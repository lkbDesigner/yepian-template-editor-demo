// Run under the user's launchd agent, independently of the editor or terminal.
import {spawn} from 'node:child_process';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {publishTunnel,configPaths} from './tunnel-config.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),runtime=root+'.private/runtime/';await mkdir(runtime,{recursive:true,mode:0o700});
const children=new Set();let stopping=false,server,tunnel,url=null,published=null,checking=false,failures=0,started=0,publishAt=0,serverFailures=0,serverStarted=0;
const log=message=>console.log(new Date().toISOString()+' '+message);
function child(binary,args,label){const p=spawn(binary,args,{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});children.add(p);p.stdout.resume();p.stderr.resume();p.once('error',()=>log(label+' failed to start'));p.once('exit',()=>{children.delete(p);log(label+' stopped');});return p;}
async function healthy(address){try{const response=await fetch(address+'/api/status',{signal:AbortSignal.timeout(10000)});const data=await response.json();return response.ok&&data.ready===true&&data.accounts===true&&data.portfolios===true&&data.mode==='local-github';}catch{return false;}}
async function writeConfig(path){try{const config=JSON.parse(await readFile(path,'utf8'));if(!new URL(config.saveServiceUrl).hostname.endsWith('.trycloudflare.com'))return;const next=JSON.stringify({...config,saveServiceUrl:url},null,2)+'\n';await writeFile(path+'.tmp',next,{mode:0o600});await rename(path+'.tmp',path);}catch{log('Local configuration could not be updated');}}
async function tick(){if(checking||stopping)return;checking=true;try{
 if(!server||server.exitCode!==null||server.signalCode){server=child(process.execPath,['server/local-server.mjs'],'API');serverStarted=Date.now();serverFailures=0;}
 if(!await healthy('http://127.0.0.1:8767')){if(Date.now()-serverStarted>60000&&++serverFailures>=3)server.kill();return;}serverFailures=0;
 if(!tunnel||tunnel.exitCode!==null||tunnel.signalCode){url=null;published=null;started=Date.now();failures=0;tunnel=child(root+'.private/bin/cloudflared',['tunnel','--no-autoupdate','--protocol','http2','--url','http://127.0.0.1:8767'],'Tunnel');let buffer='';const capture=chunk=>{buffer=(buffer+chunk.toString()).slice(-10000);const match=buffer.match(/https:\/\/[-a-z0-9]+\.trycloudflare\.com/);if(match&&!url){url=match[0];log('New test tunnel allocated: '+url);}};tunnel.stdout.on('data',capture);tunnel.stderr.on('data',capture);return;}
 if(!url){if(Date.now()-started>180000){tunnel.kill();}return;}
 if(!await healthy(url)){if(Date.now()-started>90000&&++failures>=3){log('Tunnel health failed repeatedly; reconnecting');tunnel.kill();}return;}failures=0;
 if(published!==url&&Date.now()>publishAt){publishAt=Date.now()+60000;await publishTunnel(url);for(const path of configPaths)await writeConfig(root+path);if(process.env.YEPIAN_SOURCE_CONFIG)await writeConfig(process.env.YEPIAN_SOURCE_CONFIG);published=url;await writeFile(runtime+'status.json',JSON.stringify({url,updatedAt:new Date().toISOString()}),{mode:0o600});log('Healthy test tunnel published');}
 }catch(error){log(error.message==='A permanent backend is configured; automatic tunnel updates stopped'?error.message:'Health or configuration check failed; will retry');}finally{checking=false;}}
function stop(){stopping=true;clearInterval(timer);for(const p of children)p.kill();setTimeout(()=>process.exit(0),1500).unref();}process.on('SIGTERM',stop);process.on('SIGINT',stop);
const timer=setInterval(tick,15000);await tick();
