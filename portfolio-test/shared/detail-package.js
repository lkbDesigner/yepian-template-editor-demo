(function(){
'use strict';
const MAX_ARCHIVE=50*1024*1024,MAX_TOTAL=100*1024*1024,MAX_COUNT=500,MAX_HTML=5*1024*1024;
const types={html:'text/html',htm:'text/html',css:'text/css',js:'text/javascript',json:'application/json',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',svg:'image/svg+xml',ico:'image/x-icon',avif:'image/avif',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',pdf:'application/pdf',mp4:'video/mp4',webm:'video/webm',m4v:'video/mp4',mp3:'audio/mpeg',ogg:'audio/ogg',wav:'audio/wav'};
const decoder=new TextDecoder(),encoder=new TextEncoder(),extension=path=>path.split('.').pop().toLowerCase();
function pathOK(path){let decoded;try{decoded=decodeURIComponent(path);}catch{throw Error('资源路径编码不正确');}if(!path||path.startsWith('/')||/[\\\x00-\x1f?#]/.test(path)||decoded.split('/').some(p=>p==='..'||p==='.')||decoded.includes('\\'))throw Error('压缩包包含无效路径：'+path);return path;}
function unzip(bytes,unzipSync){if(bytes.length>MAX_ARCHIVE)throw Error('ZIP 请控制在 50 MB 以内');let total=0,count=0;return unzipSync(bytes,{filter:f=>{total+=f.originalSize;if(total>MAX_TOTAL||++count>MAX_COUNT+100)throw Error('ZIP 解压资源超过 100 MB 或文件过多');return true;}});}
function css(text,from,resolve){return text.replace(/@import\s+(["'])([^"']+)\1/g,(_,q,ref)=>'@import url("'+resolve(ref,from)+'")').replace(/url\(\s*(["']?)([^)"']+)\1\s*\)/g,(_,q,ref)=>'url("'+resolve(ref,from)+'")');}
function html(text,from,resolve,warnings=[]){
 const doc=new DOMParser().parseFromString(text,'text/html');if(!doc.head||!doc.body)throw Error('HTML 页面结构不完整');
 doc.querySelectorAll('base,meta[http-equiv="Content-Security-Policy"]').forEach(e=>e.remove());
 for(const el of doc.querySelectorAll('[src],[poster],link[href],image[href],image[xlink\\:href],object[data]')){
  const attrs=['src','poster',...(el.localName==='link'||el.localName==='image'?['href','xlink:href']:[]),...(el.localName==='object'?['data']:[])];
  for(const attr of attrs)if(el.hasAttribute(attr))try{el.setAttribute(attr,resolve(el.getAttribute(attr),from));}catch(error){if(el.localName==='link'&&/^(?:icon|shortcut icon|apple-touch-icon)$/i.test(el.getAttribute('rel')||'')){warnings.push(error.message);el.remove();}else throw error;}
 }
 for(const el of doc.querySelectorAll('[srcset]')){const value=el.getAttribute('srcset');if(!value.trim().startsWith('data:'))el.setAttribute('srcset',value.split(',').map(part=>{const [ref,...size]=part.trim().split(/\s+/);return [resolve(ref,from),...size].join(' ');}).join(', '));}
 for(const el of doc.querySelectorAll('style'))el.textContent=css(el.textContent,from,resolve);
 for(const el of doc.querySelectorAll('[style]'))el.setAttribute('style',css(el.getAttribute('style'),from,resolve));
 for(const el of doc.querySelectorAll('a[href]')){const ref=el.getAttribute('href');if(ref&&!/^(?:#|https?:|mailto:|tel:|\/\/)/i.test(ref))el.setAttribute('href',resolve(ref,from));}
 [...doc.querySelectorAll('img')].forEach((el,i)=>{if(!el.hasAttribute('loading'))el.setAttribute('loading',i<4?'eager':'lazy');if(!el.hasAttribute('decoding'))el.setAttribute('decoding','async');});
 doc.querySelectorAll('meta[charset]').forEach(e=>e.remove());const meta=doc.createElement('meta');meta.setAttribute('charset','utf-8');doc.head.prepend(meta);
 return '<!doctype html>'+doc.documentElement.outerHTML;
}
function relative(from,to){const parts=from.split('/');parts.pop();const target=to.split('/');while(parts.length&&target.length&&parts[0]===target[0]){parts.shift();target.shift();}return [...parts.map(()=> '..'),...target].map(p=>p==='..'?p:encodeURIComponent(p)).join('/');}
function target(ref,from,files,root){
 if(/^[a-z][a-z\d+.-]*:/i.test(ref)&&!/^https?:/i.test(ref))throw Error('不支持的资源地址：'+ref.slice(0,100));
 const url=new URL(ref,'https://package.invalid/'+from);let path;try{path=decodeURIComponent(url.pathname.slice(1));}catch{throw Error('资源地址编码不正确');}
 if(!files.has(path)&&ref.startsWith('/')&&files.has(root+path))path=root+path;
 if(!files.has(path))throw Error('缺少配套资源：'+path+'。请上传包含 index.html 和资源文件夹的 ZIP，不要只选择 HTML。');return {path,suffix:url.search+url.hash};
}
function inspect(entries){
 const files=new Map(),warnings=[];let total=0;
 for(const [path,bytes]of Object.entries(entries)){
  pathOK(path);if(path.endsWith('/')||path.startsWith('__MACOSX/')||path.split('/').some(p=>p.startsWith('.')))continue;
  total+=bytes.length;if(total>MAX_TOTAL||files.size>=MAX_COUNT)throw Error('解压资源请控制在 100 MB、500 个文件以内');const type=types[extension(path)];if(!type)continue;files.set(path,{path,type,bytes});
 }
 let candidates=[...files.keys()].filter(p=>/(^|\/)index\.html?$/i.test(p));const rootEntry=candidates.find(p=>!p.includes('/'));if(rootEntry)candidates=[rootEntry];if(candidates.length!==1)throw Error('请在 ZIP 中提供唯一的 index.html 入口');
 const entry=candidates[0],root=entry.slice(0,entry.lastIndexOf('/')+1),inline=new Map();let sequence=0;
 function resolve(raw,from){const ref=raw.trim();if(!ref||/^(#|https?:|mailto:|tel:|\/\/)/i.test(ref))return ref;
  if(ref.startsWith('data:')){
   const match=/^data:([^;,]*);base64,([A-Za-z0-9+/]*={0,2})$/.exec(ref);if(!match)return ref;let path=inline.get(ref);
   if(!path){const ext=Object.keys(types).find(k=>types[k]===match[1]);if(!ext)return ref;const binary=atob(match[2]),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));path=root+'__inline/resource-'+(++sequence)+'.'+ext;while(files.has(path))path=root+'__inline/resource-'+(++sequence)+'.'+ext;files.set(path,{path,type:match[1],bytes});inline.set(ref,path);}
   return relative(from,path);
  }
  const found=target(ref,from,files,root);return relative(from,found.path)+found.suffix;
 }
 // Normalize local references and extract embedded resources once, rather than
 // repeatedly inserting large base64 strings into the document.
 for(const file of files.values())if(file.type==='text/html'||file.type==='text/css'){
  const text=decoder.decode(file.bytes),normalized=file.type==='text/html'?html(text,file.path,resolve,warnings):css(text,file.path,resolve);file.bytes=encoder.encode(normalized);
  if(file.type==='text/html'&&file.bytes.length>MAX_HTML)throw Error('HTML 正文超过 5 MB，请将大段数据改为独立资源');
 }
 total=0;for(const file of files.values()){total+=file.bytes.length;if(file.bytes.length>MAX_ARCHIVE||total>MAX_TOTAL||files.size>MAX_COUNT)throw Error('单个资源最多 50 MB，全部资源最多 100 MB、500 个文件');}
 return {entry,root,files,warnings,totalBytes:total};
}
function preview(bundle,makeURL){
 const cache=new Map(),visiting=new Set();
 function resolve(ref,from){if(!ref||/^(#|https?:|data:|mailto:|tel:|\/\/|blob:)/i.test(ref))return ref;const found=target(ref,from,bundle.files,bundle.root);return create(found.path)+found.suffix.replace(/^\?[^#]*/,'');}
 function create(path){if(cache.has(path))return cache.get(path);if(visiting.has(path))throw Error('资源循环引用：'+path);visiting.add(path);const file=bundle.files.get(path);let bytes=file.bytes;if(file.type==='text/css')bytes=encoder.encode(css(decoder.decode(bytes),path,resolve));if(file.type==='text/html')bytes=encoder.encode(html(decoder.decode(bytes),path,resolve));const url=makeURL(bytes,file.type);cache.set(path,url);visiting.delete(path);return url;}
 return create(bundle.entry);
}
window.PortfolioDetailPackage={inspect,unzip,preview,types,MAX_ARCHIVE,MAX_TOTAL};
})();
