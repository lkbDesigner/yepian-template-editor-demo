import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { REPOSITORY, handleRequest } from './save-worker.mjs';
const origin = 'https://lkbdesigner.github.io';
const hex = n => randomBytes(n).toString('hex');
export function createAccountService({directory, githubFetch}) {
  const sessions = new Map(), attempts = new Map();
  let queue = Promise.resolve();
  const headers = {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Cache-Control':'no-store','Content-Type':'application/json','Vary':'Origin'};
  const reply = (data,status=200) => Response.json(data,{status,headers});
  const filename = directory + '/accounts.json';
  async function boundedBody(request,limit){const reader=request.body?.getReader();if(!reader)throw Error('missing body');let length=0;const chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw Error('body too large')}chunks.push(Buffer.from(value))}return Buffer.concat(chunks).toString('utf8')}

  async function readAccounts(){try{return JSON.parse(await readFile(filename,'utf8'))}catch(e){if(e.code==='ENOENT')return {};throw e}}
  async function commit(accounts){await mkdir(directory,{recursive:true,mode:0o700});await writeFile(filename+'.tmp',JSON.stringify(accounts),{mode:0o600});await rename(filename+'.tmp',filename)}
  const exclusive = work => {const job=queue.then(work);queue=job.catch(()=>{});return job};
  async function github(path){const res=await githubFetch(`https://api.github.com/repos/${REPOSITORY}/contents/${path}?ref=main`,{method:'GET'});if(res.status===404)return null;if(!res.ok)throw Error('读取已保存页面失败，请稍后重试');return res.json()}
  async function load(account){const item=await github(`user-sites/${account.siteId}/site.json`);if(!item)return {fields:{},assets:[]};const doc=JSON.parse(Buffer.from(item.content,'base64').toString());const assets=[];for(const [key,asset] of Object.entries(doc.assets||{})){if(!/^assets\/(heroImage|product[123]Image|storyImage|resourcePdf)\.(png|jpg|gif|webp|pdf)$/.test(asset.path))throw Error('文件路径无效');let file=await github(`user-sites/${account.siteId}/${asset.path}`);if(file&&!file.content&&/^[a-f0-9]{40}$/.test(file.sha)){const res=await githubFetch(`https://api.github.com/repos/${REPOSITORY}/git/blobs/${file.sha}`,{method:'GET'});if(res.ok)file=await res.json()}if(!file?.content)throw Error('文件读取失败，请稍后重试');assets.push({key,name:asset.name,type:asset.type,data:file.content.replace(/\s/g,'')})}return {fields:doc.fields,assets}}
  return async request => {
    const path=new URL(request.url).pathname;
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(path==='/api/status')return reply({ready:true,accounts:true,repository:REPOSITORY});
    if(request.headers.get('Origin')!==origin)return reply({error:'请求来源不被允许'},403);
    try {
      if(path==='/api/start'||path==='/api/register'||path==='/api/login'){
        if(request.method!=='POST')return reply({error:'请求方法不正确'},405);
        const raw=await boundedBody(request,1024);if(raw.length>1024)return reply({error:'请求过大'},413);
        const body=JSON.parse(raw),phone=body.phone;
        if(typeof phone!=='string'||!/^\d{11}$/.test(phone))return reply({error:'手机号码必须是 11 位数字'},400);
        const address=request.headers.get('CF-Connecting-IP')||'local';
        for(const key of ['ip:'+address,'phone:'+phone]){let bucket=attempts.get(key);if(!bucket||bucket.until<Date.now()){bucket={n:0,until:Date.now()+600000};attempts.set(key,bucket)}if(++bucket.n>30)return reply({error:'尝试次数过多，请 10 分钟后重试'},429)}
        const result=await exclusive(async()=>{const accounts=await readAccounts();let account=accounts[phone];
          if(path==='/api/start')return {lookup:true,existing:!!account,legacy:!!account&&!account.passwordHash};
          const password=body.password;
          if(path==='/api/register'){
            if(account?.passwordHash)return {error:'该号码已注册，请输入密码登录',status:409};
            if(typeof password!=='string'||password.length<8||password.length>128)return {error:'密码需要 8–128 位字符',status:400};
            if(password!==body.confirmPassword)return {error:'两次输入的密码不一致',status:400};
            if(account){
              const code=String(body.code||'').trim().replace(/-/g,'').toUpperCase();
              if(!timingSafeEqual(scryptSync(code,account.salt,32),Buffer.from(account.hash,'hex')))return {error:'原找回码不正确',status:401};
            }
            const created=!account;
            account=account||{siteId:hex(12),editKey:hex(32),createdAt:new Date().toISOString()};
            account.passwordSalt=hex(16);account.passwordHash=scryptSync(password,account.passwordSalt,32).toString('hex');
            delete account.hash;delete account.salt;
            accounts[phone]=account;await commit(accounts);
            for(const [token,session] of sessions)if(session.siteId===account.siteId)sessions.delete(token);
            return {account,created};
          }
          if(typeof password!=='string'||password.length>128)return {error:'手机号或密码不正确',status:401};
          const actual=scryptSync(password,account?.passwordSalt||'missing-account-salt',32);
          if(!account?.passwordHash||!timingSafeEqual(actual,Buffer.from(account.passwordHash,'hex')))return {error:'手机号或密码不正确',status:401};
          return {account};
        });
        if(result.lookup)return reply({existing:result.existing,legacy:result.legacy});
        if(result.error)return reply({error:result.error},result.status);
        const content=result.created?{fields:{},assets:[]}:await load(result.account);
        const token=hex(32);sessions.set(token,{...result.account,expires:Date.now()+8*3600000});
        return reply({token,siteId:result.account.siteId,...content});
      }
      const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');const account=sessions.get(token);
      if(!account||account.expires<Date.now())return reply({error:'请重新输入手机号和密码进入编辑'},401);
      if(path==='/api/logout'){sessions.delete(token);return reply({ok:true})}
      if(path==='/api/save'){
        const body=JSON.parse(await boundedBody(request,12*1024*1024));if(body.siteId!==account.siteId)return reply({error:'不能修改其他用户的页面'},403);
        const secured=new Request(request.url,{method:'POST',headers:{'Origin':origin,'Content-Type':'application/json','Authorization':`Bearer ${account.editKey}`},body:JSON.stringify(body)});
        return handleRequest(secured,{GITHUB_TOKEN:'local-gh-transport'},{githubFetch});
      }
      return reply({error:'接口不存在'},404);
    }catch{return reply({error:'服务暂时不可用，请稍后重试'},502)}
  };
}
