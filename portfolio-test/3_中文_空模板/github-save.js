(() => {
'use strict';
let token=null,accountId=null,phone=null,expires=0,role='user',roleVerified=false,editorOwner=null,service=null,busy=false,connecting=null;
const templateBase=new URL('.',document.currentScript.src);
const sessionKey='portfolio-session:'+new URL('../',templateBase).pathname;
function updateAccountUI(){
 const signedIn=!!(token&&phone&&expires>Date.now()),admin=signedIn&&roleVerified&&role==='admin';
 document.documentElement.classList.toggle('role-admin',admin);
 document.querySelectorAll('[data-my-templates]').forEach(el=>el.textContent=admin?'审核管理':'我的模板');
 document.querySelectorAll('[data-admin-reviews]').forEach(el=>el.hidden=!admin);
 document.querySelectorAll('[data-account-role]').forEach(el=>{el.hidden=!admin;el.textContent=admin?'管理员':'';});
 const example=document.querySelector('.template-edit-entry');if(example){const personal=new URLSearchParams(location.search).get('personal')==='1';example.firstChild.textContent=admin&&!personal?'进入审核管理 ':'编辑模板 ';}
 document.querySelectorAll('[data-account-login]').forEach(el=>el.hidden=signedIn);
 document.querySelectorAll('[data-account-user]').forEach(el=>el.hidden=!signedIn);
 document.querySelectorAll('[data-account-phone]').forEach(el=>el.textContent=signedIn?phone:'');
 document.querySelectorAll('[data-account-logout]').forEach(el=>el.hidden=!signedIn);
}
function clearSession(expectedToken=token){
 if(expectedToken!==token)return;
 const old=token;token=null;accountId=null;phone=null;expires=0;role='user';roleVerified=false;
 try{const stored=JSON.parse(localStorage.getItem(sessionKey)||'null');if(!stored||stored.token===old)localStorage.removeItem(sessionKey);}catch{}
 updateAccountUI();
}
function storeSession(session){
 token=session.token||token;accountId=session.siteId;phone=session.phone;expires=session.expires;role=session.role==='admin'?'admin':'user';roleVerified=true;
 try{localStorage.setItem(sessionKey,JSON.stringify({token,siteId:accountId,phone,expires,role}));}catch{}
 updateAccountUI();
}
function restoreStoredSession(){
 try{const stored=JSON.parse(localStorage.getItem(sessionKey)||'null');
  if(stored&&/^[a-f0-9]{64}$/.test(stored.token)&&/^[a-f0-9]{24}$/.test(stored.siteId)&&/^\d{11}$/.test(stored.phone)&&Number.isFinite(stored.expires)&&stored.expires>Date.now()){
   token=stored.token;accountId=stored.siteId;phone=stored.phone;expires=stored.expires;role='user';roleVerified=false;return;
  }
 }catch{}
 token=null;accountId=null;phone=null;expires=0;role='user';roleVerified=false;
}
restoreStoredSession();

const dialog=document.createElement('dialog');dialog.className='github-dialog';
dialog.innerHTML=`<form><h2>登录后编辑模板</h2><p>输入手机号后继续：新用户设置密码，已有账号输入密码。手机号仅作为测试账号，不发送短信。</p><label>手机号<input name="phone" inputmode="numeric" autocomplete="username" pattern="[0-9]{11}" maxlength="11" required placeholder="11 位手机号"></label><label class="password-step" hidden>密码<input name="password" type="password" autocomplete="current-password" minlength="8" maxlength="128"></label><label class="confirm-step" hidden>确认密码<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128"></label><p class="github-error" role="alert"></p><div class="github-actions"><button type="button" data-cancel>取消</button><button type="submit" class="primary">继续</button></div></form>`;
document.body.append(dialog);
const form=dialog.querySelector('form'),error=dialog.querySelector('.github-error');
function connectionError(path){return Error(path.startsWith('/api/portfolio')?'保存服务连接中断，本机草稿仍保留，请稍后再保存。':'登录服务暂时无法连接，请点击继续重试；仍失败时请刷新页面。');}
async function api(path,body,auth=false){
 await connect();
 const requestToken=token;
 const request=()=>fetch(service+path,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+requestToken}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(path.endsWith('/asset')||path.endsWith('/file')||path.endsWith('/publish')?300000:path==='/api/portfolio'||path.endsWith('/save')?180000:path.endsWith('/approve')?60000:20000)});
 let response;
 try{response=await request();}
 catch{
  service=null;
  // Retry only non-writing authentication operations. Registration and saves
  // may already have reached the server, so never automatically replay them.
  if(!['/api/start','/api/login','/api/session','/api/portfolios','/api/portfolio/load','/api/portfolio/file','/api/admin/session','/api/admin/reviews','/api/admin/review/load','/api/admin/review/file'].includes(path))throw connectionError(path);
  try{await connect();response=await request();}catch{service=null;throw connectionError(path);}
 }
 if(response.status>=500){
  service=null;
  if(!['/api/start','/api/login','/api/session','/api/portfolios','/api/portfolio/load','/api/portfolio/file','/api/admin/session','/api/admin/reviews','/api/admin/review/load','/api/admin/review/file'].includes(path))throw connectionError(path);
  try{await connect();response=await request();}catch{service=null;throw connectionError(path);}
 }
 const result=await response.json().catch(()=>({error:'登录或保存服务返回异常，请稍后重试'}));
 if(!response.ok){if(response.status===401)clearSession(requestToken);throw Object.assign(Error(result.error||'请求失败，请重试'),{status:response.status,issues:result.issues});}return result;
}
async function connect(){
 if(service)return;if(connecting)return connecting;
 connecting=(async()=>{
  const probes=new Map();
  function verify(config){
   const url=new URL(config.saveServiceUrl),address=url.href.replace(/\/$/,'');
   if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!['https:','http:'].includes(url.protocol)||url.hostname==='api.trycloudflare.com')throw Error('Invalid service address');
   if(url.protocol==='http:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Invalid service address');
   if(!probes.has(address))probes.set(address,(async()=>{const response=await fetch(address+'/api/status',{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(7000)});const data=await response.json();if(!response.ok||!data.ready||!data.accounts||!data.portfolios)throw Error('Service not ready');return address;})());
   return probes.get(address);
  }
  const stamp=Date.now(),path='portfolio-test/3_%E4%B8%AD%E6%96%87_%E7%A9%BA%E6%A8%A1%E6%9D%BF/save-config.json';
  const local=new URL('save-config.json',templateBase);local.searchParams.set('t',stamp);
  const sources=[{url:local.href},{url:'https://raw.githubusercontent.com/lkbDesigner/yepian-template-editor-demo/main/'+path+'?t='+stamp},{url:'https://api.github.com/repos/lkbDesigner/yepian-template-editor-demo/contents/'+path+'?ref=main&t='+stamp,encoded:true}];
  try{
   // These fixed public config requests carry no account/session data. Race them
   // so stale Pages caches or one unavailable GitHub endpoint cannot block login.
   service=await Promise.any(sources.map(async source=>{const response=await fetch(source.url,{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('Configuration unavailable');let config=await response.json();if(source.encoded)config=JSON.parse(atob(config.content.replace(/\s/g,'')));return verify(config);}));
   document.querySelector('#entry-error')?.remove();
  }catch{service=null;throw Error('登录与保存服务暂时无法连接，请稍后点击“重试连接”；本机草稿仍保留');}
 })();try{return await connecting;}finally{connecting=null;}
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
 if(action==='start'){action=result.existing?'login':'register';form.phone.readOnly=true;form.password.required=true;form.confirmPassword.required=!result.existing;dialog.querySelector('.password-step').hidden=false;dialog.querySelector('.confirm-step').hidden=result.existing;const intent=dialog.dataset.intent;const next=intent==='library'?'查看模板':'进入编辑';submit.textContent=intent==='home'?(result.existing?'登录':'注册并登录'):(result.existing?'登录并':'注册并')+next;form.password.autocomplete=result.existing?'current-password':'new-password';form.password.focus();}
 else{if(expectedAccount&&result.siteId!==expectedAccount){token=result.token;await api('/api/logout',{},true).catch(()=>{});token=null;throw Error('请使用当前作品所属的账号登录');}storeSession(result);form.password.value='';form.confirmPassword.value='';dialog.close();resolve();}}
 catch(err){error.textContent=err.message;}finally{working=false;submit.disabled=false;}};
 dialog.showModal();form.phone.focus();
 });}
