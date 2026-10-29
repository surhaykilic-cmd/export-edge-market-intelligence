import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {mergeReturnedObservations} from './trade-merge.mjs';
const previous=[{year:2023,flow:'X',value:90},{year:2024,flow:'X',value:100},{year:2024,flow:'M',value:50}];
const partialRevision=mergeReturnedObservations(previous,[{year:2024,flow:'X',value:120}]);
assert.equal(partialRevision.find(r=>r.year===2024&&r.flow==='M').value,50,'Omitted import flow must retain the last known value');
assert.equal(partialRevision.find(r=>r.year===2024&&r.flow==='X').value,120,'A returned revision replaces its matching value');
assert.equal(partialRevision.find(r=>r.year===2023).value,90,'Unrequested years must retain their history');
assert.deepEqual(mergeReturnedObservations(previous,[]),previous,'An empty response must retain previous observations');
assert.equal(mergeReturnedObservations(previous,[{year:2024,flow:'X',value:0}]).find(r=>r.year===2024&&r.flow==='X').value,0,'Explicit source zero must remain zero');
assert.throws(()=>mergeReturnedObservations(previous,[{year:2024,flow:'X',value:120},{year:2024,flow:'X',value:999}]),'Duplicate source rows must be rejected');
assert.equal(previous.find(r=>r.year===2024&&r.flow==='X').value,100,'Failed merge must not mutate previous data');
const root=new URL('../',import.meta.url);
const catalog=JSON.parse(await fs.readFile(new URL('data/catalog.json',root),'utf8'));
const snapshot=JSON.parse(await fs.readFile(new URL('dist/data.json',root),'utf8'));
const checkpoint=JSON.parse(await fs.readFile(new URL('data/trade-checkpoint.json',root),'utf8'));
const reporters=JSON.parse((await fs.readFile(new URL('data/reporter-verification.json',root),'utf8')).replace(/^\uFEFF/,''));
assert.equal(catalog.products.length,40);
assert.equal(catalog.countries.length,30);
assert.equal(new Set(catalog.products.map(p=>p.hs)).size,catalog.products.length);
assert.equal(new Set(catalog.countries.map(c=>c.code)).size,catalog.countries.length);
assert.equal(reporters.length,catalog.countries.length);
assert.equal(snapshot.markets.length,catalog.countries.length*catalog.products.length);
assert.equal(new Set(snapshot.markets.map(m=>`${m.code}-${m.hs}`)).size,snapshot.markets.length);
let observations=0,verifiedAgainstSource=0;
for(const market of snapshot.markets){
 assert(catalog.countries.some(c=>c.code===market.code));
 assert(catalog.products.some(p=>p.hs===market.hs));
 const unique=new Set();
 for(const observation of market.records){
  const key=`${observation.year}-${observation.flow}`;
  assert(!unique.has(key),`Duplicate ${market.id} ${key}`);unique.add(key);
  assert(['X','M'].includes(observation.flow));
  assert.equal(typeof observation.value,'number');assert(Number.isFinite(observation.value)&&observation.value>=0);
  const fetched=checkpoint.queries[`${market.code}-${observation.year}`];
  const source=fetched?.data?.find(r=>r.hs===market.hs&&r.flow===observation.flow);
  if(source){assert.equal(observation.value,source.value,`Source value mismatch ${market.id} ${key}`);verifiedAgainstSource++;}
  observations++;
 }
 for(const sourceUrl of market.sourceUrls){const query=new URL(sourceUrl);assert.equal(query.hostname,'comtradeapi.un.org');assert.equal(query.searchParams.get('cmdCode'),market.hs);assert.equal(+query.searchParams.get('reporterCode'),market.code);assert.equal(query.searchParams.get('partnerCode'),'0');}
 for(const year of catalog.years){
  const fetched=checkpoint.queries[`${market.code}-${year}`];
  if(fetched?.status==='success'&&!fetched.data.some(r=>r.hs===market.hs)&&!market.records.some(r=>r.year===year))assert.equal(market.availability[year].status,'not_returned');
 }
}
console.log(JSON.stringify({passed:true,products:catalog.products.length,countries:catalog.countries.length,markets:snapshot.markets.length,marketsWithData:snapshot.markets.filter(m=>m.records.length).length,observations,verifiedAgainstSource,completedQueries:snapshot.collection.completedQueries,failedQueries:snapshot.collection.failedQueries,emptyQueries:snapshot.collection.emptyQueries}));
