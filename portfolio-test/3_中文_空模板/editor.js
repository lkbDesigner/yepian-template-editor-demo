(async()=>{
'use strict';
if(!await PortfolioGitHub.enterEditor())return;
const E=TemplateEngine,$=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let draftEpoch=0,resetting=false,publishing=false;let queue=[];let db,state,page='home',opened='home-top',scroll=0,timer,toastTimer,selection=null,pending=null,editing=null,ready=false,previewLoad=null,saving=Promise.resolve();const defaults={};
let locating=false,locateKey=null,locateAfterLoad=null;
const frame=$('#canvas'),itemFrame=$('#item-canvas');const DB='portfolio-chinese-template-20261117',current='portfolio-chinese-template-current:'+PortfolioGitHub.accountId;
function toast(s){$('#toast').textContent=s;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3000);}
try{db=await new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}catch{toast('浏览器存储不可用，请使用备份资料');}
async function get(id){if(!db||!id)return null;return new Promise((resolve,reject)=>{let r=db.transaction('drafts').objectStore('drafts').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function save(announce=false){if(resetting)return false;clearTimeout(timer);if(pending&&announce){toast('请先保存或取消作品资料弹窗');return false;}if(!db){toast('存储不可用，请下载备份');return false;}
 const titleFields=['home-top','global'].flatMap(id=>E.definitions.find(d=>d.id===id)?.fields||[]);state.title=titleFields.filter(f=>!state.hidden?.[f.id]&&['text','textarea'].includes(f.type)).map(f=>state.values[f.id]).find(v=>typeof v==='string'&&v.trim())?.trim().slice(0,100)||'中文作品集模板';
 const snapshot=structuredClone(state);try{await(saving=saving.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(snapshot);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);})));if(state.updated===snapshot.updated)$('#status').textContent='已保存到本机';localStorage.setItem(current,state.id);if(announce)toast('已保存到当前浏览器');return true;}catch{$('#status').textContent='保存失败';toast('保存失败，请下载备份');return false;}}
