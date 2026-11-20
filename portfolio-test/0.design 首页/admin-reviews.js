(async()=>{
'use strict';const $=s=>document.querySelector(s);let loading=false,tasks=[],ready=false;
const tabs=[...document.querySelectorAll('[role=tab]')];
let activeTab=new URL(location.href).searchParams.get('tab')==='approved'?'approved':'pending';
const isApproved=task=>['approved','published'].includes(task.status);
function render(){
 const filtered=tasks.filter(task=>isApproved(task)===(activeTab==='approved'));
 for(const tab of tabs){const selected=tab.dataset.tab===activeTab;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;tab.disabled=!ready;tab.querySelector('span').textContent=tasks.filter(task=>isApproved(task)===(tab.dataset.tab==='approved')).length;}
 $('#reviews').setAttribute('aria-labelledby','review-tab-'+activeTab);
 $('#review-count').textContent=filtered.length+' 个'+(activeTab==='approved'?'审核通过':'审核中')+'任务';
 $('#review-empty').hidden=filtered.length>0;
 $('#review-empty h2').textContent=activeTab==='approved'?'暂无审核通过的模板':'暂无审核中的模板';
 $('#review-empty-description').textContent=activeTab==='approved'?'管理员审核通过后，模板会显示在这里，用户可自行发布。':'用户点击“上传审核”后，模板会显示在这里；未提交的个人草稿不会进入此列表。';
 $('#reviews').replaceChildren();
 for(const task of filtered)renderCard(task);
}
function selectTab(value,focus=false){activeTab=value;const url=new URL(location.href);url.searchParams.set('tab',value);history.replaceState(null,'',url);render();if(focus)tabs.find(tab=>tab.dataset.tab===value).focus();}
for(const tab of tabs){tab.onclick=()=>selectTab(tab.dataset.tab);tab.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();selectTab(event.key==='Home'?'pending':event.key==='End'?'approved':activeTab==='pending'?'approved':'pending',true);};}
function renderCard(task){
const card=document.createElement('article');card.className='my-template';const body=document.createElement('div');body.className='card-body';card.append(body);const tag=document.createElement('span');tag.className='tag';tag.textContent=({submitted:'待审核',reviewing:'审核中',approved:'审核通过',published:'已发布'})[task.status]||'待审核';body.append(tag);const title=document.createElement('h2');title.textContent=task.title;body.append(title);const owner=document.createElement('p');owner.className='review-meta';owner.textContent='提交用户：'+(task.ownerPhone||'用户');body.append(owner);const time=document.createElement('time');time.textContent='提交时间：'+new Date(task.submittedAt).toLocaleString('zh-CN');body.append(time);const actions=document.createElement('div');actions.className='card-actions';const button=document.createElement('button');button.className='button primary';button.textContent=['approved','published'].includes(task.status)?'查看审核结果':'审核并编辑';button.onclick=()=>{const url=new URL('../3_中文_空模板/editor.html',location.href);url.searchParams.set('review',task.reviewId);PortfolioGitHub.open(url.href);};actions.append(button);body.append(actions);$('#reviews').append(card);}
async function load(){
 if(loading)return;loading=true;ready=false;tasks=[];for(const tab of tabs){tab.disabled=true;tab.querySelector('span').textContent='—';}$('#review-refresh').disabled=true;$('#review-error').hidden=true;$('#review-empty').hidden=true;$('#reviews').replaceChildren();$('#review-count').textContent='正在验证管理员身份…';
 try{
  await PortfolioGitHub.adminSession();$('#review-count').textContent='正在读取提交记录…';const result=await PortfolioGitHub.reviews();
  $('#review-availability').hidden=result.submissionEnabled!==false;
  tasks=result.reviews;ready=true;render();
 }catch(error){if(error.cancelled){location.replace('index.html');return;}$('#review-count').textContent=error.status===403?'无管理员权限':'读取失败';$('#review-error').hidden=false;$('#review-error').textContent=error.status===403?'当前账号不是管理员，请返回首页切换账号。':error.message;}
 finally{loading=false;$('#review-refresh').hidden=false;$('#review-refresh').disabled=false;}
}
$('#review-refresh').onclick=load;addEventListener('portfolio-session-ended',()=>{$('#reviews').replaceChildren();location.replace('index.html');});await load();
})();
