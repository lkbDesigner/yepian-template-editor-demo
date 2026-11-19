import{readFileSync}from'node:fs';import{randomUUID}from'node:crypto';import vm from'node:vm';import{DOMParser}from'linkedom';import{portfolioSchema}from'./review-validation.mjs';
let engine;
export function publishedEngine(){
 if(engine)return engine;
 const base='https://lkbdesigner.github.io/yepian-template-editor-demo/portfolio-test/3_%E4%B8%AD%E6%96%87_%E7%A9%BA%E6%A8%A1%E6%9D%BF/';
 const context=vm.createContext({window:{},DOMParser,NodeFilter:{SHOW_TEXT:4},crypto:{randomUUID},URL,structuredClone,document:{currentScript:{src:base+'template-source.js'}}});
 vm.runInContext(readFileSync(new URL('../portfolio-test/3_中文_空模板/template-source.js',import.meta.url),'utf8'),context);context.TemplateSources=context.window.TemplateSources;
 vm.runInContext(readFileSync(new URL('../portfolio-test/3_中文_空模板/template-engine.js',import.meta.url),'utf8'),context);const result=context.window.TemplateEngine;
 const identity=d=>({id:d.id,fields:d.fields.map(f=>f.id),collections:d.collections});if(JSON.stringify(result.definitions.map(identity))!==JSON.stringify(portfolioSchema.definitions.map(identity)))throw Error('发布模板与审核结构不一致，已停止发布');
 const collectionIdentity=c=>({id:c.id,templates:c.templates.map(t=>({target:t.target,fields:t.fields.map(f=>f.id)}))});if(JSON.stringify(Object.values(result.collections).map(collectionIdentity))!==JSON.stringify(Object.values(portfolioSchema.collections).map(collectionIdentity)))throw Error('发布作品结构与审核结构不一致');
 engine=result;return engine;
}
export function renderApprovedWebsite(state){return publishedEngine().publicHTML(structuredClone(state));}
