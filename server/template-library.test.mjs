import test from'node:test';import assert from'node:assert/strict';import{mkdtemp,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{randomUUID}from'node:crypto';
import{createAccountService}from'./account-service.mjs';import{createMockGitHub}from'./test-utils/mock-github.mjs';
test('my templates returns only owner saved drafts, excludes legacy webpages without deleting them or reading the public repository',async()=>{
 const directory=await mkdtemp(tmpdir()+'/current-library-'),gh=createMockGitHub(),api=createAccountService({directory,githubFetch:gh.fetch});
 const call=(path,body={},token)=>api(new Request('https://api.test'+path,{method:'POST',headers:{Origin:'https://lkbdesigner.github.io','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({clientVersion:2,template:'chinese-portfolio',...body})}));
 try{
  const password='Isolated library password!';const owner=await(await call('/api/register',{phone:'10000000051',password,confirmPassword:password})).json(),other=await(await call('/api/register',{phone:'10000000052',password,confirmPassword:password})).json();
  const repo='lkbDesigner/yepian-template-editor-demo',r=gh.repo(repo),path='user-sites/'+owner.siteId+'/portfolios/'+randomUUID()+'/metadata.json';
  const github=async(p,body)=>(await gh.fetch('https://api.github.com/repos/'+repo+p,{method:'POST',body:JSON.stringify(body)})).json();
  const tree=await github('/git/trees',{base_tree:r.commits.get(r.head).tree,tree:[{path,mode:'100644',type:'blob',content:JSON.stringify({title:'旧版公开网页'})}]}),commit=await github('/git/commits',{tree:tree.sha,parents:[r.head],message:'seed legacy fixture'});r.head=commit.sha;
  let response=await call('/api/portfolios',{},owner.token);assert.equal(response.status,200);assert.deepEqual((await response.json()).templates,[]);
  const draftId=randomUUID();const saved=await call('/api/portfolio',{draftId,baseRevision:null,state:{id:draftId,title:'本人当前模板',updated:1,values:{},hidden:{},colors:{},modules:{},tabs:{},repeats:{}}},owner.token);assert.equal(saved.status,200);
  gh.calls.length=0;const result=await(await call('/api/portfolios',{},owner.token)).json();assert.equal(result.templates.length,1);assert.equal(result.templates[0].draftId,draftId);assert.equal(result.templates[0].private,true);assert.ok(!result.templates[0].legacyUrl);assert.ok(gh.calls.every(c=>c.repo.endsWith('-data')));
  assert.deepEqual((await(await call('/api/portfolios',{},other.token)).json()).templates,[]);assert.ok(r.trees.get(r.commits.get(r.head).tree).has(path));assert.equal(r.head,commit.sha);
 }finally{await rm(directory,{recursive:true,force:true});}
});
