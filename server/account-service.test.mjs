import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createAccountService} from './account-service.mjs';
test('password registration, validation, login, restart, ownership',async()=>{
 const directory=await mkdtemp(tmpdir()+'/yepian-auth-');
 const githubFetch=async()=>Response.json({content:Buffer.from(JSON.stringify({fields:{heroTitle:'saved content'},assets:{}})).toString('base64')});
 let api=createAccountService({directory,githubFetch});
 const call=(path,body,token)=>api(new Request('https://api.test'+path,{method:'POST',headers:{Origin:'https://lkbdesigner.github.io','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}));
 try{
  for(const phone of ['123','123456789012','1234567890a','１２３４５６７８９０１'])assert.equal((await call('/api/start',{phone})).status,400);
  const phone='10000000001',password='Test Password Abc!';
  assert.deepEqual(await (await call('/api/start',{phone})).json(),{existing:false});
  assert.deepEqual(await (await call('/api/start',{phone})).json(),{existing:false});
  assert.equal((await call('/api/register',{phone,password:'short',confirmPassword:'short'})).status,400);
  assert.equal((await call('/api/register',{phone,password,confirmPassword:'mismatch'})).status,400);
  const res=await call('/api/register',{phone,password,confirmPassword:password});assert.equal(res.status,200);const account=await res.json();assert.deepEqual(account.fields,{});
  assert.deepEqual(await (await call('/api/start',{phone})).json(),{existing:true});
  assert.equal((await call('/api/register',{phone,password,confirmPassword:password})).status,409);
  assert.equal((await call('/api/login',{phone,password:'wrong'})).status,401);
  assert.equal((await call('/api/login',{phone,password:password.toLowerCase()})).status,401);
  assert.equal((await call('/api/save',{siteId:'abcdefabcdef'},account.token)).status,403);
  await call('/api/logout',{},account.token);assert.equal((await call('/api/save',{},account.token)).status,401);
  api=createAccountService({directory,githubFetch});const login=await call('/api/login',{phone,password});assert.equal(login.status,200);const restored=await login.json();assert.equal(restored.siteId,account.siteId);assert.equal(restored.fields.heroTitle,'saved content');
  const stored=await readFile(directory+'/accounts.json','utf8');assert.ok(!stored.includes(password));
 }finally{await rm(directory,{recursive:true,force:true})}
});
