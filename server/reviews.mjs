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
  if(!['submitted','reviewing','approved'].includes(item.status)||!/^[a-f0-9]{24}$/.test(item.ownerId||'')||!UUID.test(item.draftId||'')||!/^[a-f0-9]{40}$/.test(item.submittedRevision||'')||!Number.isFinite(Date.parse(item.submittedAt)))continue;
  result.push({reviewId:entry.name.slice(0,-5),ownerId:item.ownerId,draftId:item.draftId,title:typeof item.title==='string'?item.title.slice(0,100):'作品集模板',status:item.status,submittedAt:item.submittedAt});
 }
 return result.sort((a,b)=>Date.parse(b.submittedAt)-Date.parse(a.submittedAt));
}
