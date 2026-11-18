(() => {
'use strict';
let token=null,accountId=null,editorOwner=null,service=null,busy=false;
const dialog=document.createElement('dialog');dialog.className='github-dialog';
dialog.innerHTML=`<form><h2>登录后编辑模板</h2><p>输入手机号后继续：新用户设置密码，已有账号输入密码。手机号仅作为测试账号，不发送短信。</p><label>手机号<input name="phone" inputmode="numeric" autocomplete="username" pattern="[0-9]{11}" maxlength="11" required placeholder="11 位手机号"></label><label class="password-step" hidden>密码<input name="password" type="password" autocomplete="current-password" minlength="8" maxlength="128"></label><label class="confirm-step" hidden>确认密码<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128"></label><p class="github-error" role="alert"></p><div class="github-actions"><button type="button" data-cancel>取消</button><button type="submit" class="primary">继续</button></div></form>`;
document.body.append(dialog);
const form=dialog.querySelector('form'),error=dialog.querySelector('.github-error');
async function api(path,body,auth=false){
 const response=await fetch(service+path,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(180000)});
 const result=await response.json().catch(()=>({error:'服务返回异常，请稍后重试'}));
 if(!response.ok){if(response.status===401){token=null;accountId=null;}throw Object.assign(Error(result.error||'请求失败，请重试'),{status:response.status});}return result;
}
async function connect(){
 if(service)return;
 try{const res=await fetch('./save-config.json',{cache:'no-store'});const config=await res.json();service=new URL(config.saveServiceUrl).href.replace(/\/$/,'');const status=await fetch(service+'/api/status',{signal:AbortSignal.timeout(15000)});const data=await status.json();if(!status.ok||!data.ready||!data.portfolios)throw Error();}
 catch{service=null;throw Error('本机测试保存服务未连接，请联系管理员启动服务和通道；本机草稿仍保留');}
}
function login(expectedAccount=null){return new Promise((resolve,reject)=>{
 let action='start',working=false;form.reset();error.textContent='';
 form.phone.readOnly=false;form.password.required=false;form.confirmPassword.required=false;
 dialog.querySelector('.password-step').hidden=true;dialog.querySelector('.confirm-step').hidden=true;
 const submit=form.querySelector('[type=submit]');submit.textContent='继续';submit.disabled=false;
 const cancel=()=>{if(working)return;dialog.close();reject(Object.assign(Error('已取消登录'),{cancelled:true}));};
 dialog.querySelector('[data-cancel]').onclick=cancel;dialog.oncancel=e=>{e.preventDefault();cancel();};
 form.onsubmit=async e=>{e.preventDefault();if(working||!form.reportValidity())return;working=true;submit.disabled=true;error.textContent='';
 try{const result=await api('/api/'+action,{phone:form.phone.value,password:form.password.value,confirmPassword:form.confirmPassword.value,clientVersion:2,template:'chinese-portfolio'});
 if(action==='start'){action=result.existing?'login':'register';form.phone.readOnly=true;form.password.required=true;form.confirmPassword.required=!result.existing;dialog.querySelector('.password-step').hidden=false;dialog.querySelector('.confirm-step').hidden=result.existing;submit.textContent=result.existing?'登录并进入编辑':'注册并进入编辑';form.password.autocomplete=result.existing?'current-password':'new-password';form.password.focus();}
 else{if(expectedAccount&&result.siteId!==expectedAccount){token=result.token;await api('/api/logout',{},true).catch(()=>{});token=null;throw Error('请使用当前作品所属的账号登录');}token=result.token;accountId=result.siteId;form.password.value='';form.confirmPassword.value='';dialog.close();resolve();}}
 catch(err){error.textContent=err.message;}finally{working=false;submit.disabled=false;}};
 dialog.showModal();form.phone.focus();
 });}
function showResult(result){
 const output=document.createElement('dialog');output.className='github-dialog';
 output.innerHTML='<h2>已保存到 GitHub</h2><p>网页首次生成或更新可能需要几分钟。继续编辑后再次保存，会更新同一个网页。</p><p><a target="_blank" rel="noopener" data-site>打开作品集网页 ↗</a></p><p><a target="_blank" rel="noopener" data-commit>查看 GitHub 保存记录 ↗</a></p><button autofocus>继续编辑</button>';
 output.querySelector('[data-site]').href=result.url;output.querySelector('[data-commit]').href=result.commitUrl;
 output.querySelector('button').onclick=()=>output.close();output.onclose=()=>output.remove();document.body.append(output);output.showModal();
}
async function authenticate(expectedAccount=null){
 await connect();
 if(token){try{const session=await api('/api/session',{},true);accountId=session.siteId;return;}catch(err){if(err.status!==401)throw err;}}
 await login(expectedAccount);
}
async function beginEditing(destination){
 if(busy)return;busy=true;
 try{
  await authenticate();
  const nonce=crypto.randomUUID();sessionStorage.setItem('portfolio-entry:'+nonce,JSON.stringify({token,accountId,at:Date.now()}));
  const url=new URL(destination,location.href);url.searchParams.set('entry',nonce);location.assign(url.href);
 }catch(err){if(!err.cancelled)entryError(err.message);}
 finally{busy=false;}
}
function entryError(message){
 let notice=document.querySelector('#entry-error');if(!notice){notice=document.createElement('p');notice.id='entry-error';notice.setAttribute('role','alert');document.body.append(notice);}
 notice.textContent=message;
}
async function enterEditor(){
 const url=new URL(location.href),nonce=url.searchParams.get('entry');
 url.searchParams.delete('entry');history.replaceState(null,'',url.pathname+url.search);
 try{
  if(nonce){const key='portfolio-entry:'+nonce,stored=sessionStorage.getItem(key);sessionStorage.removeItem(key);const handoff=JSON.parse(stored||'null');
   if(handoff&&Date.now()-handoff.at<120000){token=handoff.token;accountId=handoff.accountId;}}
  if(!token)throw Error('需要登录');
  await connect();const session=await api('/api/session',{},true);accountId=session.siteId;editorOwner=accountId;
  document.documentElement.removeAttribute('data-auth-pending');return accountId;
 }catch{
  const back=new URL('index.html',location.href);back.searchParams.set('edit','1');
  for(const key of ['draft','new'])if(url.searchParams.has(key))back.searchParams.set(key,url.searchParams.get(key));
  location.replace(back.href);return null;
 }
}
async function logout(){const currentToken=token;token=null;accountId=null;editorOwner=null;if(currentToken&&service)await fetch(service+'/api/logout',{method:'POST',headers:{Authorization:'Bearer '+currentToken},signal:AbortSignal.timeout(5000)}).catch(()=>{});}
window.PortfolioGitHub={enterEditor,logout,get accountId(){return accountId;},async save(draftId,html){
 if(busy)throw Error('正在保存，请稍候');busy=true;const owner=editorOwner||accountId;
 try{
  await authenticate(owner);let result;
  try{result=await api('/api/portfolio',{draftId,html},true);}
  catch(err){if(err.status!==401)throw err;await authenticate(owner);result=await api('/api/portfolio',{draftId,html},true);}
  if(!result.saved)throw Error('GitHub 尚未确认保存成功');showResult(result);return result;
 }
 catch(err){if(err.name==='TimeoutError')throw Error('保存等待超时，请稍后重试；本机草稿仍保留');throw err;}
 finally{busy=false;}
}};
const entry=document.querySelector('.template-edit-entry');
if(entry){
 entry.addEventListener('click',e=>{e.preventDefault();beginEditing(entry.href);});
 const params=new URLSearchParams(location.search);
 if(params.has('edit')){
  const destination=new URL(entry.href,location.href);
  if(params.has('draft')){destination.searchParams.delete('new');destination.searchParams.set('draft',params.get('draft'));}
  params.delete('edit');params.delete('draft');params.delete('new');history.replaceState(null,'',location.pathname+(params.size?'?'+params:''));
  beginEditing(destination.href);
 }
}
})();
