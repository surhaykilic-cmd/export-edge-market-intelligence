import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AMERICAS_SOURCE_URLS,SOURCE_POLICIES,parseUSDADairyPlants,parseOntarioMeatPlants,refreshAmericasCompanies} from '../worker/companies-americas.mjs';

const checkedAt='2026-10-29T12:00:00.000Z';
const usaHeader='<h1>Dairy Plants Surveyed and Approved for USDA Grading Service</h1><p>October 20, 2026</p><table><tr><th>Plt No</th><th></th><th>Plant Name</th><th>City</th><th>Codes</th></tr>';
const state=(code,name)=>`<tr><td colspan=5>${code} - ${name}</td></tr>`;
const plant=(id,name,codes)=>`<tr><td>${id}</td><td>*</td><td>${name}</td><td>Private location</td><td>${codes}</td></tr>`;
const usaHTML=usaHeader+state('06','CALIFORNIA')+plant('0031','Example Dairy Inc.','B1, D1, M1')+plant('0031','Example Dairy Inc.','P1')+state('06','CALIFORNIA Continued')+plant('99','Example Cheese LLC','C17')+plant('100','Ministry of Dairy','M1')+plant('101','Jane Citizen','C3')+state('99','NEW ZEALAND')+plant('91','Example Dairy Ltd.','M1')+'</table>';
const us=parseUSDADairyPlants(usaHTML,undefined,checkedAt);
assert.equal(us.sourcePublishedAt,'2026-10-20');assert.equal(us.records.length,2);
assert.equal(us.records[0].id,'usda-ams-dairy-06-0031');assert.equal(us.records[0].establishmentId,'06-0031');
assert(us.records.every(r=>r.country==='United States'&&r.region==='California'));
assert(us.records[0].products.includes('Butter and milkfat'));assert(us.records[0].products.includes('Dairy processing and packaging'));
assert(us.records[0].evidence.includes('grading eligibility is conditional'));assert.equal(us.records[0].productCodes.length,4);
assert.equal(us.eligible,2);assert(!JSON.stringify(us).includes('Private location'));
assert.throws(()=>parseUSDADairyPlants('<table><td>Access denied</td></table>'),/identity\/layout/);

const headers=["Plant Name_ Nom de l'usine","Plant Number_No. de l'usine",'Address_Adresse','City_Ville','Province','Postal Code_Code postal','Telephone_Téléphone','Latitude','Longitude','Beef_Boeuf','Buffalo,Yak_Bison, Yack','Veal, Light Calves_Veaux de boucherie, Veaux légers','Goats, Lamb, Sheep_Chèvres, Agneaux, Moutons','Deer, Elk_Cerfs, Élans ','Pigs_Porcs','Chicken, Fowl_Poulet, Oiseaux de basse-cour','Turkeys_Dindes','Ducks, Geese_Canards, Oies','Fancy Poultry_Volaille à chair fine','Rabbits_Lapins','Emus, Ostrich, Rhea_Émeus, Autruches, Nandous','Alpaca, Llama_Alpaga, Lama','FSMP_ETVA','FP_ETVA avec abattoir',"Animal Class_Catégorie d'animaux"];
const csvQuote=v=>'"'+String(v).replaceAll('"','""')+'"';
const caRow=(name,id,province='ON',beef='1',processing='0')=>[name,id,'Private street address','Private city',province,'A1A 1A1','+1 555 555 5555','0','0',beef,...Array(12).fill('0'),processing,'0','Beef'];
const caCSV=[headers,caRow('Example Meat Ltd.','0012'),caRow('Example Processing Inc.','0014','ON','0','1'),caRow('Jane Citizen','0015'),caRow('Example Outside Meat Ltd.','0016','BC')].map(row=>row.map(csvQuote).join(',')).join('\r\n');
const ca=parseOntarioMeatPlants(caCSV,undefined,checkedAt,'2026-10-06');assert.equal(ca.records.length,2);assert.equal(ca.records[0].establishmentId,'0012');
assert.equal(ca.records[0].country,'Canada');assert.equal(ca.records[0].region,'Ontario');assert(ca.records[0].products.includes('Beef'));
assert(ca.records[1].products.includes('Meat and meat products'));assert(ca.records[1].activities.includes('Freestanding meat processing'));
assert(ca.records.every(r=>r.evidence.includes('does not establish permission to trade outside Ontario')));
assert(!/Private street|Private city|555 555|A1A 1A1/.test(JSON.stringify(ca)));
assert.throws(()=>parseOntarioMeatPlants(caCSV+'\r\n'+caRow('Other Meat Ltd.','0012').map(csvQuote).join(',')),/Duplicate Ontario/);
assert.throws(()=>parseOntarioMeatPlants('Name,Address\nBad,private'),/headers changed/);

