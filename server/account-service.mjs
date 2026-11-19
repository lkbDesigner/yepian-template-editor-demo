import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import {listSubmittedReviews,submitDraftReview,withdrawDraftReview,readSubmittedReview,downloadSubmittedAsset} from './reviews.mjs';
import { REPOSITORY } from './save-worker.mjs';
import { listPortfolios } from './portfolio-save.mjs';
import {DATA_REPOSITORY,savePrivateDraft,loadPrivateDraft,listPrivateDrafts,uploadDraftAsset,downloadDraftAsset} from './private-drafts.mjs';
const origin = 'https://lkbdesigner.github.io';
const hex = n => randomBytes(n).toString('hex');
export function createAccountService({directory, githubFetch, allowedOrigins=[origin]}) {
  const sessions = new Map(), attempts = new Map();
  let queue = Promise.resolve();
  const headers = {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Cache-Control':'no-store','Content-Type':'application/json','Vary':'Origin'};
  const reply = (data,status=200) => Response.json(data,{status,headers});
  const filename = directory + '/accounts.json';
  async function boundedBody(request,limit){const reader=request.body?.getReader();if(!reader)throw Error('missing body');let length=0;const chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw Object.assign(Error('上传资料过大，请分批上传附件'),{status:413})}chunks.push(Buffer.from(value))}return Buffer.concat(chunks).toString('utf8')}

  async function readAccounts(){try{return JSON.parse(await readFile(filename,'utf8'))}catch(e){if(e.code==='ENOENT')return {};throw e}}
  async function commit(accounts){await mkdir(directory,{recursive:true,mode:0o700});await writeFile(filename+'.tmp',JSON.stringify(accounts),{mode:0o600});await rename(filename+'.tmp',filename)}
  const exclusive = work => {const job=queue.then(work);queue=job.catch(()=>{});return job};
  async function github(path){const res=await githubFetch(`https://api.github.com/repos/${REPOSITORY}/contents/${path}?ref=main`,{method:'GET'});if(res.status===404)return null;if(!res.ok)throw Error('读取已保存页面失败，请稍后重试');return res.json()}
  async function load(account){const item=await github(`user-sites/${account.siteId}/site.json`);if(!item)return {fields:{},assets:[]};const doc=JSON.parse(Buffer.from(item.content,'base64').toString());const assets=[];for(const [key,asset] of Object.entries(doc.assets||{})){if(!/^assets\/(heroImage|product[123]Image|storyImage|resourcePdf)\.(png|jpg|gif|webp|pdf)$/.test(asset.path))throw Error('文件路径无效');let file=await github(`user-sites/${account.siteId}/${asset.path}`);if(file&&!file.content&&/^[a-f0-9]{40}$/.test(file.sha)){const res=await githubFetch(`https://api.github.com/repos/${REPOSITORY}/git/blobs/${file.sha}`,{method:'GET'});if(res.ok)file=await res.json()}if(!file?.content)throw Error('文件读取失败，请稍后重试');assets.push({key,name:asset.name,type:asset.type,data:file.content.replace(/\s/g,'')})}return {fields:doc.fields,assets}}
  return async request => {
    const path=new URL(request.url).pathname;
    const source=request.headers.get('Origin');
    const accepted=allowedOrigins.includes(source);
    const reply=(data,status=200)=>Response.json(data,{status,headers:{...headers,...(accepted?{'Access-Control-Allow-Origin':source}:{'Access-Control-Allow-Origin':origin})}});
    if(request.method==='OPTIONS')return new Response(null,{status:accepted?204:403,headers:{...headers,...(accepted?{'Access-Control-Allow-Origin':source}:{})}});
    if(path==='/api/status')return reply({ready:true,accounts:true,portfolios:true,myTemplates:true,privateDrafts:true,mode:'local-github',repository:REPOSITORY,dataRepository:DATA_REPOSITORY});
    if(!accepted)return reply({error:'请求来源不被允许'},403);
    try {
      if(path==='/api/start'||path==='/api/register'||path==='/api/login'){
        if(request.method!=='POST')return reply({error:'请求方法不正确'},405);
        const raw=await boundedBody(request,1024);if(raw.length>1024)return reply({error:'请求过大'},413);
        const body=JSON.parse(raw),phone=body.phone;
        if(body.clientVersion!==2)return reply({error:'页面版本已更新，请关闭旧页面，并打开最新版：https://lkbdesigner.github.io/yepian-template-editor-demo/?v=password2'},426);
        if(typeof phone!=='string'||!/^\d{11}$/.test(phone))return reply({error:'手机号码必须是 11 位数字'},400);
        const address=request.headers.get('CF-Connecting-IP')||'local';
        for(const key of ['ip:'+address,'phone:'+phone]){let bucket=attempts.get(key);if(!bucket||bucket.until<Date.now()){bucket={n:0,until:Date.now()+600000};attempts.set(key,bucket)}if(++bucket.n>30)return reply({error:'尝试次数过多，请 10 分钟后重试'},429)}
        const result=await exclusive(async()=>{const accounts=await readAccounts();let account=accounts[phone];
          if(path==='/api/start')return {lookup:true,existing:!!account};
          const password=body.password;
          if(path==='/api/register'){
            if(account)return {error:'该号码已注册，请输入密码登录',status:409};
            if(typeof password!=='string'||password.length<8||password.length>128)return {error:'密码需要 8–128 位字符',status:400};
            if(password!==body.confirmPassword)return {error:'两次输入的密码不一致',status:400};
            const created=!account;
            account=account||{siteId:hex(12),editKey:hex(32),createdAt:new Date().toISOString()};
            account.passwordSalt=hex(16);account.passwordHash=scryptSync(password,account.passwordSalt,32).toString('hex');
            accounts[phone]=account;await commit(accounts);
            for(const [token,session] of sessions)if(session.siteId===account.siteId)sessions.delete(token);
            return {account,created};
          }
          if(typeof password!=='string'||password.length>128)return {error:'手机号或密码不正确',status:401};
          const actual=scryptSync(password,account?.passwordSalt||'missing-account-salt',32);
          if(!account?.passwordHash||!timingSafeEqual(actual,Buffer.from(account.passwordHash,'hex')))return {error:'手机号或密码不正确',status:401};
          return {account};
        });
        if(result.lookup)return reply({existing:result.existing});
        if(result.error)return reply({error:result.error},result.status);
        const content=result.created||body.template==='chinese-portfolio'?{fields:{},assets:[]}:await load(result.account);
        const token=hex(32),expires=Date.now()+8*3600000;sessions.set(token,{...result.account,phone,expires});
        return reply({token,siteId:result.account.siteId,phone,expires,role:result.account.role==='admin'?'admin':'user',...content});
      }
      const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');const account=sessions.get(token);
      if(!account||account.expires<Date.now())return reply({error:'请重新输入手机号和密码进入编辑'},401);
      const role=account.role==='admin'?'admin':'user';
      if(path==='/api/session')return reply({authenticated:true,siteId:account.siteId,phone:account.phone,expires:account.expires,role});
      if(path.startsWith('/api/admin/')){
        if(role!=='admin')return reply({error:'只有管理员可以访问审核管理'},403);
        if(path==='/api/admin/session')return reply({authorized:true,role:'admin'});
        if(path==='/api/admin/review/load'||path==='/api/admin/review/file'){
          if(request.method!=='POST')return reply({error:'请求方法不正确'},405);
          const input=JSON.parse(await boundedBody(request,64*1024));
          if(path.endsWith('/file'))return reply(await downloadSubmittedAsset(input,githubFetch));
          const record=await readSubmittedReview(input,githubFetch);delete record.assets;return reply(record);
        }
        if(path==='/api/admin/reviews'){
          const tasks=await listSubmittedReviews(githubFetch),accounts=await readAccounts();
          const phones=new Map(Object.entries(accounts).map(([phone,data])=>[data.siteId,phone]));
          return reply({reviews:tasks.map(task=>({...task,ownerPhone:phones.get(task.ownerId)||null})),submissionEnabled:true});
        }
      }
      if(path==='/api/logout'){sessions.delete(token);return reply({ok:true})}
      if(path==='/api/portfolios'){
        const [drafts,legacy]=await Promise.all([listPrivateDrafts(account,githubFetch),listPortfolios(account,githubFetch)]);
        const records=new Map(legacy.map(item=>[item.draftId,{...item,legacy:true}]));
        for(const draft of drafts){const old=records.get(draft.draftId);records.set(draft.draftId,{...draft,...(old?.url?{legacyUrl:old.url}:{})});}
        return reply({templates:[...records.values()]});
      }
      if(path==='/api/portfolio/submit'||path==='/api/portfolio/withdraw'){
        if(request.method!=='POST')return reply({error:'请求方法不正确'},405);
        if(role==='admin')return reply({error:'管理员请从审核管理查看用户提交'},403);
        const input=JSON.parse(await boundedBody(request,4096));return reply(await(path.endsWith('/submit')?submitDraftReview:withdrawDraftReview)(input,account,githubFetch));
      }
      if(path==='/api/portfolio/load'||path==='/api/portfolio/asset'||path==='/api/portfolio/file'){
        if(request.method!=='POST')return reply({error:'请求方法不正确'},405);
        const input=JSON.parse(await boundedBody(request,path.endsWith('/asset')?72*1024*1024:64*1024));
        if(path.endsWith('/load'))return reply(await loadPrivateDraft(input,account,githubFetch));
        if(path.endsWith('/asset'))return reply({file:await uploadDraftAsset(input,account,githubFetch)});
        return reply(await downloadDraftAsset(input,account,githubFetch));
      }
      if(path==='/api/portfolio'){
        if(request.method!=='POST')return reply({error:'请求方法不正确'},405);
        const body=JSON.parse(await boundedBody(request,6*1024*1024));
        return reply(await savePrivateDraft(body,account,githubFetch));
      }
      if(path==='/api/save'){
        const body=JSON.parse(await boundedBody(request,12*1024*1024));if(body.siteId!==account.siteId)return reply({error:'不能修改其他用户的页面'},403);
        return reply({error:'旧版公开保存已停用，请使用新版私有模板编辑器'},410);

      }
      return reply({error:'接口不存在'},404);
    }catch(error){return reply({error:error.status?error.message:'服务暂时不可用，请稍后重试',...(error.issues?{issues:error.issues}:{})},error.status||502)}
  };
}
