(async()=>{
'use strict';const $=s=>document.querySelector(s);let loading=false;
async function load(){
 if(loading)return;loading=true;$('#review-refresh').disabled=true;$('#review-error').hidden=true;$('#review-empty').hidden=true;$('#review-note').hidden=true;$('#reviews').replaceChildren();$('#review-count').textContent='正在验证管理员身份…';
 try{
  await PortfolioGitHub.adminSession();$('#review-count').textContent='正在读取提交记录…';const result=await PortfolioGitHub.reviews();$('#review-count').textContent=result.reviews.length+' 个审核任务';$('#review-empty').hidden=result.reviews.length>0;
  $('#review-availability').hidden=result.submissionEnabled!==false;
  for(const task of result.reviews){const card=document.createElement('article');card.className='my-template';const body=document.createElement('div');body.className='card-body';card.append(body);const tag=document.createElement('span');tag.className='tag';tag.textContent=({submitted:'待审核',reviewing:'审核中',approved:'审核完成'})[task.status]||'待审核';body.append(tag);const title=document.createElement('h2');title.textContent=task.title;body.append(title);const owner=document.createElement('p');owner.className='review-meta';owner.textContent='提交用户：'+(task.ownerPhone||'用户');body.append(owner);const time=document.createElement('time');time.textContent='提交时间：'+new Date(task.submittedAt).toLocaleString('zh-CN');body.append(time);$('#reviews').append(card);}
  if(result.reviews.length){$('#review-note').hidden=false;$('#review-note').textContent='目前已开放审核列表，查看资料与审核编辑将在上传审核流程中接入。';}
 }catch(error){if(error.cancelled){location.replace('index.html');return;}$('#review-count').textContent=error.status===403?'无管理员权限':'读取失败';$('#review-error').hidden=false;$('#review-error').textContent=error.status===403?'当前账号不是管理员，请返回首页切换账号。':error.message;}
 finally{loading=false;$('#review-refresh').hidden=false;$('#review-refresh').disabled=false;}
}
$('#review-refresh').onclick=load;addEventListener('portfolio-session-ended',()=>{$('#reviews').replaceChildren();location.replace('index.html');});await load();
})();
