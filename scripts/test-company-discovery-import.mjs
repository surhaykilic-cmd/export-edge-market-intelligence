import {ownerRequest,ownerEnv} from './auth-fixture.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorker} from '../worker/index.mjs';
import {companyRecordCurrent,validateDiscoverySnapshot,mergeDiscoverySnapshots} from '../worker/company-discovery.mjs';
import {companySeed,companySourcePolicies,companySourceGroups} from './company-config.mjs';

const read=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
const official=companySeed(),policies=companySourcePolicies,now=Date.now();
const day=offset=>new Date(now+offset*86400000).toISOString().slice(0,10);
assert(official.records.length>=500,'The real multi-country bootstrap must be exercised');
assert(new Set(official.records.map(r=>r.country)).size>=10,'The real bootstrap must cover international countries');
assert.equal(validateDiscoverySnapshot(official,policies).length,official.records.length);
assert.deepEqual(new Set(policies.map(p=>p.id)),new Set(official.records.map(r=>r.sourceId)),'Every bootstrapped source needs an import policy');
assert.equal(companySourceGroups.flatMap(g=>g.sourceIds).length,policies.length);
assert.deepEqual(new Set(companySourceGroups.flatMap(g=>g.sourceIds)),new Set(policies.map(p=>p.id)),'Hosted connector groups and importer policies must cover the same sources');
const sample=sourceId=>structuredClone(official.records.find(r=>r.sourceId===sourceId));
const ireland=sample('ie-fsai-approved'),india=sample('in-eic-approved'),buyer=sample('eu-ted-food-buyers');
assert(ireland&&india&&buyer,'Actual bootstrap must include establishment and procurement evidence');
const minimal={records:[ireland],statuses:[{id:ireland.sourceId,status:'connected'}]};
const changed=mutate=>{const body=structuredClone(minimal);mutate(body,body.records[0]);return body;};
const invalidCases=[
 ['empty records',b=>b.records=[]],
 ['records is not an array',b=>b.records={}],
 ['null record',b=>b.records=[null]],
 ['missing identity',(_,r)=>delete r.id],
 ['unapproved identity prefix',(_,r)=>r.id='uk-forged-identity'],
 ['duplicate identity',b=>b.records.push(structuredClone(b.records[0]))],
 ['missing organization name',(_,r)=>r.name=' '],
 ['non-string organization name',(_,r)=>r.name={}],
 ['unapproved source',(_,r)=>r.sourceId='paid-private-directory'],
 ['source country mismatch',(_,r)=>r.country='Brazil'],
 ['destination substituted for country',(_,r)=>r.country='European Union'],
 ['source role mismatch',(_,r)=>r.role='buyer-discovery'],
 ['verified trading role',(_,r)=>r.role='verified-supplier'],
 ['unapproved evidence host',(_,r)=>r.sourceUrl='https://private.example/companies'],
 ['deceptive evidence host',(_,r)=>r.sourceUrl='https://oapi.fsai.ie.evil.example/list'],
 ['wrong official source host',(_,r)=>r.sourceUrl='https://archive.eicindia.gov.in/WebApp1/list'],
 ['HTTP evidence URL',(_,r)=>r.sourceUrl='http://oapi.fsai.ie/HSEApprovedEstablishments.aspx'],
 ['script evidence URL',(_,r)=>r.sourceUrl='javascript:alert(1)'],
 ['malformed evidence URL',(_,r)=>r.sourceUrl='not a URL'],
 ['evidence credentials',(_,r)=>r.sourceUrl='https://name:secret@oapi.fsai.ie/list'],
 ['verified supplier claim',(_,r)=>r.verification='Verified supplier'],
 ['missing evidence',(_,r)=>r.evidence=''],
 ['invalid checked date',(_,r)=>r.retrievedAt='yesterday'],
 ['products is not an array',(_,r)=>r.products='Food'],
 ['activity is not text',(_,r)=>r.activities=[{food:true}]],
 ['oversized activity label',(_,r)=>r.activities=['x'.repeat(1501)]],
 ['too many product labels',(_,r)=>r.products=Array(61).fill('Food')],
 ['unsafe company website',(_,r)=>r.website='http://supplier.example'],
 ['website credentials',(_,r)=>r.website='https://user:secret@supplier.example'],
 ['past approval expiry',(_,r)=>r.approvalExpiresAt=day(-1)],
 ['malformed approval expiry',(_,r)=>r.approvalExpiresAt='not a date'],
 ['legacy past approval expiry',(_,r)=>r.approvalExpiryDate=day(-1)],
 ['legacy past expiry',(_,r)=>r.expiryDate=day(-1)],
 ['inactive flag',(_,r)=>r.isActive=false],
 ...['inactive','suspended','withdrawn','revoked','expired','cancelled','canceled'].map(status=>[`${status} approval`,(_,r)=>r.approvalStatus=status]),
 ...['email','phone','telephone','address','contact','contactName','contactEmail','contactPhone','postalCode'].map(key=>[`${key} field`,(_,r)=>r[key]='Excluded private contact value']),
 ['unknown source status',b=>b.statuses=[{id:'unapproved-directory',status:'connected'}]],
 ['unknown connection status',b=>b.statuses[0].status='verified-trader'],
 ['buyer without procurement evidence',b=>{b.records=[structuredClone(buyer)];b.records[0].verification='Registry-listed';b.statuses=[{id:buyer.sourceId,status:'connected'}];}]
];
for(const [name,mutate] of invalidCases)assert.throws(()=>validateDiscoverySnapshot(changed(mutate),policies),`${name} must fail validation`);
assert.throws(()=>validateDiscoverySnapshot({records:Array.from({length:6001},(_,i)=>({...ireland,id:'ie-fsai-many-'+i}))},policies),/Bounded/);
const boundary=Date.parse('2026-10-29T12:00:00Z');
assert.equal(companyRecordCurrent({approvalExpiresAt:'2026-10-29'},boundary),true,'The listed expiry day remains included');
assert.equal(companyRecordCurrent({approvalExpiresAt:'2026-10-29'},Date.parse('2026-10-30T00:00:00Z')),false,'Approval expires at the next UTC day');
assert.equal(companyRecordCurrent({approvalExpiresAt:null},boundary),true,'Missing expiry must not imply expired or verified validity');

