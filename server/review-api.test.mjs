import test from 'node:test';import assert from 'node:assert/strict';import{mkdtemp,readFile,writeFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';
import{createAccountService}from'./account-service.mjs';import{createMockGitHub}from'./test-utils/mock-github.mjs';import{readyDraft}from'./test-utils/review-fixture.mjs';
test('user submits complete template; only administrator can read submission; owner can withdraw',async()=>{
 const directory=await mkdtemp(tmpdir()+'/review-api-'),gh=createMockGitHub();let api=createAccountService({directory,githubFetch:gh.fetch});
 const call=(path,body={},token)=>api(new Request('https://api.test'+path,{method:'POST',headers:{Origin:'https://lkbdesigner.github.io','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({clientVersion:2,template:'chinese-portfolio',...body})}));
 const password='Review isolated password!';try{
  await call('/api/register',{phone:'10000000041',password,confirmPassword:password});await call('/api/register',{phone:'10000000042',password,confirmPassword:password});
  const filename=directory+'/accounts.json',accounts=JSON.parse(await readFile(filename,'utf8'));accounts['10000000041'].role='admin';await writeFile(filename,JSON.stringify(accounts),{mode:0o600});api=createAccountService({directory,githubFetch:gh.fetch});
  const admin=await(await call('/api/login',{phone:'10000000041',password})).json(),user=await(await call('/api/login',{phone:'10000000042',password})).json(),state=readyDraft();
  assert.equal((await call('/api/portfolio/submit',{draftId:state.id},admin.token)).status,403);
  const saved=await(await call('/api/portfolio',{draftId:state.id,state,baseRevision:null},user.token)).json();
  const response=await call('/api/portfolio/submit',{draftId:state.id,baseRevision:saved.revision},user.token);assert.equal(response.status,200);const submitted=await response.json();assert.equal(submitted.status,'submitted');
  assert.equal((await call('/api/admin/review/load',{reviewId:submitted.reviewId},user.token)).status,403);
  const list=await(await call('/api/admin/reviews',{},admin.token)).json();assert.equal(list.submissionEnabled,true);assert.equal(list.reviews.length,1);assert.equal(list.reviews[0].ownerPhone,'10000000042');
  const reviewed=await(await call('/api/admin/review/load',{reviewId:submitted.reviewId},admin.token)).json();assert.equal(reviewed.state.owner,user.siteId);assert.equal(reviewed.state.title,state.title);assert.ok(!reviewed.state.editKey);
  const userList=await(await call('/api/portfolios',{},user.token)).json();assert.equal(userList.templates[0].status,'submitted');
  assert.equal((await call('/api/portfolio/withdraw',{draftId:state.id,baseRevision:submitted.revision},user.token)).status,200);assert.equal((await(await call('/api/admin/reviews',{},admin.token)).json()).reviews.length,0);
 }finally{await rm(directory,{recursive:true,force:true});}
});
