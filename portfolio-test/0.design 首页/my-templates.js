(async()=>{
'use strict';const $=s=>document.querySelector(s);let loading=false;
const templateBase=new URL('../3_中文_空模板/',location.href);
function date(value){if(!value)return '历史保存';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'历史保存';}
function action(label,fn){const b=document.createElement('button');b.className='button';b.textContent=label;b.onclick=fn;return b;}
function openDraft(file,item){const url=new URL(file,templateBase);url.searchParams.set('draft',item.draftId);url.searchParams.set('from','templates');PortfolioGitHub.open(url.href);}
function render(items){
 $('#templates').replaceChildren();$('#count').textContent=items.length+' 个模板';$('#empty').hidden=items.length>0;$('#storage-note').hidden=!items.length;
 for(const item of items){
  const card=document.createElement('article');card.className='my-template';
  const image=document.createElement('img');image.src='assets/chinese-portfolio-template.png';image.alt='中文作品集模板';image.loading='lazy';card.append(image);
  const body=document.createElement('div');body.className='card-body';card.append(body);
  const tag=document.createElement('span');tag.className='tag'+(item.url?' published':'');tag.textContent=item.url?(item.local&&item.savedAt&&Number(item.updatedAt)>Number(item.savedAt)?'本机有新修改':'已保存到 GitHub'):'本机草稿';body.append(tag);
  const title=document.createElement('h2');title.textContent=item.title||'中文作品集模板';body.append(title);
  const stamp=document.createElement('time');stamp.textContent='最近编辑 · '+date(item.updatedAt||item.savedAt);body.append(stamp);
  const actions=document.createElement('div');actions.className='card-actions';body.append(actions);
  if(item.local){const edit=action('继续编辑',()=>openDraft('editor.html',item));edit.classList.add('primary');actions.append(edit);actions.append(action('预览当前模板',()=>openDraft('template-preview.html',item)));}
  if(item.url){const link=document.createElement('a');link.className='button';link.textContent='查看已保存网页 ↗';link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';actions.append(link);}
  if(!item.local){const note=document.createElement('p');note.className='card-note';note.textContent='当前浏览器没有编辑草稿，请在原浏览器继续编辑。';body.append(note);}
  $('#templates').append(card);
 }
}
async function load(){
 if(loading)return;loading=true;$('#refresh').disabled=true;$('#error').hidden=true;$('#notice').hidden=true;$('#templates').replaceChildren();$('#empty').hidden=true;$('#storage-note').hidden=true;$('#count').textContent='正在读取模板…';
 try{
  const owner=await PortfolioGitHub.accountSession();$('#logout').hidden=false;let locals=[],published=[];let localError=false,remoteError=false;
  const results=await Promise.allSettled([PortfolioDrafts.list(owner),PortfolioGitHub.list()]);
  if(results[0].status==='fulfilled')locals=results[0].value;else localError=true;
  if(results[1].status==='fulfilled')published=results[1].value;else remoteError=true;
  if(PortfolioGitHub.accountId!==owner)throw Error('账号状态已变化，请刷新列表');
  const records=new Map();
  for(const p of published)records.set(p.draftId,{...p,savedAt:p.updatedAt?Date.parse(p.updatedAt):null,updatedAt:p.updatedAt?Date.parse(p.updatedAt):null});
  for(const d of locals){const p=records.get(d.draftId)||{};records.set(d.draftId,{...p,...d,url:p.url||d.github?.url,savedAt:p.savedAt||d.github?.savedAt});}
  // Local saved links must still belong to the authenticated account.
  for(const item of records.values())if(item.url&&!item.url.startsWith('https://lkbdesigner.github.io/yepian-template-editor-demo/user-sites/'+owner+'/portfolios/'+item.draftId+'/'))delete item.url;
  render([...records.values()].sort((a,b)=>(Number(b.updatedAt)||0)-(Number(a.updatedAt)||0)));
  if(localError||remoteError){$('#error').hidden=false;$('#error').textContent=remoteError?'暂时无法读取 GitHub 模板，已显示可用的本机草稿。请点击刷新列表重试。':'无法读取当前浏览器的草稿，已显示 GitHub 保存记录。';$('#empty').hidden=true;}
  if(new URLSearchParams(location.search).has('missing')){$('#notice').hidden=false;$('#notice').textContent='该草稿在当前浏览器不存在或不属于当前账号，请从下面选择你的模板。';}
 }catch(err){if(err.cancelled){location.href='index.html';return;}$('#count').textContent='读取失败';$('#error').hidden=false;$('#error').textContent=err.message;}
 finally{loading=false;$('#refresh').hidden=false;$('#refresh').disabled=false;}
}
$('#refresh').onclick=load;
addEventListener('portfolio-session-ended',()=>{document.querySelector('#templates').replaceChildren();location.replace('index.html');});
addEventListener('pageshow',e=>{if(e.persisted)load();});await load();
})();
