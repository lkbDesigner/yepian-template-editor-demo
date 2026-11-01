import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
import {startWorker} from './service.mjs';
test('empty queue backs off, new save wakes it, stopping prevents further database reads',async()=>{
 let claims=0;
 const rpc=async action=>{if(action==='claim')claims++;return null};
 const stop=startWorker({rpc,env:{GITHUB_TOKEN:'test'},idleInterval:10000,maxIdleInterval:10000});
 try{
  await sleep(25);assert.equal(claims,1);
  await sleep(40);assert.equal(claims,1);
  stop.wake();await sleep(25);assert.equal(claims,2);
  stop();stop.wake();await sleep(25);assert.equal(claims,2);
 }finally{stop()}
});
