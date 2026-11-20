(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PortfolioPrefilled=factory();})(globalThis,function(){
'use strict';
function dataFile(name,type,bytes){let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return {name,type,size:bytes.length,data:'data:'+type+';base64,'+btoa(binary)};}
function sampleResume(){
 const text='BT /F1 20 Tf 55 780 Td (Sample Product Designer) Tj 0 -35 Td /F1 12 Tf (Portfolio template demonstration resume) Tj 0 -28 Td (Experience: Product design, research and design systems.) Tj 0 -24 Td (Projects: Mobile experiences and visual identity.) Tj 0 -24 Td (Replace this sample resume with your own PDF.) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+text.length+' >>\nstream\n'+text+'\nendstream'];
 let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((object,i)=>{offsets.push(pdf.length);pdf+=(i+1)+' 0 obj\n'+object+'\nendobj\n';});const xref=pdf.length;pdf+='xref\n0 '+offsets.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';return dataFile('示例简历.pdf','application/pdf',new TextEncoder().encode(pdf));
}
async function create(engine,{baseURL,fetchAsset=fetch,progress=()=>{}}={}){
 const state=engine.empty(),base=new URL(baseURL),assets=new Map();
 const raster=sample=>typeof sample==='string'&&/\.(png|jpe?g|webp|gif)(?:[?#]|$)/i.test(sample);
 const samples=Object.values(engine.fields).filter(f=>f.type==='image'&&raster(f.sample)).map(f=>new URL(f.sample,base).href);
 const fallback=samples[0]||new URL('assets/template-media/fc231d5a2348c7fe3e3138f1.png',base).href;
 async function image(field,alternative){const url=raster(field.sample)?new URL(field.sample,base).href:alternative||fallback;if(!assets.has(url))assets.set(url,(async()=>{progress('正在准备示例图片…');const response=await fetchAsset(url,{cache:'force-cache',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('示例图片未能加载，请重试');const bytes=new Uint8Array(await response.arrayBuffer()),extension=new URL(url).pathname.split('.').pop().toLowerCase(),type=({'png':'image/png','jpg':'image/jpeg','jpeg':'image/jpeg','webp':'image/webp','gif':'image/gif'})[extension];if(!type||!bytes.length)throw Error('示例图片无效，请重试');return dataFile('示例图片-'+assets.size+'.'+extension,type,bytes);})());return assets.get(url);}
 const resume=sampleResume();
 async function fill(fields,data,alternative){for(const field of fields){if(field.type==='image')data.values[field.id]=await image(field,alternative);else if(field.type==='resume')data.values[field.id]=resume;else if(field.type==='url'){let url;try{url=new URL(field.sample||'',base);if(!['http:','https:','mailto:'].includes(url.protocol))url=null;}catch{}data.values[field.id]=url?.href||base.href;}else data.values[field.id]=field.sample||field.initial||(field.label.includes('时间')?'2024—2026':field.label.includes('数值')?'30':field.label+'示例内容');}}
 const usedCollections=new Set();
 for(const def of engine.definitions){if(def.page.startsWith('case-'))continue;await fill(def.fields,state);for(const cid of def.collections){if(usedCollections.has(cid))continue;usedCollections.add(cid);const collection=engine.collections[cid];for(const item of state.repeats[cid]){const template=collection.templates[item.variant%collection.templates.length];const projectImage=collection.project?engine.definitions.filter(d=>d.page===template.target).flatMap(d=>d.fields).find(f=>f.type==='image'&&raster(f.sample))?.sample:null;await fill(template.fields,item,projectImage?new URL(projectImage,base).href:null);if(collection.project){item.links=new URL(engine.pages[template.target].file,base).href;item.notes='请根据提供的示例作品资料制作独立详情页。';item.style='沿用当前模板的深色背景、蓝色强调色和页面布局。';}}}}
 state.sharedFooterVersion=2;state.title='中文作品集模板 · 已填示例';return state;
}
return {create};
});