const params=new URLSearchParams(location.search);const id=params.get('draft')||localStorage.getItem(current);
try{state=params.has('new')?E.empty():await get(id);}catch{state=null;}
if(params.has('draft')&&!params.has('new')&&(!state||state.owner&&state.owner!==PortfolioGitHub.accountId)){await PortfolioGitHub.open(new URL('../0.design 首页/my-templates.html?missing=1',location.href).href);return;}
state||=E.empty();
if(state.owner&&state.owner!==PortfolioGitHub.accountId)state=E.empty();
state.owner=PortfolioGitHub.accountId;
const footerMigration=E.migrateSharedFooter(state);
if(footerMigration.conflicts)toast('联系与页脚已合并，优先沿用首页内容；原有差异仍保留在资料备份中');
params.delete('new');params.set('draft',state.id);history.replaceState(null,'',location.pathname+'?'+params);localStorage.setItem(current,state.id);
function dirty(){if(locating)locatorUI();state.updated=Math.max(Date.now(),state.updated+1);$('#status').textContent='正在保存…';clearTimeout(timer);timer=setTimeout(()=>save(),650);}
function post(message,modal=false){if(!modal&&!ready){queue.push(message);return;}(modal?itemFrame:frame).contentWindow?.postMessage({type:'template-patch',...message},'*');}
function dataFor(item){if(item==='pending')return pending;if(!item)return state;return Object.values(state.repeats).flat().find(i=>i.id===item);}
function context(el){return {id:el.dataset.field,item:el.dataset.item||null};}
function inputHTML(f,data,item=null){const attrs=`data-field="${f.id}" ${item?`data-item="${item}"`:''}`;
 if(data.hidden?.[f.id])return `<div class="removed"><b>${esc(f.label)} · 已删除</b><button type="button" data-restore="${f.id}" ${item?`data-item="${item}"`:''}>撤回删除</button></div>`;
 const v=data.values?.[f.id];const isText=['text','textarea'].includes(f.type);const title=`<div class="field-head"><span>${esc(f.label)}</span>${isText?`<button type="button" class="color" ${attrs} data-color aria-label="${esc(f.label)}文字颜色" style="--color:${esc(data.colors?.[f.id]||'#f2f2f5')}"></button>`:''}<button type="button" class="delete" data-delete="${f.id}" ${item?`data-item="${item}"`:''}>删除</button></div>`;
 let control='';
 if(f.type==='image'||f.type==='resume')control=(v?`${f.type==='image'?`<img class="file-thumb" src="${esc(v.data)}" alt="已上传图片">`:''}<p class="file-summary">${esc(v.name)} · ${(v.size/1048576).toFixed(2)} MB</p>`:'')+`<label class="upload">${f.type==='resume'?'上传 PDF 简历':'上传 / 替换'+esc(f.label)}<input type="file" ${attrs} data-upload accept="${f.type==='resume'?'application/pdf': 'image/png,image/jpeg,image/webp,image/gif'}"></label>`;
 else if(f.type==='textarea')control=`<textarea ${attrs} placeholder="${esc(f.placeholder)}">${esc(v??f.initial??'')}</textarea>`;
 else control=`<input ${attrs} type="${f.type==='url'?'url':'text'}" value="${esc(v??f.initial??'')}" placeholder="${esc(f.placeholder)}">`;
 return `<div class="field">${title}${control}</div>`;
}
function collectionHTML(cid){const c=E.collections[cid];return `<div class="collection-title"><b>${esc(c.label)}</b><span>${state.repeats[cid].filter(i=>!i.deleted).length} 项</span></div>`+state.repeats[cid].map((item,i)=>{
 if(item.deleted)return `<div class="removed"><b>${esc(c.label)} ${i+1} · 已删除</b><button data-restore-item="${item.id}" data-cid="${cid}">撤回删除</button></div>`;
 const t=c.templates[item.variant%c.templates.length],title=t.fields.find(f=>f.label==='标题'||f.label==='主标题');
 const label=title?item.values[title.id]||c.label+' '+(i+1):c.label+' '+(i+1);
 const actions=`<div class="item-actions">${c.project?`<button data-edit="${item.id}" data-cid="${cid}">编辑资料</button>`:'<span></span>'}<button data-delete-item="${item.id}" data-cid="${cid}">删除</button></div>`;
 if(c.project)return `<div class="item-row"><b>${esc(label)}</b>${actions}</div>`;
 return `<details class="item-row" data-repeat="${item.id}"><summary>${esc(label)}</summary><div class="repeat-fields">${t.fields.map(f=>inputHTML(f,item,item.id)).join('')}${actions}</div></details>`;
 }).join('')+`<button class="add" data-add="${cid}">＋ 添加${esc(c.label)}</button>`;}