function showResult(){
 const output=document.createElement('dialog');output.className='github-dialog';
 output.innerHTML='<h2>已保存</h2><p>模板、附件和补充资料已保存到 GitHub。当前仅你可查看，点击“上传审核”后管理员才能查看。</p><button autofocus>继续编辑</button>';
 output.querySelector('button').onclick=()=>output.close();output.onclose=()=>output.remove();document.body.append(output);output.showModal();
}
async function authenticate(expectedAccount=null){
 if(!token)restoreStoredSession();
 await connect();
 if(token){try{const checkedToken=token;const session=await api('/api/session',{},true);if(token!==checkedToken)throw Error('登录状态已变化，请重试');if(expectedAccount&&session.siteId!==expectedAccount)throw Error('当前作品属于其他账号，请切换回原账号后继续编辑');storeSession(session);return;}catch(err){if(err.status!==401)throw err;}}
 await login(expectedAccount);
}
async function beginEditing(destination,options={}){
 if(busy)return;busy=true;
 const editing=new URL(destination,location.href).pathname.endsWith('/editor.html');dialog.dataset.intent=editing?'editor':'library';dialog.querySelector('h2').textContent=editing?'登录后编辑模板':'登录后查看我的模板';
 try{
  await authenticate();
  const nonce=crypto.randomUUID();sessionStorage.setItem('portfolio-entry:'+nonce,JSON.stringify({token,accountId,phone,expires,at:Date.now()}));
  let url=new URL(destination,location.href);
  if(options.workspace)url=new URL(role==='admin'?'../0.design 首页/admin-reviews.html':'../0.design 首页/my-templates.html',templateBase);
  if(role==='admin'&&url.pathname.endsWith('/editor.html')&&url.searchParams.get('from')!=='templates'&&url.searchParams.get('personal')!=='1'&&!url.searchParams.has('review'))url=new URL('../0.design 首页/admin-reviews.html',templateBase);
  url.searchParams.set('entry',nonce);location.assign(url.href);
 }catch(err){if(!err.cancelled)entryError(err.message,()=>beginEditing(destination,options));}
 finally{busy=false;}
}
function entryError(message,retry){
 let notice=document.querySelector('#entry-error');if(!notice){notice=document.createElement('p');notice.id='entry-error';notice.setAttribute('role','alert');document.body.append(notice);}
 notice.replaceChildren(document.createTextNode(message));
 if(retry){const button=document.createElement('button');button.type='button';button.className='entry-retry';button.textContent='重试连接';button.onclick=()=>{notice.remove();service=null;retry();};notice.append(button);}
}
function receiveSession(){
 const url=new URL(location.href),nonce=url.searchParams.get('entry');
 url.searchParams.delete('entry');history.replaceState(null,'',url.pathname+url.search);
 if(nonce){const key='portfolio-entry:'+nonce,stored=sessionStorage.getItem(key);sessionStorage.removeItem(key);const handoff=JSON.parse(stored||'null');
  if(handoff&&Date.now()-handoff.at<120000){token=handoff.token;accountId=handoff.accountId;phone=handoff.phone;expires=handoff.expires;}}
 return url;
}
async function accountSession(){
 dialog.dataset.intent='library';dialog.querySelector('h2').textContent='登录后查看我的模板';
 receiveSession();await authenticate();return accountId;
}
async function enterEditor(){
 const url=receiveSession();dialog.dataset.intent='editor';dialog.querySelector('h2').textContent='登录后编辑模板';
 try{
  await authenticate();editorOwner=accountId;
  if(role==='admin'&&url.searchParams.get('from')!=='templates'&&url.searchParams.get('personal')!=='1'&&!url.searchParams.has('review')){location.replace(new URL('../0.design 首页/admin-reviews.html',templateBase).href);return null;}
  document.documentElement.removeAttribute('data-auth-pending');return accountId;
 }catch(error){
  if(error.cancelled){const back=new URL('index.html',location.href);for(const key of ['preset','personal'])if(url.searchParams.has(key))back.searchParams.set(key,url.searchParams.get(key));location.replace(back.href);return null;}
  throw error;
 }
}

