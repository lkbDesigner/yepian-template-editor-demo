import { REPOSITORY } from './save-worker.mjs';

const PAGES='https://lkbdesigner.github.io/yepian-template-editor-demo';
function fail(status,message){throw Object.assign(new Error(message),{status});}
// The browser sends only publicHTML(), never the draft or its private attachments.
// Wrap even authenticated uploads in an opaque sandbox: user HTML cannot run
// with the GitHub Pages origin or read other visitors' editor storage.
export function publicWrapper(html){
  const escaped=html.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>个人作品集</title><style>body{margin:0}iframe{border:0;display:block;width:100%;height:100dvh}</style></head><body><iframe title="个人作品集" sandbox="allow-scripts allow-popups" referrerpolicy="no-referrer" srcdoc="'+escaped+'"></iframe></body></html>';
}
export async function savePortfolio(input,account,githubFetch){
  if(!/^[a-f0-9]{24}$/.test(account.siteId))fail(403,'账号标识不正确');
  if(typeof input.draftId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.draftId))fail(400,'草稿编号不正确');
  if(typeof input.html!=='string'||!/^<!doctype html>/i.test(input.html)||!input.html.includes('<meta charset="utf-8">'))fail(400,'缺少有效的 UTF-8 网页');
  if(Buffer.byteLength(input.html)>32*1024*1024)fail(413,'网页内容超过 32 MB，请压缩公开图片后重试');
  const content=publicWrapper(input.html);
  if(Buffer.byteLength(content)>48*1024*1024)fail(413,'网页内容过大，请压缩图片后重试');
  const root=`user-sites/${account.siteId}/portfolios/${input.draftId}`;
  const api=async(path,method='GET',body)=>{
    const res=await githubFetch(`https://api.github.com/repos/${REPOSITORY}${path}`,{method,...(body?{body:JSON.stringify(body)}:{})});
    if(!res.ok){const error=new Error('GitHub 暂时无法接收保存，请重试');error.upstreamStatus=res.status;throw error;}
    return res.json();
  };
  let blob;
  for(let attempt=0;attempt<3;attempt++){
    const head=await api('/git/ref/heads/main');
    const parent=await api('/git/commits/'+head.object.sha);
    blob??=await api('/git/blobs','POST',{encoding:'base64',content:Buffer.from(content).toString('base64')});
    const tree=await api('/git/trees','POST',{base_tree:parent.tree.sha,tree:[{path:root+'/index.html',mode:'100644',type:'blob',sha:blob.sha}]});
    const commit=await api('/git/commits','POST',{message:'Save Chinese portfolio '+input.draftId,tree:tree.sha,parents:[head.object.sha]});
    try{await api('/git/refs/heads/main','PATCH',{sha:commit.sha,force:false});}
    catch(error){if([409,422].includes(error.upstreamStatus)&&attempt<2)continue;throw error;}
    return {saved:true,url:PAGES+'/'+root+'/',commitUrl:`https://github.com/${REPOSITORY}/commit/${commit.sha}`};
  }
}
