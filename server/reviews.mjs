import {DATA_REPOSITORY} from './private-drafts.mjs';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
// Review tasks are a distinct, explicitly submitted queue. Never enumerate
// users' private editing drafts to populate the administrator's workspace.
export async function listSubmittedReviews(githubFetch){
 const api=async(path,missing=false)=>{const res=await githubFetch(`https://api.github.com/repos/${DATA_REPOSITORY}${path}`,{method:'GET'});if(missing&&res.status===404)return null;if(!res.ok)throw Error('审核列表暂时无法读取，请重试');return res.json();};
 if((await api('')).private!==true)throw Object.assign(Error('审核资料仓库未确认为私有'),{status:503});
 const entries=await api('/contents/reviews?ref=main',true);if(!entries)return [];if(!Array.isArray(entries))throw Error('审核列表格式异常');
 const result=[];
 for(const entry of entries){
  if(entry.type!=='file'||!entry.name.endsWith('.json')||!UUID.test(entry.name.slice(0,-5)))continue;
  const file=await api('/contents/reviews/'+entry.name+'?ref=main');let content=file;if(!file.content&&file.sha)content=await api('/git/blobs/'+file.sha);
  const item=JSON.parse(Buffer.from(content.content.replace(/\s/g,''),'base64').toString('utf8'));
  if(!['submitted','reviewing','approved','published'].includes(item.status)||!/^[a-f0-9]{24}$/.test(item.ownerId||'')||!UUID.test(item.draftId||'')||!/^[a-f0-9]{40}$/.test(item.submittedRevision||'')||!Number.isFinite(Date.parse(item.submittedAt)))continue;
  result.push({reviewId:entry.name.slice(0,-5),ownerId:item.ownerId,draftId:item.draftId,title:typeof item.title==='string'?item.title.slice(0,100):'作品集模板',status:item.status,submittedAt:item.submittedAt});
 }
 return result.sort((a,b)=>Date.parse(b.submittedAt)-Date.parse(a.submittedAt));
}

