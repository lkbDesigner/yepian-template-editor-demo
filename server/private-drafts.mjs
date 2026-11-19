import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
export const DATA_REPOSITORY='lkbDesigner/yepian-template-editor-data';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SHA=/^[a-f0-9]{40}$/;
const MAX_FILE=50*1024*1024,MAX_TOTAL=500*1024*1024;
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
function scope(account,id){if(!/^[a-f0-9]{24}$/.test(account.siteId))fail(403,'账号不正确');if(!UUID.test(id||''))fail(400,'草稿编号不正确');return `templates/${account.siteId}/${id}`;}
function apiClient(githubFetch,repo=DATA_REPOSITORY){return async(path,method='GET',body,missing=false)=>{
 const response=await githubFetch(`https://api.github.com/repos/${repo}${path}`,{method,...(body?{body:JSON.stringify(body)}:{})});
 if(missing&&response.status===404)return null;
 if(!response.ok)throw Object.assign(new Error('GitHub 资料暂时不可用，请稍后重试'),{upstreamStatus:response.status});
 return response.json();
};}
async function privateAPI(githubFetch){const api=apiClient(githubFetch);const repo=await api('');if(repo.private!==true)fail(503,'资料仓库未确认为私有，已停止上传，请联系管理员');return api;}
const blobJSON=file=>JSON.parse(Buffer.from(file.content.replace(/\s/g,''),'base64').toString('utf8'));
async function documentAt(api,root,ref='main'){
 const file=await api(`/contents/${root}/draft.json?ref=${encodeURIComponent(ref)}`,'GET',undefined,true);if(!file)return null;
 let data=file;if(!file.content&&file.sha)data=await api('/git/blobs/'+file.sha);
 return {document:blobJSON(data),revision:file.sha};
}
function proof(account,id,file){return createHmac('sha256',account.editKey).update(JSON.stringify([account.siteId,id,file.sha,file.name,file.type,file.size])).digest('hex');}
function validateFileRef(ref,account,id){
 if(ref.__privateAsset!==1||!SHA.test(ref.sha||'')||typeof ref.name!=='string'||ref.name.length>255||typeof ref.type!=='string'||ref.type.length>128||!Number.isSafeInteger(ref.size)||ref.size<0||ref.size>MAX_FILE||!/^[a-f0-9]{64}$/.test(ref.proof||''))fail(400,'附件引用不正确，请重新上传');
 if(!timingSafeEqual(Buffer.from(ref.proof,'hex'),Buffer.from(proof(account,id,ref),'hex')))fail(403,'附件不属于当前账号或模板，请重新上传');
 return {__privateAsset:1,sha:ref.sha,name:ref.name,type:ref.type,size:ref.size,proof:ref.proof};
}
export async function uploadDraftAsset(input,account,githubFetch){
 scope(account,input.draftId);const file=input.file;
 if(!file||typeof file.name!=='string'||!file.name||file.name.length>255||typeof file.type!=='string'||file.type.length>128||typeof file.data!=='string')fail(400,'附件资料不完整');
 const match=/^data:([^;,]*);base64,([A-Za-z0-9+/]*={0,2})$/.exec(file.data);
 if(!match||match[2].length%4||match[2].length>Math.ceil(MAX_FILE/3)*4)fail(413,'附件编码不正确或超过 50 MB');
 const bytes=Buffer.from(match[2],'base64');if(bytes.toString('base64')!==match[2]||bytes.length>MAX_FILE||file.size!==bytes.length)fail(400,'附件内容与大小不一致，请重新上传');
 const api=await privateAPI(githubFetch);const blob=await api('/git/blobs','POST',{encoding:'base64',content:match[2]});
 const ref={__privateAsset:1,sha:blob.sha,name:file.name,type:file.type||'application/octet-stream',size:bytes.length};ref.proof=proof(account,input.draftId,ref);return ref;
}
function normalizeState(input,account,id){
 if(!input||input.id!==id||typeof input.title!=='string'||input.title.length>100)fail(400,'草稿内容不正确');
 for(const key of ['values','hidden','colors','modules','tabs','repeats'])if(!input[key]||typeof input[key]!=='object'||Array.isArray(input[key]))fail(400,'缺少模板编辑数据');
 let nodes=0,total=0;const assets=new Map();
 function walk(value,depth=0){
  if(++nodes>80000||depth>25)fail(413,'草稿结构过大');
  if(value===null||typeof value==='boolean'||typeof value==='number'||typeof value==='string')return value;
  if(Array.isArray(value))return value.map(v=>walk(v,depth+1));
  if(typeof value!=='object')fail(400,'草稿字段格式错误');
  if(value.__privateAsset===1){const ref=validateFileRef(value,account,id);if(!assets.has(ref.sha)){total+=ref.size;if(total>MAX_TOTAL)fail(413,'当前模板全部附件合计最多 500 MB');assets.set(ref.sha,ref);}return ref;}
  if(typeof value.data==='string'&&value.data.startsWith('data:'))fail(400,'请先完成附件上传再保存');
  const result={};for(const [key,v]of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(key))fail(400,'草稿包含无效字段');result[key]=walk(v,depth+1);}return result;
 }
 const state={};for(const key of ['id','updated','title','values','hidden','colors','modules','tabs','repeats','sharedFooterVersion'])if(input[key]!==undefined)state[key]=walk(input[key]);
 if(!Number.isSafeInteger(state.updated)||state.updated<0)fail(400,'编辑时间不正确');
 state.owner=account.siteId;if(Buffer.byteLength(JSON.stringify(state))>4*1024*1024)fail(413,'文字及编辑数据合计最多 4 MB');return {state,assets:[...assets.values()]};
}
function summary(doc,revision){return {draftId:doc.state.id,title:doc.state.title||'中文作品集模板',updatedAt:doc.savedAt,editedAt:doc.state.updated,status:'editing',private:true,revision};}
export async function savePrivateDraft(input,account,githubFetch){
 const root=scope(account,input.draftId);if(input.html!==undefined)fail(426,'保存方式已更新，请刷新页面；保存仅存私有草稿，不再生成公开网页');
 if(input.baseRevision!==null&&!SHA.test(input.baseRevision||''))fail(400,'缺少草稿版本，请重新打开模板');
 const {state,assets}=normalizeState(input.state,account,input.draftId);const contentHash=createHash('sha256').update(JSON.stringify(state)).digest('hex');const api=await privateAPI(githubFetch);
 const requestId=typeof input.requestId==='string'&&UUID.test(input.requestId)?input.requestId:null;
 for(let attempt=0;attempt<4;attempt++){
  const head=await api('/git/ref/heads/main'),parent=await api('/git/commits/'+head.object.sha),previous=await documentAt(api,root,head.object.sha);
  if(previous?.document.contentHash===contentHash)return {saved:true,...summary(previous.document,previous.revision),requestId};
  if((previous?.revision??null)!==input.baseRevision)fail(409,'草稿已在其他页面更新，本机修改已保留。请重新打开模板后再保存');
  const savedAt=new Date().toISOString(),doc={schemaVersion:1,template:'chinese-portfolio',status:'editing',ownerId:account.siteId,savedAt,contentHash,state,assets};
  const draftBlob=await api('/git/blobs','POST',{encoding:'utf-8',content:JSON.stringify(doc)});
  const meta=summary(doc,draftBlob.sha);
  const tree=[{path:root+'/draft.json',mode:'100644',type:'blob',sha:draftBlob.sha},{path:root+'/metadata.json',mode:'100644',type:'blob',content:JSON.stringify(meta)},...assets.map(f=>({path:root+'/attachments/'+f.sha,mode:'100644',type:'blob',sha:f.sha}))];
  const active=new Set(assets.map(f=>f.sha));for(const old of previous?.document.assets||[])if(SHA.test(old.sha)&&!active.has(old.sha))tree.push({path:root+'/attachments/'+old.sha,mode:'100644',type:'blob',sha:null});
  const created=await api('/git/trees','POST',{base_tree:parent.tree.sha,tree});
  const commit=await api('/git/commits','POST',{message:'Save private portfolio draft '+input.draftId,tree:created.sha,parents:[head.object.sha]});
  try{await api('/git/refs/heads/main','PATCH',{sha:commit.sha,force:false});}catch(error){if([409,422].includes(error.upstreamStatus)&&attempt<3)continue;throw error;}
  return {saved:true,...meta,requestId};
 }
}
export async function loadPrivateDraft(input,account,githubFetch){
 const root=scope(account,input.draftId),api=await privateAPI(githubFetch),record=await documentAt(api,root);if(!record)fail(404,'没有找到当前账号的已保存草稿');
 if(record.document.ownerId!==account.siteId)fail(403,'无权读取此草稿');return {...summary(record.document,record.revision),state:record.document.state};
}
export async function downloadDraftAsset(input,account,githubFetch){
 scope(account,input.draftId);const ref=validateFileRef(input.file,account,input.draftId),api=await privateAPI(githubFetch);const blob=await api('/git/blobs/'+ref.sha);
 const data=blob.content.replace(/\s/g,'');if(Buffer.from(data,'base64').length!==ref.size)fail(502,'附件读取不完整，请稍后重试');return {file:{name:ref.name,type:ref.type,size:ref.size,data:`data:${ref.type};base64,${data}`,storage:ref}};
}
export async function listPrivateDrafts(account,githubFetch){
 const owner=account.siteId;if(!/^[a-f0-9]{24}$/.test(owner))fail(403,'账号不正确');const api=await privateAPI(githubFetch),root='templates/'+owner;
 const dirs=await api('/contents/'+root+'?ref=main','GET',undefined,true);if(!dirs)return [];if(!Array.isArray(dirs))throw Error('草稿列表异常');
 const results=[];for(const dir of dirs){if(dir.type!=='dir'||!UUID.test(dir.name))continue;const file=await api(`/contents/${root}/${dir.name}/metadata.json?ref=main`,'GET',undefined,true);if(file){const m=blobJSON(file);results.push({draftId:dir.name,title:String(m.title||'中文作品集模板').slice(0,100),updatedAt:m.updatedAt,editedAt:m.editedAt,status:'editing',private:true,revision:m.revision});}}
 return results;
}