async function logout(){
 const currentToken=token;clearSession();editorOwner=null;
 if(currentToken){try{await connect();await fetch(service+'/api/logout',{method:'POST',headers:{Authorization:'Bearer '+currentToken},signal:AbortSignal.timeout(5000)});}catch{}}
}
async function loginOnHome(){
 if(busy)return;busy=true;dialog.dataset.intent='home';dialog.querySelector('h2').textContent='登录账号';
 try{await authenticate();if(role==='admin')location.assign(new URL('../0.design 首页/admin-reviews.html',templateBase).href);}catch(err){if(!err.cancelled)entryError(err.message,loginOnHome);}finally{busy=false;}
}
async function packDraft(draft,progress,reviewId=null){
 let count=0,done=0;
 function countFiles(value){if(!value||typeof value!=='object')return;if(typeof value.data==='string'&&value.data.startsWith('data:')&&typeof value.name==='string'){count++;return;}for(const child of Object.values(value))countFiles(child);}
 countFiles(draft);
 async function walk(value){
  if(!value||typeof value!=='object')return value;
  if(value.storage?.__privateAsset===1&&value.data===null)return value.storage;
  if(typeof value.data==='string'&&value.data.startsWith('data:')&&typeof value.name==='string'){
   progress('正在保存附件 '+(++done)+' / '+count);
   let ref=value.storage;
   if(!ref||ref.name!==value.name||ref.size!==value.size||ref.type!==(value.type||'application/octet-stream')){
    ref=(await api(reviewId?'/api/admin/review/asset':'/api/portfolio/asset',{...(reviewId?{reviewId}:{draftId:draft.id}),file:{name:value.name,size:value.size,type:value.type||'',data:value.data}},true)).file;value.storage=ref;
   }
   return ref;
  }
  if(Array.isArray(value)){const result=[];for(const v of value)result.push(await walk(v));return result;}
  const result={};for(const [key,v]of Object.entries(value)){if(['remote','github','owner','localBackup'].includes(key)&&value===draft)continue;result[key]=await walk(v);}return result;
 }
 return walk(draft);
}
async function hydrateDraft(record,cached){
 const files=new Map();
 function collect(v){if(!v||typeof v!=='object')return;if(v.storage?.proof&&v.data){files.set(v.storage.proof,v);return;}for(const child of Object.values(v))collect(child);}
 collect(cached);
 async function walk(v){
  if(!v||typeof v!=='object')return v;
  if(v.__privateAsset===1){if(!files.has(v.proof))files.set(v.proof,(await api(record.review?'/api/admin/review/file':'/api/portfolio/file',record.review?{reviewId:record.review.reviewId,file:v}:{draftId:record.draftId,file:v},true)).file);return structuredClone(files.get(v.proof));}
  if(Array.isArray(v)){const result=[];for(const item of v)result.push(await walk(item));return result;}
  const result={};for(const [key,child]of Object.entries(v)){if(record.review&&key==='files'&&Array.isArray(child))result[key]=child.map(f=>f.__privateAsset===1?{name:f.name,size:f.size,type:f.type,data:null,storage:f}:f);else result[key]=await walk(child);}return result;
 }
 const state=await walk(record.state);state.remote={revision:record.revision,savedAt:record.updatedAt,savedUpdated:state.updated,status:record.status||'editing',reviewId:record.reviewId||record.review?.reviewId||null,submittedAt:record.submittedAt,approvedAt:record.approvedAt,publication:record.publication||null};return state;
}
window.PortfolioGitHub={enterEditor,logout,accountSession,async adminSession(){await accountSession();return api('/api/admin/session',{},true);},async reviews(){await authenticate();return api('/api/admin/reviews',{},true);},open:beginEditing,async list(){await authenticate();return (await api('/api/portfolios',{},true)).templates;},
 async approve(reviewId,baseRevision){await authenticate();return api('/api/admin/review/approve',{reviewId,baseRevision},true);},
 async publish(draftId,baseRevision){await authenticate(editorOwner||accountId);return api('/api/portfolio/publish',{draftId,baseRevision},true);},
 async saveReview(reviewId,draft,progress=()=>{}){if(busy)throw Error('正在保存，请稍候');busy=true;try{await authenticate();const state=await packDraft(draft,progress,reviewId);return await api('/api/admin/review/save',{reviewId,state,baseRevision:draft.remote.revision},true);}finally{busy=false;}},
 async submit(draftId,baseRevision){await authenticate(editorOwner||accountId);return api('/api/portfolio/submit',{draftId,baseRevision},true);},
 async withdraw(draftId,baseRevision){await authenticate(editorOwner||accountId);return api('/api/portfolio/withdraw',{draftId,baseRevision},true);},
 async reviewFile(reviewId,file){await authenticate();return (await api('/api/admin/review/file',{reviewId,file},true)).file;},
 async reviewRead(reviewId){await authenticate();return api('/api/admin/review/load',{reviewId},true);},
 async read(draftId){await authenticate(editorOwner||accountId);return api('/api/portfolio/load',{draftId},true);},
 hydrate:hydrateDraft,
 get accountId(){return accountId;},get phone(){return phone;},get role(){return roleVerified?role:'user';},
 async save(draft,progress=()=>{},options={}){
  if(busy)throw Error('正在保存，请稍候');busy=true;const owner=editorOwner||draft.owner||accountId;
  try{
   await authenticate(owner);const state=await packDraft(draft,progress);progress('正在保存模板…');
   const input={draftId:draft.id,state,baseRevision:draft.remote?.revision||null,requestId:crypto.randomUUID()};
   const result=await api('/api/portfolio',input,true);if(!result.saved||!result.private||!['editing','approved','published'].includes(result.status))throw Error('保存尚未完成，请重试');if(!options.silent)showResult();return result;
  }catch(err){if(err.name==='TimeoutError')throw Error('保存等待超时，本机资料仍保留，请稍后再次保存');throw err;}finally{busy=false;}
 }
};
document.querySelectorAll('[data-my-templates]').forEach(button=>button.addEventListener('click',()=>beginEditing(new URL('../0.design 首页/my-templates.html',templateBase).href,{workspace:true})));
document.querySelectorAll('[data-admin-reviews]').forEach(link=>link.addEventListener('click',e=>{e.preventDefault();beginEditing(new URL('../0.design 首页/admin-reviews.html',templateBase).href);}));
document.querySelectorAll('[data-account-login]').forEach(button=>{
 const group=document.createElement('span');group.dataset.accountUser='';group.className='account-user';group.hidden=true;
 const number=document.createElement('span');number.dataset.accountPhone='';group.append(number);
 const badge=document.createElement('small');badge.dataset.accountRole='';badge.hidden=true;group.append(badge);
 const out=document.createElement('button');out.type='button';out.textContent='退出登录';out.dataset.accountLogout='';group.append(out);button.before(group);
 button.addEventListener('click',loginOnHome);
});
document.querySelectorAll('[data-account-logout]').forEach(button=>button.addEventListener('click',async()=>{
 button.disabled=true;try{await logout();if(!document.querySelector('[data-account-login]'))location.replace(new URL('../0.design 首页/index.html',templateBase).href);}finally{button.disabled=false;}
}));
updateAccountUI();
async function verifyDisplayedSession(){
 if(!token)return;
 try{await connect();const checkedToken=token;const session=await api('/api/session',{},true);if(token===checkedToken)storeSession(session);}catch(err){if(err.status===401)clearSession();}
}
if(document.querySelector('[data-account-login],.template-edit-entry'))verifyDisplayedSession();
addEventListener('pageshow',e=>{if(e.persisted){restoreStoredSession();updateAccountUI();verifyDisplayedSession();}});
addEventListener('storage',e=>{
 if(e.key!==sessionKey&&e.key!==null)return;
 const previous=accountId;restoreStoredSession();updateAccountUI();
 if(previous&&previous!==accountId&&!document.querySelector('[data-account-login]')){
  dispatchEvent(new Event('portfolio-session-ended'));
 }else verifyDisplayedSession();
});
if(new URLSearchParams(location.search).get('personal')==='1')document.querySelectorAll('#portfolio-grid a').forEach(link=>{const url=new URL(link.href,location.href);if(url.origin===location.origin&&[new URL('index.html',templateBase).pathname,new URL('editor.html',templateBase).pathname].includes(url.pathname)){url.searchParams.set('personal','1');if(url.pathname.endsWith('/editor.html'))url.searchParams.set('from','templates');link.href=url.href;}});
const entry=document.querySelector('.template-edit-entry');
if(entry){
 if(new URLSearchParams(location.search).get('preset')==='filled'){const filled=new URL(entry.href,location.href);filled.searchParams.set('preset','filled');entry.href=filled.href;}
 entry.addEventListener('click',e=>{e.preventDefault();const url=new URL(entry.href,location.href);if(new URLSearchParams(location.search).get('personal')==='1'){url.searchParams.set('personal','1');url.searchParams.set('from','templates');}beginEditing(url.href);});
 const params=new URLSearchParams(location.search);
 if(params.has('edit')){
  const destination=new URL(entry.href,location.href);
  if(params.has('draft')){destination.searchParams.delete('new');destination.searchParams.set('draft',params.get('draft'));}
  if(params.get('from')==='templates')destination.searchParams.set('from','templates');
  params.delete('edit');params.delete('draft');params.delete('new');params.delete('from');history.replaceState(null,'',location.pathname+(params.size?'?'+params:''));
  beginEditing(destination.href);
 }
}
})();
