import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorker} from '../worker/index.mjs';
import {parseFaostatCatalog,parseFaostatPrices} from '../worker/faostat.mjs';

Object.assign(globalThis,{parseFaostatCatalog,parseFaostatPrices});
const read=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const CATALOG_URL='https://bulks-faostat.fao.org/production/datasets_E.json';
const PRICE_URL='https://bulks-faostat.fao.org/production/Prices_E_All_Data_(Normalized).zip';
const seedTrade={markets:[{id:'brazil-coffee',code:76,country:'Brazil',hs:'0901',records:[{year:2025,flow:'X',value:123}]}],retrievedAt:'2026-10-20'};
const oldSchedule={enabled:true,id:'existing-daily-schedule',cadence:'Daily at 06:30',timezone:'Europe/London'};
const seedSupply={source:'USDA PSD',records:[{country:'Brazil',product:'Coffee, Green',year:2025,unit:'(1000 60 KG BAGS)',value:100}]};
const initial={dataset:seedTrade,benchmarks:{series:[{id:'existing-world-bank',name:'Coffee',observations:[{period:'2026-09',value:5}]}]},production:{datasets:[{code:'older-catalog',name:'Earlier verified dataset'}]},supply:seedSupply,fpma:{series:[]},faostatPrices:{series:[]},marketFeeds:{prices:{series:[]},news:{items:[]}},companies:{records:[]},sourceStatus:[{id:'un-comtrade',status:'connected'}],runs:[],cursor:9,automaticUpdates:oldSchedule};
let persisted=structuredClone(initial),etag='v0',writes=0;
const BUCKET={
 async get(){return {etag,json:async()=>structuredClone(persisted)};},
 async put(key,body,options){assert.equal(key,'agriculture/current.json');assert.equal(options.onlyIf.etagMatches,etag,'Imports must use the last read storage revision');persisted=JSON.parse(body);etag='v'+(++writes);return {etag};}
};
const app=createWorker({seed:seedTrade,catalog:read('data/catalog.json'),assets:{},sources:{sources:[]},revision:'faostat-import-test'});
const request=(path,body,source,headers={})=>new Request('https://private.example'+path,{method:'POST',headers:{...(source?{'x-source-url':source}:{}),...headers},body});
async function rejectWithoutMutation(req,expectedStatus){const prior=structuredClone(persisted),priorWrites=writes;const response=await app.fetch(req,{BUCKET});if(expectedStatus)assert.equal(response.status,expectedStatus);else assert(response.status>=400,'Invalid input must be rejected');assert.deepEqual(persisted,prior,'Rejected input must not change stored data');assert.equal(writes,priorWrites,'Rejected input must not call the storage writer');}
function unchangedCore(){assert.deepEqual(persisted.dataset,seedTrade,'FAOSTAT import must not overwrite trade');assert.deepEqual(persisted.automaticUpdates,oldSchedule,'Import must not replace or disable the saved schedule');assert.deepEqual(persisted.supply,seedSupply,'Import must not overwrite USDA production');assert.equal(persisted.benchmarks.series[0].id,'existing-world-bank','FAOSTAT import must not replace World Bank benchmarks');assert.equal(persisted.cursor,9,'Import must not advance the rotating trade cursor');}

await rejectWithoutMutation(request('/api/faostat/catalog-import','{}','https://bulks-faostat.fao.org.evil.example/production/datasets_E.json'),400);
await rejectWithoutMutation(request('/api/faostat/catalog-import','{}',null),400);
await rejectWithoutMutation(request('/api/faostat/prices-import',new Uint8Array(30),'https://example.com/prices.zip'),400);
await rejectWithoutMutation(request('/api/faostat/catalog-import',new Uint8Array(300001),CATALOG_URL),413);
await rejectWithoutMutation(request('/api/faostat/catalog-import','{malformed-json',CATALOG_URL));
await rejectWithoutMutation(request('/api/faostat/catalog-import',JSON.stringify({Datasets:{Dataset:[]}}),CATALOG_URL));
await rejectWithoutMutation(request('/api/faostat/prices-import',new Uint8Array(40),PRICE_URL));
await rejectWithoutMutation(request('/api/faostat/catalog-import','{}',CATALOG_URL,{Origin:'https://another.example'}),403);

