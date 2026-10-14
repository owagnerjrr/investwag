import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../app.js';
if(!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('_test')) throw Error('Dedicated _test database required');
const db=new PrismaClient(), prefix='quant-'+crypto.randomUUID();
const risk={assetBps:3000,totalBps:5000,concentrationBps:3000,dailyLossBps:1000,maxOperations:2,minLiquidity:0,allowUnknownLiquidity:true};
test('Quant PostgreSQL: isolamento, checkpoints, concorrência e compatibilidade',async t=>{
  let server,base;const users=[],tokens=[];
  let sourceCalls=0;
  const marketFetcher=async()=>{sourceCalls++;return new Response(JSON.stringify(Array.from({length:30},(_,i)=>({base:'USD',quote:'BRL',date:`2025-01-${String(i+1).padStart(2,'0')}`,rate:4+(i%6),providers:['TEST FIXTURE']}))));};
  const start=async()=>{server=createApp(db,{quantEnabled:true,authLimit:1000,marketFetcher}).listen(0,'127.0.0.1');await once(server,'listening');base='http://127.0.0.1:'+server.address().port;};
  const call=async(path,body,who=0,key=crypto.randomUUID())=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tokens[who],'Idempotency-Key':key},...(body!==undefined&&{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};};
  let asset,strategy,backtest,paper,request;
  try {
    for(let i=0;i<2;i++) { const u=await db.user.create({data:{email:`${prefix}-${i}@example.test`,passwordHash:'test-only',portfolio:{create:{cashCents:1000n,contributedCents:1000n,movements:{create:{type:'DEPOSIT',amountCents:1000n,idempotencyKey:'test-credit'}}}}}});users.push(u.id);
      const token=crypto.randomBytes(32).toString('hex');tokens.push(token);await db.session.create({data:{userId:u.id,tokenHash:crypto.createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+3600000)}}); }
    await start();
    await t.test('cadastro de ativo e fonte com cache persistente concorrente',async()=>{
      asset=(await call('/quant/assets',{symbol:'USD-BRL'})).data;
      assert.equal((await call('/quant/assets',{symbol:'AAPL'})).status,400);
      const responses=await Promise.all([call(`/quant/assets/${asset.id}/refresh`,{from:'2025-01-01',to:'2025-01-31'}),call(`/quant/assets/${asset.id}/refresh`,{from:'2025-01-01',to:'2025-01-31'})]);
      assert.deepEqual(responses.map(r=>r.status).sort(),[200,429]);assert.equal(sourceCalls,1);
      assert.equal((await call(`/quant/assets/${asset.id}/bars`,undefined,1)).status,404);
      const scanner=(await call('/quant/assets')).data.assets[0].analyses[0].result;
      assert.equal(scanner.stale,true);assert.equal(scanner.volume,null);assert.equal(scanner.liquidity,null);
    });
    await t.test('estratégia e backtest causais, chave inicia uma única sessão',async()=>{
      strategy=(await call('/quant/strategies',{name:'Teste SMA',fast:2,slow:3})).data;
      request={kind:'BACKTEST',assetId:asset.id,strategyId:strategy.id,capital:'100',allocationBps:2000,feeBps:10,slippageBps:10,risk,from:'2025-01-01',to:'2025-01-31'};
      const key=crypto.randomUUID();const responses=await Promise.all([call('/quant/runs',request,0,key),call('/quant/runs',request,0,key)]);
      assert.equal(responses[0].data.id,responses[1].data.id);backtest=responses[0].data;
      assert.equal((await call('/quant/runs',{...request,capital:'101'},0,key)).status,409);
      assert.equal((await call('/quant/runs',request,1)).status,404);
    });
    await t.test('lotes concorrentes e retry não duplicam; reinício retoma checkpoint',async()=>{
      const key=crypto.randomUUID();const responses=await Promise.all([call(`/quant/runs/${backtest.id}/step`,{limit:10},0,key),call(`/quant/runs/${backtest.id}/step`,{limit:10},0,key)]);
      assert.deepEqual(responses[0],responses[1]);assert.equal(responses[0].data.processed,10);
      assert.equal((await call(`/quant/runs/${backtest.id}/step`,{limit:11},0,key)).status,409);
      await new Promise(resolve=>server.close(resolve));await start();
      const resumed=await call(`/quant/runs/${backtest.id}/step`,{limit:50});assert.equal(resumed.data.processed,20);assert.equal(resumed.data.status,'COMPLETED');
      assert.equal(await db.quantEvent.count({where:{runId:backtest.id,key:{startsWith:'bar_'}}}),30);
      assert.equal((await call(`/quant/runs/${backtest.id}/events`,undefined,1)).status,404);
      assert.equal((await call('/quant/runs',undefined,1)).data.length,0);
      const another=(await call('/quant/runs',request)).data;
      const parallel=await Promise.all([call(`/quant/runs/${another.id}/step`,{limit:15}),call(`/quant/runs/${another.id}/step`,{limit:15})]);
      assert.equal(parallel.reduce((sum,r)=>sum+r.data.processed,0),30);
      assert.equal(await db.quantEvent.count({where:{runId:another.id,key:{startsWith:'bar_'}}}),30);
      const final=await db.quantRun.findUniqueOrThrow({where:{id:another.id}});
      assert.equal(BigInt(final.state.equityCents)-BigInt(final.state.initialCents),BigInt(final.state.realizedCents)+BigInt(final.state.unrealizedCents));
      assert.ok(BigInt(final.state.cashCents)>=0n);
    });
    await t.test('paper separado, pausa global, emergência, controles e consultas',async()=>{
      const bars=await db.quantBar.findMany({where:{assetId:asset.id},orderBy:{date:'asc'}});
      const now=Date.now();for(let i=0;i<bars.length;i++) await db.quantBar.update({where:{id:bars[i].id},data:{date:new Date(now-(bars.length-i)*86400000),sourceDate:new Date(now-(bars.length-i)*86400000)}});
      paper=(await call('/quant/runs',{...request,kind:'PAPER',from:undefined,to:undefined})).data;assert.ok(paper.id);
      await db.quantBar.create({data:{assetId:asset.id,date:new Date(new Date().toISOString().slice(0,10)),priceMicros:6000000n,source:'TEST FIXTURE'}});
      assert.deepEqual((await call(`/quant/runs/${paper.id}/step`,{limit:50})).data.reasons,['GLOBAL_PAUSED']);
      assert.equal((await call('/portfolio/pause',{paused:false})).status,200);
      assert.equal((await call(`/quant/runs/${paper.id}/step`,{limit:50})).data.processed,1);
      assert.equal((await call(`/quant/runs/${paper.id}/control`,{action:'PAUSE'})).data.status,'PAUSED');
      assert.equal((await call(`/quant/runs/${paper.id}/step`,{limit:1})).status,409);
      assert.equal((await call(`/quant/runs/${paper.id}/control`,{action:'RESUME'})).status,200);
      assert.equal((await call(`/quant/runs/${paper.id}/control`,{action:'EMERGENCY'})).data.status,'EMERGENCY');
      assert.equal((await call(`/quant/runs/${paper.id}/control`,{action:'RESUME'})).status,409);
      assert.equal((await call(`/quant/runs/${paper.id}/control`,{action:'PAUSE'})).status,409);
      assert.equal((await call(`/quant/runs/${paper.id}/control`,{action:'CLOSE'})).data.status,'CLOSED');
      const wallet=(await call('/portfolio')).data;assert.equal(wallet.cashCents,'1000');assert.equal(wallet.movements.length,1);
      const sessions=await call('/quant/runs');assert.equal(sessions.data.length,3);assert.ok(sessions.data.every(r=>r.config.dataset===undefined));
    });
    await t.test('feature flag fechado por padrão preserva versão publicada',async()=>{
      const disabled=createApp(db).listen(0,'127.0.0.1');await once(disabled,'listening');
      try {const response=await fetch(`http://127.0.0.1:${disabled.address().port}/quant/assets`,{headers:{Authorization:'Bearer '+tokens[0]}});assert.equal(response.status,404);}
      finally {await new Promise(r=>disabled.close(r));}
    });
  } finally {if(server) await new Promise(r=>server.close(r));await db.user.deleteMany({where:{id:{in:users}}});await db.$disconnect();}
});
