import test from 'node:test';import assert from 'node:assert/strict';import{mkdtemp,readFile,writeFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';
import{createAccountService}from'./account-service.mjs';import{createMockGitHub}from'./test-utils/mock-github.mjs';
test('admin role comes only from private account record; frontend claims do not grant privileges',async()=>{
 const directory=await mkdtemp(tmpdir()+'/yepian-admin-'),githubFetch=createMockGitHub().fetch;let api=createAccountService({directory,githubFetch});
 const call=(path,body={},token)=>api(new Request('https://save.local'+path,{method:'POST',headers:{Origin:'https://lkbdesigner.github.io','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({clientVersion:2,template:'chinese-portfolio',...body})}));
 const phone='10000000003',password='Isolated-admin-test!';
 try{
  assert.equal((await call('/api/admin/session')).status,401);
  const created=await(await call('/api/register',{phone,password,confirmPassword:password,role:'admin',isAdmin:true})).json();assert.equal(created.role,'user');
  assert.equal((await call('/api/admin/session',{role:'admin',isAdmin:true},created.token)).status,403);assert.equal((await call('/api/admin/reviews',{role:'admin'},created.token)).status,403);
  const filename=directory+'/accounts.json',accounts=JSON.parse(await readFile(filename,'utf8'));accounts[phone].role='admin';await writeFile(filename,JSON.stringify(accounts),{mode:0o600});
  api=createAccountService({directory,githubFetch});const signedIn=await(await call('/api/login',{phone,password,role:'user'})).json();assert.equal(signedIn.role,'admin');assert.equal((await call('/api/session',{},signedIn.token)).status,200);assert.equal((await(await call('/api/session',{},signedIn.token)).json()).role,'admin');
  assert.deepEqual(await(await call('/api/admin/session',{},signedIn.token)).json(),{authorized:true,role:'admin'});assert.deepEqual(await(await call('/api/admin/reviews',{},signedIn.token)).json(),{reviews:[],submissionEnabled:true});
  const ordinary=await(await call('/api/register',{phone:'10000000004',password,confirmPassword:password,role:'admin'})).json();assert.equal(ordinary.role,'user');assert.equal((await call('/api/admin/session',{},ordinary.token)).status,403);
  await call('/api/logout',{},signedIn.token);assert.equal((await call('/api/admin/session',{},signedIn.token)).status,401);
 }finally{await rm(directory,{recursive:true,force:true});}
});
