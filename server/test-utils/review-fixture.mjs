import{randomUUID}from'node:crypto';import{portfolioSchema as schema}from'../review-validation.mjs';
export function readyDraft(id=randomUUID()){
 const hidden=Object.fromEntries([...schema.definitions.flatMap(d=>d.fields),...Object.values(schema.collections).flatMap(c=>c.templates.flatMap(t=>t.fields))].map(f=>[f.id,true]));
 const variant=schema.collections.projects.templates[0],title=variant.fields.find(f=>f.label==='标题'),modules=Object.fromEntries(schema.definitions.filter(d=>!d.locked).map(d=>[d.id,false]));modules['projects-work']=true;
 const tabs=Object.fromEntries(Object.keys(schema.pages).map(p=>[p,false]));tabs.home=tabs.projects=tabs[variant.target]=true;
 const item={id:randomUUID(),variant:0,deleted:false,values:{[title.id]:'审核测试作品'},hidden:{...hidden,[title.id]:false},colors:{},files:[],links:'https://source.example/project',notes:'',style:''};
 return {id,title:'完整可提交模板',updated:1,values:{},hidden,colors:{},modules,tabs,repeats:{projects:[item]},sharedFooterVersion:1};
}
