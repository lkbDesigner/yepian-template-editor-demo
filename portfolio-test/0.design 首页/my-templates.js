(async()=>{
'use strict';const $=s=>document.querySelector(s);let loading=false;const query=new URL(location.href);let unavailable=query.searchParams.has('missing')||query.searchParams.has('unavailable');query.searchParams.delete('missing');query.searchParams.delete('unavailable');history.replaceState(null,'',query.pathname+query.search+query.hash);
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
  const tag=document.createElement('span');tag.className='tag published';tag.textContent=['submitted','reviewing'].includes(item.status)?'审核中':'编辑中';body.append(tag);
  const title=document.createElement('h2');title.textContent=item.title||'中文作品集模板';body.append(title);
  const stamp=document.createElement('time');stamp.textContent='最近保存 · '+date(item.updatedAt||item.savedAt);body.append(stamp);
  const actions=document.createElement('div');actions.className='card-actions';body.append(actions);
  {const edit=action(['submitted','reviewing'].includes(item.status)?'查看提交内容':'继续编辑',()=>openDraft('editor.html',item));edit.classList.add('primary');actions.append(edit);actions.append(action('预览当前模板',()=>openDraft('template-preview.html',item)));}
  $('#templates').append(card);
 }
}
async function load(){
 if(loading)return;loading=true;$('#refresh').disabled=true;$('#error').hidden=true;$('#notice').hidden=true;$('#templates').replaceChildren();$('#empty').hidden=true;$('#storage-note').hidden=true;$('#count').textContent='正在读取模板…';
 try{
  const owner=await PortfolioGitHub.accountSession();const admin=PortfolioGitHub.role==='admin';if(admin){document.querySelector('.library-heading>a').href='index.html?personal=1';document.querySelector('.library-heading>div>p:last-child').textContent='这里只显示你自己保存的模板，用户提交的作品请前往审核管理。';$('#empty h2').textContent='你还没有保存个人模板';$('#empty p').textContent='用户提交的作品位于审核管理。也可以选择新模板，制作你自己的作品集。';const entry=$('#empty a');entry.href='admin-reviews.html';entry.textContent='前往审核管理';}$('#logout').hidden=false;
  const saved=await PortfolioGitHub.list();
  if(PortfolioGitHub.accountId!==owner)throw Error('账号状态已变化，请刷新列表');
  const records=new Map(saved.filter(p=>p.private===true).map(p=>[p.draftId,{...p,savedAt:p.updatedAt?Date.parse(p.updatedAt):null,updatedAt:p.updatedAt?Date.parse(p.updatedAt):p.editedAt}]));
  render([...records.values()].sort((a,b)=>(Number(b.updatedAt)||0)-(Number(a.updatedAt)||0)));

  if(unavailable){unavailable=false;$('#notice').hidden=false;$('#notice').replaceChildren(document.createTextNode(records.size?'当前链接对应的模板在此账号下不可用，请选择下面已保存的模板。':'当前链接对应的模板在此账号下不可用，你可以选择新模板开始编辑。'));if(admin){$('#notice').append(document.createTextNode(' 用户提交的作品请前往'));const link=document.createElement('a');link.href='admin-reviews.html';link.textContent='审核管理';$('#notice').append(link);}}
 }catch(err){if(err.cancelled){location.href='index.html';return;}$('#count').textContent='读取失败';$('#empty').hidden=true;$('#error').hidden=false;$('#error').textContent=err.message;}
 finally{loading=false;$('#refresh').hidden=false;$('#refresh').disabled=false;}
}
$('#refresh').onclick=load;
addEventListener('portfolio-session-ended',()=>{document.querySelector('#templates').replaceChildren();location.replace('index.html');});
addEventListener('pageshow',e=>{if(e.persisted)load();});await load();
})();
