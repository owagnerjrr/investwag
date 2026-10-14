import express from 'express';
import { z } from 'zod';
import { SYMBOLS, fetchRates } from './market.js';
import { analyze } from './indicators.js';
import { STRATEGY_VERSION } from './strategy.js';
import { initialState, step, metrics, serialize, datasetHash } from './simulation.js';
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(d => !Number.isNaN(+new Date(d)) && new Date(d).toISOString().slice(0,10) === d);
const period = z.object({ from:date, to:date }).strict().refine(v => v.from <= v.to && +new Date(v.to) - +new Date(v.from) <= 366*86400000 && v.to <= new Date().toISOString().slice(0,10));
const strategySchema = z.object({ name:z.string().trim().min(1).max(80),fast:z.number().int().min(2).max(50),slow:z.number().int().min(3).max(200) }).strict().refine(v => v.fast < v.slow);
const riskSchema = z.object({ assetBps:z.number().int().min(1).max(10000),totalBps:z.number().int().min(1).max(10000),concentrationBps:z.number().int().min(1).max(10000),dailyLossBps:z.number().int().min(1).max(10000),maxOperations:z.number().int().min(1).max(50),minLiquidity:z.number().min(0).max(1e12),allowUnknownLiquidity:z.boolean() }).strict();
const startSchema = z.object({ kind:z.enum(['PAPER','BACKTEST']),assetId:z.string().max(100),strategyId:z.string().max(100),capital:z.string().regex(/^[1-9]\d{0,7}(?:\.\d{1,2})?$/),allocationBps:z.number().int().min(1).max(10000),feeBps:z.number().int().min(0).max(1000),slippageBps:z.number().int().min(0).max(1000),risk:riskSchema,from:date.optional(),to:date.optional() }).strict().refine(v => v.kind === 'PAPER' || (v.from && v.to && v.from <= v.to));
class QuantError extends Error { constructor(message,status=400) { super(message); this.status=status; } }
const fail = (message,status=400) => { throw new QuantError(message,status); };
const parse = (schema,body) => { const result=schema.safeParse(body); if (!result.success) fail('Parâmetros quantitativos inválidos'); return result.data; };
const keyFor = req => { const key=req.get('Idempotency-Key'); if (!key || !/^[a-zA-Z0-9_-]{8,100}$/.test(key)) fail('Idempotency-Key obrigatório'); return key; };
const norm = bars => bars.map(b => ({ date:new Date(b.date).toISOString().slice(0,10),priceMicros:String(b.priceMicros),source:b.source,sourceDate:b.sourceDate?new Date(b.sourceDate).toISOString().slice(0,10):new Date(b.date).toISOString().slice(0,10),provenance:b.provenance || [] }));
export function quantRouter(db, options={}) {
  const router=express.Router();
  router.use((_req,res,next) => (options.quantEnabled ?? process.env.QUANT_ENABLED === '1') ? next() : res.status(404).json({error:'Módulos quantitativos desabilitados'}));
  const route = fn => async (req,res,next) => { try { await fn(req,res); } catch(e) { if(e instanceof QuantError) res.status(e.status).json({error:e.message}); else next(e); } };
  const userLock = async (tx,userId) => { await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`; };
  const assetFor = async (tx,id,userId) => { const a=await tx.quantAsset.findFirst({where:{id,userId}}); if(!a) fail('Ativo não encontrado',404); return a; };
  router.get('/assets',route(async(req,res) => {
    const assets=await db.quantAsset.findMany({where:{userId:req.userId},orderBy:{createdAt:'asc'},include:{analyses:{orderBy:{createdAt:'desc'},take:1},_count:{select:{bars:true}}}});
    for(const asset of assets) for(const analysis of asset.analyses) {
      const r=analysis.result;
      if(r.asOf && Date.now()- +new Date(r.sourceDate || r.asOf)>5*86400000)
        analysis.result={...r,stale:true,score:null,classification:'DATA_UNAVAILABLE'};
    }
    res.json({supported:SYMBOLS,assets,source:'Frankfurter v2 blended',currency:'BRL',referenceRates:true});
  }));
  router.post('/assets',route(async(req,res) => {
    const {symbol}=parse(z.object({symbol:z.enum(SYMBOLS)}).strict(),req.body);
    const asset=await db.$transaction(async tx => {
      await userLock(tx,req.userId);
      const existing=await tx.quantAsset.findUnique({where:{userId_symbol:{userId:req.userId,symbol}}}); if(existing) return existing;
      if(await tx.quantAsset.count({where:{userId:req.userId}})>=10) fail('Limite de 10 ativos atingido',409);
      return tx.quantAsset.create({data:{userId:req.userId,symbol}});
    }); res.status(201).json(asset);
  }));
  router.get('/assets/:id/bars',route(async(req,res) => {
    await assetFor(db,req.params.id,req.userId);
    res.json(norm(await db.quantBar.findMany({where:{assetId:req.params.id},orderBy:{date:'asc'},take:1000})));
  }));
  router.post('/assets/:id/refresh',route(async(req,res) => {
    const range=parse(period,req.body), asset=await assetFor(db,req.params.id,req.userId);
    // Reserve fetch slot persistently before network I/O, preventing concurrent quota abuse.
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "QuantAsset" WHERE id=${asset.id} FOR UPDATE`;
      const latest=await assetFor(tx,asset.id,req.userId);
      if(latest.lastFetch && Date.now()- +latest.lastFetch < 15*60000) fail('Atualização limitada a uma chamada a cada 15 minutos por ativo',429);
      if(await tx.quantAnalysis.count({where:{assetId:asset.id}})>=50) fail('Limite de análises atingido',409);
      await tx.quantAsset.update({where:{id:asset.id},data:{lastFetch:new Date(),lastError:null}});
    });
    let rows;
    try { rows=await fetchRates(asset.symbol,range.from,range.to,options.marketFetcher); }
    catch { await db.quantAsset.update({where:{id:asset.id},data:{lastError:'Fonte indisponível ou resposta inválida'}});
      await db.quantAnalysis.create({data:{assetId:asset.id,result:{classification:'DATA_UNAVAILABLE',stale:true,reason:'Fonte indisponível ou resposta inválida',range}}});
      fail('Dados indisponíveis; nenhum preço foi inventado. Tente após 15 minutos.',503); }
    const result=await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "QuantAsset" WHERE id=${asset.id} FOR UPDATE`;
      const current=await tx.quantBar.findMany({where:{assetId:asset.id}});
      const existing=new Map(norm(current).map(b=>[b.date,b]));
      for(const row of rows) if(existing.has(row.date) && existing.get(row.date).priceMicros !== String(row.priceMicros)) fail('Fornecedor revisou dados existentes; histórico preservado, atualização recusada',409);
      const added=rows.filter(b=>!existing.has(b.date));
      if(current.length+added.length>1000) fail('Limite de 1000 observações por ativo atingido',409);
      await tx.quantBar.createMany({data:added.map(b=>({...b,date:new Date(b.date),sourceDate:new Date(b.sourceDate),assetId:asset.id}))});
      const bars=norm(await tx.quantBar.findMany({where:{assetId:asset.id},orderBy:{date:'asc'}}));
      const analysis={...analyze(bars),datasetHash:datasetHash(bars),range};
      await tx.quantAnalysis.create({data:{assetId:asset.id,result:analysis}});
      return analysis;
    }); res.json(result);
  }));
  router.get('/strategies',route(async(req,res) => res.json(await db.quantStrategy.findMany({where:{userId:req.userId},orderBy:{createdAt:'asc'}}))));
  router.post('/strategies',route(async(req,res) => {
    const {name,...config}=parse(strategySchema,req.body),key=keyFor(req);
    const result=await db.$transaction(async tx=>{await userLock(tx,req.userId);
      const existing=await tx.quantStrategy.findUnique({where:{userId_idempotencyKey:{userId:req.userId,idempotencyKey:key}}});
      if(existing) { if(existing.name!==name || datasetHash(existing.config)!==datasetHash(config)) fail('Chave reutilizada com outros parâmetros',409);return existing; }
      if(await tx.quantStrategy.count({where:{userId:req.userId}})>=10) fail('Limite de 10 estratégias atingido',409);
      return tx.quantStrategy.create({data:{userId:req.userId,name,config,version:STRATEGY_VERSION,idempotencyKey:key}});
    });res.status(201).json(result);
  }));
  router.get('/runs',route(async(req,res) => {
    const runs=await db.quantRun.findMany({where:{userId:req.userId},orderBy:{createdAt:'desc'},take:30});
    res.json(runs.map(r=>({...r,config:{...r.config,dataset:undefined},metrics:metrics(r.state,r.kind==='BACKTEST'?r.config.dataset:[])})));
  }));
  router.get('/runs/:id/events',route(async(req,res) => {
    if(!await db.quantRun.findFirst({where:{id:req.params.id,userId:req.userId}})) fail('Sessão não encontrada',404);
    res.json(await db.quantEvent.findMany({where:{runId:req.params.id},orderBy:{createdAt:'desc'},take:100}));
  }));
  router.post('/runs',route(async(req,res)=>{
    const body=parse(startSchema,req.body), key=keyFor(req), requestHash=datasetHash(body);
    const result=await db.$transaction(async tx=>{
      await userLock(tx,req.userId);
      const existing=await tx.quantRun.findUnique({where:{userId_idempotencyKey:{userId:req.userId,idempotencyKey:key}}});
      if(existing) {if(existing.config.requestHash!==requestHash) fail('Chave reutilizada com outros parâmetros',409); return existing;}
      if(await tx.quantRun.count({where:{userId:req.userId,kind:body.kind}})>=(body.kind==='PAPER'?10:20)) fail('Limite de simulações atingido',409);
      await assetFor(tx,body.assetId,req.userId);
      const strategy=await tx.quantStrategy.findFirst({where:{id:body.strategyId,userId:req.userId}});if(!strategy) fail('Estratégia não encontrada',404);
      const bars=norm(await tx.quantBar.findMany({where:{assetId:body.assetId},orderBy:{date:'asc'},take:1000}));
      const selected=body.kind==='BACKTEST'?bars.filter(b=>b.date>=body.from&&b.date<=body.to):bars;
      if(selected.length < strategy.config.slow+2) fail('Histórico insuficiente; atualize o ativo e amplie o período',409);
      if(body.kind==='PAPER' && analyze(bars).stale) fail('Dados desatualizados; sessão não iniciada',409);
      const [whole,fraction='']=body.capital.split('.'), capital=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
      const state=initialState(capital,body.kind==='PAPER'?bars.at(-1).date:null);
      const config=serialize({...body,strategy:strategy.config,strategyVersion:strategy.version,requestHash,dataset:body.kind==='BACKTEST'?selected:undefined});
      return tx.quantRun.create({data:{userId:req.userId,kind:body.kind,status:'RUNNING',assetId:body.assetId,strategyId:strategy.id,config,state,datasetHash:datasetHash(selected),idempotencyKey:key}});
    });res.status(201).json({...result,config:{...result.config,dataset:undefined}});
  }));
  router.post('/runs/:id/step',route(async(req,res)=>{
    const body=parse(z.object({limit:z.number().int().min(1).max(50)}).strict(),req.body),key=keyFor(req);
    const result=await db.$transaction(async tx=>{
      // Same lock as the original global pause endpoint: serialize pause with processing.
      const portfolios=await tx.$queryRaw`SELECT paused FROM "Portfolio" WHERE "userId"=${req.userId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "QuantRun" WHERE id=${req.params.id} AND "userId"=${req.userId} FOR UPDATE`;
      const run=await tx.quantRun.findFirst({where:{id:req.params.id,userId:req.userId}});if(!run) fail('Sessão não encontrada',404);
      const prior=await tx.quantEvent.findUnique({where:{runId_key:{runId:run.id,key}}});
      if(prior) { if(prior.result.requestHash!==datasetHash(body)) fail('Chave reutilizada com outros parâmetros',409); return prior.result; }
      if(run.status!=='RUNNING') fail('Sessão pausada, encerrada ou interrompida',409);
      if(await tx.quantEvent.count({where:{runId:run.id}})+body.limit+1>1000) fail('Limite de 1000 registros atingido; encerre a sessão',409);
      const bars=run.kind==='BACKTEST'?run.config.dataset:norm(await tx.quantBar.findMany({where:{assetId:run.assetId},orderBy:{date:'asc'},take:1000}));
      const paused=run.kind==='PAPER'&&portfolios[0]?.paused;
      const stale=run.kind==='PAPER'&&analyze(bars).stale;
      if(paused || stale) {
        const blocked={type:'BLOCK',requestHash:datasetHash(body),processed:0,reasons:[paused?'GLOBAL_PAUSED':'STALE_DATA'],checkpoint:run.state.checkpoint};
        await tx.quantEvent.create({data:{runId:run.id,key,result:blocked}});return blocked;
      }
      let state=run.state,processed=0;const events=[];
      for(let i=0;i<bars.length&&processed<body.limit;i++) {
        if(state.checkpoint&&bars[i].date<=state.checkpoint) continue;
        const result=step(state,bars.slice(0,i),bars[i],run.config,{stale}); state=result.state;
        events.push({runId:run.id,key:'bar_'+bars[i].date,result:result.event});processed++;
      }
      if(run.kind==='BACKTEST'&&state.checkpoint===bars.at(-1)?.date) state.status='COMPLETED';
      await tx.quantEvent.createMany({data:events});
      await tx.quantRun.update({where:{id:run.id},data:{state:serialize(state),status:state.status,datasetHash:datasetHash(bars)}});
      const batch={type:'BATCH',requestHash:datasetHash(body),processed,checkpoint:state.checkpoint,status:state.status};
      await tx.quantEvent.create({data:{runId:run.id,key,result:batch}});return batch;
    },{maxWait:10000,timeout:15000});res.json(result);
  }));
  router.post('/runs/:id/control',route(async(req,res)=>{
    const {action}=parse(z.object({action:z.enum(['PAUSE','RESUME','EMERGENCY','CLOSE'])}).strict(),req.body),key=keyFor(req);
    const result=await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "QuantRun" WHERE id=${req.params.id} AND "userId"=${req.userId} FOR UPDATE`;
      const run=await tx.quantRun.findFirst({where:{id:req.params.id,userId:req.userId}});if(!run) fail('Sessão não encontrada',404);
      const prior=await tx.quantEvent.findUnique({where:{runId_key:{runId:run.id,key}}});
      if(prior){if(prior.result.action!==action) fail('Chave reutilizada',409);return prior.result;}
      if(action!=='CLOSE' && await tx.quantEvent.count({where:{runId:run.id}})>=1000) fail('Limite de auditoria atingido; encerre a sessão',409);
      if(['CLOSED','COMPLETED'].includes(run.status)) fail('Sessão encerrada',409);
      if(run.status==='EMERGENCY'&&action==='RESUME') fail('Emergência não pode ser reativada; encerre e crie outra sessão',409);
      const status={PAUSE:'PAUSED',RESUME:'RUNNING',EMERGENCY:'EMERGENCY',CLOSE:'CLOSED'}[action];
      if(run.status==='EMERGENCY'&&action==='PAUSE') fail('Emergência permanece ativa',409);
      // Controls do not liquidate fictitious positions or touch the existing wallet.
      await tx.quantRun.update({where:{id:run.id},data:{status,state:{...run.state,status}}});
      const event={type:'CONTROL',action,status};await tx.quantEvent.create({data:{runId:run.id,key,result:event}});return event;
    });res.json(result);
  }));
  return router;
}
