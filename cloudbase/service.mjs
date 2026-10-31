import {randomBytes,createHash,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {validatePayload,saveSubmission,REPOSITORY} from '../server/save-worker.mjs';
const derive=promisify(scrypt),hex=n=>randomBytes(n).toString('hex');
const hash=value=>createHash('sha256').update(value).digest('hex');
const origin='https://lkbdesigner.github.io';
class ApiError extends Error{constructor(status,message){super(message);this.status=status}}
async function body(request,limit){
 const reader=request.body?.getReader();if(!reader)throw new ApiError(400,'缺少请求内容');
 const chunks=[];let length=0;
 for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw new ApiError(413,'请求内容过大')}chunks.push(Buffer.from(value))}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new ApiError(400,'请求格式不正确')}
}
export function createCloudService({rpc,env}){
 const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
 const reply=(data,status=200)=>Response.json(data,{status,headers});
 let hashing=0;const hashWaiters=[];
 async function passwordHash(password,salt){if(hashing>=4){if(hashWaiters.length>=128)throw new ApiError(503,'登录人数较多，请稍后重试');await new Promise(resolve=>hashWaiters.push(resolve))}else hashing++;try{return await derive(password,salt,32)}finally{const next=hashWaiters.shift();if(next)next();else hashing--}}
 return async(request,ip='unknown')=>{
  const url=new URL(request.url),path=url.pathname;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(path==='/healthz')return reply({ok:true});
  try{
   if(path==='/api/status'){await rpc('health');return reply({ready:!!env.GITHUB_TOKEN,accounts:true,queue:true,repository:REPOSITORY})}
   if(request.headers.get('Origin')!==origin)throw new ApiError(403,'请求来源不被允许');
   if(['/api/start','/api/register','/api/login'].includes(path)){
    if(request.method!=='POST')throw new ApiError(405,'请求方法不正确');
    const input=await body(request,4096),phone=input.phone;
    if(input.clientVersion!==2)throw new ApiError(426,'请刷新到最新版页面后重试');
    if(typeof phone!=='string'||!/^\d{11}$/.test(phone))throw new ApiError(400,'手机号码必须是 11 位数字');
    if(!(await rpc('limit',{phone,ip})).allowed)throw new ApiError(429,'尝试次数过多，请 10 分钟后重试');
    let account=await rpc('lookup',{phone});
    if(path==='/api/start')return reply({existing:!!account});
    const password=input.password;
    if(typeof password!=='string'||password.length<8||password.length>128)throw new ApiError(400,'密码需要 8–128 位字符');
    if(path==='/api/register'){
     if(account)throw new ApiError(409,'该号码已注册，请输入密码登录');
     if(password!==input.confirmPassword)throw new ApiError(400,'两次输入的密码不一致');
     const salt=hex(16),password_hash=(await passwordHash(password,salt)).toString('hex');
     account={site_id:hex(12),password_salt:salt,password_hash};
     const created=await rpc('register',{phone,siteId:account.site_id,salt,hash:password_hash,editKey:hex(32)});
     if(!created.created)throw new ApiError(409,'该号码已注册，请输入密码登录');
    }else{
     const actual=await passwordHash(password,account?.password_salt||'missing-account');
     if(!account||!timingSafeEqual(actual,Buffer.from(account.password_hash,'hex')))throw new ApiError(401,'手机号或密码不正确');
    }
    const content=await rpc('load',{siteId:account.site_id});
    const token=hex(32);await rpc('session',{siteId:account.site_id,tokenHash:hash(token)});
    return reply({token,siteId:account.site_id,fields:content.fields,assets:content.assets});
   }
   const token=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
   const session=token?await rpc('authenticate',{tokenHash:hash(token)}):null;
   if(!session)throw new ApiError(401,'请重新输入手机号和密码进入编辑');
   if(path==='/api/logout'&&request.method==='POST'){await rpc('logout',{tokenHash:hash(token)});return reply({ok:true})}
   if(path==='/api/save'&&request.method==='POST'){
    const input=await body(request,12*1024*1024);
    if(input.siteId!==session.siteId)throw new ApiError(403,'不能修改其他用户的页面');
    let validated;try{validated=validatePayload(input)}catch(e){throw new ApiError(e.status||400,e.message)}
    if(!/^[a-f0-9-]{16,64}$/.test(input.requestId||''))throw new ApiError(400,'请刷新到支持排队保存的新版页面');
    // Store sanitized fields and validated files. DB atomically persists page and queue snapshot.
    const assets=validated.blobs.map(blob=>{const key=Object.keys(validated.assets).find(k=>validated.assets[k].path===blob.path);return {key,name:validated.assets[key].name,type:validated.assets[key].type,data:blob.content}});
    const queued=await rpc('enqueue',{id:hex(16),siteId:session.siteId,requestId:input.requestId,payload:{siteId:session.siteId,fields:validated.fields,assets}});
    return reply({queued:true,cloudSaved:true,jobId:queued.id},202);
   }
   if(path.startsWith('/api/jobs/')&&request.method==='GET'){
    const id=path.slice('/api/jobs/'.length);if(!/^[a-f0-9]{32}$/.test(id))throw new ApiError(400,'任务编号不正确');
    const job=await rpc('job',{id,siteId:session.siteId});if(!job)throw new ApiError(404,'任务不存在');return reply(job);
   }
   throw new ApiError(404,'接口不存在');
  }catch(e){return reply({error:e instanceof ApiError?e.message:'服务暂时不可用，请稍后重试'},e instanceof ApiError?e.status:503)}
 };
}
export function startWorker({rpc,env,githubFetch=fetch,interval=2000}){
 let stopped=false,timer,busy=false;
 const tick=async()=>{
  if(stopped||busy)return;busy=true;let job;const holder=hex(16);
  try{
   if(!env.GITHUB_TOKEN)return;
   job=await rpc('claim',{holder});if(!job)return;
   const heartbeat=setInterval(()=>rpc('heartbeat',{holder,id:job.id}).catch(()=>{}),30000);
   try{
    const result=await saveSubmission(validatePayload(job.payload),job.editKey,env.GITHUB_TOKEN,(url,options)=>githubFetch(url,{...options,signal:AbortSignal.timeout(45000)}));
    await rpc('finish',{holder,id:job.id,result});
   }finally{clearInterval(heartbeat)}
  }catch{
   if(job)await rpc('fail',{holder,id:job.id}).catch(()=>{});
   console.error('Queue sync deferred; queued payload remains in database.');
  }finally{busy=false;if(!stopped)timer=setTimeout(tick,interval)}
 };
 timer=setTimeout(tick,0);
 const cleanup=setInterval(()=>rpc('cleanup').catch(()=>{}),3600000);
 return ()=>{stopped=true;clearTimeout(timer);clearInterval(cleanup)};
}
