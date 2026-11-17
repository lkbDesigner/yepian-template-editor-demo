import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {savePortfolio,publicWrapper} from './portfolio-save.mjs';
import {createAccountService} from './account-service.mjs';
const draftId='12345678-1234-1234-1234-123456789abc';
const html='<!doctype html><html><head><meta charset="utf-8"></head><body>中文测试</body></html>';
function fake(){const calls=[];let reads=0;return {calls,fetch:async(url,options={})=>{const path=new URL(url).pathname,body=options.body&&JSON.parse(options.body);calls.push({path,body});if(path.endsWith('/git/ref/heads/main'))return Response.json({object:{sha:'head'+(++reads)}});if(/\/git\/commits\/head/.test(path))return Response.json({tree:{sha:'base'}});if(path.endsWith('/git/blobs'))return Response.json({sha:'blob'});if(path.endsWith('/git/trees'))return Response.json({sha:'tree'});if(path.endsWith('/git/commits'))return Response.json({sha:'commit'});if(path.endsWith('/git/refs/heads/main'))return reads===1?Response.json({},{status:422}):Response.json({});throw Error(path);}};}
test('portfolio writes only sandboxed public HTML to the authenticated account; retries conflict',async()=>{
 const gh=fake(),account={siteId:'a'.repeat(24)};
 const result=await savePortfolio({draftId,html,siteId:'b'.repeat(24),notes:'PRIVATE-NOTES',files:['PRIVATE-FILE']},account,gh.fetch);
 assert.equal(result.saved,true);assert.ok(result.url.includes(account.siteId));assert.ok(!result.url.includes('b'.repeat(24)));
 const trees=gh.calls.filter(c=>c.path.endsWith('/git/trees'));assert.equal(trees.length,2);assert.equal(trees[0].body.tree.length,1);assert.ok(trees[0].body.tree[0].path.endsWith('/'+draftId+'/index.html'));
 const blob=Buffer.from(gh.calls.find(c=>c.path.endsWith('/git/blobs')).body.content,'base64').toString();
 assert.ok(blob.includes('sandbox="allow-scripts allow-popups"'));assert.ok(!blob.includes('allow-same-origin'));assert.ok(!blob.includes('PRIVATE-'));assert.ok(blob.includes('中文测试'));
 assert.ok(gh.calls.filter(c=>c.path.endsWith('/git/refs/heads/main')).every(c=>c.body.force===false));
 await assert.rejects(savePortfolio({draftId:'../index.html',html},account,gh.fetch),/编号/);
 assert.ok(publicWrapper('"/><script>malicious()</script>').includes('&quot;/&gt;&lt;script&gt;'));
});
test('portfolio API requires login and accepts loopback CORS only when configured',async()=>{
 const directory=await mkdtemp(tmpdir()+'/yepian-portfolio-test-'),gh=fake();
 const api=createAccountService({directory,githubFetch:gh.fetch,allowedOrigins:['http://127.0.0.1:8765']});
 const call=(path,body,token,origin='http://127.0.0.1:8765')=>api(new Request('https://save.local'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}));
 try{
 assert.equal((await call('/api/portfolio',{draftId,html})).status,401);
 assert.equal((await call('/api/register',{},null,'https://evil.example')).status,403);
 const registration=await call('/api/register',{phone:'10000000002',password:'Test password!',confirmPassword:'Test password!',clientVersion:2,template:'chinese-portfolio'});
 assert.equal(registration.status,200);assert.equal(registration.headers.get('Access-Control-Allow-Origin'),'http://127.0.0.1:8765');
 const account=await registration.json();const saved=await call('/api/portfolio',{draftId,html},account.token);assert.equal(saved.status,200);assert.ok((await saved.json()).url.includes(account.siteId));
 }finally{await rm(directory,{recursive:true,force:true});}
});