const trade={markets:[{code:76,country:'Brazil',hs:'0901',records:[{year:2025,flow:'X',value:123}],sourceUrls:[]}]};
const domestic=read('data/companies.json'),domesticRecord=structuredClone(domestic.records.find(r=>r.sourceId==='uk-fsa-approved'));
assert(domesticRecord,'Domestic UK seed is required for separation regression');
const extraIndia={...india,id:'in-eic-prior-unexpired',name:'Prior test establishment',approvalExpiresAt:day(1)};
const expiredIndia={...india,id:'in-eic-prior-expired',name:'Expired test establishment',approvalExpiresAt:day(-1)};
const priorIreland={...ireland,id:'ie-fsai-prior-removed',name:'Removed test establishment'};
const expiredDomestic={...domesticRecord,id:'fsa-ew-expired-fixture',approvalExpiresAt:day(-1)};
let persisted={dataset:trade,benchmarks:{series:[{id:'wb-preserved'}]},faostatPrices:{series:[{id:'faostat-preserved'}]},production:{datasets:[{id:'production-preserved'}]},supply:{records:[{country:'Brazil',value:42,unit:'MT'}]},fpma:{series:[{id:'fpma-preserved'}]},marketFeeds:{prices:{series:[{id:'market-price-preserved'}]},news:{items:[{id:'news-preserved',title:'Official market news'}]},priceRelayEnabled:true},companies:{records:[domesticRecord,expiredDomestic],statuses:[{id:'uk-fsa-approved',status:'connected'}],retrievedAt:'2026-10-01T00:00:00Z'},internationalCompanies:{records:[extraIndia,expiredIndia,priorIreland],statuses:[{id:'in-eic-approved',status:'snapshot',refreshMode:'snapshot-only',refreshWarning:'Known source transport failure'},{id:'ie-fsai-approved',status:'connected'}],errors:[{source:'in-eic-approved',error:'Known source transport failure'}],retrievedAt:'2026-10-01T00:00:00Z'},sourceStatus:[{id:'un-comtrade',status:'connected'}],runs:[{id:'prior-run'}],cursor:8,automaticUpdates:{enabled:true,id:'existing-daily-schedule',timezone:'Europe/London'},faostatRelay:{enabled:true,lastCatalogImportAt:'2026-10-29T00:00:00Z',lastPricesImportAt:'2026-10-29T00:00:00Z'}};
let etag='v0',writes=0,putCalls=0,rejectConcurrency=false;
const BUCKET={async get(key){assert.equal(key,'agriculture/current.json');return {etag,json:async()=>structuredClone(persisted)};},async put(key,body,options){putCalls++;assert.equal(key,'agriculture/current.json');assert.equal(options.onlyIf.etagMatches,etag);if(rejectConcurrency)return null;persisted=JSON.parse(body);etag='v'+(++writes);return {etag};}};
const config={seed:trade,catalog:read('data/catalog.json'),assets:{},sources:{sources:[]},companies:domestic,internationalCompanies:official,companySourcePolicies:policies,companySourceGroups,revision:'company-discovery-import-test'};
const worker=createWorker(config),env=ownerEnv({BUCKET});
const request=(body,extra={})=>ownerRequest('https://private.example/api/company-discovery-import',{method:'POST',headers:{'Content-Type':'application/json',...extra},body:typeof body==='string'?body:JSON.stringify(body)});
const get=async path=>{const response=await worker.fetch(ownerRequest('https://private.example'+path),env);assert.equal(response.status,200);return response.json();};
const initial=structuredClone(persisted);
let shown=await get('/api/companies');
assert(shown.records.some(r=>r.id===domesticRecord.id));assert(shown.records.some(r=>r.id===extraIndia.id));
assert(!shown.records.some(r=>r.id===expiredIndia.id||r.id===expiredDomestic.id),'GET must remove expired cached records across both storage namespaces');
for(const [name,mutate] of invalidCases){
 const before=structuredClone(persisted),beforeCalls=putCalls;
 const response=await worker.fetch(request(changed(mutate)),env);assert(response.status>=400,`${name} must fail through the private endpoint`);
 assert.deepEqual(persisted,before,`${name} must leave all saved data unchanged`);assert.equal(putCalls,beforeCalls,`${name} must never call the writer`);
}
for(const [name,body] of [['malformed JSON','{invalid'],['null payload','null']]){const response=await worker.fetch(request(body),env);assert(response.status>=400,name);assert.equal(putCalls,0);}
let response=await worker.fetch(request(' '.repeat(6000001)),env);assert.equal(response.status,413);assert.equal(putCalls,0);
response=await worker.fetch(request(minimal,{Origin:'https://other.example'}),env);assert.equal(response.status,403);assert.equal(putCalls,0);
rejectConcurrency=true;response=await worker.fetch(request(minimal),env);assert.equal(response.status,409);assert.equal(writes,0);assert.deepEqual(persisted,initial,'A concurrent-write conflict must not mutate storage');rejectConcurrency=false;

