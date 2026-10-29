import {ownerRequest,ownerEnv} from './auth-fixture.mjs';
import assert from 'node:assert/strict';
import {createWorker,mergeTrade} from '../worker/index.mjs';
const country={code:76,country:'Brazil'},products=[{hs:'0901',product:'Coffee'}],original={markets:[{code:76,hs:'0901',records:[{year:2024,flow:'X',value:100}],sourceUrls:[]}]};
let data=structuredClone(original);
mergeTrade(data,country,products,2024,{data:[]},'2026-10-29');assert.equal(data.markets[0].records[0].value,100,'Empty responses must retain earlier observations');
assert.throws(()=>mergeTrade(data,country,products,2024,{data:[{reporterCode:999,cmdCode:'0901',partnerCode:0,period:2024,flowCode:'X',primaryValue:9}]},'2026-10-29'),'Mismatched source dimensions must be rejected');
mergeTrade(data,country,products,2024,{data:[{reporterCode:76,cmdCode:'0901',partnerCode:0,period:2024,flowCode:'X',primaryValue:120,classificationCode:'H6'}]},'2026-10-29');assert.equal(data.markets[0].records.length,1);assert.equal(data.markets[0].records[0].value,120,'Revisions replace the matching observation, without duplicating it');
const validSourceRow={typeCode:'C',freqCode:'A',reporterCode:76,cmdCode:'0901',partnerCode:0,partner2Code:0,customsCode:'C00',motCode:0,period:'2024',flowCode:'X',primaryValue:120,classificationCode:'H6'};
for(const [name,patch] of [
 ['wrong reporter',{reporterCode:999}],['wrong HS heading',{cmdCode:'1001'}],['non-world partner',{partnerCode:156}],['second partner',{partner2Code:156}],['wrong year',{period:'2025'}],
 ['monthly frequency',{freqCode:'M'}],['services instead of goods',{typeCode:'S'}],['specific customs procedure',{customsCode:'C01'}],['specific transport mode',{motCode:1}],['unrequested re-export flow',{flowCode:'RX'}],
 ['negative trade value',{primaryValue:-1}],['infinite trade value',{primaryValue:Infinity}],['missing trade value',{primaryValue:null}]
]){
 const target=structuredClone(original),before=structuredClone(target);
 assert.throws(()=>mergeTrade(target,country,products,2024,{data:[{...validSourceRow,...patch}]},'2026-10-29'),`${name} must be rejected`);
 assert.deepEqual(target,before,`${name} must leave the previous snapshot unchanged`);
}
{
 const target=structuredClone(original),before=structuredClone(target);
 assert.throws(()=>mergeTrade(target,country,products,2024,{data:[validSourceRow,{...validSourceRow,primaryValue:999}]},'2026-10-29'),'Duplicate country/product/year/flow rows must fail instead of taking the last value');
 assert.deepEqual(target,before,'A duplicate response must not partially revise the prior snapshot');
 assert.throws(()=>mergeTrade(target,country,products,2024,{data:Array.from({length:500},()=>validSourceRow)},'2026-10-29'),'Preview-limit responses must be rejected as potentially truncated');
 assert.deepEqual(target,before,'A potentially truncated response must not change existing data');
}
{
 const target=structuredClone(original);target.markets[0].records.push({year:2024,flow:'M',value:50});
 mergeTrade(target,country,products,2024,{data:[validSourceRow]},'2026-10-29');
 assert.equal(target.markets[0].records.find(r=>r.flow==='M').value,50,'An omitted flow must retain the last known observation');
 mergeTrade(target,country,products,2024,{data:[{...validSourceRow,primaryValue:0}]},'2026-10-29');
 assert.equal(target.markets[0].records.find(r=>r.flow==='X').value,0,'A zero explicitly returned by the source is valid data');
}
let stored=null,etag=null;const BUCKET={async get(){return stored?{etag,json:async()=>JSON.parse(stored)}:null},async put(key,body,options){if(options.onlyIf.etagMatches&&options.onlyIf.etagMatches!==etag)return null;stored=body;etag='v1';return{etag};}};
const config={seed:original,catalog:{countries:[country],products},assets:{},sources:{sources:[]},revision:'test'};const worker=createWorker(config);
let r=await worker.fetch(ownerRequest('https://private.test/api/schedule-confirmed',{method:'POST',headers:{Origin:'https://malicious.test'},body:'{}'}),ownerEnv({BUCKET}));assert.equal(r.status,403,'Cross-origin writes must fail');
r=await worker.fetch(ownerRequest('https://private.test/api/schedule-confirmed',{method:'POST',body:JSON.stringify({id:'saved-schedule',enabled:true})}),ownerEnv({BUCKET}));assert.equal(r.status,200);
r=await worker.fetch(ownerRequest('https://private.test/api/status'),ownerEnv({BUCKET}));assert.equal((await r.json()).automaticUpdates.enabled,true,'Schedule state must survive separate requests');
r=await worker.fetch(ownerRequest('https://private.test/api/refresh',{method:'POST',body:'{"scope":"unknown"}'}),ownerEnv({BUCKET}));assert.equal(r.status,400);
console.log('Passed: retain-on-empty, strict source dimensions, duplicate/truncation rejection without partial mutation, revision merge, omitted-flow retention, explicit zero values, cross-origin protection, persisted schedule readback, scope validation.');
