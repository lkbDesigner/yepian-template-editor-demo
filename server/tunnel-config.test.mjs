import test from 'node:test';import assert from 'node:assert/strict';
import{createMockGitHub}from'./test-utils/mock-github.mjs';import{publishTunnel,configPaths}from'./tunnel-config.mjs';
const repo='lkbDesigner/yepian-template-editor-demo';
async function seed(gh,url='https://old.trycloudflare.com'){
 const r=gh.repo(repo),api=async(path,body)=>{const response=await gh.fetch('https://api.github.com/repos/'+repo+path,{method:'POST',body:JSON.stringify(body)});return response.json();};
 const tree=await api('/git/trees',{base_tree:r.commits.get(r.head).tree,tree:configPaths.map(path=>({path,content:JSON.stringify({saveServiceUrl:url,other:'preserved'}),mode:'100644',type:'blob'}))});const commit=await api('/git/commits',{tree:tree.sha,parents:[r.head],message:'seed'});r.head=commit.sha;
}
test('tunnel recovery updates only both public configs atomically, preserves values, retries conflicts and is idempotent',async()=>{
 const gh=createMockGitHub();await seed(gh);gh.conflicts=1;assert.equal(await publishTunnel('https://recovered.trycloudflare.com',gh.fetch),true);assert.equal(await publishTunnel('https://recovered.trycloudflare.com',gh.fetch),false);
 const r=gh.repo(repo),tree=r.trees.get(r.commits.get(r.head).tree);for(const path of configPaths){const data=JSON.parse(r.blobs.get(tree.get(path)).toString());assert.equal(data.saveServiceUrl,'https://recovered.trycloudflare.com');assert.equal(data.other,'preserved');}
 assert.ok(gh.calls.every(c=>c.repo===repo));assert.ok(gh.calls.filter(c=>c.method==='PATCH').every(c=>c.body.force===false));
});
test('tunnel recovery never replaces a permanent backend or accepts arbitrary URLs',async()=>{
 const gh=createMockGitHub();await seed(gh,'https://save.example.com');await assert.rejects(publishTunnel('https://recovered.trycloudflare.com',gh.fetch),/permanent backend/);await assert.rejects(publishTunnel('https://attacker.example.com',gh.fetch),/Invalid test tunnel/);assert.equal(gh.calls.filter(c=>c.method==='PATCH').length,0);
});
