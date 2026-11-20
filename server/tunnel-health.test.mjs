import test from'node:test';import assert from'node:assert/strict';import{extractTunnelURL,recordProbe}from'./tunnel-health.mjs';
test('cloudflared provisioning errors never become a published tunnel URL',()=>{
 const error='ERR Error requesting quick Tunnel: Post "https://api.trycloudflare.com/tunnel": timeout';assert.equal(extractTunnelURL(error),null);
 assert.equal(extractTunnelURL(error+'\n| https://real-healthy-demo-tunnel.trycloudflare.com |'),'https://real-healthy-demo-tunnel.trycloudflare.com');
 assert.equal(extractTunnelURL('https://api.trycloudflare.com/tun'),null);
});
test('isolated timeouts and a short laptop wake-up interruption keep the working URL',()=>{
 let state={failures:0,firstFailureAt:0};for(let i=0;i<6;i++)state=recordProbe(state,false,1000+i*15000);assert.equal(state.restart,false);state=recordProbe(state,true,95000);assert.equal(state.failures,0);assert.equal(state.firstFailureAt,0);state=recordProbe(state,false,120000);assert.equal(state.restart,false);
});
test('continuously unavailable tunnels restart after sustained failures, not on one late probe',()=>{
 let state={};for(let i=0;i<9;i++)state=recordProbe(state,false,1000+i*15000);assert.equal(state.restart,true);assert.equal(recordProbe({},false,3600000).restart,false);
});
