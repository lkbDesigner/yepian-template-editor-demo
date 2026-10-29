import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createAccountService} from './account-service.mjs';
test('phone registration, recovery authentication, restart, content restore and ownership',async()=>{
 const directory=await mkdtemp(tmpdir()+'/yepian-auth-');
 const githubFetch=async url=>Response.json({content:Buffer.from(JSON.stringify({fields:{heroTitle:'saved content'},assets:{}})).toString('base64')});
 let api=createAccountService({directory,githubFetch});
 const call=(path,body,token)=>api(new Request('https://api.test'+path,{method:'POST',headers:{Origin:'https://lkbdesigner.github.io','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}));
 try{
  for(const phone of ['123','123456789012','1234567890a','１２３４５６７８９０１'])assert.equal((await call('/api/register',{phone})).status,400);
  const phone='10000000001';let res=await call('/api/register',{phone});assert.equal(res.status,200);const account=await res.json();assert.match(account.recoveryCode,/^[A-F0-9]{24}$/);assert.deepEqual(account.fields,{});
  assert.equal((await call('/api/register',{phone})).status,409);
  assert.equal((await call('/api/login',{phone,code:'wrong'})).status,401);
  assert.equal((await call('/api/save',{siteId:'abcdefabcdef'},account.token)).status,403);
  assert.equal((await call('/api/save',{siteId:account.siteId},'old-anonymous-key')).status,401);
  await call('/api/logout',{},account.token);assert.equal((await call('/api/save',{},account.token)).status,401);
  api=createAccountService({directory,githubFetch});res=await call('/api/login',{phone,code:account.recoveryCode});assert.equal(res.status,200);const restored=await res.json();assert.equal(restored.siteId,account.siteId);assert.equal(restored.fields.heroTitle,'saved content');
  const stored=await readFile(directory+'/accounts.json','utf8');assert.ok(!stored.includes(account.recoveryCode));
 }finally{await rm(directory,{recursive:true,force:true})}
});