response=await worker.fetch(request(official),env);assert.equal(response.status,200);const imported=await response.json();assert.equal(imported.imported,true);
assert.equal(persisted.internationalCompanies.relayEnabled,true);assert(Number.isFinite(Date.parse(persisted.internationalCompanies.importedAt)));
assert(persisted.internationalCompanies.records.some(r=>r.id===extraIndia.id),'Snapshot/error data must retain prior unexpired source records');
assert(!persisted.internationalCompanies.records.some(r=>r.id===priorIreland.id),'A successful complete source refresh must remove omitted approvals');
for(const key of ['dataset','benchmarks','faostatPrices','production','supply','fpma','marketFeeds','companies','automaticUpdates','cursor','runs','faostatRelay'])assert.deepEqual(persisted[key],initial[key],`${key} must survive discovery import unchanged`);
assert(persisted.sourceStatus.some(s=>s.id==='un-comtrade'),'Existing unrelated source status must remain');
shown=await get('/api/companies');const intl=await get('/api/company-discovery-state');
assert.deepEqual(intl,persisted.internationalCompanies,'Private directory state must read back its distinct persisted namespace');
assert.equal(shown.records.length,imported.totalRecords);assert.equal(intl.records.filter(r=>companyRecordCurrent(r)).length,imported.records);
assert(shown.records.some(r=>r.id===domesticRecord.id));assert(shown.records.some(r=>r.country==='India'));assert(shown.records.some(r=>r.role==='buyer-discovery'));
assert(!shown.records.some(r=>r.id===expiredIndia.id||r.id===expiredDomestic.id),'Expired retained rows must stay out of the public directory after importing');
assert.equal(shown.coverage.reduce((n,c)=>n+c.records,0),shown.records.length);assert.equal(shown.coverage.length,new Set(shown.records.map(r=>r.country)).size);
let status=await get('/api/status');assert.equal(status.companies.records,shown.records.length);assert.equal(status.companies.countries,shown.coverage.length);assert.equal(status.automaticUpdates.id,initial.automaticUpdates.id);assert.equal(status.runnerImports.internationalCompanies,persisted.internationalCompanies.importedAt);

