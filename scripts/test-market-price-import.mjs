import {ownerRequest,ownerEnv} from './auth-fixture.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorker,validateImportedMarketPrices} from '../worker/index.mjs';

const read=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const official=read('data/market-feeds.json');
assert.equal(official.prices.series.length,33,'Expected the verified 33 EC/FPMA market-price series');
assert.equal(validateImportedMarketPrices(official).length,33);
const changed=(mutate)=>{const body=structuredClone(official);mutate(body);return body;};
const invalidCases=[
 ['unapproved host',b=>b.prices.series[0].sourceUrl='https://untrusted.example/prices'],
 ['deceptive host',b=>b.prices.series[0].sourceUrl='https://api.tech.ec.europa.eu.evil.example/prices'],
 ['unapproved scheme',b=>b.prices.series[0].sourceUrl='http://api.tech.ec.europa.eu/agrifood/api/dairy/prices'],
 ['script scheme',b=>b.prices.series[0].sourceUrl='javascript:alert(1)'],
 ['malformed URL',b=>b.prices.series[0].sourceUrl='not a URL'],
 ['unapproved source',b=>b.prices.series[0].sourceId='private-price-provider'],
 ['source/host mismatch',b=>b.prices.series[0].sourceUrl='https://fpma.fao.org/giews/prices'],
 ['wrong EC currency',b=>b.prices.series[0].currency='USD'],
 ['wrong EC series prefix',b=>b.prices.series[0].id='fpma-forged'],
 ['missing unit',b=>b.prices.series[0].unit=''],
 ['unapproved frequency',b=>b.prices.series[0].frequency='Annual'],
 ['duplicate series ID',b=>b.prices.series.push(structuredClone(b.prices.series[0]))],
 ['duplicate observation period',b=>b.prices.series[0].observations.push(structuredClone(b.prices.series[0].observations[0]))],
 ['negative price',b=>b.prices.series[0].observations[0].value=-1],
 ['non-finite price',b=>b.prices.series[0].observations[0].value=Infinity],
 ['NaN price',b=>b.prices.series[0].observations[0].value=NaN],
 ['string price',b=>b.prices.series[0].observations[0].value='10.5'],
 ['malformed period',b=>b.prices.series[0].observations[0].period='latest'],
 ['no series',b=>b.prices.series=[]],
 ['too many series',b=>b.prices.series=Array.from({length:201},(_,i)=>({...structuredClone(b.prices.series[0]),id:'ec-test-'+i}))]
];
for(const [name,mutate] of invalidCases)assert.throws(()=>validateImportedMarketPrices(changed(mutate)),`${name} must be rejected`);
const fpma=official.prices.series.find(s=>s.sourceId==='fao-fpma-observations');assert(fpma,'Verified payload must include FPMA observations');
const invalidFpma=structuredClone(fpma);invalidFpma.id='ec-forged';assert.throws(()=>validateImportedMarketPrices({prices:{series:[invalidFpma]}}));
const zero=changed(b=>b.prices.series[0].observations[0].value=0);assert.equal(validateImportedMarketPrices(zero)[0].observations[0].value,0,'Explicit source zero must remain valid');

const trade={markets:[{country:'Brazil',code:76,hs:'0901',records:[{year:2025,flow:'X',value:123}]}]};
const schedule={enabled:true,id:'existing-schedule',timezone:'Europe/London'};
const preservedSeries={...structuredClone(official.prices.series[0]),id:'ec-stale-preserved',name:'Earlier verified source series',observations:[{period:'2024-01-01',value:80}]};
const revisable={...structuredClone(official.prices.series[0]),observations:[{period:'2020-01-01',value:77},...official.prices.series[0].observations]};
let persisted={dataset:trade,benchmarks:{series:[{id:'wb-original',name:'Original WB'}]},faostatPrices:{series:[{id:'fao-original',name:'Original FAOSTAT'}]},production:{datasets:[]},supply:{records:[{country:'Brazil',unit:'MT',value:42}]},fpma:{series:[]},marketFeeds:{prices:{series:[revisable,preservedSeries]},news:{items:[{id:'news-preserved',title:'Earlier official news'}]}},companies:{records:[{id:'company-preserved',name:'Existing organisation'}]},sourceStatus:[],runs:[],cursor:8,automaticUpdates:schedule};
const initial=structuredClone(persisted);let etag='v0',writes=0;
const BUCKET={async get(){return {etag,json:async()=>structuredClone(persisted)};},async put(key,body,options){assert.equal(options.onlyIf.etagMatches,etag);persisted=JSON.parse(body);etag='v'+(++writes);return {etag};}};
const app=createWorker({seed:trade,catalog:read('data/catalog.json'),assets:{},sources:{sources:[]},revision:'price-import-test'});
const request=body=>ownerRequest('https://private.example/api/market-prices-import',{method:'POST',headers:{'Content-Type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)});
for(const [name,mutate] of invalidCases){const before=structuredClone(persisted),beforeWrites=writes;const response=await app.fetch(request(changed(mutate)),ownerEnv({BUCKET}));assert(response.status>=400,`${name} must fail through the HTTP endpoint`);assert.deepEqual(persisted,before,`${name} must not alter saved data`);assert.equal(writes,beforeWrites,`${name} must not call the writer`);}
let response=await app.fetch(request('{invalid JSON'),ownerEnv({BUCKET}));assert(response.status>=400);assert.equal(writes,0);
response=await app.fetch(request(' '.repeat(1500001)),ownerEnv({BUCKET}));assert.equal(response.status,413);assert.equal(writes,0);
response=await app.fetch(request(zero),ownerEnv({BUCKET}));assert.equal(response.status,200);const result=await response.json();assert.equal(result.series,33);assert.equal(result.totalSeries,34,'An older series omitted by the new import must remain available');
assert.equal(persisted.marketFeeds.priceRelayEnabled,true);assert.equal(persisted.marketFeeds.prices.series.find(s=>s.id===zero.prices.series[0].id).observations.find(o=>o.period===zero.prices.series[0].observations[0].period).value,0);
assert.equal(persisted.marketFeeds.prices.series.find(s=>s.id===revisable.id).observations.find(o=>o.period==='2020-01-01').value,77,'Earlier omitted periods must be retained');
assert.deepEqual(persisted.marketFeeds.prices.series.find(s=>s.id===preservedSeries.id),preservedSeries);
for(const key of ['dataset','benchmarks','faostatPrices','supply','companies','automaticUpdates','cursor'])assert.deepEqual(persisted[key],initial[key],`${key} must survive a price import unchanged`);
assert.deepEqual(persisted.marketFeeds.news,initial.marketFeeds.news,'Import must not replace news');
response=await app.fetch(ownerRequest('https://private.example/api/benchmarks'),ownerEnv({BUCKET}));const shown=await response.json();assert.equal(shown.series.length,36,'World Bank and FAOSTAT series must remain alongside 34 retained market series');
response=await app.fetch(ownerRequest('https://private.example/api/status'),ownerEnv({BUCKET}));const status=await response.json();assert.equal(status.prices.series,36);assert.equal(status.automaticUpdates.id,schedule.id);
console.log(JSON.stringify({passed:true,verifiedInputSeries:33,invalidCases:invalidCases.length+1,retainedSeries:34,combinedPriceSeries:36,checked:['official provenance','scheme/source/currency checks','duplicate and numeric validation','explicit zero','atomic rejection','retained missing series and periods','unrelated data and schedule preserved','readback']}));
