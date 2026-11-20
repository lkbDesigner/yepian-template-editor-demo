(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PortfolioReviewValidation=factory();})(globalThis,function(){
'use strict';
function validate(state,schema){
 const issues=[],seen=new Set(),sources=new Set();const trim=v=>typeof v==='string'?v.trim():'';
 const url=v=>{try{return ['http:','https:','mailto:'].includes(new URL(v).protocol);}catch{return false;}};
 const file=v=>!!v&&v.size>0&&(v.__privateAsset===1||typeof v.data==='string'&&v.data.startsWith('data:'));
 function add(issue){issues.push(issue);}
 function check(f,data,def,item,cid){
  const key=(item?.id||'page')+':'+f.id;if(seen.has(key)||data.hidden?.[f.id])return;seen.add(key);
  const value=data.values?.[f.id]??f.initial??'';let ok;
  if(['image','resume'].includes(f.type))ok=file(value)&&(f.type==='resume'?value.type==='application/pdf':['image/png','image/jpeg','image/webp','image/gif'].includes(value.type));
  else ok=typeof value==='string'&&!!trim(value)&&(f.type!=='url'||url(value));
  if(!ok)add({page:def.page==='global'?'home':def.page,module:def.id,field:f.id,item:item?.id||null,cid:cid||null,label:f.label,message:f.type==='url'?'请填写有效链接':'请填写'+f.label});
 }
 const itemIds=new Set();
 for(const c of Object.values(schema.collections)){
  const entries=state.repeats?.[c.id];if(entries===undefined)continue;
  if(!Array.isArray(entries)){add({page:'projects',module:null,label:c.label,message:'条目数据异常，请重新保存模板'});continue;}
  for(const item of entries){
   if(!item||typeof item!=='object'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(item.id||'')||itemIds.has(item.id)||!Number.isSafeInteger(item.variant)||item.variant<0){add({page:'projects',module:null,label:c.label,message:'条目编号异常，请重新添加该条目'});continue;}
   itemIds.add(item.id);
   for(const key of ['values','hidden','colors'])if(!item[key]||typeof item[key]!=='object'||Array.isArray(item[key]))add({page:'projects',module:null,label:c.label,message:'条目数据不完整'});
   if(c.project&&item.detail&&(typeof item.detail!=='object'||Array.isArray(item.detail)||['values','hidden','colors','modules'].some(k=>!item.detail[k]||typeof item.detail[k]!=='object'||Array.isArray(item.detail[k]))))add({page:'projects',module:null,label:'作品详情',message:'作品详情结构异常'});
   if(c.project&&(!Array.isArray(item.files)||['links','notes','style'].some(k=>typeof item[k]!=='string')))add({page:'projects',module:null,label:'作品资料',message:'作品资料结构不完整'});
  }
 }
 if(issues.length)return {valid:false,issues,count:issues.length};
 const projectDefs=schema.definitions.filter(d=>d.page==='projects'&&d.collections.includes('projects'));
 if(state.tabs?.projects===false||!projectDefs.length||projectDefs.every(d=>state.modules?.[d.id]===false))add({page:'projects',module:projectDefs[0]?.id||null,label:'作品集模块',message:'上传审核必须保留并显示作品集模块'});
 let validProject=false;
 for(const def of schema.definitions){
  // Project details are produced by administrators from the submitted source material.
  if(def.page.startsWith('case-'))continue;
  if(def.page!=='global'&&state.tabs?.[def.page]===false)continue;if(state.modules?.[def.id]===false&&!def.locked)continue;
  for(const f of def.fields)check(f,state,def);
  for(const cid of def.collections){const c=schema.collections[cid];if(!c)continue;const items=(state.repeats?.[cid]||[]).filter(i=>!i.deleted);
   if(!items.length)add({page:def.page,module:def.id,cid,label:c.label,message:'请至少保留一个'+c.label+'，或删除该模块'});
   for(const item of items){const t=c.templates[item.variant%c.templates.length];if(!t){add({page:def.page,module:def.id,cid,item:item.id,label:c.label,message:'条目类型不正确，请重新添加'});continue;}
    for(const f of t.fields)check(f,item,def,item,cid);
    if(c.project){
     const title=t.fields.find(f=>f.label==='标题'||f.label==='主标题');if(title&&!item.hidden?.[title.id]&&trim(item.values?.[title.id]))validProject=true;
     const key=cid+':'+item.id;if(sources.has(key))continue;sources.add(key);
     // Notes and style references explicitly marked optional remain optional.
     const links=trim(item.links),files=(item.files||[]).filter(file);
     if(!links&&!files.length)add({page:def.page,module:def.id,cid,item:item.id,private:'source',label:'原始资料',message:'请为作品上传原始附件，或填写原始资料链接'});
     if(links&&links.split(/\r?\n/).some(line=>trim(line)&&!/^https?:\/\//i.test(trim(line))||trim(line)&&!url(trim(line))))add({page:def.page,module:def.id,cid,item:item.id,private:'links',label:'原始链接',message:'请填写有效的原始链接，每行一个'});
    }
   }
  }
 }

 if(!validProject)add({page:'projects',module:projectDefs[0]?.id||null,cid:'projects',label:'作品集',message:'作品集不能为空，至少需要一个已填写名称的作品'});
 return {valid:issues.length===0,issues,count:issues.length};
}
return {validate};
});