const catalog=read('data/production.json');
assert.equal(catalog.datasets.length,69,'Expected the verified 69-dataset FAOSTAT catalog bootstrap');
const rows=catalog.datasets.map(d=>({DatasetCode:d.code,DatasetName:d.name,DateUpdate:d.updatedAt,FileLocation:d.url,FileSize:d.size,FileRows:d.rows}));
const fixture=rows.slice(0,20);
let response=await app.fetch(request('/api/faostat/catalog-import',JSON.stringify({Datasets:{Dataset:fixture}}),CATALOG_URL,{'x-source-last-modified':'Thu, 29 Oct 2026 10:00:00 GMT'}),{BUCKET});
assert.equal(response.status,200);assert.equal((await response.json()).count,20);assert.equal(persisted.production.datasets.length,20);unchangedCore();

const badRows=structuredClone(rows);badRows[2].FileLocation='https://untrusted.example/data.zip';
await rejectWithoutMutation(request('/api/faostat/catalog-import',JSON.stringify({Datasets:{Dataset:badRows}}),CATALOG_URL));
response=await app.fetch(request('/api/faostat/catalog-import',JSON.stringify({Datasets:{Dataset:rows}}),CATALOG_URL),{BUCKET});
assert.equal(response.status,200);const importedCatalog=await response.json();assert.equal(importedCatalog.count,69);assert.equal(persisted.production.datasets.length,69);assert.equal(persisted.production.connection.representation,'official-json-via-task-runner');assert.equal(persisted.faostatRelay.enabled,true);unchangedCore();

const sourceArchive=readFileSync('research/faostat-prices.zip'),expected=read('data/faostat-prices.json');
assert.equal(expected.series.length,373,'Expected the independently seeded 373 producer-price series');
response=await app.fetch(request('/api/faostat/prices-import',sourceArchive,PRICE_URL),{BUCKET});
assert.equal(response.status,200);assert.equal((await response.json()).count,373);assert.equal(persisted.faostatPrices.series.length,373);unchangedCore();
const expectedMap=new Map(expected.series.map(s=>[s.id,s]));
for(const actual of persisted.faostatPrices.series){const original=expectedMap.get(actual.id);assert(original,'Imported series must exist in the verified source extract');assert.equal(actual.country,original.country);assert.equal(actual.frequency,'Annual');assert.equal(actual.unit,original.unit);assert.deepEqual(actual.observations,original.observations,'Values, periods and source flags must survive import exactly');}

response=await app.fetch(new Request('https://private.example/api/status'),{BUCKET});assert.equal(response.status,200);const status=await response.json();assert.equal(status.faostat.status,'connected');assert.equal(status.automaticUpdates.id,oldSchedule.id);assert.equal(status.sourceStatus.find(s=>s.id==='faostat').count,69);assert.equal(status.sourceStatus.find(s=>s.id==='faostat-producer-prices').count,373);
response=await app.fetch(new Request('https://private.example/api/benchmarks'),{BUCKET});assert.equal((await response.json()).series.length,374,'Existing World Bank series and imported producer prices must both be available');
response=await app.fetch(new Request('https://private.example/api/production'),{BUCKET});const production=await response.json();assert.equal(production.datasets.length,69);assert.deepEqual(production.records,seedSupply.records);
console.log(JSON.stringify({passed:true,checked:['official-source-header','catalog-size-limit','malformed-input-atomicity','cross-origin-protection','20-and-69-dataset-imports','373-price-series-and-flags','unrelated-state-preserved','persisted-status-and-view-readback'],catalogDatasets:69,priceSeries:373,storageWrites:writes}));
