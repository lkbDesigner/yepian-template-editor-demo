import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import{tmpdir}from'node:os';
import {createAccountService} from './account-service.mjs';import{createMockGitHub}from'./test-utils/mock-github.mjs';
const id='12345678-1234-1234-1234-123456789abc';
test('authenticated API saves private editing state, restores it and rejects old public save clients',async()=>{
 const directory=await mkdtemp(tmpdir()+'/yepian-private-api-'),gh=createMockGitHub(),api=createAccountService({directory,githubFetch:gh.fetch});
 const call=(path,body={},token)=>api(new Request('https://save.local'+path,{method:'POST',headers:{Origin:'https://lkbdesigner.github.io','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}));
 try{
  for(const path of ['/api/portfolio','/api/portfolio/load','/api/portfolio/asset','/api/portfolio/file','/api/portfolios'])assert.equal((await call(path)).status,401);
  const r=await call('/api/register',{phone:'10000000002',password:'Test password!',confirmPassword:'Test password!',clientVersion:2,template:'chinese-portfolio'});const account=await r.json();assert.equal(r.status,200);
  const identity=await(await call('/api/session',{},account.token)).json();assert.equal(identity.phone,'10000000002');assert.equal(identity.expires,account.expires);assert.ok(!('passwordHash'in identity));
  const state={id,title:'私人草稿',updated:123,values:{f1:'编辑数据'},hidden:{},colors:{},modules:{},tabs:{},repeats:{}};
  const saved=await call('/api/portfolio',{draftId:id,state,baseRevision:null},account.token);assert.equal(saved.status,200);const result=await saved.json();assert.equal(result.status,'editing');assert.ok(!result.url);
  const loaded=await(await call('/api/portfolio/load',{draftId:id},account.token)).json();assert.equal(loaded.state.values.f1,'编辑数据');
  const list=await(await call('/api/portfolios',{},account.token)).json();assert.equal(list.templates.length,1);assert.equal(list.templates[0].private,true);
  assert.equal((await call('/api/portfolio',{draftId:id,html:'<!doctype html>old'},account.token)).status,426);
  assert.equal((await call('/api/save',{siteId:account.siteId},account.token)).status,410);
  await call('/api/logout',{},account.token);assert.equal((await call('/api/portfolio/load',{draftId:id},account.token)).status,401);
 }finally{await rm(directory,{recursive:true,force:true});}
});
