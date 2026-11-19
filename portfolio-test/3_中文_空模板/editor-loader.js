(async()=>{
'use strict';
const screen=document.querySelector('#editor-loading'),message=screen.querySelector('[data-loading-message]'),retry=screen.querySelector('button');
let timer;function stage(text){message.textContent=text;}function fail(error){clearTimeout(timer);screen.classList.add('loading-failed');stage(error?.message||'模板未能加载，请重试');retry.hidden=false;}
window.PortfolioEditorBoot={authorized:false,stage,fail,ready(){clearTimeout(timer);screen.remove();}};
retry.onclick=()=>{const url=new URL(location.href);url.searchParams.set('retry',Date.now());location.replace(url.href);};
function load(file){return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=file;const timeout=setTimeout(()=>{script.remove();reject(Error('模板资源加载超时，请检查网络后重试'));},20000);script.onload=()=>{clearTimeout(timeout);resolve();};script.onerror=()=>{clearTimeout(timeout);reject(Error('模板资源未能下载，请重试'));};document.head.append(script);});}
try{
 timer=setTimeout(()=>fail(Error('模板加载时间较长，请重试；已保存的内容不会丢失')),60000);
 stage('正在验证登录…');if(!window.PortfolioGitHub)throw Error('登录组件未能加载，请重试');if(!await PortfolioGitHub.enterEditor())return;
 PortfolioEditorBoot.authorized=true;stage('正在加载空白模板…');await load('template-source.js?v=light-template-1');await load('template-engine.js?v=review-publish-1');
 stage('正在读取模板内容…');await load('editor.js?v=review-publish-1');
}catch(error){fail(error);}
})();
