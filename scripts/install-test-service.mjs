// Installs an opt-in, per-user service. Requires macOS launchctl and existing gh login.
import{cp,copyFile,mkdir,readdir,readFile,writeFile,access,chmod}from'node:fs/promises';
import{execFileSync}from'node:child_process';import{homedir}from'node:os';import{fileURLToPath}from'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),destination=homedir()+'/Library/Application Support/YepianTestService',label='io.yepian.test-service',domain='gui/'+process.getuid();
const xml=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
try{execFileSync('/bin/launchctl',['bootout',domain+'/'+label],{stdio:'ignore'});}catch{}
await mkdir(destination+'/server',{recursive:true,mode:0o700});await chmod(destination,0o700);
for(const name of await readdir(root+'server'))if(/\.(mjs|json)$/.test(name)&&!name.endsWith('.test.mjs'))await copyFile(root+'server/'+name,destination+'/server/'+name);
for(const path of ['site-renderer.mjs','site-config.json','portfolio-test/shared/review-validation.js','portfolio-test/3_中文_空模板/save-config.json']){await mkdir(destination+'/'+path.split('/').slice(0,-1).join('/'),{recursive:true});await copyFile(root+path,destination+'/'+path);}
await mkdir(destination+'/.private/bin',{recursive:true,mode:0o700});await mkdir(destination+'/.private/runtime',{recursive:true,mode:0o700});await cp(root+'.private/bin/cloudflared',destination+'/.private/bin/cloudflared');
const accounts=destination+'/.private/accounts.json';try{await access(accounts);}catch{await copyFile(root+'.private/accounts.json',accounts);await chmod(accounts,0o600);}
// Future manual starts from the source checkout use the same account store.
await writeFile(root+'.private/runtime-install.json',JSON.stringify({accountDirectory:destination+'/.private/',installation:destination}),{mode:0o600});
const environment={PATH:process.execPath.split('/').slice(0,-1).join('/')+':/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',HOME:homedir()};
const plist='<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>'+`<key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(destination+'/server/test-service-supervisor.mjs')}</string></array><key>WorkingDirectory</key><string>${xml(destination)}</string><key>EnvironmentVariables</key><dict>${Object.entries(environment).map(([k,v])=>'<key>'+k+'</key><string>'+xml(v)+'</string>').join('')}</dict><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>15</integer><key>StandardOutPath</key><string>${xml(destination+'/.private/runtime/supervisor.log')}</string><key>StandardErrorPath</key><string>${xml(destination+'/.private/runtime/supervisor-error.log')}</string></dict></plist>`;
const agent=homedir()+'/Library/LaunchAgents/'+label+'.plist';await mkdir(homedir()+'/Library/LaunchAgents',{recursive:true});await writeFile(agent,plist,{mode:0o600});execFileSync('/bin/launchctl',['bootstrap',domain,agent]);console.log('Installed and started independent test service. Accounts preserved.');
