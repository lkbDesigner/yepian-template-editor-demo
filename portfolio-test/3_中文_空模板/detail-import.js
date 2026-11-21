(function(){
'use strict';
const P=PortfolioDetailPackage,previews=window.TemplateDetailPreviews=new Map();
function base64(bytes){let text='';for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(text);}
function archive(bundle){const entries={};for(const f of bundle.files.values())entries[f.path]=f.bytes;return fflate.zipSync(entries,{level:6});}
function compile(entries){const bundle=P.inspect(entries),bytes=archive(bundle);if(bytes.length>P.MAX_ARCHIVE)throw Error('打包后的 ZIP 超过 50 MB');return {entryName:bundle.entry,file:{name:'作品详情.zip',type:'application/zip',size:bytes.length,data:'data:application/zip;base64,'+base64(bytes)}};}
async function read(file){if(file.size>P.MAX_ARCHIVE)throw Error('导入 HTML 或 ZIP 请控制在 50 MB 以内');const bytes=new Uint8Array(await file.arrayBuffer());if(/\.html?$/i.test(file.name))return compile({'index.html':bytes});if(!/\.zip$/i.test(file.name))throw Error('请选择 HTML 或完整 ZIP 文件');return compile(P.unzip(bytes,fflate.unzipSync));}
function mountPreview(payload){
 const urls=new Map();
 function asset(index){if(urls.has(index))return urls.get(index);const item=payload.assets[index];let bytes=Uint8Array.from(atob(item.data),c=>c.charCodeAt(0));if(item.type==='text/css')bytes=new TextEncoder().encode(new TextDecoder().decode(bytes).replace(/blob:portfolio-resource-(\d+)/g,(_,i)=>asset(Number(i))));const url=URL.createObjectURL(new Blob([bytes],{type:item.type}));urls.set(index,url);return url;}
 const html=payload.html.replace(/blob:portfolio-resource-(\d+)/g,(_,i)=>asset(Number(i)));document.open();document.write(html);document.close();
}
function prepareItem(item){
 const generated=item.generatedDetail,file=generated?.file;if(!file||file.type!=='application/zip'||!file.data)return;const cached=previews.get(item.id);if(cached?.data===file.data)return;
 const bytes=Uint8Array.from(atob(file.data.split(',')[1]),c=>c.charCodeAt(0)),bundle=P.inspect(P.unzip(bytes,fflate.unzipSync)),assets=[];
 const url=P.preview(bundle,(bytes,type)=>{if(type==='text/html')return 'data:text/html;base64,'+base64(bytes);const id=assets.length;assets.push({type,data:base64(bytes)});return 'blob:portfolio-resource-'+id;});
 const body=new TextDecoder().decode(Uint8Array.from(atob(url.split(',')[1]),c=>c.charCodeAt(0))),payload=JSON.stringify({html:body,assets}).replace(/</g,'\\u003c');
 const html='<!doctype html><html><head><meta charset="utf-8"></head><body><script>('+mountPreview.toString()+')('+payload+');<\/script></body></html>';
 previews.set(item.id,{data:file.data,url,html});
}
async function prepare(state){for(const item of state.repeats.projects||[])if(!item.deleted)prepareItem(item);}
window.PortfolioDetailImport={read,compile,prepare,prepareItem};
})();
