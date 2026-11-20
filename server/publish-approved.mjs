import{privateAPI,documentAt,scope,summary}from'./private-drafts.mjs';import{jsonAt,commitWorkflow}from'./reviews.mjs';import{validateReviewDraft,portfolioSchema}from'./review-validation.mjs';import{renderApprovedWebsite}from'./approved-renderer.mjs';
const REPO='lkbDesigner/yepian-template-editor-demo',PAGES='https://lkbdesigner.github.io/yepian-template-editor-demo';
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
export async function publishApprovedDraft(input,owner,githubFetch){
 const root=scope(owner,input.draftId),api=await privateAPI(githubFetch);
 let record=await documentAt(api,root);if(!record)fail(404,'没有找到模板');
 if(record.document.status==='published'&&(record.revision===input.baseRevision||record.document.publication?.sourceRevision===input.baseRevision||record.document.publication?.requestRevision===input.baseRevision))return {...summary(record.document,record.revision),published:true};
 if(record.document.status!=='approved'||!record.document.workflow?.reviewId)fail(409,'只有审核通过的版本可以发布');
 if(record.revision!==input.baseRevision&&record.document.publicationPending?.sourceRevision!==input.baseRevision)fail(409,'模板版本已更新，请重新打开后发布');
 let review=await jsonAt(api,'reviews/'+record.document.workflow.reviewId+'.json');if(!review||review.status!=='approved'||!/^[a-f0-9]{40}$/.test(review.approvedRevision||''))fail(409,'审核结果已失效');
 const approvedBlob=await api('/git/blobs/'+review.approvedRevision),approved=JSON.parse(Buffer.from(approvedBlob.content.replace(/\s/g,''),'base64').toString());if(approved.ownerId!==owner.siteId||approved.state.id!==input.draftId)fail(403,'无权发布此模板');
 if(!validateReviewDraft(approved.state).valid)fail(422,'获批资料不完整，不能发布');
 // Persist the publishing lock so a restart cannot allow edits halfway through a release.
 async function ensurePending(){if(record.document.publicationPending)return;
  for(let attempt=0;attempt<4;attempt++){
   const head=await api('/git/ref/heads/main'),parent=await api('/git/commits/'+head.object.sha),fresh=await documentAt(api,root,head.object.sha);if(fresh.revision!==record.revision)fail(409,'模板版本已更新');
   try{await commitWorkflow(api,head,parent,root,{...fresh.document,publicationPending:{sourceRevision:record.revision,approvedRevision:review.approvedRevision}},review,'Begin approved publication '+input.draftId);record=await documentAt(api,root);return;}catch(error){if([409,422].includes(error.upstreamStatus)&&attempt<3)continue;throw error;}
  }
 }

 const publicAPI=async(path,method='GET',body,missing=false)=>{const response=await githubFetch('https://api.github.com/repos/'+REPO+path,{method,...(body?{body:JSON.stringify(body)}:{})});if(missing&&response.status===404)return null;if(!response.ok)throw Object.assign(Error('公开网站暂时无法发布，请再次点击发布重试'),{upstreamStatus:response.status});return response.json();};
 const target='user-sites/'+owner.siteId+'/portfolios/'+input.draftId,url=PAGES+'/'+target+'/',receiptPath=target+'/release.json';
 let receiptFile=await publicAPI('/contents/'+receiptPath+'?ref=main','GET',undefined,true),receipt=receiptFile?JSON.parse(Buffer.from(receiptFile.content.replace(/\s/g,''),'base64').toString()):null;
 if(receipt?.approvedRevision!==review.approvedRevision){
  const state=structuredClone(approved.state),usedDetails=new Set((state.repeats.projects||[]).filter(i=>!i.deleted).map(i=>portfolioSchema.collections.projects.templates[i.variant%portfolioSchema.collections.projects.templates.length].target));for(const page of Object.keys(state.tabs))if(page.startsWith('case-')&&!usedDetails.has(page))state.tabs[page]=false;
  const publicAssets=new Map();let bytesTotal=0;
  async function publicFile(value){if(!value?.__privateAsset)return value;const types={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','application/pdf':'pdf'};if(!types[value.type])fail(422,'公开内容包含不支持的图片或简历类型');const path=target+'/releases/'+review.approvedRevision+'/assets/'+value.sha+'.'+types[value.type];if(!publicAssets.has(value.sha)){bytesTotal+=value.size;if(bytesTotal>100*1024*1024)fail(413,'公开图片与简历合计请控制在 100 MB 内');const file=await api('/git/blobs/'+value.sha);if(Buffer.from(file.content.replace(/\s/g,''),'base64').length!==value.size)fail(502,'图片读取不完整');const blob=await publicAPI('/git/blobs','POST',{encoding:'base64',content:file.content.replace(/\s/g,'')});publicAssets.set(value.sha,{path,mode:'100644',type:'blob',sha:blob.sha});}return {publicUrl:PAGES+'/'+path};}
  // Only known visible display fields can cross into the public repository.
  for(const def of portfolioSchema.definitions){if(def.page.startsWith('case-'))continue;if(def.page!=='global'&&state.tabs[def.page]===false||state.modules[def.id]===false&&!def.locked)continue;
   for(const f of def.fields)if(!state.hidden[f.id]&&['image','resume'].includes(f.type))state.values[f.id]=await publicFile(state.values[f.id]);
   for(const cid of def.collections){const c=portfolioSchema.collections[cid];for(const item of state.repeats[cid]||[]){if(item.deleted)continue;for(const f of c.templates[item.variant%c.templates.length].fields)if(!item.hidden[f.id]&&['image','resume'].includes(f.type))item.values[f.id]=await publicFile(item.values[f.id]);}}
  }
  for(const item of state.repeats.projects||[]){if(item.deleted||item.generatedDetail)continue;const target=portfolioSchema.collections.projects.templates[item.variant%portfolioSchema.collections.projects.templates.length].target,data=item.detail||{values:state.values,hidden:state.hidden,modules:state.modules};for(const def of portfolioSchema.definitions.filter(d=>d.page===target&&(d.locked||data.modules[d.id]!==false)))for(const f of def.fields)if(!data.hidden[f.id]&&['image','resume'].includes(f.type))data.values[f.id]=await publicFile(data.values[f.id]);}
  // Only an explicitly imported administrator HTML asset becomes a detail page.
  for(const item of state.repeats.projects||[]){if(item.deleted||!item.generatedDetail)continue;const ref=item.generatedDetail.file;if(ref?.__privateAsset!==1||ref.type!=='text/html'||ref.size>10*1024*1024)fail(422,'作品详情成品格式不正确');const file=await api('/git/blobs/'+ref.sha),data=file.content.replace(/\s/g,'');if(Buffer.from(data,'base64').length!==ref.size)fail(502,'作品详情读取不完整');bytesTotal+=ref.size;if(bytesTotal>100*1024*1024)fail(413,'公开资源合计请控制在 100 MB 内');const path=target+'/releases/'+review.approvedRevision+'/details/'+item.id+'.html',blob=await publicAPI('/git/blobs','POST',{encoding:'base64',content:data});publicAssets.set('detail:'+item.id,{path,mode:'100644',type:'blob',sha:blob.sha});item.generatedDetail={publicUrl:PAGES+'/'+path};}
  const html=renderApprovedWebsite(state);if(Buffer.byteLength(html)>8*1024*1024)fail(413,'公开页面内容过大，请联系管理员');
  receipt={approvedRevision:review.approvedRevision,publishedAt:new Date().toISOString(),url};
  await ensurePending();
  for(let attempt=0;attempt<4;attempt++){
   const head=await publicAPI('/git/ref/heads/main'),parent=await publicAPI('/git/commits/'+head.object.sha),tree=await publicAPI('/git/trees','POST',{base_tree:parent.tree.sha,tree:[...publicAssets.values(),{path:target+'/index.html',mode:'100644',type:'blob',content:html},{path:receiptPath,mode:'100644',type:'blob',content:JSON.stringify(receipt)}]}),commit=await publicAPI('/git/commits','POST',{tree:tree.sha,parents:[head.object.sha],message:'Publish approved portfolio '+input.draftId});
   try{await publicAPI('/git/refs/heads/main','PATCH',{sha:commit.sha,force:false});break;}catch(error){if([409,422].includes(error.upstreamStatus)&&attempt<3)continue;throw error;}
  }
 }
 await ensurePending();
 for(let attempt=0;attempt<4;attempt++){
  const head=await api('/git/ref/heads/main'),parent=await api('/git/commits/'+head.object.sha),fresh=await documentAt(api,root,head.object.sha);if(fresh.document.publicationPending?.approvedRevision!==review.approvedRevision)fail(409,'发布状态已变化，请刷新');
  const doc={...fresh.document,status:'published',savedAt:new Date().toISOString(),publication:{...receipt,sourceRevision:fresh.document.publicationPending.sourceRevision,requestRevision:input.baseRevision}};delete doc.publicationPending;
  try{return {...await commitWorkflow(api,head,parent,root,doc,{...review,status:'published',publishedAt:receipt.publishedAt},'Complete approved publication '+input.draftId),published:true};}catch(error){if([409,422].includes(error.upstreamStatus)&&attempt<3)continue;throw error;}
 }
}
