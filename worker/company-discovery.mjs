import {refreshAmericasCompanies} from './companies-americas.mjs';
import {refreshInternationalCompanies} from './companies-international.mjs';
import {refreshProcurementCompanies} from './companies-procurement.mjs';

export function companyRecordCurrent(record,now=Date.now()){
 const expiry=record.approvalExpiresAt??record.approvalExpiryDate??record.expiryDate;
 if(expiry){const stamp=Date.parse(expiry);if(!Number.isFinite(stamp)||stamp+86400000<=now)return false;}
 return record.isActive!==false&&!/^(inactive|suspended|withdrawn|revoked|expired|cancelled|canceled)$/i.test(String(record.approvalStatus||'').trim());
}
export function validateDiscoverySnapshot(snapshot,policies,now=Date.now()){
 if(!snapshot||!Array.isArray(snapshot.records)||!snapshot.records.length||snapshot.records.length>6000)throw Error('Bounded non-empty discovery records required');
 const policyMap=new Map(policies.map(p=>[p.id,p])),ids=new Set();
 for(const r of snapshot.records){
  const p=policyMap.get(r.sourceId);if(!p)throw Error('Unapproved discovery source');
  if(typeof r.id!=='string'||r.id.length>250||!r.id.startsWith(p.idPrefix)||ids.has(r.id))throw Error('Invalid or duplicate discovery identity');ids.add(r.id);
  if(typeof r.name!=='string'||r.name.trim().length<2||r.name.length>500||typeof r.country!=='string'||!p.countries.includes(r.country)||!p.roles.includes(r.role))throw Error('Discovery organization country or role does not match source policy');
  const url=new URL(r.sourceUrl);if(url.protocol!=='https:'||url.username||url.password||!p.hosts.includes(url.hostname))throw Error('Discovery evidence URL does not match official source');
  if(!['Registry-listed','Procurement evidence'].includes(r.verification)||typeof r.evidence!=='string'||r.evidence.length<20||r.evidence.length>6000||!Number.isFinite(Date.parse(r.retrievedAt)))throw Error('Evidence and checked date required; trading verification must not be implied');
  if(r.role==='buyer-discovery'&&r.verification!=='Procurement evidence')throw Error('Buyer discovery requires explicit procurement evidence');
  if(!Array.isArray(r.products)||!Array.isArray(r.activities)||r.products.length>60||r.activities.length>60||[...r.products,...r.activities].some(v=>typeof v!=='string'||v.length>1500))throw Error('Bounded food product/activity labels required');
  if(['email','phone','telephone','address','contact','contactName','contactEmail','contactPhone','postalCode'].some(key=>r[key]!=null))throw Error('Personal contact or address fields are excluded');
  if(r.website!=null){const website=new URL(r.website);if(website.protocol!=='https:'||website.username||website.password)throw Error('Unsafe company website');}
  if(!companyRecordCurrent(r,now))throw Error('Expired or inactive establishment must not be imported as a current discovery record');
 }
 for(const s of snapshot.statuses||[])if(!policyMap.has(s.id)||!['connected','partial','error','cooldown','stale','snapshot'].includes(s.status))throw Error('Unapproved discovery status');
 return snapshot.records;
}
export function discoveryCoverage(records){
 const byCountry=new Map();for(const r of records){const row=byCountry.get(r.country)||{country:r.country,records:0,buyers:0,suppliers:0,sources:new Set()};row.records++;if(r.role==='buyer-discovery')row.buyers++;else row.suppliers++;row.sources.add(r.sourceId);byCountry.set(r.country,row);}
 return [...byCountry.values()].map(r=>({...r,sources:r.sources.size})).sort((a,b)=>a.country.localeCompare(b.country));
}
export function mergeDiscoverySnapshots(previous,incoming,policies){
 const records=[];for(const p of policies){const prior=(previous.records||[]).filter(r=>r.sourceId===p.id),next=incoming.records.filter(r=>r.sourceId===p.id),status=incoming.statuses?.find(s=>s.id===p.id);
  if(status?.status==='connected'&&next.length)records.push(...next);
  else{const merged=new Map(prior.map(r=>[r.id,r]));for(const r of next)merged.set(r.id,r);records.push(...merged.values());}
 }
 const statuses=new Map((previous.statuses||[]).map(s=>[s.id,s]));for(const s of incoming.statuses||[])statuses.set(s.id,s);
 const touched=new Set((incoming.statuses||[]).map(s=>s.id)),errors=[...(previous.errors||[]).filter(e=>!touched.has(e.source||e.sourceId)),...(incoming.errors||[])];
 return {...previous,...incoming,records,statuses:[...statuses.values()],errors,coverage:discoveryCoverage(records.filter(r=>companyRecordCurrent(r)))};
}
export async function refreshInternationalDirectory(previous={records:[]},options={}){
 const groups=options.sourceGroups;if(!Array.isArray(groups)||!groups.length)throw Error('Official source groups are required');
 const runners={americas:refreshAmericasCompanies,international:refreshInternationalCompanies,procurement:refreshProcurementCompanies};
 const result=await Promise.all(groups.map(async group=>{
  const part={...previous,records:(previous.records||[]).filter(r=>group.sourceIds.includes(r.sourceId)),statuses:(previous.statuses||[]).filter(s=>group.sourceIds.includes(s.id))};
  try{return await runners[group.key](part,options);}catch(e){return {...part,errors:[{source:group.key,error:e.message}],statuses:group.sourceIds.map(id=>({id,status:'error',detail:'Connector failed; previous source evidence retained.',lastAttemptAt:new Date().toISOString()}))};}
 }));
 const records=result.flatMap(r=>r.records||[]).filter(r=>companyRecordCurrent(r)),statuses=result.flatMap(r=>r.statuses||[]),errors=result.flatMap(r=>r.errors||[]),success=statuses.some(s=>s.status==='connected'||s.status==='partial');
 return {records,statuses,errors,sourceGroups:groups,coverage:discoveryCoverage(records.filter(r=>companyRecordCurrent(r))),retrievedAt:success?new Date().toISOString():previous.retrievedAt||null,lastAttemptAt:new Date().toISOString(),notes:'International discovery evidence from official public registers and food-procurement notices. Establishments and procurement organizations are distinct record types; neither implies a verified trading relationship. Countries refer to the source organization or establishment, not a trade destination.'};
}