import {randomUUID,createHash} from 'node:crypto';
import {privateAPI,documentAt,scope,summary,normalizeState} from './private-drafts.mjs';
import {validateReviewDraft} from './review-validation.mjs';
const fail=(status,message,extra={})=>{throw Object.assign(Error(message),{status,...extra});};
const sha=/^[a-f0-9]{40}$/;
export async function jsonAt(api,path,ref='main'){
 const file=await api(`/contents/${path}?ref=${encodeURIComponent(ref)}`,'GET',undefined,true);if(!file)return null;let body=file;if(!file.content&&file.sha)body=await api('/git/blobs/'+file.sha);return JSON.parse(Buffer.from(body.content.replace(/\s/g,''),'base64').toString('utf8'));
}
export async function commitWorkflow(api,head,parent,root,doc,review,message){
 const draftBlob=await api('/git/blobs','POST',{encoding:'utf-8',content:JSON.stringify(doc)}),meta=summary(doc,draftBlob.sha);
 if(review.status==='submitted'&&!review.submittedRevision)review.submittedRevision=draftBlob.sha;review.currentRevision=draftBlob.sha;if(review.status==='approved'&&!review.approvedRevision)review.approvedRevision=draftBlob.sha;
 const tree=await api('/git/trees','POST',{base_tree:parent.tree.sha,tree:[{path:root+'/draft.json',mode:'100644',type:'blob',sha:draftBlob.sha},{path:root+'/metadata.json',mode:'100644',type:'blob',content:JSON.stringify(meta)},{path:'reviews/'+review.reviewId+'.json',mode:'100644',type:'blob',content:JSON.stringify(review)},...(doc.assets||[]).map(f=>({path:root+'/attachments/'+f.sha,mode:'100644',type:'blob',sha:f.sha}))]});
 const commit=await api('/git/commits','POST',{tree:tree.sha,parents:[head.object.sha],message});await api('/git/refs/heads/main','PATCH',{sha:commit.sha,force:false});return meta;
}
export async function submitDraftReview(input,account,githubFetch){
 const root=scope(account,input.draftId);if(!sha.test(input.baseRevision||''))fail(400,'请先保存最新草稿再上传审核');const api=await privateAPI(githubFetch),reviewId=randomUUID();
 for(let attempt=0;attempt<4;attempt++){
  const head=await api('/git/ref/heads/main'),parent=await api('/git/commits/'+head.object.sha),record=await documentAt(api,root,head.object.sha);if(!record)fail(404,'请先保存模板');const old=record.document;if(old.ownerId!==account.siteId)fail(403,'无权提交此模板');
  if(['submitted','reviewing'].includes(old.status)&&old.workflow?.sourceRevision===input.baseRevision)return {...summary(old,record.revision),submitted:true};
  if(old.status!=='editing')fail(409,'模板已经在审核中');if(record.revision!==input.baseRevision)fail(409,'草稿已有更新，请重新打开后上传审核');
  const validation=validateReviewDraft(old.state);if(!validation.valid)fail(422,'内容尚未填写完整，暂时不能上传审核',{issues:validation.issues});
  const now=new Date().toISOString(),doc={...old,status:'submitted',savedAt:now,workflow:{reviewId,submittedAt:now,sourceRevision:record.revision}},review={reviewId,ownerId:account.siteId,draftId:input.draftId,title:old.state.title,status:'submitted',submittedAt:now};
  try{return {...await commitWorkflow(api,head,parent,root,doc,review,'Submit portfolio for review '+input.draftId),submitted:true};}catch(error){if([409,422].includes(error.upstreamStatus)&&attempt<3)continue;throw error;}
 }
}
export async function withdrawDraftReview(input,account,githubFetch){
 const root=scope(account,input.draftId),api=await privateAPI(githubFetch);if(!sha.test(input.baseRevision||''))fail(400,'缺少模板版本');
 for(let attempt=0;attempt<4;attempt++){
  const head=await api('/git/ref/heads/main'),parent=await api('/git/commits/'+head.object.sha),record=await documentAt(api,root,head.object.sha);if(!record)fail(404,'没有找到模板');
  if(record.revision!==input.baseRevision)fail(409,'模板状态已有更新，请刷新后重试');const old=record.document;if(old.ownerId!==account.siteId)fail(403,'无权撤回此模板');if(!['submitted','reviewing'].includes(old.status)||!UUID.test(old.workflow?.reviewId||''))fail(409,'当前模板不在审核中');
  const review=await jsonAt(api,'reviews/'+old.workflow.reviewId+'.json',head.object.sha);if(!review||review.ownerId!==account.siteId)fail(409,'审核记录不一致');const doc={...old,status:'editing',savedAt:new Date().toISOString()};delete doc.workflow;
  try{return await commitWorkflow(api,head,parent,root,doc,{...review,status:'withdrawn',withdrawnAt:doc.savedAt},'Withdraw portfolio review '+input.draftId);}catch(error){if([409,422].includes(error.upstreamStatus)&&attempt<3)continue;throw error;}
 }
}
export async function readSubmittedReview(input,githubFetch){
 if(!UUID.test(input.reviewId||''))fail(400,'审核编号不正确');const api=await privateAPI(githubFetch),review=await jsonAt(api,'reviews/'+input.reviewId+'.json');
 if(!review)fail(404,'没有找到审核任务');if(!['submitted','reviewing','approved','published'].includes(review.status)||!sha.test(review.submittedRevision||''))fail(409,'审核任务已撤回或失效');
 const revision=review.currentRevision||review.submittedRevision;const blob=await api('/git/blobs/'+revision),doc=JSON.parse(Buffer.from(blob.content.replace(/\s/g,''),'base64').toString('utf8'));
 if(doc.ownerId!==review.ownerId||doc.state.id!==review.draftId||doc.workflow?.reviewId!==input.reviewId)fail(409,'审核版本不一致');
 return {...summary(doc,revision),review:{reviewId:input.reviewId,ownerId:review.ownerId,draftId:review.draftId,title:review.title,status:review.status,submittedAt:review.submittedAt,approvedAt:review.approvedAt||null},state:doc.state,assets:doc.assets||[]};
}
export async function downloadSubmittedAsset(input,githubFetch){
 const record=await readSubmittedReview(input,githubFetch),refs=[];const collect=v=>{if(!v||typeof v!=='object')return;if(v.__privateAsset===1){refs.push(v);return;}for(const child of Object.values(v))collect(child);};collect(record.state);const ref=refs.find(f=>f.sha===input.file?.sha&&f.proof===input.file?.proof);if(!ref)fail(403,'附件不在本次提交的资料中');const api=await privateAPI(githubFetch),blob=await api('/git/blobs/'+ref.sha);const data=blob.content.replace(/\s/g,'');if(Buffer.from(data,'base64').length!==ref.size)fail(502,'附件读取不完整');return {file:{name:ref.name,size:ref.size,type:ref.type,data:`data:${ref.type};base64,${data}`,storage:ref}};
}

