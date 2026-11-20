// Retire drafts from the explicitly requested test-data reset. Accounts are untouched.
try{indexedDB.deleteDatabase('portfolio-chinese-template-20261117');for(const key of Object.keys(localStorage))if(key.startsWith('portfolio-chinese-template-current:'))localStorage.removeItem(key);}catch{}
window.PortfolioDrafts={
 async open(){return new Promise((resolve,reject)=>{const r=indexedDB.open('portfolio-chinese-template-20261120-clean',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});},
 async put(state){const db=await this.open();try{await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(state);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}},
 async list(owner){const db=await this.open();try{return await new Promise((resolve,reject)=>{const result=[],r=db.transaction('drafts').objectStore('drafts').openCursor();r.onsuccess=()=>{const c=r.result;if(!c){resolve(result);return;}const d=c.value;if(d.owner===owner)result.push({draftId:d.id,title:d.title||'中文作品集模板',updatedAt:d.updated,local:true,github:d.github,remote:d.remote});c.continue();};r.onerror=()=>reject(r.error);});}finally{db.close();}},
 async get(id,owner){if(!id)return null;const db=await this.open();try{return await new Promise((resolve,reject)=>{const r=db.transaction('drafts').objectStore('drafts').get(id);r.onsuccess=()=>resolve(r.result?.owner===owner?r.result:null);r.onerror=()=>reject(r.error);});}finally{db.close();}},
 async resolve(id,owner){
  const local=await this.get(id,owner);let remote;
  try{remote=await PortfolioGitHub.read(id);}catch(error){if(local)return {state:local,notice:error.status===404?'':'暂时无法读取已保存版本，正在使用本机草稿；保存时会检查版本。'};if(error.status===404)return {state:null};throw error;}
  if(local?.remote?.revision===remote.revision)return {state:local};
  let notice='';
  if(local&&(!local.remote||local.updated>local.remote.savedUpdated)){
   const backup=structuredClone(local);backup.id=crypto.randomUUID();backup.title=(backup.title||'中文作品集模板')+' · 本机备份';backup.localBackup=true;backup.updated=Date.now();delete backup.remote;delete backup.github;const strip=v=>{if(!v||typeof v!=='object')return;if(v.data&&v.storage)delete v.storage;for(const child of Object.values(v))strip(child);};strip(backup);await this.put(backup);notice='已载入最新保存版本；本机未同步修改已另存为备份。';
  }
  const state=await PortfolioGitHub.hydrate(remote,local);await this.put(state);return {state,notice};
 }
};
