import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {createStore} from './store.mjs';
import {createCloudService,startWorker} from './service.mjs';
const rpc=createStore(process.env),handle=createCloudService({rpc,env:process.env});
const stop=startWorker({rpc,env:process.env});
const server=createServer(async(req,res)=>{
 try{
  const hasBody=!['GET','HEAD'].includes(req.method);
  const request=new Request(`http://service.local${req.url}`,{method:req.method,headers:req.headers,...(hasBody?{body:Readable.toWeb(req),duplex:'half'}:{})});
  // Socket IP is trusted. Do not accept client-supplied forwarding headers as identity.
  const response=await handle(request,req.socket.remoteAddress||'unknown');
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'服务暂时不可用'}))}
});
server.requestTimeout=120000;server.headersTimeout=20000;
server.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>console.log('Yepian cloud API listening; credentials are server-side only.'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{stop();server.close();setTimeout(()=>process.exit(0),10000).unref()});
