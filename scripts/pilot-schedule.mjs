import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export async function dispatch({base,secret,fetcher=fetch,now=()=>Date.now(),wait=ms=>new Promise(r=>setTimeout(r,ms))}){
  const url=new URL(base);
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Exact HTTPS API origin required');
  if(!secret||secret.length<32)throw Error('Private scheduler secret of at least 32 characters required');
  // Wake only for this daily useful task, bounded to 150s. No periodic ping, no keep-alive.
  let healthy=false;
  for(let i=0;i<8;i++){
    try{const r=await fetcher(new URL('/health',url),{signal:AbortSignal.timeout(12000),redirect:'error'});if(r.ok&&(await r.json()).mode==='simulation'){healthy=true;break;}}catch{}
    if(i<7)await wait(6000);
  }
  if(!healthy)throw Error('API did not wake within bounded job budget');
  // Retries get a new short-lived signature; persistent per-account daily cycle key deduplicates commits.
  for(let i=0;i<2;i++){
    const timestamp=String(now()),signature=crypto.createHmac('sha256',secret).update('POST\n/internal/pilot/tick\n'+timestamp).digest('hex');
    try{
      const r=await fetcher(new URL('/internal/pilot/tick',url),{method:'POST',headers:{'Content-Type':'application/json','X-Pilot-Timestamp':timestamp,'X-Pilot-Signature':signature},body:'{}',signal:AbortSignal.timeout(150000),redirect:'error'});
      if(!r.ok){if(r.status>=400&&r.status<500)throw Object.assign(Error('Scheduler authorization/configuration rejected'),{permanent:true});throw Error('Job failed');}
      return await r.json();
    }catch(e){if(e.permanent||i===1)throw e;await wait(3000);}
  }
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  try{const r=await dispatch({base:process.env.PILOT_API_URL,secret:process.env.PILOT_SCHEDULE_SECRET});console.log(JSON.stringify(r));if(r.pending)console.log('::warning::More accounts remain due; review capacity without increasing polling.');}
  catch{console.error('Scheduled paper job failed; inspect authenticated dashboard/provider logs. No secrets printed.');process.exitCode=1;}
}
