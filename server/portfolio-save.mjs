import { REPOSITORY } from './save-worker.mjs';

const PAGES='https://lkbdesigner.github.io/yepian-template-editor-demo';
// Read-only compatibility for webpages generated before private draft saves.
export async function listPortfolios(account,githubFetch){
 if(!/^[a-f0-9]{24}$/.test(account.siteId))fail(403,'账号标识不正确');
 const root=`user-sites/${account.siteId}/portfolios`;
 const res=await githubFetch(`https://api.github.com/repos/${REPOSITORY}/contents/${root}?ref=main`,{method:'GET'});
 if(res.status===404)return [];
 if(!res.ok)throw Error('暂时无法读取 GitHub 模板');
 const dirs=await res.json();if(!Array.isArray(dirs))throw Error('模板列表格式异常');
 const result=[];
 // Build every path from the authenticated account and a validated draft ID.
 for(const dir of dirs){
  if(dir.type!=='dir'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(dir.name))continue;
  const meta=await githubFetch(`https://api.github.com/repos/${REPOSITORY}/contents/${root}/${dir.name}/template.json?ref=main`,{method:'GET'});
  let data={};if(meta.ok){const file=await meta.json();data=JSON.parse(Buffer.from(file.content,'base64').toString('utf8'));}else if(meta.status!==404)throw Error('暂时无法读取模板详情');
  result.push({draftId:dir.name,title:typeof data.title==='string'?data.title.slice(0,100):'中文作品集模板',updatedAt:Number.isFinite(Date.parse(data.updatedAt))?data.updatedAt:null,url:PAGES+'/'+root+'/'+dir.name+'/'});
 }
 return result;
}
