(() => {
'use strict';
const parse=s=>new DOMParser().parseFromString(s,'text/html');
const definitions=[],collections={},pages={},fields={};let serial=0;
const titles={top:'首屏展示',work:'精选作品',expertise:'专业能力',experience:'工作经历',about:'个人介绍','about-more':'工作方式与生活',contact:'联系与页脚',overview:'项目概览',reflection:'设计思考'};
function field(el,type,label,placeholder='',initial=''){
 const id='f'+serial++;el.dataset.field=id;
 const f={id,type,label,placeholder,initial};fields[id]=f;return f;
}
function compile(root){
 const out=[];
 for(const a of root.querySelectorAll('a[href]')){
  if(a.closest('.brand')||a.hasAttribute('data-list-item')||a.closest('.site-nav')&&!a.hasAttribute('data-resume-link'))continue;
  const href=a.getAttribute('href');if(href.startsWith('#'))continue;
  if(a.hasAttribute('data-resume-link')){
   const slot=a.ownerDocument.createElement('span');slot.className='resume-slot';a.after(slot);
   const f=field(slot,'resume','简历附件');f.link=true;out.push(f);a.dataset.resumeTarget=f.id;a.removeAttribute('href');continue;
  }
  const id='f'+serial++;a.dataset.link=id;fields[id]={id,type:'url',label:'链接地址',placeholder:'https://…',initial:''};out.push(fields[id]);a.removeAttribute('href');
 }
 for(const el of [...root.querySelectorAll('.portrait-frame,.life-art,.brand-mark,img')]){
  if(el.closest('[data-list]')||el.parentElement?.closest('.portrait-frame,.life-art,.brand-mark'))continue;
  const label=el.matches('.brand-mark')?'个人标识':el.matches('.portrait-frame')?'个人照片':'图片';
  el.removeAttribute('aria-label');
  if(el.tagName==='IMG') {el.removeAttribute('srcset');el.removeAttribute('src');el.alt='';el.style.minHeight='120px';}
  else {el.replaceChildren();el.classList.add('blank-image');}
  out.push(field(el,'image',label,'上传'+label));
 }
 const selector='h1,h2,h3,h4,p,time,.brand-name,.portrait-caption,.brand-track>span,.cover-meta>span,.eyebrow,.client-logo,.stats-grid strong,.stats-grid span,.meituan-cover-metrics strong,.meituan-cover-metrics div>span,.contact-links>a';
 const blocks=[...root.querySelectorAll(selector)].filter(n=>!n.closest('[data-list],.site-nav,svg,.ai-footer-particles')&&!n.closest('[data-field]'));
 const counts={};
 for(const block of blocks){
  if(blocks.some(b=>b!==block&&b.contains(block)))continue;
  const walker=block.ownerDocument.createTreeWalker(block,NodeFilter.SHOW_TEXT);let node;const nodes=[];
  while((node=walker.nextNode()))if(node.textContent.trim()&&!node.parentElement.closest('svg,.blue-dot,[aria-hidden="true"],.step-number'))nodes.push(node);
  const tag=block.tagName.toLowerCase();
  const label=block.matches('.brand-name')?'姓名 / 昵称':tag==='h1'?'主标题':tag==='h2'?'模块标题':tag==='h3'||tag==='h4'?'标题':tag==='time'?'时间':tag==='strong'?'成果数值':block.matches('.role')?'职位':block.matches('.client-logo')?'项目 / 品牌':tag==='p'?'描述':'文字';
  for(const node of nodes){
   const original=node.textContent.trim();if(original==='%')continue;const span=block.ownerDocument.createElement('span');node.replaceWith(span);counts[label]=(counts[label]||0)+1;
   const name=label+(counts[label]>1?' · '+counts[label]:'');
   const structural=['h2','h3'].includes(tag)&&(!!block.closest('.section-heading,.compact-heading,.contact-section')||tag==='h2'&&!block.closest('.about-copy,.hero-copy,.cover,.article-heading'));
   out.push(field(span,tag==='p'?'textarea':'text',name,structural?original:tag==='strong'?'—':name,structural?original:''));
  }
 }
 const rest=root.ownerDocument.createTreeWalker(root,NodeFilter.SHOW_TEXT);const textNodes=[];let text;
 while((text=rest.nextNode())){const p=text.parentElement;if(!text.textContent.trim()||p.closest('[data-field],[data-list],svg,style,script,.site-nav,.back,.article-back,.blue-dot,[aria-hidden="true"],.step-number'))continue;if(/^([0-9]{1,2}|[↑↗↘→←+.%·])$/.test(text.textContent.trim()))continue;textNodes.push(text);}
 for(const text of textNodes){const span=root.ownerDocument.createElement('span');text.replaceWith(span);out.push(field(span,'text','说明文字','说明文字'));}
 return out;
}
function makeCollection(container,id,label,itemSelector,project=false){
 if(collections[id]){container.replaceChildren();container.dataset.list=id;return;}
 let children=[...container.children].filter(e=>e.matches(itemSelector));
 if(id.includes('brands')&&children.length%2===0){const half=children.length/2;if(children.slice(0,half).every((e,i)=>e.textContent===children[i+half].textContent))children=children.slice(0,half);}
 const templates=children.map((el,i)=>{
  el=el.cloneNode(true);el.removeAttribute('id');el.removeAttribute('aria-label');el.classList.remove('reveal');el.dataset.listItem=id;
  if(project){
   el.removeAttribute('href');for(const child of [...el.children])if(!child.matches('.project-copy'))child.remove();
   el.querySelectorAll('.client-logo').forEach(n=>{n.replaceChildren(el.ownerDocument.createTextNode('项目 / 品牌'))});
   el.querySelectorAll('.meituan-metrics-source,.wechat-card-label,.rednote-card-label').forEach(n=>n.remove());
  }
  // Put a repeat root such as a brand span inside a wrapper for field discovery.
  const wrapper=el.ownerDocument.createElement('div');wrapper.append(el);
  const fs=compile(wrapper);
  if(id.includes('brands')&&!fs.some(f=>f.type==='text'))fs.push(field(el,'text','品牌名称','品牌名称'));
  if(project){const slot=el.ownerDocument.createElement('div');slot.className='whole-cover';el.prepend(slot);fs.unshift(field(slot,'image','整张作品封面','上传整张封面'));}
  const target=project?'case-'+[1,2,3,4][[...children].indexOf(children[i])]:null;
  return {html:wrapper.innerHTML,fields:fs,target:project?({'project-beike':'case-1','project-wechat':'case-2','project-rednote':'case-3','project-meituan':'case-4'})[[...el.classList].find(c=>['project-beike','project-wechat','project-rednote','project-meituan'].includes(c))] : null};
 });
 collections[id]={id,label,templates,count:templates.length,project};container.replaceChildren();container.dataset.list=id;
}
function module(node,id,label,page,locked=false){
 if(!node)return;node.dataset.module=id;const d={id,label,page,locked,fields:[],collections:[]};definitions.push(d);
 const rules=[['.work-grid','projects','作品','.project-card',true],['.expertise-grid',id+'-expertise','专长','article'],['.timeline',id+'-experience','经历','li'],['.process-grid',id+'-process','步骤','article'],['.life-grid',id+'-life','生活记录','article'],['.brand-track',id+'-brands','品牌','span'],['.ai-entry-list','ai-entries','AI 项目','a']];
 for(const [sel,cid,cl,child,project] of rules){const container=node.matches(sel)?node:node.querySelector(sel);if(!container)continue;makeCollection(container,cid,cl,child,project);d.collections.push(cid);}
 // Compile only this module, excluding child modules and repeat containers.
 d.fields=compile(node);
}
for(const source of TemplateSources){
 const doc=parse(source.html);doc.querySelectorAll('script,.source-attribution,.skip-link,.skip,.chapter-nav .sticky-back,.ai-sr-title').forEach(n=>n.remove());
 doc.querySelectorAll('.reveal').forEach(n=>{n.dataset.entrance='';n.classList.remove('reveal');});
 for(const el of doc.querySelectorAll('[onclick],[onload]')){el.removeAttribute('onclick');el.removeAttribute('onload');}
 const header=doc.querySelector('.site-header');
 if(header){if(!pages.home){module(header,'global','个人标识与简历','global',true);window.sharedHeader=header.outerHTML;}else header.outerHTML=window.sharedHeader;}
 doc.querySelectorAll('main [aria-label]').forEach(el=>el.removeAttribute('aria-label'));
 const main=doc.querySelector('main');let nodes=[];
 if(source.id==='home'||source.id==='projects')nodes=[...main.children].filter(n=>n.matches('section,footer'));
 else if(source.id==='about'){
  nodes=[...main.querySelectorAll(':scope > section')];const more=doc.querySelector('#about-more');
  if(more){nodes=nodes.filter(n=>n!==more);nodes.push(...more.children);}
 }else if(source.id==='ai')nodes=[doc.querySelector('.ai-entry-list'),doc.querySelector('.contact-section')].filter(Boolean);
 else if(source.id.startsWith('ai-'))nodes=[doc.querySelector('.article-heading'),doc.querySelector('.article-body')].filter(Boolean);
 else nodes=[...doc.querySelectorAll('body > section, main > section, body > footer, main > footer')];
 nodes.forEach((node,i)=>{const label=titles[node.id]||node.querySelector('h1,h2,h3')?.textContent.replace(/[.?。]/g,'').trim()||'内容模块 '+(i+1);module(node,source.id+'-'+(node.id||'m'+i),label,source.id,i===0&&(source.id==='home'||source.id.startsWith('case-')))});
 const footer=doc.querySelector('footer');if(footer&&!footer.closest('[data-module]'))module(footer,source.id+'-footer','联系与页脚',source.id);
 pages[source.id]={id:source.id,title:source.title,file:source.file,html:'<!doctype html>'+doc.documentElement.outerHTML};
}
// Share semantic footer content without replacing each page's own layout.
const footerAliases=[],collectionAliases=[],sharedFooterFields=new Map();let sharingVersion=1;
const homeDoc=parse(pages.home.html),homeFooter=homeDoc.querySelector('.contact-section');
const homeDef=definitions.find(d=>d.id===homeFooter?.dataset.module);
const resumeField=definitions.find(d=>d.id==='global')?.fields.find(f=>f.type==='resume');
const homeCopyright=homeFooter?.querySelector('.footer-bottom p [data-field]')?.dataset.field;
if(homeFooter){
 const names=[['h2 [data-field]','合作标题'],['.contact-links a [data-field]','简历按钮文字'],['.footer-bottom p [data-field]','版权信息'],['.footer-top [data-field]','返回顶部文字']];
 for(const [selector,label] of names)homeFooter.querySelectorAll(selector).forEach((el,i)=>{if(fields[el.dataset.field])fields[el.dataset.field].label=label+(i?' · '+(i+1):'');});
}

function aliasField(doc,def,oldId,canonical){
 if(!canonical)return;
 sharedFooterFields.set(canonical.id,canonical);
 if(oldId!==canonical.id){
  if(!footerAliases.some(a=>a.from===oldId))footerAliases.push({from:oldId,to:canonical.id,version:sharingVersion});
  doc.querySelectorAll('[data-field="'+oldId+'"],[data-link="'+oldId+'"],[data-resume-target="'+oldId+'"]')
   .forEach(el=>{for(const attr of ['data-field','data-link','data-resume-target'])if(el.getAttribute(attr)===oldId)el.setAttribute(attr,canonical.id);});
 }
 def.fields=Array.from(new Map(def.fields.map(f=>f.id===oldId?[canonical.id,canonical]:[f.id,f])).values());
 def.shared=true;
}
if(homeDef){
 const prototypes=[...homeDef.fields];
 for(const page of Object.values(pages)){
  const doc=parse(page.html),footer=doc.querySelector('.contact-section');
  if(footer){const def=definitions.find(d=>d.id===footer.dataset.module);
   if(def){const originals=[...def.fields];
    originals.forEach((f,i)=>{const canonical=f.type==='resume'?resumeField:prototypes[i];if(canonical&&canonical.type===f.type)aliasField(doc,def,f.id,canonical);});
    def.label='联系与页脚 · 全站共用';
   }
  }else if(page.id.startsWith('ai-')){
   const copyright=doc.querySelector('footer.ai-footer>span'),def=definitions.find(d=>d.id===copyright?.closest('[data-module]')?.dataset.module);
   if(def&&homeCopyright){const targets=[...(copyright.matches('[data-field]')?[copyright]:[]),...copyright.querySelectorAll('[data-field]')];
    for(const el of targets)aliasField(doc,def,el.dataset.field,fields[homeCopyright]);
    def.label='页脚版权 · 全站共用';
   }
  }
  page.html='<!doctype html>'+doc.documentElement.outerHTML;
 }
}
// Expertise and contact content are shared; page-level visibility remains independent.
sharingVersion=2;
const expertiseHome=definitions.find(d=>d.id==='home-expertise'),expertiseAbout=definitions.find(d=>d.id==='about-expertise');
if(expertiseHome&&expertiseAbout){
 const canonical=collections[expertiseHome.collections[0]],previous=collections[expertiseAbout.collections[0]];
 const doc=parse(pages.about.html);
 expertiseAbout.fields.forEach((f,i)=>{if(expertiseHome.fields[i]?.type===f.type)aliasField(doc,expertiseAbout,f.id,expertiseHome.fields[i]);});
 if(canonical&&previous&&canonical.id!==previous.id){
  const mappings=previous.templates.map((t,i)=>Object.fromEntries(t.fields.map((f,j)=>[f.id,canonical.templates[i%canonical.templates.length].fields[j]?.id]).filter(([,id])=>id)));
  collectionAliases.push({from:previous.id,to:canonical.id,mappings});
  doc.querySelectorAll('[data-list="'+previous.id+'"]').forEach(el=>el.dataset.list=canonical.id);
  expertiseAbout.collections=expertiseAbout.collections.map(id=>id===previous.id?canonical.id:id);delete collections[previous.id];
 }
 expertiseHome.shared=true;expertiseHome.sharedSource='home-expertise';expertiseAbout.shared=true;expertiseAbout.sharedSource='home-expertise';pages.about.html='<!doctype html>'+doc.documentElement.outerHTML;
}
const topField=homeDef?.fields.find(f=>f.label==='返回顶部文字');
for(const page of Object.values(pages)){
 const doc=parse(page.html);
 if(page.id.startsWith('ai-')&&topField){
  const footer=doc.querySelector('footer.ai-footer'),def=definitions.find(d=>d.id===footer?.dataset.module);
  const top=footer?.querySelector('a[href^="#"] [data-field]');if(top&&def)aliasField(doc,def,top.dataset.field,topField);
 }
 for(const def of definitions.filter(d=>d.page===page.id&&d.shared&&!d.sharedSource))def.sharedSource='home-contact';
 page.html='<!doctype html>'+doc.documentElement.outerHTML;
}
function migrateSharedFooter(state){
 const version=state.sharedFooterVersion||0;if(version>=2)return {conflicts:0};
 let conflicts=0;
 for(const key of ['values','colors','hidden']){
  state[key]||={};
  for(const {from,to,version:since} of footerAliases){
   if((since||1)<=version||!Object.prototype.hasOwnProperty.call(state[key],from))continue;
   const old=state[key][from],existing=state[key][to],blank=v=>v===undefined||v===null||v==='';
   if(blank(existing))state[key][to]=structuredClone(old);
   else if(!blank(old)&&JSON.stringify(existing)!==JSON.stringify(old))conflicts++;
  }
 }
 state.repeats||={};
 for(const alias of collectionAliases){
  const previous=state.repeats[alias.from];if(!previous)continue;
  const filled=items=>(items||[]).some(item=>!item.deleted&&Object.values(item.values||{}).some(v=>typeof v==='string'?v.trim():v?.data||v?.__privateAsset));
  if(filled(previous)&&!filled(state.repeats[alias.to]))state.repeats[alias.to]=previous.map(item=>{const copy=structuredClone(item),mapping=alias.mappings[item.variant%alias.mappings.length];for(const key of ['values','hidden','colors'])copy[key]=Object.fromEntries(Object.entries(item[key]||{}).map(([id,v])=>[mapping[id]||id,v]));return copy;});
  else if(filled(previous)&&filled(state.repeats[alias.to]))conflicts++;
  // Preserve the original collection and scalar keys for lossless backups.
 }
 state.sharedFooterVersion=2;return {conflicts};
}

function emptyItem(c,i=0){return{id:crypto.randomUUID(),variant:i%c.templates.length,deleted:false,values:{},hidden:{},colors:{},files:[],notes:'',links:'',style:''};}
function empty(){return{id:crypto.randomUUID(),updated:Date.now(),values:{},hidden:{},colors:{},modules:{},tabs:Object.fromEntries(Object.keys(pages).map(p=>[p,true])),repeats:Object.fromEntries(Object.values(collections).map(c=>[c.id,Array.from({length:c.count},(_,i)=>emptyItem(c,i))]))};}
function safeUrl(v){try{const u=new URL(v);return ['https:','http:','mailto:'].includes(u.protocol)?u.href:''}catch{return ''}}
function apply(root,fs,data,placeholder){
 for(const f of fs){const el=root.querySelector('[data-field="'+f.id+'"],[data-link="'+f.id+'"]');if(!el)continue;
  const hidden=data.hidden?.[f.id];if(hidden){if(f.type==='url')el.removeAttribute('href');else {el.remove();}continue;}
  const value=data.values?.[f.id];
  if(f.type==='url'){const u=safeUrl(value||'');if(u)el.setAttribute('href',u);else el.removeAttribute('href');}
  else if(f.type==='resume'){const link=root.querySelector('[data-resume-target="'+f.id+'"]');if(link){if(value?.data?.startsWith('data:application/pdf')){link.href=value.data;link.target='_blank';}else link.removeAttribute('href');}el.hidden=true;}
  else if(f.type==='image'){
   const image=value?.data&&/^data:image\/(png|jpeg|webp|gif);base64,/.test(value.data)?value.data:'';
   if(el.tagName==='IMG'){if(image)el.src=image;else{el.removeAttribute('src');el.classList.add('empty-content-image');}}
   else{el.replaceChildren();if(image){const im=el.ownerDocument.createElement('img');im.src=image;im.alt='';el.append(im);}else if(placeholder)el.textContent=f.placeholder;}
  }else{el.textContent=value??f.initial??'';if(!el.textContent&&placeholder)el.textContent=f.placeholder;const c=data.colors?.[f.id];if(/^#[\da-f]{6}$/i.test(c||''))el.style.color=c;}
 }
 // Remove wrappers left with decoration only after deleting their last text field.
 root.querySelectorAll('h1,h2,h3,h4,p,time').forEach(el=>{const copy=el.cloneNode(true);copy.querySelectorAll('.blue-dot').forEach(n=>n.remove());if(!copy.textContent.trim()&&!el.querySelector('img'))el.remove();});
}
const extraCSS=`html{scroll-behavior:auto!important}body{overflow-x:hidden}.whole-cover{position:absolute;inset:0;z-index:0;display:flex;align-items:center;justify-content:center;color:#ffffff88;font-size:16px}.whole-cover>img{width:100%;height:100%;object-fit:cover}.project-card{position:relative}.project-card>.project-copy{position:relative;z-index:1;pointer-events:none}.blank-image{display:flex;align-items:center;justify-content:center;background:#ffffff08;border:1px dashed #ffffff30;overflow:hidden;font-size:13px;min-height:48px}.blank-image>img{width:100%;height:100%;object-fit:cover}.brand-mark.blank-image{width:48px;height:48px;border-radius:50%}.portrait-frame.blank-image{aspect-ratio:520/640}.life-art.blank-image{aspect-ratio:360/240}.empty-content-image{visibility:hidden;background:#ffffff08}.editor-target{outline:2px solid #4d8bff!important;outline-offset:5px}.site-nav[aria-hidden=true]{visibility:hidden}.resume-slot{display:none}[data-module][hidden]{display:none!important}[data-list-item][hidden]{display:none!important}.article-back svg{vertical-align:middle}.template-edit-entry{display:none!important}`;
function render(state,page='home',editor=false,placeholders=true){
 migrateSharedFooter(state);const doc=parse(pages[page].html);doc.head.querySelectorAll('meta[charset]').forEach(n=>n.remove());const meta=doc.createElement('meta');meta.setAttribute('charset','utf-8');doc.head.prepend(meta);
 doc.title='个人作品集 · '+pages[page].title;doc.querySelector('meta[name=description]')?.remove();
 const st=doc.createElement('style');st.textContent=extraCSS;doc.head.append(st);
 for(const d of definitions.filter(d=>d.page===page||d.page==='global')){
  const root=doc.querySelector('[data-module="'+d.id+'"]');if(!root)continue;if(state.modules[d.id]===false&&!d.locked){root.remove();continue;}
  for(const cid of d.collections){const c=collections[cid],container=root.querySelector('[data-list="'+cid+'"]')||(root.matches('[data-list]')?root:null);if(!container)continue;
   for(const item of (state.repeats[cid]||[]).filter(item=>!item.deleted).slice(0,page==='home'&&cid==='projects'?4:Infinity)){const t=c.templates[item.variant%c.templates.length];const wrap=doc.createElement('div');wrap.innerHTML=t.html;apply(wrap,t.fields,item,placeholders);const el=wrap.firstElementChild;if(!el)continue;el.dataset.item=item.id;el.dataset.collection=cid;
    if(c.project)el.dataset.route=t.target||'case-1';else if(cid==='ai-entries')el.dataset.route='ai-'+((item.variant%3)+1);
    container.append(el);
   }
  }
  apply(root,d.fields,state,placeholders);
 }
 for(const a of doc.querySelectorAll('.site-nav a')){
  const h=a.getAttribute('href')||'';const route=Object.values(pages).find(p=>p.file===h.split('?')[0])?.id;
  if(route){a.dataset.route=route;a.classList.toggle('is-active',route===page);if(state.tabs[route]===false)a.remove();}
 }
 const nav=doc.querySelector('.site-nav');if(nav&&nav.querySelectorAll('[data-route]').length<=1)nav.style.display='none';
 // Shared content also controls the hero ambient palette through original first-card CSS.
 const card=doc.querySelector('.project-card');if(card){const style=doc.createElement('style');const variant=[...card.classList].find(c=>c.startsWith('project-')&&c!=='project-card');style.textContent=variant==='project-meituan'?'.hero-ambient{--ambient-primary:255 220 53;--ambient-secondary:245 147 63}':'';doc.head.append(style);}
 doc.querySelectorAll('.brand').forEach(a=>{a.removeAttribute('aria-label');a.dataset.route='home';});
 const back=doc.querySelector('.article-back');if(back){back.removeAttribute('href');back.dataset.route='ai';}
 doc.querySelectorAll('a.back').forEach(a=>{a.removeAttribute('href');a.dataset.route='home';});
 // No original sample destination or external content survives as a project target.
 doc.querySelectorAll('[data-route]').forEach(a=>a.setAttribute('href','#'+a.dataset.route));
 const script=doc.createElement('script');script.textContent=`(${runtime.toString()})(${JSON.stringify({editor,page})});`;doc.body.append(script);
 return '<!doctype html>'+doc.documentElement.outerHTML;
}
function runtime(options){
 const ambient=document.querySelector('.hero-ambient'),firstCard=document.querySelector('.project-card');
 if(ambient&&firstCard){const css=getComputedStyle(firstCard),ctx=document.createElement('canvas').getContext('2d');const colors=[css.backgroundColor,...(css.backgroundImage.match(/#[\da-f]{3,8}\b|rgba?\([^)]*\)/gi)||[])];let best=null,score=0;
 for(const color of colors){ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);const rgb=[...ctx.getImageData(0,0,1,1).data],chroma=Math.max(...rgb.slice(0,3))-Math.min(...rgb.slice(0,3));if(rgb[3]>100&&chroma>score){score=chroma;best=rgb.slice(0,3);}}
 if(best){const bright=best.map(v=>Math.min(255,Math.round(v*Math.max(1,160/Math.max(...best)))));ambient.style.setProperty('--ambient-primary',bright.join(' '));ambient.style.setProperty('--ambient-secondary',[Math.min(255,bright[0]+25),Math.max(0,bright[1]-30),Math.max(0,bright[2]-20)].join(' '));}}
 if(!options.editor&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&'IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;entry.target.getAnimations().forEach(a=>a.play());observer.unobserve(entry.target);}},{rootMargin:'0px 0px -50px 0px'});document.querySelectorAll('[data-entrance]').forEach(el=>{if(el.getBoundingClientRect().top<innerHeight)return;const animation=el.animate([{opacity:0,translate:'0 28px'},{opacity:1,translate:'0 0'}],{duration:1200,easing:'cubic-bezier(.22,.61,.36,1)'});animation.pause();animation.currentTime=0;observer.observe(el);});}
 document.addEventListener('pointerdown',()=>parent.postMessage({type:'template-canvas-pointer'},'*'));
 document.querySelectorAll('[data-route]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();if(!options.editor)parent.postMessage({type:'template-route',page:el.dataset.route},'*');}));
 if(options.editor){document.querySelectorAll('.site-nav').forEach(n=>{n.inert=true;});document.addEventListener('click',e=>{const a=e.target.closest('a');if(a)e.preventDefault();});}
 addEventListener('message',e=>{if(e.source!==parent)return;if(e.data?.type==='template-restore-scroll'){scrollTo({top:e.data.scroll||0,behavior:'instant'});return;}if(e.data?.type==='template-clear-highlight'){document.querySelectorAll('.editor-target').forEach(n=>n.classList.remove('editor-target'));return;}if(e.data?.type==='template-locate-module'){const module=document.querySelector('[data-module="'+CSS.escape(e.data.id)+'"]');if(e.data.highlight){document.querySelectorAll('.editor-target').forEach(n=>n.classList.remove('editor-target'));module?.classList.add('editor-target');}module?.scrollIntoView({block:'start',behavior:'smooth'});return;}if(e.data?.type!=='template-patch')return;const m=e.data;let scope=m.item?document.querySelector('[data-item="'+CSS.escape(m.item)+'"]'):document;const selector='[data-field="'+CSS.escape(m.id)+'"],[data-link="'+CSS.escape(m.id)+'"]';const el=scope?.matches?.(selector)?scope:scope?.querySelector(selector);if(!el)return;
  if(m.kind==='focus'){document.querySelectorAll('.editor-target').forEach(n=>n.classList.remove('editor-target'));el.classList.add('editor-target');if(m.scroll)el.scrollIntoView({block:'center',behavior:'smooth'});const current=el.style.color;el.style.removeProperty('color');const color=getComputedStyle(el).color;if(current)el.style.color=current;parent.postMessage({type:'template-default',id:m.id,color},'*');}
  if(m.kind==='value'){if(el.hasAttribute('data-link')){try{let u=new URL(m.value);if(['http:','https:','mailto:'].includes(u.protocol))el.href=u.href;}catch{el.removeAttribute('href');}}else el.textContent=m.value||m.placeholder||'';}
  if(m.kind==='color'){if(m.value)el.style.color=m.value;else el.style.removeProperty('color');}
  if(m.kind==='module')document.querySelector('[data-module="'+CSS.escape(m.id)+'"]')?.scrollIntoView({block:'start',behavior:'smooth'});
 });
 addEventListener('scroll',()=>parent.postMessage({type:'template-scroll',scroll:scrollY},'*'),{passive:true});
 parent.postMessage({type:'template-ready'},'*');
}
function publicHTML(state,start='home'){
 const docs=Object.fromEntries(Object.keys(pages).filter(p=>state.tabs[p]!==false).map(p=>[p,render(state,p,false,false)]));
 const json=JSON.stringify(docs).replace(/</g,'\\u003c');
 return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>个人作品集</title><style>body{margin:0}iframe{border:0;width:100%;height:100dvh;display:block}</style></head><body><iframe title="个人作品集" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"></iframe><script>const docs='+json+';const frame=document.querySelector("iframe");function go(p){frame.srcdoc=docs[p]||docs.home;}go('+JSON.stringify(start)+');addEventListener("message",e=>{if(e.source===frame.contentWindow&&e.data?.type==="template-route")go(e.data.page)});<\/script></body></html>';
}
window.TemplateEngine={pages,definitions,collections,fields,empty,emptyItem,render,publicHTML,migrateSharedFooter,footerAliases,collectionAliases};
})();