function panel(){const root=$('#panel'),position=root.scrollTop,openedRepeats=[...root.querySelectorAll('[data-repeat][open]')].map(e=>e.dataset.repeat);
 const defs=E.definitions.filter(d=>d.page===page||d.page==='global'&&E.pages[page].html.includes('data-module="global"'));
 root.innerHTML=`${page!=='home'?`<div class="visibility"><span>在网站中显示${esc(E.pages[page].title)}</span><input type="checkbox" data-tab-toggle ${state.tabs[page]!==false?'checked':''}></div>`:''}`+defs.map(d=>{
  if(state.modules[d.id]===false&&!d.locked)return `<div class="removed"><b>${esc(d.label)} · ${d.shared?'本页已隐藏':'已删除'}</b><button data-restore-module="${d.id}">${d.shared?'恢复本页展示':'撤回删除'}</button></div>`;
  return `<details class="module" data-module="${d.id}" ${opened===d.id?'open':''}><summary><b>${esc(d.label)}</b>${d.locked?'<small>固定模块</small>':`<button data-delete-module="${d.id}">${d.shared?'隐藏本页':'删除模块'}</button>`}</summary><div class="module-content">${d.shared?'<p class="note">内容全站同步；隐藏本页不影响其他页面。简历与“个人标识与简历”共用。</p>':''}${d.fields.map(f=>inputHTML(f,state)).join('')}${d.collections.map(collectionHTML).join('')}</div></details>`;
 }).join('')+`<p class="note">空白内容按原网页结构生成。所有删除均可撤回；作品附件只保存在本机，供后续人工制作。</p>`;
 root.scrollTop=position;for(const id of openedRepeats){const el=root.querySelector('[data-repeat="'+id+'"]');if(el)el.open=true;}
 root.querySelectorAll('details.module').forEach(el=>el.addEventListener('toggle',()=>{if(!el.open)return;const id=el.dataset.module;if(opened===id)return;opened=id;root.querySelectorAll('details.module').forEach(other=>{if(other!==el)other.open=false;});scrollModule(id);el.scrollIntoView({block:'nearest',behavior:'smooth'});}));
}
function tabs(){const root=$('#tabs');root.innerHTML=Object.values(E.pages).filter(p=>['home','projects','ai','about'].includes(p.id)).map(p=>`<button type="button" role="tab" data-page="${p.id}" aria-selected="${page===p.id}">${esc(p.title)}</button>`).join('')+`<select id="detail-page" aria-label="编辑详情页"><option value="">选择作品 / AI 文章详情页</option>${Object.values(E.pages).filter(p=>!['home','projects','ai','about'].includes(p.id)).map(p=>`<option value="${p.id}" ${p.id===page?'selected':''}>${esc(p.title)}</option>`).join('')}</select>`;}
function draw(keep=true){ready=false;previewLoad={scroll:keep?scroll:0};frame.srcdoc=E.render(state,page,true,true);}
function scrollModule(id){// Locate via sandbox-safe messages.
 frame.contentWindow.postMessage({type:'template-locate-module',id},'*');}
