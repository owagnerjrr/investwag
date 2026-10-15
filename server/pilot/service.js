import crypto from 'node:crypto';
import { emptyState, advance, movement, policyFromEnv, summary, reconcile, VERSION } from './engine.js';
import { refreshMarkets } from './sources.js';

export class PilotError extends Error{constructor(message,status=409){super(message);this.status=status;}}
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const nextDaily=now=>{const n=new Date(now);n.setUTCDate(n.getUTCDate()+1);n.setUTCHours(17,23,0,0);return n;};
const locked=async(tx,userId)=>{await tx.$queryRaw`SELECT id FROM "PilotAccount" WHERE "userId"=${userId} FOR UPDATE`;return tx.pilotAccount.findUnique({where:{userId}});};
const view=(a,events=[],now=new Date())=>{
  if(!a)return null;
  let state,integrityValid=true;try{state=summary(a.state,now);}catch{state={alerts:['INTEGRITY_FAILURE']};integrityValid=false;}
  return {id:a.id,status:a.status,state,integrityValid,policy:a.policy,authorizedAt:a.authorizedAt,lastRun:a.lastRun,nextRun:a.nextRun,failures:a.failures,scheduleOverdue:!!(a.nextRun&&+now-+a.nextRun>6*3600000),events};
};
export async function getPilot(db,userId,now=new Date()){
  const a=await db.pilotAccount.findUnique({where:{userId},include:{events:{orderBy:{createdAt:'desc'},take:30}}});
  const result=view(a,a?.events,now);
  if(result)result.schedule=await db.pilotClock.findUnique({where:{id:'daily'},select:{lastTick:true,lastSuccess:true,lastError:true}});
  return result;
}
export async function mutatePilot(db,userId,key,body,options={}){
  const now=options.now||new Date(),fingerprint=hash(body);
  // Create only on explicit activation. Reading the screen cannot consent or start jobs.
  if(body.action==='ACTIVATE')await db.pilotAccount.createMany({data:[{userId,state:emptyState(),policy:policyFromEnv((options.env||process.env).PILOT_POLICY_JSON)}],skipDuplicates:true});
  return db.$transaction(async tx=>{
    const a=await locked(tx,userId);if(!a)throw new PilotError('Ative o piloto fictício primeiro',404);
    const cached=await tx.pilotEvent.findUnique({where:{accountId_key:{accountId:a.id,key}}});
    if(cached){if(cached.fingerprint!==fingerprint)throw new PilotError('Chave reutilizada com outro conteúdo');return cached.result;}
    const count=await tx.pilotEvent.count({where:{accountId:a.id}});
    if(count>=495&&!['PAUSE','EMERGENCY','WITHDRAW'].includes(body.action))throw new PilotError('Limite de histórico: novos ciclos/aportes bloqueados');
    const data={},state=structuredClone(a.state);
    if(['DEPOSIT','WITHDRAW'].includes(body.action)){
      if(count>=495&&body.action==='WITHDRAW'&&BigInt(body.amountCents)!==BigInt(state.cashCents))throw new PilotError('No limite de histórico, retire todo o disponível em uma operação');
      try{data.state=movement(state,body.action,body.amountCents);}catch(e){throw new PilotError(e.message,400);}
    }else if(body.action==='ACTIVATE'){
      if(a.authorizedAt)throw new PilotError('Autorização já registrada; use retomar');
      if(body.consent!==true)throw new PilotError('Autorização única obrigatória',400);
      data.authorizedAt=now;data.status='ACTIVE';state.startedOn=now.toISOString().slice(0,10);data.state=state;data.nextRun=now;
      await tx.portfolio.update({where:{userId},data:{paused:false}});
    }else if(body.action==='PAUSE')data.status=a.status==='EMERGENCY'?'EMERGENCY':'PAUSED';
    else if(body.action==='EMERGENCY')data.status='EMERGENCY';
    else if(body.action==='RESUME'){
      if(a.status!=='PAUSED'||a.failures>=3)throw new PilotError('Proteção ou emergência não admite retomada automática');
      data.status='ACTIVE';data.nextRun=now;
      await tx.portfolio.update({where:{userId},data:{paused:false}});
    }else throw new PilotError('Ação inválida',400);
    if(['PAUSE','EMERGENCY'].includes(body.action)&&data.status===a.status)return {id:a.id,status:a.status,unchanged:true};
    const updated=await tx.pilotAccount.update({where:{id:a.id},data});
    const result={id:a.id,status:updated.status,action:body.action,cashCents:updated.state.cashCents};
    await tx.pilotEvent.create({data:{accountId:a.id,key,kind:body.action,fingerprint,result}});return result;
  },{maxWait:10000,timeout:10000});
}
export async function runAccount(db,userId,cycle,assets,options={}){
  const now=options.now||new Date(),key='cycle:'+cycle;
  return db.$transaction(async tx=>{
    if(options.leaseToken){
      await tx.$queryRaw`SELECT id FROM "PilotClock" WHERE id='daily' FOR UPDATE`;
      const clock=await tx.pilotClock.findUnique({where:{id:'daily'}});
      if(clock?.leaseToken!==options.leaseToken)throw new PilotError('Execução substituída por outra lease');
    }
    const a=await locked(tx,userId);if(!a)return {status:'MISSING'};
    const existing=await tx.pilotEvent.findUnique({where:{accountId_key:{accountId:a.id,key}}});if(existing)return existing.result;
    if(a.status!=='ACTIVE'||!a.authorizedAt)return {status:a.status,skipped:true};
    if(a.nextRun&&+a.nextRun>+now)return {status:'NOT_DUE',skipped:true};
    if(await tx.pilotEvent.count({where:{accountId:a.id}})>=490){await tx.pilotAccount.update({where:{id:a.id},data:{status:'PROTECTED',state:{...a.state,alerts:['STORAGE_LIMIT']}}});return {status:'PROTECTED',reason:'STORAGE_LIMIT'};}
    // Lock the legacy wallet as well: a simultaneous global pause serializes before/after the batch.
    await tx.$queryRaw`SELECT id FROM "Portfolio" WHERE "userId"=${userId} FOR UPDATE`;
    const wallet=await tx.portfolio.findUnique({where:{userId}});
    const allFailed=assets.length===0||assets.every(s=>s.error||s.bars.length===0);
    const failures=allFailed?a.failures+1:0;
    let state,result,status='ACTIVE',policy=a.policy;
    try{
      policy=policyFromEnv((options.env||process.env).PILOT_POLICY_JSON);
      const output=advance(a.state,assets,policy,{now,paused:wallet?.paused!==false,failures,limit:10});state=output.state;
      if(output.protect||failures>=3)status='PROTECTED';
      if(wallet?.paused!==false)state.alerts=[...new Set([...state.alerts,'GLOBAL_PAUSED'])];
      result={status,version:VERSION,policy,cycle,processedDates:output.processedDates,decisions:output.events,orders:output.events.filter(e=>e.order).length,checkpoint:{...state.checkpoints}};
    }catch{
      // No partially mutated in-memory state is saved. Data corruption is never 'reconciled' by inventing cash.
      state={...a.state,alerts:['ENGINE_OR_INTEGRITY_FAILURE']};status='PROTECTED';result={status,cycle,reason:'ENGINE_OR_INTEGRITY_FAILURE',orders:0};
    }
    await tx.pilotAccount.update({where:{id:a.id},data:{state,status,policy,failures,lastRun:now,nextRun:nextDaily(now)}});
    await tx.pilotEvent.create({data:{accountId:a.id,key,kind:'CYCLE',fingerprint:hash({cycle}),result}});return result;
  },{maxWait:15000,timeout:15000});
}
export async function tick(db,options={}){
  const now=options.now||new Date();
  await db.pilotClock.createMany({data:[{id:'daily'}],skipDuplicates:true});
  const leaseToken=crypto.randomUUID();
  const claimed=await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "PilotClock" WHERE id='daily' FOR UPDATE`;
    const clock=await tx.pilotClock.findUnique({where:{id:'daily'}});
    if(clock.leaseUntil&&+clock.leaseUntil>+now)return false;
    await tx.pilotClock.update({where:{id:'daily'},data:{leaseToken,leaseUntil:new Date(+now+300000),lastTick:now}});return true;
  });
  if(!claimed)return {accounts:0,orders:0,busy:true};
  try{
  const due=await db.pilotAccount.findMany({where:{status:'ACTIVE',authorizedAt:{not:null},OR:[{nextRun:null},{nextRun:{lte:now}}]},orderBy:[{nextRun:'asc'},{id:'asc'}],take:5,select:{userId:true}});
  if(!due.length)return {accounts:0,orders:0,pending:false};
  const assets=await refreshMarkets(db,options),cycle=now.toISOString().slice(0,10),results=[];
  for(const a of due)results.push(await runAccount(db,a.userId,cycle,assets,{...options,leaseToken}));
  const pending=await db.pilotAccount.count({where:{status:'ACTIVE',nextRun:{lte:now}}});
  // Internal scheduler receives aggregate results only, never user IDs/emails/balances.
  await db.pilotClock.updateMany({where:{id:'daily',leaseToken},data:{lastSuccess:now,lastError:null}});
  return {accounts:due.length,orders:results.reduce((n,r)=>n+(r.orders||0),0),protected:results.filter(r=>r.status==='PROTECTED').length,pending:pending>0};
  }catch(e){await db.pilotClock.updateMany({where:{id:'daily',leaseToken},data:{lastError:'SCHEDULE_FAILED'}});throw e;}
  finally{await db.pilotClock.updateMany({where:{id:'daily',leaseToken},data:{leaseUntil:null,leaseToken:null}});}
}
