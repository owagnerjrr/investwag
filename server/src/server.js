import "dotenv/config";
import express from "express";
import cors from "cors";
import {PrismaClient} from "@prisma/client";
import {z} from "zod";
import {timingSafeEqual} from "node:crypto";
const token=process.env.DEMO_API_TOKEN;
if(!token||token.length<32||token==="replace_with_a_long_random_secret")throw Error("Configure DEMO_API_TOKEN com pelo menos 32 caracteres aleatórios");
if(!process.env.DATABASE_URL)throw Error("Configure DATABASE_URL");
const prisma=new PrismaClient();
const app=express();
app.disable("x-powered-by");
app.use(cors({origin:process.env.CORS_ORIGIN||"http://localhost:5173"}));
app.use(express.json({limit:"8kb"}));
app.get("/health",(_,res)=>res.json({ok:true,mode:"simulation"}));
app.use("/api", (req,res,next)=>{
 const provided=(req.headers.authorization||"").replace(/^Bearer /,"");
 const a=Buffer.from(provided),b=Buffer.from(token);
 if(a.length!==b.length||!timingSafeEqual(a,b))return res.status(401).json({error:"Não autorizado"});
 next();
});
const cents=(s)=>{if(!/^[1-9]\d*(?:\.\d{1,2})?$/.test(s))throw Error("Valor inválido");const n=Math.round(Number(s)*100);if(!Number.isSafeInteger(n))throw Error("Valor fora do limite");return BigInt(n)};
const serialize=a=>({cashCents:Number(a.cashCents),contributedCents:Number(a.contributedCents),withdrawnCents:Number(a.withdrawnCents),paused:a.paused,events:a.events.map(e=>({id:e.id,type:e.type,amountCents:e.amountCents===null?null:Number(e.amountCents),at:e.createdAt.toISOString()}))});
async function account(tx){let a=await tx.demoAccount.findFirst({orderBy:{createdAt:"asc"}});if(!a)a=await tx.demoAccount.create({data:{}});return a}
app.get("/api/state",async(req,res,next)=>{try{const a=await prisma.$transaction(async tx=>{const a=await account(tx);return tx.demoAccount.findUnique({where:{id:a.id},include:{events:{orderBy:{createdAt:"desc"},take:100}}})});res.json(serialize(a))}catch(e){next(e)}});
const actionSchema=z.discriminatedUnion("type",[z.object({type:z.literal("DEPOSIT"),amount:z.string()}),z.object({type:z.literal("WITHDRAW"),amount:z.string()}),z.object({type:z.literal("TOGGLE")})]);
app.post("/api/actions",async(req,res,next)=>{try{
 const parsed=actionSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"Ação inválida"});
 const action=parsed.data;let value=0n;
 if(action.type!=="TOGGLE"){try{value=cents(action.amount)}catch{return res.status(400).json({error:"Valor inválido"})}if(action.type==="DEPOSIT"&&value<1000n)return res.status(400).json({error:"Aporte mínimo de R$10"})}
 const result=await prisma.$transaction(async tx=>{
  const a=await account(tx);
  if(action.type==="WITHDRAW"){const updated=await tx.demoAccount.updateMany({where:{id:a.id,cashCents:{gte:value}},data:{cashCents:{decrement:value},withdrawnCents:{increment:value}}}});if(updated.count!==1)return null}
  else if(action.type==="DEPOSIT")await tx.demoAccount.update({where:{id:a.id},data:{cashCents:{increment:value},contributedCents:{increment:value}}});
  else await tx.demoAccount.update({where:{id:a.id},data:{paused:!a.paused}});
  await tx.demoEvent.create({data:{accountId:a.id,type:action.type==="TOGGLE"?(a.paused?"RESUMED":"PAUSED"):action.type,amountCents:action.type==="TOGGLE"?null:value}});
  return tx.demoAccount.findUnique({where:{id:a.id},include:{events:{orderBy:{createdAt:"desc"},take:100}}});
 });
 if(!result)return res.status(409).json({error:"Saldo insuficiente"});
 res.json(serialize(result));
}catch(e){next(e)}});
app.use((err,req,res,next)=>{console.error("Erro interno na API:",err.name);res.status(500).json({error:"Erro interno"})});
app.listen(Number(process.env.PORT||3001),()=>console.log("WJ Quant demo API ativa (somente simulação)"));
