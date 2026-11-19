import {ghFetch} from './gh-transport.mjs';
export const configPaths=['site-config.json','portfolio-test/3_中文_空模板/save-config.json'];
export async function publishTunnel(url,fetchGitHub=ghFetch){
 const target=new URL(url);if(target.protocol!=='https:'||!/^[-a-z0-9]+\.trycloudflare\.com$/.test(target.hostname)||target.pathname!=='/')throw Error('Invalid test tunnel');
 const api=async(path,method='GET',body)=>{const response=await fetchGitHub('https://api.github.com/repos/lkbDesigner/yepian-template-editor-demo'+path,{method,...(body?{body:JSON.stringify(body)}:{})});if(!response.ok)throw Object.assign(Error('Could not update shared service configuration'),{status:response.status});return response.json();};
 for(let attempt=0;attempt<4;attempt++){
  const head=await api('/git/ref/heads/main'),parent=await api('/git/commits/'+head.object.sha),tree=[];
  for(const path of configPaths){const file=await api('/contents/'+encodeURI(path)+'?ref='+head.object.sha);const config=JSON.parse(Buffer.from(file.content.replace(/\s/g,''),'base64').toString());const previous=new URL(config.saveServiceUrl);if(!previous.hostname.endsWith('.trycloudflare.com'))throw Error('A permanent backend is configured; automatic tunnel updates stopped');if(config.saveServiceUrl!==target.origin)tree.push({path,mode:'100644',type:'blob',content:JSON.stringify({...config,saveServiceUrl:target.origin},null,2)+'\n'});}
  if(!tree.length)return false;
  const nextTree=await api('/git/trees','POST',{base_tree:parent.tree.sha,tree}),commit=await api('/git/commits','POST',{tree:nextTree.sha,parents:[head.object.sha],message:'Restore shared test service connection'});
  try{await api('/git/refs/heads/main','PATCH',{sha:commit.sha,force:false});return true;}catch(error){if(![409,422].includes(error.status)||attempt===3)throw error;}
 }
}
