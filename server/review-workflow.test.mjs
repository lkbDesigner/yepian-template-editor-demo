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

test('shared contacts and expertise are validated once across tabs, while retaining page visibility',()=>{
 const state=readyDraft();for(const page of ['home','projects','ai','about'])state.tabs[page]=true;
 const contact=schema.definitions.find(d=>d.id==='home-contact'),field=contact.fields.find(f=>f.label==='合作标题');for(const def of schema.definitions.filter(d=>['home-contact','projects-contact','ai-contact','about-footer'].includes(d.id)))state.modules[def.id]=true;state.hidden[field.id]=false;state.values[field.id]='';
 assert.equal(validateReviewDraft(state).issues.filter(i=>i.field===field.id).length,1);state.values[field.id]='只填写一次';
 const home=schema.definitions.find(d=>d.id==='home-expertise'),about=schema.definitions.find(d=>d.id==='about-expertise');assert.deepEqual(home.collections,about.collections);assert.deepEqual(home.fields.map(f=>f.id),about.fields.map(f=>f.id));state.modules[home.id]=state.modules[about.id]=true;
 const collection=schema.collections[home.collections[0]],entryField=collection.templates[0].fields[0];state.repeats[collection.id]=[{id:randomUUID(),variant:0,values:{[entryField.id]:''},hidden:{...state.hidden,[entryField.id]:false},colors:{}}];
 assert.equal(validateReviewDraft(state).issues.filter(i=>i.field===entryField.id).length,1);state.repeats[collection.id][0].values[entryField.id]='同一份专业能力';assert.equal(validateReviewDraft(state).valid,true);
 state.modules[home.id]=false;assert.equal(validateReviewDraft(state).valid,true);
});

test('submission needs project source material and card fields, but no administrator-produced detail fields or visibility',()=>{
 const state=readyDraft();for(const def of schema.definitions.filter(d=>d.page.startsWith('case-'))){state.tabs[def.page]=true;state.modules[def.id]=true;for(const field of def.fields){state.hidden[field.id]=false;delete state.values[field.id];}}
 assert.equal(validateReviewDraft(state).valid,true);state.tabs['case-4']=false;assert.equal(validateReviewDraft(state).valid,true);
 const project=state.repeats.projects[0];project.links='';assert.ok(validateReviewDraft(state).issues.some(i=>i.private==='source'));project.links='https://design.example.com/project';
 const cover=schema.collections.projects.templates[0].fields.find(f=>f.type==='image');project.hidden[cover.id]=false;assert.ok(validateReviewDraft(state).issues.some(i=>i.field===cover.id));project.hidden[cover.id]=true;assert.equal(validateReviewDraft(state).valid,true);
});
