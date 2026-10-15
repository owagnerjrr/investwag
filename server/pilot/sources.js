import { fetchRates } from '../quant/market.js';
import { serialize } from '../quant/simulation.js';

// Bounded, owner-reviewed research universe. Never accept arbitrary URLs/tickers from clients.
export const CATALOG = [
  ...['USD-BRL','EUR-BRL'].map(symbol=>({symbol,market:'FX',source:'Frankfurter v2',referenceOnly:true})),
  ...['PETR4','VALE3','ITUB4','MGLU3'].map(symbol=>({symbol,market:'BR_STOCK',source:'brapi'})),
  ...['bitcoin','ethereum'].map(id=>({symbol:id==='bitcoin'?'BTC-BRL':'ETH-BRL',market:'CRYPTO',source:'CoinGecko Demo',id})),
  ...['ETF','FII','INTERNATIONAL'].map(market=>({symbol:market,market,source:null})),
];
const DAY=86400000;
const date=t=>new Date(t).toISOString().slice(0,10);
function price(value) {
  if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>1e9)throw Error('INVALID_PRICE');
  const result=Math.round(value*1e6);if(!Number.isSafeInteger(result)||result<1)throw Error('PRECISION');
  return String(result);
}
async function json(url,fetcher,headers={}) {
  const r=await fetcher(url,{headers,redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error(r.status===429?'SOURCE_QUOTA':'SOURCE_UNAVAILABLE');
  const reader=r.body.getReader(),chunks=[];let bytes=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>2e6)throw Error('PAYLOAD_LIMIT');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function validateSnapshot(snapshot,now=new Date()) {
  if(!snapshot||!Array.isArray(snapshot.bars)||snapshot.bars.length>366)throw Error('INVALID_DATA');
  const seen=new Set();
  for(const b of snapshot.bars){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||date(b.date)!==b.date||b.date>=date(now)||seen.has(b.date)||!/^\d{1,16}$/.test(b.priceMicros)||BigInt(b.priceMicros)<=0n)throw Error('INVALID_DATA');
    if(b.volumeCents!==null&&(!/^\d{1,22}$/.test(b.volumeCents)||BigInt(b.volumeCents)<0n))throw Error('INVALID_VOLUME');
    if(!b.sourceDate||b.sourceDate>b.date)throw Error('INVALID_PROVENANCE');seen.add(b.date);
  }
  snapshot.bars.sort((a,b)=>a.date.localeCompare(b.date));return snapshot;
}
export async function loadSource(asset,{now=new Date(),fetcher=fetch,env=process.env}={}) {
  const result={symbol:asset.symbol,market:asset.market,source:asset.source,referenceOnly:!!asset.referenceOnly,executionEligible:false,bars:[],reason:null};
  const end=date(+now-DAY),start=date(+now-180*DAY);
  if(!asset.source)return {...result,reason:'NO_VALIDATED_FREE_HISTORY'};
  if(asset.market==='FX'){
    result.bars=serialize((await fetchRates(asset.symbol,start,end,fetcher)).map(b=>({...b,volumeCents:null,volumeKind:'UNAVAILABLE'})));
    result.reason='REFERENCE_ONLY_NO_EXECUTION';
  }else if(asset.market==='CRYPTO'){
    // Keyless terms explicitly exclude scheduled polling. No fallback to keyless/pro endpoints.
    if(!env.COINGECKO_DEMO_KEY)return {...result,reason:'DEMO_KEY_REQUIRED_FOR_SCHEDULED_DATA'};
    const url=new URL(`https://api.coingecko.com/api/v3/coins/${asset.id}/market_chart`);
    url.search=new URLSearchParams({vs_currency:'brl',days:'180',interval:'daily'}).toString();
    const data=await json(url,fetcher,{'x-cg-demo-api-key':env.COINGECKO_DEMO_KEY});
    if(!Array.isArray(data.prices)||!Array.isArray(data.total_volumes))throw Error('INVALID_DATA');
    const volumes=new Map(data.total_volumes.map(([t,v])=>[t,v]));
    // Keep only completed UTC day boundaries; never turn a partial day into a daily candle.
    result.bars=data.prices.filter(([t])=>Number.isSafeInteger(t)&&t%DAY===0&&date(t)<=end).map(([t,v])=>{
      const volume=volumes.get(t);return {date:date(t),sourceDate:date(t),priceMicros:price(v),volumeCents:typeof volume==='number'&&Number.isFinite(volume)&&volume>=0&&volume<1e15?String(Math.floor(volume*100)):null,volumeKind:'REPORTED_24H_BRL'};
    });result.executionEligible=true;
  }else if(asset.market==='BR_STOCK'){
    const url=new URL(`https://brapi.dev/api/quote/${asset.symbol}`);url.search=new URLSearchParams({range:'3mo',interval:'1d'}).toString();
    const data=await json(url,fetcher);const item=data.results?.[0];
    if(item?.symbol!==asset.symbol||item.currency!=='BRL'||!Array.isArray(item.historicalDataPrice))throw Error('HISTORY_UNAVAILABLE');
    result.bars=item.historicalDataPrice.filter(b=>date(b.date*1000)<=end).map(b=>({date:date(b.date*1000),sourceDate:date(b.date*1000),priceMicros:price(b.close),volumeCents:null,volumeKind:'SHARES_ONLY',volumeShares:Number.isSafeInteger(b.volume)&&b.volume>=0?b.volume:null}));
    // Raw close/share volume alone cannot validate adjusted history or BRL liquidity.
    result.reason='ADJUSTMENTS_AND_LIQUIDITY_NOT_VERIFIED';
  }
  return validateSnapshot(result,now);
}

export async function refreshMarkets(db,options={}) {
  const now=options.now||new Date(),provider=options.provider||loadSource,assets=options.catalog||CATALOG;
  const snapshots=[];
  for(const asset of assets){
    await db.pilotMarket.createMany({data:[{symbol:asset.symbol,market:asset.market,snapshot:{...asset,bars:[],reason:'NOT_FETCHED'}}],skipDuplicates:true});
    const reserved=await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT symbol FROM "PilotMarket" WHERE symbol=${asset.symbol} FOR UPDATE`;
      const cached=await tx.pilotMarket.findUnique({where:{symbol:asset.symbol}});
      if(cached.lastAttempt&&+now-+cached.lastAttempt<DAY)return false;
      await tx.pilotMarket.update({where:{symbol:asset.symbol},data:{lastAttempt:now}});return true;
    });
    if(reserved){
      try{
        const incoming=validateSnapshot(await provider(asset,{...options,now}),now);
        const old=await db.pilotMarket.findUnique({where:{symbol:asset.symbol}});
        const previous=new Map((old.snapshot.bars||[]).map(b=>[b.date,b]));
        for(const b of incoming.bars){if(previous.has(b.date)&&previous.get(b.date).priceMicros!==b.priceMicros)throw Error('DATA_REVISION');previous.set(b.date,b);}
        const snapshot={...incoming,bars:[...previous.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-180),fetchedAt:now.toISOString()};
        await db.pilotMarket.update({where:{symbol:asset.symbol},data:{snapshot:serialize(snapshot),failures:0,error:null}});
      }catch(e){
        const code=['DATA_REVISION','SOURCE_QUOTA','PAYLOAD_LIMIT','HISTORY_UNAVAILABLE'].includes(e.message)?e.message:'SOURCE_UNAVAILABLE';
        await db.pilotMarket.update({where:{symbol:asset.symbol},data:{failures:{increment:1},error:code}});
      }
    }
    const cached=await db.pilotMarket.findUnique({where:{symbol:asset.symbol}});
    snapshots.push({...cached.snapshot,symbol:asset.symbol,market:asset.market,error:cached.error,failures:cached.failures,lastAttempt:cached.lastAttempt?.toISOString()});
  }
  return snapshots;
}
