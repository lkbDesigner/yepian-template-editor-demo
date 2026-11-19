import test from 'node:test';import assert from 'node:assert/strict';
import {createMockGitHub} from './test-utils/mock-github.mjs';import {DATA_REPOSITORY,savePrivateDraft} from './private-drafts.mjs';import{listSubmittedReviews}from'./reviews.mjs';
const draftId='12345678-1234-1234-1234-123456789abc',reviewId='22345678-1234-1234-1234-123456789abc';
test('review list reads only explicit private submissions, never users editing drafts',async()=>{
 const gh=createMockGitHub(),account={siteId:'a'.repeat(24),editKey:'c'.repeat(64)};
 const saved=await savePrivateDraft({draftId,baseRevision:null,state:{id:draftId,title:'未提交的私人草稿',updated:1,values:{},hidden:{},colors:{},modules:{},tabs:{},repeats:{}}},account,gh.fetch);
 gh.calls.length=0;assert.deepEqual(await listSubmittedReviews(gh.fetch),[]);assert.ok(!gh.calls.some(c=>c.path.includes('/templates/')));
 const api=async(path,method='GET',body)=>(await gh.fetch('https://api.github.com/repos/'+DATA_REPOSITORY+path,{method,...(body?{body:JSON.stringify(body)}:{})})).json();
 const head=await api('/git/ref/heads/main'),parent=await api('/git/commits/'+head.object.sha);
 const submission={ownerId:account.siteId,draftId,title:'用户明确提交的模板',status:'submitted',submittedAt:new Date().toISOString(),submittedRevision:saved.revision};
 const tree=await api('/git/trees','POST',{base_tree:parent.tree.sha,tree:[{path:'reviews/'+reviewId+'.json',mode:'100644',type:'blob',content:JSON.stringify(submission)},{path:'reviews/32345678-1234-1234-1234-123456789abc.json',mode:'100644',type:'blob',content:JSON.stringify({...submission,status:'editing',title:'不可出现'})},{path:'reviews/42345678-1234-1234-1234-123456789abc.json',mode:'100644',type:'blob',content:JSON.stringify({...submission,submittedRevision:null,title:'无提交版本不可出现'})}]});
 const commit=await api('/git/commits','POST',{tree:tree.sha,parents:[head.object.sha],message:'test queue'});await api('/git/refs/heads/main','PATCH',{sha:commit.sha,force:false});
 const list=await listSubmittedReviews(gh.fetch);assert.equal(list.length,1);assert.equal(list[0].title,submission.title);assert.equal(list[0].reviewId,reviewId);
 gh.repo(DATA_REPOSITORY).private=false;await assert.rejects(listSubmittedReviews(gh.fetch),e=>e.status===503);
});
