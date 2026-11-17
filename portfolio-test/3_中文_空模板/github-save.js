(() => {
'use strict';
let token=null,service=null,busy=false;
const dialog=document.createElement('dialog');dialog.className='github-dialog';
dialog.innerHTML=`<form><h2>保存到 GitHub</h2><p>手机号仅作为测试账号，不发送短信。公开网页包含你填写的内容、图片和简历；作品原始附件与制作备注仍只保存在本机。</p><label>手机号<input name="phone" inputmode="numeric" autocomplete="username" pattern="[0-9]{11}" maxlength="11" required placeholder="11 位手机号"></label><label class="password-step" hidden>密码<input name="password" type="password" autocomplete="current-password" minlength="8" maxlength="128"></label><label class="confirm-step" hidden>确认密码<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128"></label><p class="github-error" role="alert"></p><div class="github-actions"><button type="button" data-cancel>取消</button><button type="submit" class="primary">继续</button></div></form>`;
document.body.append(dialog);
const form=dialog.querySelector('form'),error=dialog.querySelector('.github-error');
async function api(path,body,auth=false){
 const response=await fetch(service+path,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(180000)});
 const result=await response.json().catch(()=>({error:'服务返回异常，请稍后重试'}));
 if(!response.ok){if(response.status===401)token=null;throw Error(result.error||'保存失败，请重试');}return result;
}
async function connect(){
 if(service)return;
 try{const res=await fetch('./save-config.json',{cache:'no-store'});const config=await res.json();service=new URL(config.saveServiceUrl).href.replace(/\/$/,'');const status=await fetch(service+'/api/status',{signal:AbortSignal.timeout(15000)});const data=await status.json();if(!status.ok||!data.ready||!data.portfolios)throw Error();}
 catch{service=null;throw Error('本机测试保存服务未连接，请联系管理员启动服务和通道；本机草稿仍保留');}
}
function login(){return new Promise((resolve,reject)=>{
 let action='start',working=false;form.reset();error.textContent='';
 form.phone.readOnly=false;form.password.required=false;form.confirmPassword.required=false;
 dialog.querySelector('.password-step').hidden=true;dialog.querySelector('.confirm-step').hidden=true;
 const submit=form.querySelector('[type=submit]');submit.textContent='继续';submit.disabled=false;
 const cancel=()=>{if(working)return;dialog.close();reject(Error('已取消 GitHub 保存，本机草稿仍保留'));};
 dialog.querySelector('[data-cancel]').onclick=cancel;dialog.oncancel=e=>{e.preventDefault();cancel();};
 form.onsubmit=async e=>{e.preventDefault();if(working||!form.reportValidity())return;working=true;submit.disabled=true;error.textContent='';
 try{const result=await api('/api/'+action,{phone:form.phone.value,password:form.password.value,confirmPassword:form.confirmPassword.value,clientVersion:2,template:'chinese-portfolio'});
 if(action==='start'){action=result.existing?'login':'register';form.phone.readOnly=true;form.password.required=true;form.confirmPassword.required=!result.existing;dialog.querySelector('.password-step').hidden=false;dialog.querySelector('.confirm-step').hidden=result.existing;submit.textContent=result.existing?'登录并保存':'注册并保存';form.password.autocomplete=result.existing?'current-password':'new-password';form.password.focus();}
 else{token=result.token;dialog.close();resolve();}}
 catch(err){error.textContent=err.message;}finally{working=false;submit.disabled=false;}};
 dialog.showModal();form.phone.focus();
 });}
function showResult(result){
 const output=document.createElement('dialog');output.className='github-dialog';
 output.innerHTML='<h2>已保存到 GitHub</h2><p>网页首次生成或更新可能需要几分钟。继续编辑后再次保存，会更新同一个网页。</p><p><a target="_blank" rel="noopener" data-site>打开作品集网页 ↗</a></p><p><a target="_blank" rel="noopener" data-commit>查看 GitHub 保存记录 ↗</a></p><button autofocus>继续编辑</button>';
 output.querySelector('[data-site]').href=result.url;output.querySelector('[data-commit]').href=result.commitUrl;
 output.querySelector('button').onclick=()=>output.close();output.onclose=()=>output.remove();document.body.append(output);output.showModal();
}
window.PortfolioGitHub={async save(draftId,html){
 if(busy)throw Error('正在保存，请稍候');busy=true;
 try{await connect();if(!token)await login();const result=await api('/api/portfolio',{draftId,html},true);if(!result.saved)throw Error('GitHub 尚未确认保存成功');showResult(result);return result;}
 catch(err){if(err.name==='TimeoutError')throw Error('保存等待超时，请稍后重试；本机草稿仍保留');throw err;}
 finally{busy=false;}
}};
})();
