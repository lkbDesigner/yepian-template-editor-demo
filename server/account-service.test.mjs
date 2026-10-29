import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {scryptSync} from 'node:crypto';
import {tmpdir} from 'node:os';
import {createAccountService} from './account-service.mjs';
test('password registration, validation, login, restart, ownership and legacy migration',async()=>{
 const directory=await mkdtemp(tmpdir()+'/yepian-auth-');
 const githubFetch=async()=>Response.json({content:Buffer.from(JSON.stringify({fields:{heroTitle:'saved content'},assets:{}})).toString('base64')});
 let api=createAccountService({directory,githubFetch});
 const call=(path,body,token)=>api(new Request('https://api.test'+path,{method:'POST',headers:{Origin:'https://lkbdesigner.github.io','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}));
 try{
  for(const phone of ['123','123456789012','1234567890a','１２３４５６７８９０１'])assert.equal((await call('/api/start',{phone})).status,400);
  const phone='10000000001',password='Test Password Abc!';
  assert.deepEqual(await (await call('/api/start',{phone})).json(),{existing:false,legacy:false});
  assert.deepEqual(await (await call('/api/start',{phone})).json(),{existing:false,legacy:false});
  assert.equal((await call('/api/register',{phone,password:'short',confirmPassword:'short'})).status,400);
  assert.equal((await call('/api/register',{phone,password,confirmPassword:'mismatch'})).status,400);
  const res=await call('/api/register',{phone,password,confirmPassword:password});assert.equal(res.status,200);const account=await res.json();assert.deepEqual(account.fields,{});assert.ok(!account.recoveryCode);
  assert.deepEqual(await (await call('/api/start',{phone})).json(),{existing:true,legacy:false});
  assert.equal((await call('/api/register',{phone,password,confirmPassword:password})).status,409);
  assert.equal((await call('/api/login',{phone,password:'wrong'})).status,401);
  assert.equal((await call('/api/login',{phone,password:password.toLowerCase()})).status,401);
  assert.equal((await call('/api/save',{siteId:'abcdefabcdef'},account.token)).status,403);
  await call('/api/logout',{},account.token);assert.equal((await call('/api/save',{},account.token)).status,401);
  api=createAccountService({directory,githubFetch});const login=await call('/api/login',{phone,password});assert.equal(login.status,200);const restored=await login.json();assert.equal(restored.siteId,account.siteId);assert.equal(restored.fields.heroTitle,'saved content');
  const stored=await readFile(directory+'/accounts.json','utf8');assert.ok(!stored.includes(password));
  const accounts=JSON.parse(stored),legacyPhone='10000000002',code='ABCD1234EF567890ABCD1234';
  accounts[legacyPhone]={salt:'legacy-salt',hash:scryptSync(code,'legacy-salt',32).toString('hex'),siteId:'abcdef123456',editKey:'a'.repeat(64)};
  await writeFile(directory+'/accounts.json',JSON.stringify(accounts));
  assert.deepEqual(await (await call('/api/start',{phone:legacyPhone})).json(),{existing:true,legacy:true});
  assert.equal((await call('/api/register',{phone:legacyPhone,password,confirmPassword:password,code:'wrong'})).status,401);
  const migrated=await call('/api/register',{phone:legacyPhone,password,confirmPassword:password,code});assert.equal(migrated.status,200);assert.equal((await migrated.json()).siteId,'abcdef123456');
  assert.equal((await call('/api/login',{phone:legacyPhone,password})).status,200);
  assert.ok(!JSON.parse(await readFile(directory+'/accounts.json','utf8'))[legacyPhone].hash);
 }finally{await rm(directory,{recursive:true,force:true})}
});
