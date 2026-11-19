import {createHash} from 'node:crypto';
const hash=value=>createHash('sha1').update(value).digest('hex');
export function createMockGitHub(){
 const calls=[],repos=new Map();let counter=0;
 function repo(name){if(!repos.has(name)){const tree=hash('empty-tree-'+name),head=hash('initial-'+name);repos.set(name,{private:name.endsWith('-data'),head,blobs:new Map(),trees:new Map([[tree,new Map()]]),commits:new Map([[head,{tree,parents:[]}]])});}return repos.get(name);}
 function blob(r,bytes){const sha=hash(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes]));r.blobs.set(sha,bytes);return sha;}
 const mock={calls,repo,conflicts:0,fetch:async(url,options={})=>{
  const u=new URL(url),m=/^\/repos\/([^/]+\/[^/]+)(.*)$/.exec(u.pathname);if(!m)throw Error('Unexpected GitHub path');
  const name=m[1],path=m[2],r=repo(name),method=options.method||'GET',body=options.body?JSON.parse(options.body):undefined;calls.push({repo:name,path,method,body});
  if(!path)return Response.json({private:r.private});
  if(path==='/git/ref/heads/main')return Response.json({object:{sha:r.head}});
  if(path.startsWith('/git/commits/')&&method==='GET'){const c=r.commits.get(path.split('/').at(-1));return c?Response.json({tree:{sha:c.tree},parents:c.parents.map(sha=>({sha}))}):Response.json({},{status:404});}
  if(path==='/git/blobs'&&method==='POST')return Response.json({sha:blob(r,Buffer.from(body.content,body.encoding==='base64'?'base64':'utf8'))});
  if(path.startsWith('/git/blobs/')&&method==='GET'){const bytes=r.blobs.get(path.split('/').at(-1));return bytes?Response.json({content:bytes.toString('base64')}):Response.json({},{status:404});}
  if(path==='/git/trees'&&method==='POST'){
   const tree=new Map(r.trees.get(body.base_tree)||[]);
   for(const entry of body.tree){if(entry.sha===null){tree.delete(entry.path);continue;}const sha=entry.sha||blob(r,Buffer.from(entry.content));if(!r.blobs.has(sha))return Response.json({message:'Missing blob'},{status:422});tree.set(entry.path,sha);}
   const sha=hash(JSON.stringify([...tree]));r.trees.set(sha,tree);return Response.json({sha});
  }
  if(path==='/git/commits'&&method==='POST'){const sha=hash(JSON.stringify(body)+(++counter));r.commits.set(sha,{tree:body.tree,parents:body.parents});return Response.json({sha});}
  if(path==='/git/refs/heads/main'&&method==='PATCH'){
   if(mock.conflicts>0){mock.conflicts--;const current=r.commits.get(r.head),sha=hash('concurrent-'+(++counter));r.commits.set(sha,{tree:current.tree,parents:[r.head]});r.head=sha;return Response.json({},{status:422});}
   if(!body.force&&r.commits.get(body.sha).parents[0]!==r.head)return Response.json({},{status:422});r.head=body.sha;return Response.json({});
  }
  if(path.startsWith('/contents/')){
   const file=decodeURIComponent(path.slice('/contents/'.length)),ref=u.searchParams.get('ref')||'main';const commit=r.commits.get(ref==='main'?r.head:ref);if(!commit)return Response.json({},{status:404});const files=r.trees.get(commit.tree);
   if(files.has(file)){const sha=files.get(file),bytes=r.blobs.get(sha);return Response.json({sha,content:bytes.length>1048576?'':bytes.toString('base64')});}
   const dirs=new Set([...files.keys()].filter(p=>p.startsWith(file+'/')).map(p=>p.slice(file.length+1).split('/')[0]));return dirs.size?Response.json([...dirs].map(name=>({name,type:files.has(file+'/'+name)?'file':'dir'}))):Response.json({},{status:404});
  }
  throw Error('Unmocked '+method+' '+path);
 }};return mock;
}
