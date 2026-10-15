import {test} from 'node:test';import assert from 'node:assert/strict';
import {loadSource,validateSnapshot,CATALOG} from '../pilot/sources.js';
const now=new Date('2026-10-15T18:00:00Z');
test('sources: keyless scheduling prohibited, unsupported classes explicit, bad dates/volume rejected',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error('must not fetch')};
 const crypto=await loadSource(CATALOG.find(a=>a.market==='CRYPTO'),{now,env:{},fetcher});assert.equal(crypto.reason,'DEMO_KEY_REQUIRED_FOR_SCHEDULED_DATA');assert.equal(calls,0);
 const fii=await loadSource(CATALOG.find(a=>a.market==='FII'),{now,fetcher});assert.equal(fii.executionEligible,false);assert.equal(fii.reason,'NO_VALIDATED_FREE_HISTORY');
 assert.throws(()=>validateSnapshot({bars:[{date:'2026-10-16',sourceDate:'2026-10-16',priceMicros:'1',volumeCents:null}]},now));
 assert.throws(()=>validateSnapshot({bars:[{date:'2026-10-14',sourceDate:'2026-10-14',priceMicros:'1',volumeCents:'invented'}]},now));
});
test('CoinGecko Demo: completed UTC days, BRL reported volume and fixed read-only endpoint',async()=>{
 const t=Date.parse('2026-10-14'),fetcher=async(url,options)=>{assert.equal(url.hostname,'api.coingecko.com');assert.equal(options.headers['x-cg-demo-api-key'],'test-only-demo-key');assert.equal(url.searchParams.get('vs_currency'),'brl');return new Response(JSON.stringify({prices:[[t,500000],[t+86400000+1000,999]],total_volumes:[[t,1000000]]}));};
 const s=await loadSource(CATALOG.find(a=>a.market==='CRYPTO'),{now,env:{COINGECKO_DEMO_KEY:'test-only-demo-key'},fetcher});assert.equal(s.bars.length,1);assert.equal(s.bars[0].priceMicros,'500000000000');assert.equal(s.bars[0].volumeCents,'100000000');assert.equal(s.executionEligible,true);
});
