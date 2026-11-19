(async()=>{
'use strict';const $=s=>document.querySelector(s);let loading=false;
async function load(){
 if(loading)return;loading=true;$('#review-refresh').disabled=true;$('#review-error').hidden=true;$('#review-empty').hidden=true;$('#review-note').hidden=true;$('#reviews').replaceChildren();$('#review-count').textContent='正在验证管理员身份…';
 try{
  await PortfolioGitHub.adminSession();$('#review-count').textContent='正在读取提交记录…';const result=await PortfolioGitHub.reviews();$('#review-count').textContent=result.reviews.length+' 个审核任务';$('#review-empty').hidden=result.reviews.length>0;
  $('#review-availability').hidden=result.submissionEnabled!==false;
  for(const task of result.reviews){const card=document.createElement('article');card.className='my-template';const body=document.createElement('div');body.className='card-body';card.append(body);const tag=document.createElement('span');tag.className='tag';tag.textContent=({submitted:'待审核',reviewing:'审核中',approved:'审核完成'})[task.status]||'待审核';body.append(tag);const title=document.createElement('h2');title.textContent=task.title;body.append(title);const owner=document.createElement('p');owner.className='review-meta';owner.textContent='提交用户：'+(task.ownerPhone||'用户');body.append(owner);const time=document.createElement('time');time.textContent='提交时间：'+new Date(task.submittedAt).toLocaleString('zh-CN');body.append(time);const actions=document.createElement('div');actions.className='card-actions';const button=document.createElement('button');button.className='button primary';button.textContent='查看模板与资料';button.onclick=()=>{const url=new URL('../3_中文_空模板/editor.html',location.href);url.searchParams.set('review',task.reviewId);PortfolioGitHub.open(url.href);};actions.append(button);body.append(actions);$('#reviews').append(card);}
  if(result.reviews.length){$('#review-note').hidden=false;$('#review-note').textContent='可查看用户提交的模板、原始附件和补充资料。审核编辑与完成审核将在下一步接入。';}
 }catch(error){if(error.cancelled){location.replace('index.html');return;}$('#review-count').textContent=error.status===403?'无管理员权限':'读取失败';$('#review-error').hidden=false;$('#review-error').textContent=error.status===403?'当前账号不是管理员，请返回首页切换账号。':error.message;}
 finally{loading=false;$('#review-refresh').hidden=false;$('#review-refresh').disabled=false;}
}
$('#review-refresh').onclick=load;addEventListener('portfolio-session-ended',()=>{$('#reviews').replaceChildren();location.replace('index.html');});await load();
})();