export async function saveReviewDraft(input,owner,administrator,githubFetch){
 const api=await privateAPI(githubFetch);if(!sha.test(input.baseRevision||''))fail(400,'缺少审核版本');
 const loaded=await readSubmittedReview(input,githubFetch);if(loaded.review.ownerId!==owner.siteId)fail(403,'审核归属不正确');const root=scope(owner,loaded.review.draftId);
 const {state,assets}=normalizeState(input.state,owner,loaded.review.draftId),contentHash=createHash('sha256').update(JSON.stringify(state)).digest('hex');
 for(let attempt=0;attempt<4;attempt++){
  const head=await api('/git/ref/heads/main'),parent=await api('/git/commits/'+head.object.sha),record=await documentAt(api,root,head.object.sha),review=await jsonAt(api,'reviews/'+input.reviewId+'.json',head.object.sha);
  if(!record||!review||!['submitted','reviewing'].includes(review.status)||record.document.workflow?.reviewId!==input.reviewId||!['submitted','reviewing'].includes(record.document.status))fail(409,'审核任务已撤回或已经完成');
  if(record.document.contentHash===contentHash&&record.document.status==='reviewing')return {saved:true,...summary(record.document,record.revision)};
  if(record.revision!==input.baseRevision)fail(409,'审核内容已更新，请重新打开后编辑');
  const now=new Date().toISOString(),doc={...record.document,state,assets,contentHash,status:'reviewing',savedAt:now,workflow:{...record.document.workflow,reviewedBy:administrator.siteId}};
  try{return {saved:true,...await commitWorkflow(api,head,parent,root,doc,{...review,title:state.title,status:'reviewing',reviewedBy:administrator.siteId},'Edit portfolio review '+input.reviewId)};}catch(error){if([409,422].includes(error.upstreamStatus)&&attempt<3)continue;throw error;}
 }
}
export async function approveDraftReview(input,owner,administrator,githubFetch){
 const api=await privateAPI(githubFetch),loaded=await readSubmittedReview(input,githubFetch);if(loaded.review.ownerId!==owner.siteId)fail(403,'审核归属不正确');const root=scope(owner,loaded.review.draftId);
 for(let attempt=0;attempt<4;attempt++){
  const head=await api('/git/ref/heads/main'),parent=await api('/git/commits/'+head.object.sha),record=await documentAt(api,root,head.object.sha),review=await jsonAt(api,'reviews/'+input.reviewId+'.json',head.object.sha);
  if(!record||!review||record.document.workflow?.reviewId!==input.reviewId)fail(409,'审核任务已失效');
  if(record.document.status==='approved'&&record.document.workflow.approvalSourceRevision===input.baseRevision)return {...summary(record.document,record.revision),approved:true};
  if(!['submitted','reviewing'].includes(record.document.status)||!['submitted','reviewing'].includes(review.status)||record.revision!==input.baseRevision)fail(409,'审核版本已变化，请重新打开');
  const validation=validateReviewDraft(record.document.state);if(!validation.valid)fail(422,'提交资料仍有必填内容未完成，请检查后再审核通过',{issues:validation.issues});
  const now=new Date().toISOString(),doc={...record.document,status:'approved',savedAt:now,workflow:{...record.document.workflow,approvedAt:now,approvedBy:administrator.siteId,approvalSourceRevision:record.revision}};
  try{return {...await commitWorkflow(api,head,parent,root,doc,{...review,status:'approved',approvedAt:now,approvedBy:administrator.siteId},'Approve portfolio review '+input.reviewId),approved:true};}catch(error){if([409,422].includes(error.upstreamStatus)&&attempt<3)continue;throw error;}
 }
}
