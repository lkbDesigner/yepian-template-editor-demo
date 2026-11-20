(function(){
'use strict';
const MAX=10*1024*1024,decode=bytes=>new TextDecoder().decode(bytes);
const types={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',svg:'image/svg+xml',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',css:'text/css',js:'text/javascript',pdf:'application/pdf'};
function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s);}
function compile(entries){
 const files=new Map();let total=0;
 for(const [raw,bytes]of Object.entries(entries)){
  if(raw.startsWith('/')||raw.includes('\\')||raw.split('/').includes('..'))throw Error('压缩包包含无效路径');
  if(raw.startsWith('__MACOSX/')||raw.split('/').some(p=>p.startsWith('.'))||raw.endsWith('/'))continue;
  total+=bytes.length;if(total>MAX||files.size>=150)throw Error('解压后的文件合计请控制在 10 MB、150 个文件以内');files.set(raw,bytes);
 }
 let candidates=[...files.keys()].filter(p=>/(^|\/)index\.html?$/i.test(p));
 const root=candidates.find(p=>!p.includes('/'));if(root)candidates=[root];
 if(candidates.length!==1)throw Error('请提供唯一的 index.html 入口；单个 HTML 可直接上传');
 const entry=candidates[0],cache=new Map();
 function resolve(ref,from){
  ref=ref.trim();if(!ref||ref.startsWith('#')||/^(https?:|data:|mailto:|tel:|\/\/)/i.test(ref))return null;
  if(/^[a-z][a-z\d+.-]*:/i.test(ref)||ref.startsWith('/'))throw Error('请使用相对资源路径：'+ref);
  const url=new URL(ref,'https://detail.invalid/'+from);let path;try{path=decodeURIComponent(url.pathname.slice(1));}catch{throw Error('资源路径编码不正确');}
  if(!files.has(path))throw Error('缺少配套资源：'+path);return {path,hash:url.hash};
 }
 function resource(ref,from,stack=[]){const target=resolve(ref,from);if(!target)return ref;
  const path=target.path;if(stack.includes(path))throw Error('资源循环引用：'+path);if(cache.has(path))return cache.get(path)+target.hash;
  const ext=path.split('.').pop().toLowerCase(),type=types[ext];if(!type)throw Error('暂不支持此资源类型：'+path);
  let bytes=files.get(path);if(ext==='css')bytes=new TextEncoder().encode(css(decode(bytes),path,[...stack,path]));
  if(ext==='js'&&/\b(?:import\s*(?:\(|["'{*])|export\s)/.test(decode(bytes)))throw Error('请先将 JavaScript 模块打包为普通浏览器脚本：'+path);
  const value='data:'+type+';base64,'+base64(bytes);cache.set(path,value);return value+target.hash;
 }
 function css(text,from,stack=[]){return text.replace(/@import\s+(["'])([^"']+)\1/g,(_,q,ref)=>'@import url("'+resource(ref,from,stack)+'")').replace(/url\(\s*(["']?)([^)"']+)\1\s*\)/g,(_,q,ref)=>'url("'+resource(ref,from,stack)+'")');}
 const doc=new DOMParser().parseFromString(decode(files.get(entry)),'text/html');
 if(!doc.querySelector('html')||!doc.querySelector('body'))throw Error('HTML 页面结构不完整');
 doc.querySelectorAll('base,meta[http-equiv="Content-Security-Policy"]').forEach(el=>el.remove());
 for(const el of doc.querySelectorAll('[src],[poster],link[href],image[href],image[xlink\\:href]'))for(const attr of ['src','poster',...(el.localName==='link'||el.localName==='image'?['href','xlink:href']:[])])if(el.hasAttribute(attr))el.setAttribute(attr,resource(el.getAttribute(attr),entry));
 for(const el of doc.querySelectorAll('[srcset]')){const value=el.getAttribute('srcset');if(!value.trim().startsWith('data:'))el.setAttribute('srcset',value.split(',').map(part=>{const [ref,...size]=part.trim().split(/\s+/);return [resource(ref,entry),...size].join(' ');}).join(', '));}
 for(const el of doc.querySelectorAll('style'))el.textContent=css(el.textContent,entry);
 for(const el of doc.querySelectorAll('[style]'))el.setAttribute('style',css(el.getAttribute('style'),entry));
 for(const el of doc.querySelectorAll('a[href]')){const ref=el.getAttribute('href');if(resolve(ref,entry))el.setAttribute('href',resource(ref,entry));}
 doc.querySelectorAll('meta[charset]').forEach(el=>el.remove());const meta=doc.createElement('meta');meta.setAttribute('charset','utf-8');doc.head.prepend(meta);
 const html='<!doctype html>'+doc.documentElement.outerHTML,bytes=new TextEncoder().encode(html);if(bytes.length>MAX)throw Error('打包后的详情超过 10 MB，请压缩图片后再导入');
 return {entryName:entry,file:{name:'作品详情.html',type:'text/html',size:bytes.length,data:'data:text/html;base64,'+base64(bytes)}};
}
async function read(file){
 if(file.size>MAX)throw Error('导入文件请控制在 10 MB 以内');const bytes=new Uint8Array(await file.arrayBuffer());
 if(/\.html?$/i.test(file.name))return compile({'index.html':bytes});
 if(!/\.zip$/i.test(file.name))throw Error('请选择 HTML 或 ZIP 文件');let total=0,count=0;
 const entries=fflate.unzipSync(bytes,{filter:file=>{total+=file.originalSize;if(total>MAX||++count>200)throw Error('压缩包解压后过大或文件过多');return true;}});return compile(entries);
}
window.PortfolioDetailImport={read,compile};
})();
