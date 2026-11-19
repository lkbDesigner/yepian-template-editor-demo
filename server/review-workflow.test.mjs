import test from 'node:test';import assert from 'node:assert/strict';import{randomUUID}from'node:crypto';
import{readyDraft}from'./test-utils/review-fixture.mjs';import{portfolioSchema as schema,validateReviewDraft}from'./review-validation.mjs';import{createMockGitHub}from'./test-utils/mock-github.mjs';
import{savePrivateDraft,uploadDraftAsset,loadPrivateDraft}from'./private-drafts.mjs';import{submitDraftReview,withdrawDraftReview,readSubmittedReview,downloadSubmittedAsset,listSubmittedReviews}from'./reviews.mjs';
const account={siteId:'a'.repeat(24),editKey:'b'.repeat(64)},other={siteId:'c'.repeat(24),editKey:'d'.repeat(64)};
test('all retained visible fields are required; deleted/hidden fields and optional notes/style do not block submission',()=>{
 const state=readyDraft();assert.equal(validateReviewDraft(state).valid,true);assert.equal(state.repeats.projects[0].notes,'');assert.equal(state.repeats.projects[0].style,'');
 const field=schema.definitions.find(d=>d.id==='home-top').fields.find(f=>['text','textarea'].includes(f.type)&&!f.initial);state.hidden[field.id]=false;assert.ok(validateReviewDraft(state).issues.some(i=>i.field===field.id));state.values[field.id]='已填写';assert.equal(validateReviewDraft(state).valid,true);
 const image=schema.definitions.find(d=>d.id==='global').fields.find(f=>f.type==='image');state.hidden[image.id]=false;assert.ok(validateReviewDraft(state).issues.some(i=>i.field===image.id));state.hidden[image.id]=true;
 state.tabs.projects=false;assert.equal(validateReviewDraft(state).valid,false);state.tabs.projects=true;state.modules['projects-work']=false;assert.equal(validateReviewDraft(state).valid,false);state.modules['projects-work']=true;
 state.repeats.projects[0].links='invalid link';assert.equal(validateReviewDraft(state).valid,false);state.repeats.projects[0].links='';assert.equal(validateReviewDraft(state).valid,false);
 state.repeats.projects=[];assert.equal(validateReviewDraft(state).valid,false);
});
test('server refuses incomplete templates; submission pins full data/attachments and is atomic/idempotent',async()=>{
 const gh=createMockGitHub(),state=readyDraft(),field=schema.definitions.find(d=>d.id==='home-top').fields.find(f=>['text','textarea'].includes(f.type)&&!f.initial);state.hidden[field.id]=false;
 let saved=await savePrivateDraft({draftId:state.id,state,baseRevision:null},account,gh.fetch);
 await assert.rejects(submitDraftReview({draftId:state.id,baseRevision:saved.revision},account,gh.fetch),e=>e.status===422&&e.issues.some(i=>i.field===field.id));assert.deepEqual(await listSubmittedReviews(gh.fetch),[]);
 state.values[field.id]='全部必填内容已完成';
 const bytes=Buffer.from('%PDF-1.7\n完整原稿附件');const raw={name:'提交原稿.pdf',type:'application/pdf',size:bytes.length,data:'data:application/pdf;base64,'+bytes.toString('base64')};
 const ref=await uploadDraftAsset({draftId:state.id,file:raw},account,gh.fetch);state.repeats.projects[0].files=[ref];state.repeats.projects[0].links='';saved=await savePrivateDraft({draftId:state.id,state,baseRevision:saved.revision},account,gh.fetch);
 gh.conflicts=1;const submitted=await submitDraftReview({draftId:state.id,baseRevision:saved.revision},account,gh.fetch);assert.equal(submitted.status,'submitted');assert.ok(submitted.reviewId);assert.equal((await listSubmittedReviews(gh.fetch)).length,1);
 const retry=await submitDraftReview({draftId:state.id,baseRevision:saved.revision},account,gh.fetch);assert.equal(retry.reviewId,submitted.reviewId);assert.equal(retry.revision,submitted.revision);
 const review=await readSubmittedReview({reviewId:submitted.reviewId},gh.fetch);assert.equal(review.state.values[field.id],state.values[field.id]);assert.equal(review.review.ownerId,account.siteId);assert.equal(review.revision,submitted.revision);
 const file=await downloadSubmittedAsset({reviewId:submitted.reviewId,file:ref},gh.fetch);assert.equal(file.file.data,raw.data);
 await assert.rejects(savePrivateDraft({draftId:state.id,state,baseRevision:submitted.revision},account,gh.fetch),e=>e.status===409);
 await assert.rejects(withdrawDraftReview({draftId:state.id,baseRevision:submitted.revision},other,gh.fetch),e=>e.status===404);
 const withdrawn=await withdrawDraftReview({draftId:state.id,baseRevision:submitted.revision},account,gh.fetch);assert.equal(withdrawn.status,'editing');assert.deepEqual(await listSubmittedReviews(gh.fetch),[]);await assert.rejects(readSubmittedReview({reviewId:submitted.reviewId},gh.fetch),e=>e.status===409);assert.equal((await loadPrivateDraft({draftId:state.id},account,gh.fetch)).state.values[field.id],state.values[field.id]);
});
test('invalid or duplicate item identities cannot reach administrator HTML rendering',()=>{
 const state=readyDraft();state.repeats.projects[0].id='\" onclick=alert(1)';assert.equal(validateReviewDraft(state).valid,false);
 const safe=readyDraft();safe.repeats.projects.push(structuredClone(safe.repeats.projects[0]));assert.equal(validateReviewDraft(safe).valid,false);
});
