import test from 'node:test';import assert from 'node:assert/strict';
import {createMockGitHub} from './test-utils/mock-github.mjs';
import {DATA_REPOSITORY,uploadDraftAsset,savePrivateDraft,loadPrivateDraft,downloadDraftAsset,listPrivateDrafts} from './private-drafts.mjs';
const id='12345678-1234-1234-1234-123456789abc',account={siteId:'a'.repeat(24),editKey:'c'.repeat(64)},other={siteId:'b'.repeat(24),editKey:'d'.repeat(64)};
const raw=Buffer.from('%PDF-1.7\n私人附件 · 中文资料'),file={name:'项目原始资料.pdf',type:'application/pdf',size:raw.length,data:'data:application/pdf;base64,'+raw.toString('base64')};
function state(ref){return {id,title:'完整中文作品集',updated:123456,values:{f1:'中文标题',...(ref?{f2:ref}:{})},hidden:{f5:true},colors:{f1:'#abc123'},modules:{'home-work':false},tabs:{about:false},sharedFooterVersion:1,repeats:{work:[{id:'work-1',variant:0,deleted:false,values:{title:'作品'},hidden:{},colors:{},files:ref?[ref]:[],notes:'私人制作要求',links:'https://source.example',style:'深色风格'}]}};}
test('full draft and attachments save only to private repository and restore losslessly',async()=>{
 const gh=createMockGitHub(),ref=await uploadDraftAsset({draftId:id,file},account,gh.fetch),draft=state(ref);gh.conflicts=1;
 const saved=await savePrivateDraft({draftId:id,state:draft,baseRevision:null},account,gh.fetch);assert.equal(saved.status,'editing');assert.equal(saved.private,true);assert.match(saved.revision,/^[a-f0-9]{40}$/);assert.ok(!saved.url);assert.ok(!saved.commitUrl);
 const loaded=await loadPrivateDraft({draftId:id},account,gh.fetch);assert.deepEqual(loaded.state,{...draft,owner:account.siteId});assert.equal(loaded.revision,saved.revision);
 const restored=await downloadDraftAsset({draftId:id,file:ref},account,gh.fetch);assert.equal(restored.file.data,file.data);assert.equal(restored.file.name,file.name);
 const list=await listPrivateDrafts(account,gh.fetch);assert.equal(list.length,1);assert.equal(list[0].status,'editing');assert.equal(list[0].revision,saved.revision);
 assert.ok(gh.calls.filter(c=>c.method!=='GET').every(c=>c.repo===DATA_REPOSITORY));assert.ok(gh.calls.filter(c=>c.path==='/git/refs/heads/main').every(c=>c.body.force===false));
 const r=gh.repo(DATA_REPOSITORY),paths=[...r.trees.get(r.commits.get(r.head).tree).keys()];assert.ok(paths.includes(`templates/${account.siteId}/${id}/attachments/${ref.sha}`));assert.ok(!paths.some(p=>p.endsWith('.html')));
});
test('ownership and signed file references block cross-account and cross-draft access',async()=>{
 const gh=createMockGitHub(),ref=await uploadDraftAsset({draftId:id,file},account,gh.fetch);await savePrivateDraft({draftId:id,state:state(ref),baseRevision:null},account,gh.fetch);
 await assert.rejects(loadPrivateDraft({draftId:id},other,gh.fetch),e=>e.status===404);assert.deepEqual(await listPrivateDrafts(other,gh.fetch),[]);
 await assert.rejects(downloadDraftAsset({draftId:id,file:ref},other,gh.fetch),e=>e.status===403);
 await assert.rejects(downloadDraftAsset({draftId:id,file:{...ref,name:'篡改.pdf'}},account,gh.fetch),e=>e.status===403);
 await assert.rejects(downloadDraftAsset({draftId:'22345678-1234-1234-1234-123456789abc',file:ref},account,gh.fetch),e=>e.status===403);
});
test('save retries are idempotent and stale edits cannot overwrite newer drafts',async()=>{
 const gh=createMockGitHub(),draft=state(),first=await savePrivateDraft({draftId:id,state:draft,baseRevision:null},account,gh.fetch);
 const again=await savePrivateDraft({draftId:id,state:draft,baseRevision:null},account,gh.fetch);assert.equal(again.revision,first.revision);
 const newer=state();newer.updated++;newer.values.f1='较新版本';const second=await savePrivateDraft({draftId:id,state:newer,baseRevision:first.revision},account,gh.fetch);assert.notEqual(second.revision,first.revision);
 const stale=state();stale.values.f1='旧页面';await assert.rejects(savePrivateDraft({draftId:id,state:stale,baseRevision:first.revision},account,gh.fetch),e=>e.status===409);
 assert.equal((await loadPrivateDraft({draftId:id},account,gh.fetch)).state.values.f1,'较新版本');
});
test('removed files leave current draft tree; public visibility or legacy HTML stops all uploads',async()=>{
 const gh=createMockGitHub(),ref=await uploadDraftAsset({draftId:id,file},account,gh.fetch),first=await savePrivateDraft({draftId:id,state:state(ref),baseRevision:null},account,gh.fetch);
 await savePrivateDraft({draftId:id,state:state(),baseRevision:first.revision},account,gh.fetch);const r=gh.repo(DATA_REPOSITORY);assert.ok(!r.trees.get(r.commits.get(r.head).tree).has(`templates/${account.siteId}/${id}/attachments/${ref.sha}`));
 gh.repo(DATA_REPOSITORY).private=false;const before=gh.calls.filter(c=>c.method==='POST').length;await assert.rejects(uploadDraftAsset({draftId:id,file},account,gh.fetch),e=>e.status===503);assert.equal(gh.calls.filter(c=>c.method==='POST').length,before);
 await assert.rejects(savePrivateDraft({draftId:id,html:'<!doctype html>old'},account,gh.fetch),e=>e.status===426);
 await assert.rejects(savePrivateDraft({draftId:'../../public',state:state(),baseRevision:null},account,gh.fetch),e=>e.status===400);
});