// Structural updates restore the current canvas position; text and colors are patched in place.
function refresh(){panel();draw();if(locating)locatorUI();}
function selectPage(id){page=id;opened=E.definitions.find(d=>d.page===page)?.id;scroll=0;selection=null;closePalette();tabs();panel();$('#panel').scrollTop=0;draw(false);}
// Build a stable, deduplicated traversal from the actual template schema.
function locateCatalog(){
 const result=[],seen=new Set();
 function add(f,d,owner,item=null,cid=null){
  const key=(item||'page')+':'+f.id;if(seen.has(key)||d.hidden?.[f.id])return;seen.add(key);
  const value=d.values?.[f.id]??f.initial??'';
  const filled=['image','resume'].includes(f.type)?!!value?.data:!!String(value).trim();
  result.push({key,field:f.id,page:owner.page==='global'?'home':owner.page,module:owner.id,item,cid,filled});
 }
 for(const def of E.definitions){
  if(def.page!=='global'&&state.tabs[def.page]===false)continue;
  if(state.modules[def.id]===false&&!def.locked)continue;
  for(const f of def.fields)add(f,state,def);
  for(const cid of def.collections){const c=E.collections[cid];
   for(const stored of state.repeats[cid]||[]){
    const item=pending&&editing?.id===stored.id?pending:stored;if(item.deleted)continue;
    const t=c.templates[item.variant%c.templates.length];for(const f of t.fields)add(f,item,def,item.id,cid);
   }
  }
 }
 const modules=new Map();
 for(const field of result){
  let entry=modules.get(field.module);
  if(!entry){entry={key:field.module,module:field.module,page:field.page,filled:true};modules.set(field.module,entry);}
  if(!field.filled)entry.filled=false;
 }
 return [...modules.values()];
}
function locatorUI(){
 const count=locateCatalog().filter(t=>!t.filled).length;
 $('#normal-actions').hidden=locating;
 for(const id of ['#locate-actions','#item-locate-actions']){
  const box=$(id);box.hidden=!locating;
  if(!locating)continue;
  // Keep the buttons mounted while typing so keyboard focus is not disturbed.
  if(!box.firstElementChild)box.innerHTML='<span class="locate-count" role="status" aria-live="polite"></span><button type="button" data-locate-step="-1">上一个未编辑模块</button><button type="button" data-locate-step="1">下一个未编辑模块</button><button type="button" data-locate-exit>退出定位模式</button>';
  box.querySelector('.locate-count').textContent=count+' 个待编辑模块';
  box.querySelectorAll('[data-locate-step]').forEach(b=>b.disabled=count===0);
 }
}
function commitLocatedItem(){
 if(!pending)return;
 const list=state.repeats[editing.cid],index=list.findIndex(i=>i.id===editing.id);
 if(index!==-1)list[index]=pending;
 closeItem();dirty();refresh();
}
function focusLocated(target){
 const root=$('#panel'),el=root.querySelector('[data-module="'+target.module+'"]');
 if(!el)return;
 root.querySelectorAll('.locate-current').forEach(n=>n.classList.remove('locate-current'));
 el.classList.add('locate-current');
 el.querySelector('summary')?.focus({preventScroll:true});
 el.scrollIntoView({block:'start',behavior:'smooth'});
 frame.contentWindow.postMessage({type:'template-locate-module',id:target.module,highlight:true},'*');
}
function goLocated(target){
 locateKey=target.key;selection=null;closePalette();
 if(page!==target.page){queue=[];selectPage(target.page);}
 opened=target.module;panel();
 if(ready)focusLocated(target);else locateAfterLoad={target,modal:false};
 locatorUI();
}
function stepLocated(direction,first=false){
 const catalog=locateCatalog(),remaining=catalog.filter(t=>!t.filled);
 if(!remaining.length){locatorUI();toast('当前没有待编辑模块');return;}
 const index=catalog.findIndex(t=>t.key===locateKey);
 const candidates=first?catalog:direction>0?[...catalog.slice(index+1),...catalog.slice(0,index+1)]:[...catalog.slice(0,Math.max(index,0)).reverse(),...catalog.slice(Math.max(index,0)).reverse()];
 const target=candidates.find(t=>!t.filled)||remaining[0];
 commitLocatedItem();goLocated(target);
}
function exitLocator(){
 locating=false;locateKey=null;locateAfterLoad=null;locatorUI();
 frame.contentWindow.postMessage({type:'template-clear-highlight'},'*');
 document.querySelectorAll('.locate-current').forEach(n=>n.classList.remove('locate-current'));
}
$('#locate-unedited').onclick=()=>{locating=true;locatorUI();stepLocated(1,true);};
document.addEventListener('click',e=>{
 const step=e.target.closest('[data-locate-step]');if(step){stepLocated(Number(step.dataset.locateStep));return;}
 if(e.target.closest('[data-locate-exit]'))exitLocator();
});
function makeFile(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve({name:file.name,size:file.size,type:file.type,data:r.result});r.onerror=()=>reject(r.error);r.readAsDataURL(file);});}
async function upload(file,type){if(file.size>(type==='private'?50:10)*1048576)throw Error('文件过大：图片 / 简历 ≤10MB，制作附件 ≤50MB');if(type==='image'&&!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw Error('请选择 PNG、JPG、WebP 或 GIF 图片');if(type==='resume'){const h=await file.slice(0,5).text();if(h!=='%PDF-')throw Error('请选择有效的 PDF 文件');}return makeFile(file);}
function touch(el){const f=E.fields[el.dataset.field];if(!f)return;selection=context(el);post({kind:'focus',...selection,item:selection.item==='pending'?pending.id:selection.item,scroll:selection.item!=='pending'},selection.item==='pending');}
function colorHex(s){if(/^#[0-9a-f]{6}$/i.test(s))return s;const m=s?.match(/[\d.]+/g);return m&&m.length>=3?'#'+m.slice(0,3).map(v=>Math.round(Number(v)).toString(16).padStart(2,'0')).join(''):'#f2f2f5';}
const paletteColors=['#ffffff','#d1d5db','#9298a5','#4b5563','#1f2937','#000000',...Array.from({length:189},(_,i)=>{const hue=Math.floor(i/9)*360/21,light=92-(i%9)*9;const a=document.createElement('canvas').getContext('2d');a.fillStyle=`hsl(${hue} 72% ${light}%)`;return a.fillStyle;})];
function closePalette(){for(const id of ['#palette','#item-palette'])$(id).hidden=true;}
function openPalette(el){touch(el);closePalette();const modal=selection.item==='pending',box=$(modal?'#item-palette':'#palette');const data=dataFor(selection.item);const color=data.colors?.[selection.id]||colorHex(defaults[selection.id]);
 box.innerHTML=`<div class="palette-head"><b>${esc(E.fields[selection.id].label)} · 文字颜色</b><button data-close-color aria-label="关闭色板">×</button></div><div class="swatches">${paletteColors.map(c=>`<button style="--color:${c}" data-swatch="${c}" aria-label="选择 ${c}"></button>`).join('')}</div><div class="picker-tools"><input type="color" value="${color}" aria-label="自定义颜色"><span class="current-color">${color}</span><button data-reset-color>重置默认</button></div>`;box.hidden=false;
}
function setColor(value){if(!selection)return;const d=dataFor(selection.item);d.colors||={};if(value)d.colors[selection.id]=value;else delete d.colors[selection.id];post({kind:'color',...selection,item:selection.item==='pending'?pending.id:selection.item,value},selection.item==='pending');if(selection.item!=='pending')dirty();const box=$(selection.item==='pending'?'#item-palette':'#palette');const c=value||colorHex(defaults[selection.id]);box.querySelector('.current-color').textContent=c;box.querySelector('input').value=c;}
function showItem(cid,id){editing={cid,id};pending=structuredClone(state.repeats[cid].find(i=>i.id===id));$('#item-dialog').showModal();paintItem();drawItem();if(locating)locatorUI();}
function paintItem(){const c=E.collections[editing.cid],t=c.templates[pending.variant%c.templates.length];$('#item-fields').innerHTML=t.fields.map(f=>inputHTML(f,pending,'pending')).join('')+`<hr><h3>制作资料</h3><label class="field"><div class="field-head">原始附件 · PDF / ZIP / Sketch / Figma 文件</div><input type="file" multiple data-private-upload></label><div>${pending.files.map((f,i)=>`<p class="file-summary">${esc(f.name)} <button data-remove-file="${i}">移除</button></p>`).join('')}</div>${['links','notes','style'].map(k=>`<label class="field"><div class="field-head">${{links:'原始链接（每行一条）',notes:'补充要求（选填）',style:'风格 / 颜色参考（选填）'}[k]}</div><textarea data-private="${k}">${esc(pending[k])}</textarea></label>`).join('')}`;}
function drawItem(){const sandbox=structuredClone(state);sandbox.repeats[editing.cid]=[pending];let html=E.render(sandbox,'home',true,true);const d=new DOMParser().parseFromString(html,'text/html');const card=d.querySelector('[data-item="'+pending.id+'"]');const runtime=d.querySelector('body>script');d.body.replaceChildren();if(card)d.body.append(card);if(runtime)d.body.append(runtime);const style=d.createElement('style');style.textContent='body{margin:0;padding:0;background:#101114}.project-card{width:100%!important;height:340px!important;min-height:0!important;border-radius:14px!important;grid-column:auto!important}.project-copy{padding:24px!important;width:100%!important}.project-copy h3{font-size:25px!important;white-space:normal!important}.project-copy p{font-size:13px!important}.client-logo{font-size:14px!important}.meituan-cover-metrics strong{font-size:28px!important}';d.head.append(style);itemFrame.srcdoc='<!doctype html>'+d.documentElement.outerHTML;}
function closeItem(){pending=null;editing=null;closePalette();$('#item-dialog').close();if(locating)locatorUI();}
function download(name,body,type){const url=URL.createObjectURL(new Blob(['\uFEFF',body],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function openPreview(){if(pending){toast('请先保存作品资料');return;}const html=E.publicHTML(state,page);const url=URL.createObjectURL(new Blob(['\uFEFF',html],{type:'text/html;charset=utf-8'}));window.open(url,'_blank');setTimeout(()=>URL.revokeObjectURL(url),120000);}
$('#tabs').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b)selectPage(b.dataset.page);});
document.addEventListener('focusin',e=>{if(e.target.matches('input[data-field],textarea[data-field]')){closePalette();touch(e.target);}});
document.addEventListener('input',e=>{
 const el=e.target;
 if(el.matches('input[type=color]')){setColor(el.value);return;}
 if(el.matches('[data-private]')){pending[el.dataset.private]=el.value;return;}
 if(!el.matches('input[data-field]:not([type=file]),textarea[data-field]'))return;
 const ctx=context(el),data=dataFor(ctx.item),f=E.fields[ctx.id];data.values[ctx.id]=el.value;post({kind:'value',...ctx,item:ctx.item==='pending'?pending.id:ctx.item,value:el.value,placeholder:f.placeholder},ctx.item==='pending');if(ctx.item!=='pending')dirty();else if(locating)locatorUI();
});
document.addEventListener('change',async e=>{
 const el=e.target;const uploadEpoch=draftEpoch,uploadPending=pending;
 if(el.matches('#detail-page')){if(el.value)selectPage(el.value);return;}
 if(el.matches('[data-tab-toggle]')){state.tabs[page]=el.checked;dirty();draw();return;}
 if(el.matches('[data-private-upload]')){try{const files=await Promise.all([...el.files].map(f=>upload(f,'private')));if(uploadEpoch!==draftEpoch||pending!==uploadPending||!pending)return;pending.files.push(...files);paintItem();}catch(err){toast(err.message);}return;}
 if(!el.matches('[data-upload]')||!el.files[0])return;
 try{const f=E.fields[el.dataset.field],v=await upload(el.files[0],f.type);if(uploadEpoch!==draftEpoch||(el.dataset.item==='pending'&&pending!==uploadPending))return;const target=dataFor(el.dataset.item);if(!target)return;target.values[f.id]=v;if(el.dataset.item==='pending'){paintItem();drawItem();if(locating)locatorUI();}else{dirty();refresh();}}catch(err){toast(err.message);}
});
document.addEventListener('click',e=>{
 const b=e.target.closest('button');
 if(b?.matches('[data-color]')){openPalette(b);return;}
 if(b?.matches('[data-swatch]')){setColor(b.dataset.swatch);return;}
 if(b?.matches('[data-reset-color]')){setColor(null);return;}
 if(b?.matches('[data-close-color]')){closePalette();return;}
 if(!e.target.closest('#palette,#item-palette'))closePalette();
 if(!b)return;let structural=false;
 if(b.dataset.delete||b.dataset.restore){const id=b.dataset.delete||b.dataset.restore,d=dataFor(b.dataset.item);d.hidden||={};d.hidden[id]=!!b.dataset.delete;if(b.dataset.item==='pending'){paintItem();drawItem();if(locating)locatorUI();return;}structural=true;}
 if(b.dataset.deleteModule||b.dataset.restoreModule){const id=b.dataset.deleteModule||b.dataset.restoreModule;state.modules[id]=!b.dataset.deleteModule;structural=true;}
 if(b.dataset.deleteItem||b.dataset.restoreItem){const id=b.dataset.deleteItem||b.dataset.restoreItem;state.repeats[b.dataset.cid].find(i=>i.id===id).deleted=!!b.dataset.deleteItem;structural=true;}
 if(b.dataset.add){const c=E.collections[b.dataset.add];state.repeats[c.id].push(E.emptyItem(c,state.repeats[c.id].length));structural=true;}
 if(b.dataset.edit){showItem(b.dataset.cid,b.dataset.edit);return;}
 if(b.dataset.removeFile!==undefined){pending.files.splice(Number(b.dataset.removeFile),1);paintItem();return;}
 if(structural){dirty();refresh();}
});
addEventListener('message',e=>{
 const modal=e.source===itemFrame.contentWindow;if(e.source!==frame.contentWindow&&!modal)return;
 if(e.data?.type==='template-canvas-pointer'){closePalette();return;}
 if(e.data?.type==='template-scroll'&&!modal){scroll=e.data.scroll;return;}
 if(e.data?.type==='template-default'){defaults[e.data.id]=e.data.color;return;}
 if(e.data?.type==='template-ready'){
  if(!modal){ready=true;frame.contentWindow.postMessage({type:'template-restore-scroll',scroll:previewLoad?.scroll||0},'*');const pendingQueue=queue;queue=[];pendingQueue.forEach(m=>post(m));}
  if(locating&&locateAfterLoad?.modal===modal){const target=locateAfterLoad.target;locateAfterLoad=null;focusLocated(target);}
 }
 if(e.data?.type==='template-route'&&E.pages[e.data.page])selectPage(e.data.page);
});
$('#save-item').onclick=()=>{state.repeats[editing.cid][state.repeats[editing.cid].findIndex(i=>i.id===editing.id)]=pending;closeItem();dirty();refresh();toast('作品资料已更新');};
$('#close-item').onclick=$('#cancel-item').onclick=closeItem;$('#item-dialog').addEventListener('cancel',()=>{pending=null;editing=null;closePalette();if(locating)locatorUI();});
async function saveGitHub(){
 if(publishing||resetting)return;
 if(!await save())return;
 if(pending){toast('请先保存或取消作品资料弹窗');return;}
 publishing=true;const button=$('#save');button.disabled=true;$('#reset-template').disabled=true;$('#exit').disabled=true;button.textContent='正在保存…';
 try{const result=await PortfolioGitHub.save(state.id,E.publicHTML(structuredClone(state),'home'),state.title);state.github={url:result.url,commitUrl:result.commitUrl,savedAt:Date.now()};await save();toast('已保存到 GitHub');}
 catch(error){toast(error.message);}
 finally{publishing=false;button.disabled=false;$('#reset-template').disabled=false;$('#exit').disabled=false;button.textContent='保存';}
}
$('#save').onclick=saveGitHub;$('#preview').onclick=openPreview;$('#backup').onclick=()=>download('作品集资料备份.json',JSON.stringify(state),'application/json;charset=utf-8');
$('#exit').onclick=async()=>{if(await save()){if(new URLSearchParams(location.search).get('from')==='templates'){await PortfolioGitHub.open(new URL('../0.design 首页/my-templates.html',location.href).href);}else{await PortfolioGitHub.logout();location.href='index.html';}}};
const resetDialog=$('#reset-dialog');
function closeReset(){if(!resetting)resetDialog.close();}
$('#reset-template').onclick=()=>{closePalette();$('#reset-error').hidden=true;resetDialog.showModal();$('#cancel-reset').focus();};
$('#cancel-reset').onclick=$('#close-reset').onclick=closeReset;
resetDialog.addEventListener('cancel',e=>{if(resetting)e.preventDefault();});
$('#confirm-reset').onclick=async()=>{
 if(resetting)return;
 if(!db){$('#reset-error').textContent='本机存储不可用，未清空资料。请先备份后重试。';$('#reset-error').hidden=false;return;}
 resetting=true;draftEpoch++;clearTimeout(timer);
 resetDialog.querySelectorAll('button').forEach(b=>b.disabled=true);$('#confirm-reset').textContent='正在还原…';
 const fresh=E.empty();fresh.id=state.id;fresh.owner=state.owner;fresh.updated=Math.max(Date.now(),state.updated+1);
 try{
  // Wait for queued saves, then replace only the current draft in one transaction.
  await (saving=saving.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{
   const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(fresh);
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  })));
  exitLocator();state=fresh;pending=null;editing=null;queue=[];selection=null;scroll=0;previewLoad=null;
  closePalette();if($('#item-dialog').open)$('#item-dialog').close();
  page='home';opened='home-top';tabs();panel();$('#panel').scrollTop=0;draw(false);
  $('#status').textContent='已保存到本机';resetDialog.close();toast('已还原为空白模板，编辑和上传内容已清空');
 }catch{ $('#status').textContent='还原失败';$('#reset-error').textContent='还原未完成，原资料仍保留。请重试或先备份。';$('#reset-error').hidden=false;
 }finally{resetting=false;resetDialog.querySelectorAll('button').forEach(b=>b.disabled=false);$('#confirm-reset').textContent='确认还原';}
};

addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveGitHub();}if(e.key==='Escape')closePalette();});
addEventListener('beforeunload',e=>{if($('#status').textContent==='正在保存…'||pending||publishing){e.preventDefault();e.returnValue='';}});
tabs();panel();draw(false);await save();
})();