// A narrow source update must retain both the records and health metadata of untouched sources.
const priorStatuses=structuredClone(persisted.internationalCompanies.statuses),unrelatedRecords=structuredClone(persisted.internationalCompanies.records.filter(r=>r.sourceId!==ireland.sourceId));
const irishPair=official.records.filter(r=>r.sourceId===ireland.sourceId).slice(0,2);
const fullSource={records:structuredClone(irishPair),statuses:[{id:ireland.sourceId,status:'connected',detail:'Complete fixture source refresh'}],errors:[]};
response=await worker.fetch(request(fullSource),env);assert.equal(response.status,200);
assert.deepEqual(persisted.internationalCompanies.records.filter(r=>r.sourceId===ireland.sourceId).map(r=>r.id).sort(),irishPair.map(r=>r.id).sort());
assert.deepEqual(persisted.internationalCompanies.records.filter(r=>r.sourceId!==ireland.sourceId),unrelatedRecords);
for(const s of priorStatuses.filter(s=>s.id!==ireland.sourceId))assert.deepEqual(persisted.internationalCompanies.statuses.find(r=>r.id===s.id),s,'Omitted source health metadata must be preserved');
const revised={...irishPair[0],name:'Revised fixture manufacturer'};
for(const connection of ['partial','error']){
 const body={records:[{...revised,name:`${connection} fixture manufacturer`}],statuses:[{id:ireland.sourceId,status:connection}],errors:[{source:ireland.sourceId,error:'Fixture partial source evidence'}]};
 response=await worker.fetch(request(body),env);assert.equal(response.status,200);
 const saved=persisted.internationalCompanies.records.filter(r=>r.sourceId===ireland.sourceId);
 assert.equal(saved.length,2,`${connection} must retain omitted prior records`);assert(saved.some(r=>r.id===irishPair[1].id));assert.equal(saved.find(r=>r.id===revised.id).name,body.records[0].name,'A newly returned row can update its own identity');
 assert(persisted.internationalCompanies.statuses.some(s=>s.id==='in-eic-approved'),'Other source health must survive a partial/error import');
}
const unitMerged=mergeDiscoverySnapshots({records:[extraIndia,ireland],statuses:[{id:india.sourceId,status:'snapshot'},{id:ireland.sourceId,status:'error'}],errors:[{source:india.sourceId,error:'Untouched transport warning'},{source:ireland.sourceId,error:'Old error to replace'}]},fullSource,policies);
assert(unitMerged.errors.some(e=>e.source===india.sourceId));assert(!unitMerged.errors.some(e=>e.source===ireland.sourceId),'A successful touched source must replace its old error');

// The normal scheduled companies refresh operates only on domestic data.
const beforeScheduled=structuredClone(persisted.internationalCompanies),beforeTrade=structuredClone(persisted.dataset.markets),beforePrices=structuredClone(persisted.marketFeeds),hadRefresh=Object.hasOwn(globalThis,'refreshCompanies'),oldRefresh=globalThis.refreshCompanies;
let domesticCalls=0;
try{
 globalThis.refreshCompanies=async previous=>{domesticCalls++;assert.deepEqual(previous,initial.companies,'Scheduled UK connector must receive only domestic state');return {records:[{...domesticRecord,id:'fsa-ew-scheduled-fixture'}],statuses:[{id:'uk-fsa-approved',status:'connected',detail:'Fixture UK refresh',count:1}],errors:[],retrievedAt:new Date().toISOString()};};
 response=await worker.fetch(ownerRequest('https://private.example/api/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope:'companies'})}),env);
 assert.equal(response.status,200);const refreshed=await response.json();assert.equal(domesticCalls,1);assert.equal(refreshed.run.status,'succeeded');
 assert.deepEqual(persisted.internationalCompanies,beforeScheduled,'A scheduled UK refresh must not discard international data or source health');
 assert.deepEqual(persisted.dataset.markets,beforeTrade);assert.deepEqual(persisted.marketFeeds,beforePrices);assert.deepEqual(persisted.automaticUpdates,initial.automaticUpdates);
 shown=await get('/api/companies');assert(shown.records.some(r=>r.id==='fsa-ew-scheduled-fixture'));assert(shown.records.some(r=>r.id===india.id));
}finally{if(hadRefresh)globalThis.refreshCompanies=oldRefresh;else delete globalThis.refreshCompanies;}

console.log(JSON.stringify({passed:true,bootstrapRecords:official.records.length,bootstrapCountries:new Set(official.records.map(r=>r.country)).size,sourcePolicies:policies.length,invalidCases:invalidCases.length,checked:['real bootstrap policy validation','atomic schema/provenance/contact/expiry rejection','cross-origin and concurrency protection','separate international persistence','trade/prices/news/schedule preservation','merged current-only GET and coverage','complete-source replacement','partial/error retention','untouched source status/error retention','scheduled UK refresh preserves international directory']}));
