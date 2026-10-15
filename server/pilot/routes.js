import express from 'express';
import crypto from 'node:crypto';
import {z} from 'zod';
import {getPilot,mutatePilot,PilotError,tick} from './service.js';
const enabled=o=>o.pilotEnabled??process.env.PILOT_ENABLED==='1';
const wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){if(e instanceof PilotError)res.status(e.status).json({error:e.message});else next(e);}};
export function pilotRouter(db,options={}){
  const r=express.Router();r.use((_q,s,n)=>enabled(options)?n():s.status(404).json({error:'Piloto desabilitado'}));
  r.get('/',wrap(async(q,s)=>s.json(await getPilot(db,q.userId,options.now))));
  r.post('/',wrap(async(q,s)=>{
    const body=z.discriminatedUnion('action',[
      z.object({action:z.literal('ACTIVATE'),consent:z.literal(true)}).strict(),
      ...['PAUSE','RESUME','EMERGENCY'].map(action=>z.object({action:z.literal(action)}).strict()),
      ...['DEPOSIT','WITHDRAW'].map(action=>z.object({action:z.literal(action),amountCents:z.string().regex(/^[1-9]\d{0,11}$/)}).strict()),
    ]).safeParse(q.body);
    if(!body.success)throw new PilotError('Dados inválidos',400);
    const key=q.get('Idempotency-Key');if(!key||!/^[a-zA-Z0-9_-]{8,100}$/.test(key))throw new PilotError('Idempotency-Key obrigatório',400);
    s.json(await mutatePilot(db,q.userId,key,body.data,options));
  }));return r;
}
export function signature(secret,timestamp){return crypto.createHmac('sha256',secret).update('POST\n/internal/pilot/tick\n'+timestamp).digest('hex');}
export function schedulerRoute(db,options={}){
  return wrap(async(q,s)=>{
    if(!enabled(options))return s.status(404).json({error:'Piloto desabilitado'});
    const secret=options.schedulerSecret||process.env.PILOT_SCHEDULE_SECRET,timestamp=q.get('X-Pilot-Timestamp'),provided=q.get('X-Pilot-Signature')||'';
    const now=options.now||new Date();
    if(!secret||secret.length<32||!/^\d{13}$/.test(timestamp||'')||Math.abs(+now-Number(timestamp))>300000||!/^[a-f0-9]{64}$/.test(provided)||!crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(signature(secret,timestamp))))return s.status(401).json({error:'Agendamento não autorizado'});
    if(Object.keys(q.body||{}).length)throw new PilotError('Corpo deve ser vazio',400);
    s.json(await tick(db,{...options,now}));
  });
}
