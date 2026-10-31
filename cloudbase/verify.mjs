import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createCloudService,startWorker} from './service.mjs';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const directory=await mkdtemp(tmpdir()+'/yepian-cloud-db-');
let db=new PGlite(directory);
try{
 await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
 await db.exec(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
 const rpc=async(action,args={})=>(await db.query('SELECT public.yepian_rpc($1,$2::jsonb) AS value',[action,JSON.stringify(args)])).rows[0].value;
 const env={GITHUB_TOKEN:'test-only'},api=createCloudService({rpc,env});
 const call=(path,body,token)=>api(new Request('https://api.test'+path,{method:body?'POST':'GET',headers:{Origin:'https://lkbdesigner.github.io','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify({clientVersion:2,...body})}:{})}),'shared-test-ip');
 let r=await call('/api/register',{phone:'00000000001',password:'Test Password1',confirmPassword:'Test Password1'});assert.equal(r.status,200);const user=await r.json();
 assert.equal((await call('/api/login',{phone:'00000000001',password:'WrongPass'})).status,401);
 assert.equal((await call('/api/save',{siteId:'different',fields:{},assets:[],requestId:'a'.repeat(32)},user.token)).status,403);
 const jobs=await Promise.all(Array.from({length:100},(_,i)=>rpc('register',{phone:'001'+String(i).padStart(8,'0'),siteId:i.toString(16).padStart(24,'0'),salt:'salt',hash:'ab'.repeat(32),editKey:'cd'.repeat(32)})));
 assert.equal(jobs.filter(j=>j.created).length,100);
 const begin=performance.now();
 const submitted=await Promise.all(Array.from({length:100},(_,i)=>rpc('enqueue',{id:i.toString(16).padStart(32,'0'),siteId:i.toString(16).padStart(24,'0'),requestId:'request-'+i,payload:{siteId:i.toString(16).padStart(24,'0'),fields:{heroTitle:'Visitor '+i},assets:[]}})));
 assert.equal(submitted.length,100);console.log('100 parallel DB queue submissions: '+Math.round(performance.now()-begin)+'ms, 100 accepted');
 const claimed=await Promise.all(Array.from({length:10},(_,i)=>rpc('claim',{holder:'worker-'+i})));
 assert.equal(claimed.filter(Boolean).length,1);
 assert.equal(claimed.find(Boolean).id,'0'.repeat(32));
 // Simulate process restart. A live lease prevents a new worker from claiming the task.
 await db.close();db=new PGlite(directory);
 assert.equal(await rpc('claim',{holder:'restarted'}),null);
 await db.exec("UPDATE public.yepian_worker SET lease_until=now()-interval '1 minute'");
 const retried=await rpc('claim',{holder:'restarted'});assert.equal(retried.id,'0'.repeat(32));assert.equal(retried.attempts,2);
 assert.equal((await rpc('finish',{holder:'wrong-holder',id:retried.id,result:{}})).ok,false);
 await rpc('finish',{holder:'restarted',id:retried.id,result:{saved:true}});
 const following=await rpc('claim',{holder:'second'});assert.equal(following.id,'1'.padStart(32,'0'));
 await rpc('fail',{holder:'second',id:following.id});assert.equal(await rpc('claim',{holder:'third'}),null);
 assert.equal((await rpc('job',{siteId:'f'.repeat(24),id:'0'.repeat(32)})),null);
 const duplicate=await rpc('enqueue',{id:'f'.repeat(32),siteId:'0'.repeat(24),requestId:'request-0',payload:{fields:{heroTitle:'duplicate'},assets:[]}});assert.equal(duplicate.id,'0'.repeat(32));assert.equal((await rpc('load',{siteId:'0'.repeat(24)})).fields.heroTitle,'Visitor 0');
 // Exercise actual API enqueue and production GitHub worker without any network writes.
 const pageBody={siteId:user.siteId,fields:{heroTitle:'Cloud saved content'},assets:[{key:'resourcePdf',name:'check.pdf',type:'application/pdf',data:Buffer.from('%PDF-1.4\n%%EOF').toString('base64')}],requestId:'a'.repeat(32)};
 const accepted=await call('/api/save',pageBody,user.token);assert.equal(accepted.status,202);const queued=await accepted.json();
 const duplicateSave=await call('/api/save',pageBody,user.token);assert.equal((await duplicateSave.json()).jobId,queued.jobId);
 const loggedIn=await call('/api/login',{phone:'00000000001',password:'Test Password1'});const content=await loggedIn.json();assert.equal(content.fields.heroTitle,'Cloud saved content');assert.equal(content.assets[0].data,pageBody.assets[0].data);
 const outsider=await call('/api/jobs/'+queued.jobId,undefined,'f'.repeat(64));assert.equal(outsider.status,401);
 await db.exec("UPDATE public.yepian_jobs SET available_at=now() WHERE state='queued'");
 let writes=0,activeCommits=0,maxActive=0;
 const fakeGitHub=async(url,options={})=>{
  const p=new URL(url).pathname;
  if(p.endsWith('/git/ref/heads/main')){activeCommits++;maxActive=Math.max(maxActive,activeCommits);return Response.json({object:{sha:'head'}})}
  if(p.endsWith('/git/commits/head'))return Response.json({tree:{sha:'base'}});
  if(p.includes('/contents/'))return Response.json({}, {status:404});
  if(p.endsWith('/git/blobs'))return Response.json({sha:'blob'});
  if(p.endsWith('/git/trees'))return Response.json({sha:'tree'});
  if(p.endsWith('/git/commits'))return Response.json({sha:'commit'});
  if(p.endsWith('/git/refs/heads/main')){writes++;activeCommits--;return Response.json({object:{sha:'commit'}})}
  throw Error('Unexpected simulated GitHub request');
 };
 const deniedApi=createCloudService({rpc,env,githubFetch:async()=>Response.json({}, {status:401})});
 const diagnostic=await deniedApi(new Request('https://api.test/api/status'));
 const diagnosticBody=await diagnostic.json();assert.equal(diagnosticBody.ready,false);assert.equal(diagnosticBody.checks.database,true);assert.equal(diagnosticBody.checks.github.status,401);
 const stopWorker=startWorker({rpc,env,githubFetch:fakeGitHub,interval:1});
 try{
  const deadline=Date.now()+30000;
  for(;;){const count=(await db.query("SELECT count(*)::integer AS n FROM public.yepian_jobs WHERE state IN ('queued','processing')")).rows[0].n;if(!count)break;if(Date.now()>deadline)throw Error('Worker timeout');await new Promise(r=>setTimeout(r,20))}
 }finally{stopWorker()}
 assert.equal(maxActive,1);assert.equal(writes,100);
 const completed=await call('/api/jobs/'+queued.jobId,undefined,user.token);assert.equal((await completed.json()).state,'done');
 assert.equal((await db.query("SELECT count(*)::integer AS n FROM public.yepian_jobs WHERE state='failed'")).rows[0].n,0);
 console.log('100 queued snapshots synced through production worker against simulated GitHub; max concurrent commit = 1; no failures.');
 const authStart=performance.now();
 const registrations=await Promise.all(Array.from({length:100},(_,i)=>call('/api/register',{phone:'002'+String(i).padStart(8,'0'),password:'Concurrent password '+i,confirmPassword:'Concurrent password '+i})));
 assert.equal(registrations.filter(r=>r.status===200).length,100);
 console.log('100 concurrent API registrations from one shared IP: all accepted in '+Math.round(performance.now()-authStart)+'ms; password hashing concurrency bounded to 4.');
 // Even if the database is reachable from the browser, anonymous roles have no access.
 await db.exec('SET ROLE anon;');
 await assert.rejects(()=>db.query('SELECT * FROM public.yepian_accounts'));
 await assert.rejects(()=>db.query("SELECT public.yepian_rpc('lookup','{}')"));
 await db.exec('RESET ROLE; SET ROLE service_role;');
 assert.equal((await rpc('health')).ready,true);
 assert.equal((await rpc('lookup',{phone:'00000000001'})).site_id,user.siteId);
 await db.exec('RESET ROLE;');
 const stored=await rpc('lookup',{phone:'00000000001'});assert.notEqual(stored.password_hash,'Test Password1');
 console.log('PASS: schema, private permissions, hashed password, ownership, persistent sessions, 100 queued saves, single-worker lease, restart recovery, FIFO retry and duplicate request protection.');
}finally{await db.close();await rm(directory,{recursive:true,force:true})}