const manyUSA=usaHeader+state('06','CALIFORNIA')+Array.from({length:15},(_,i)=>plant(String(i+1),'Example Dairy Inc. '+i,'M1, C17')).join('')+'</table>';
const manyCanada=[headers,...Array.from({length:15},(_,i)=>caRow('Example Meat Ltd. '+i,String(i+1).padStart(4,'0')))].map(row=>row.map(csvQuote).join(',')).join('\n');
const metadata={success:true,result:{license_id:'OGL-ON-1.0',resources:[{id:'ee6d559a-78de-40e6-b2ba-ad3c4a674b96',url:AMERICAS_SOURCE_URLS.canada,last_modified:'2026-10-06T19:11:34'}]}};
let calls=[];
const fixtureFetch=async(url,opts)=>{calls.push({url,signal:opts.signal});return new Response(url===AMERICAS_SOURCE_URLS.usa?manyUSA:url===AMERICAS_SOURCE_URLS.canadaMetadata?JSON.stringify(metadata):manyCanada);};
const previous={records:[{id:'unrelated',sourceId:'uk-fsa-approved',name:'Keep UK',country:'United Kingdom'}]};
const result=await refreshAmericasCompanies(previous,{fetch:fixtureFetch,checkedAt});
assert.equal(calls.length,3);assert.equal(result.records.length,31);assert.equal(result.errors.length,0);assert(result.statuses.every(s=>s.status==='connected'));
assert(result.records.some(r=>r.id==='unrelated'));assert.equal(result.retrievedAt,checkedAt);
// Both sequential Canadian requests share one deadline, bounding the full source refresh.
assert.equal(calls.find(c=>c.url===AMERICAS_SOURCE_URLS.canadaMetadata).signal,calls.find(c=>c.url===AMERICAS_SOURCE_URLS.canada).signal);
const outage=await refreshAmericasCompanies(result,{fetch:async()=>new Response('Unavailable',{status:429,headers:{'retry-after':'7200'}}),checkedAt:'2026-10-29T13:00:00.000Z'});
assert.deepEqual(outage.records,result.records);assert.equal(outage.retrievedAt,checkedAt);assert.equal(outage.errors.length,2);assert(outage.statuses.every(s=>s.nextRetryAt==='2026-10-29T15:00:00.000Z'));
const cooldown=await refreshAmericasCompanies(outage,{fetch:()=>{throw Error('Cooldown must make no request');},checkedAt:'2026-10-29T14:00:00.000Z'});
assert.deepEqual(cooldown.records,result.records);assert(cooldown.statuses.every(s=>s.status==='cooldown'));
const changedLicence=await refreshAmericasCompanies(result,{fetch:async(url,opts)=>url===AMERICAS_SOURCE_URLS.canadaMetadata?new Response(JSON.stringify({...metadata,result:{...metadata.result,license_id:'restricted'}})):fixtureFetch(url,opts),checkedAt});
assert(changedLicence.errors.some(e=>e.source==='ca-ontario-meat-plants'));assert.equal(changedLicence.records.filter(r=>r.sourceId==='ca-ontario-meat-plants').length,15);

const live=JSON.parse(readFileSync('data/companies-americas.json','utf8'));
assert(live.records.length>=500);assert(live.records.filter(r=>r.country==='Canada').length>=300);assert(live.records.filter(r=>r.country==='United States').length>=100);
assert.equal(new Set(live.records.map(r=>r.id)).size,live.records.length);
const disallowedFields=['address','phone','email','contact','contactName','latitude','longitude','postalCode','city'];
for(const record of live.records){
  assert(!disallowedFields.some(field=>Object.hasOwn(record,field)));assert.equal(record.role,'supplier-discovery');assert.equal(record.verification,'Registry-listed');assert(record.establishmentId);assert(record.retrievedAt);assert(record.evidence);assert.equal(record.website,null);
  const policy=SOURCE_POLICIES.find(s=>s.id===record.sourceId);assert(policy);assert(record.id.startsWith(policy.idPrefix));assert(policy.countries.includes(record.country));assert(policy.hosts.includes(new URL(record.sourceUrl).hostname));assert(record.license);
}
assert(live.statuses.every(s=>s.status==='connected'&&s.count===live.records.filter(r=>r.sourceId===s.id).length));
console.log(`Passed Americas connectors: ${live.records.length} real official plants; source/country IDs, dairy section merging, Ontario scope, contact exclusion, 3-call bound, shared deadline, changed-licence rejection, outage retention and cooldown.`);
