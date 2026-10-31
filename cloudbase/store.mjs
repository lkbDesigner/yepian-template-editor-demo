export function createStore(env,transport=fetch){
 const id=env.CLOUDBASE_ENV_ID;
 if(!/^[a-z0-9-]+$/.test(id||'')||!env.CLOUDBASE_APIKEY)throw Error('Missing CloudBase configuration');
 const url=`https://${id}.api.tcloudbasegateway.com/v1/rdb/rest/rpc/yepian_rpc`;
 return async(action,args={})=>{
  const response=await transport(url,{method:'POST',headers:{Authorization:`Bearer ${env.CLOUDBASE_APIKEY}`,'Content-Type':'application/json'},body:JSON.stringify({action,args}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('Database operation failed');
  return response.json();
 };
}
