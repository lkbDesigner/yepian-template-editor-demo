// Cloudflared also prints its provisioning API URL on failures; it is not a tunnel.
export function extractTunnelURL(output){
 const matches=String(output).matchAll(/https:\/\/([-a-z0-9]+)\.trycloudflare\.com\b/g);
 for(const match of matches)if(match[1].includes('-')&&!['api','www','update'].includes(match[1]))return match[0];
 return null;
}
export function recordProbe(previous,ok,now=Date.now(),recoveringFromSleep=false){
 if(ok)return {failures:0,firstFailureAt:0,restart:false};
 const failures=(previous.failures||0)+1,firstFailureAt=previous.firstFailureAt||now;
 // Brief laptop/network interruptions should not discard a working address.
 return {failures,firstFailureAt,restart:recoveringFromSleep?failures>=2:failures>=5&&now-firstFailureAt>=120000};
}

export function resumedAfterPause(previous,now=Date.now()){return now-previous>60000;}
