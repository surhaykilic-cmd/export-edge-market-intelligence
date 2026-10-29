import {csvFields} from './parsers.mjs';

const FSA_PAGE='https://data.food.gov.uk/catalog/datasets/1e61736a-2a1a-4c6a-b8b1-e45912ebc8e3';
const FSA_FILE='https://fsaopendata.blob.core.windows.net/opendatacatalog/Approved-Establishments-01-10-2026.csv';
const FTS_API='https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?limit=100';
const COMPANY_NOTES='Discovery evidence only. Food-establishment approval does not verify export capability, commercial availability, product quality or willingness to supply. Procurement notices describe published purchasing or award evidence, not current buying intent. Confirm directly before relying on any organisation.';
const organisation=/\b(ltd|limited|plc|llp|inc|gmbh|company|co-operative|cooperative|foods?|meats?|fisheries|fish|dairy|creamery|seafoods?|poultry|group|wholesale|processors?|processing|cheese|butchers?|bacon|ham|farm|farms|larder|fresh|trading|provisions|produce|egg|eggs)\b/i;
async function companyFetch(url,type='json'){
 const response=await fetch(url,{headers:{Accept:type==='json'?'application/json':type==='csv'?'text/csv':'text/html'},signal:AbortSignal.timeout(18000)});
 if(!response.ok){const error=Error(`Official source returned HTTP ${response.status}`);error.status=response.status;error.retryAfter=Number(response.headers.get('retry-after'))||null;throw error;}
 const declared=+response.headers.get('content-length');if(declared>12_000_000)throw Error('Company source exceeds safe size');
 if(type==='json')return response.json();const text=await response.text();if(text.length>12_000_000)throw Error('Company source exceeds safe size');return text;
}
const productColumns=[
 ['Section_I__Meat_of_domestic_ungulates','Meat of domestic ungulates'],['Section_II__Meat_from_poultry','Poultry meat'],['Section_III__Meat_of_farmed_game','Farmed game'],['Section_IV__Wild_game_meat','Wild game'],['Section_V__Minced_meat','Minced meat and meat preparations'],['Section_VI__Meat_products','Meat products'],['Section_VII__Live_bivalve','Live bivalve molluscs'],['Section_VIII__Fishery_products','Fishery products'],['Section_IX__Raw_milk','Milk and dairy'],['Section_X__Eggs','Eggs and egg products'],['Section_XI__Frog','Frogs legs and snails'],['Section_XII__Rendered','Rendered animal fats'],['Section_XIV__Gelatine','Gelatine'],['Section_XV__Collagen','Collagen'],['Section_I__Sprouts','Sprouts']
];
export function parseApprovedEstablishments(text,url,checkedAt,limit=1000){
 const fileDate=url.match(/(\d{2})-(\d{2})-(\d{4}|\d{2})\.csv(?:$|\?)/i),sourcePublishedAt=fileDate?`${fileDate[3].length===2?'20'+fileDate[3]:fileDate[3]}-${fileDate[2]}-${fileDate[1]}`:null;
 const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).map(s=>s.replace(/\r$/,'')).filter(Boolean),headers=csvFields(lines.shift()||'');
 for(const required of ['AppNo','TradingName','Country','All_Activities'])if(!headers.includes(required))throw Error('FSA register columns changed');
 const out=[],seen=new Set();
 for(const line of lines){const cols=csvFields(line),r=Object.fromEntries(headers.map((key,i)=>[key,cols[i]||'']));
  const name=r.TradingName.trim(),approval=r.AppNo.trim();if(!name||!approval||!organisation.test(name)||seen.has(approval))continue;seen.add(approval);
  const products=productColumns.filter(([pattern])=>headers.some(h=>h.includes(pattern)&&r[h].trim())).map(([,label])=>label);
  out.push({id:'fsa-ew-'+approval,name,country:'United Kingdom',region:r.Country,role:'supplier-discovery',products:products.length?products:['Food of animal origin'],activities:[r.All_Activities.trim()].filter(Boolean),website:null,source:'Food Standards Agency approved food establishments (England and Wales)',sourceId:'uk-fsa-approved',sourceUrl:url,sourcePublishedAt,evidence:`Approval ${approval} appears in the official England/Wales register${sourcePublishedAt?' dated '+sourcePublishedAt:''}. Listed activity: ${r.All_Activities.trim()}. Plant-level approval is not a verified supplier or export offer.`,verification:'Registry-listed',roleConfidence:'Official establishment activity; commercial supplier role unverified',establishmentId:approval,retrievedAt:checkedAt,noticeDate:null,noticeStatus:null,license:'Open Government Licence v3.0'});
  if(out.length>=limit)break;
 }
 if(out.length<25)throw Error('Too few eligible FSA establishment records');return out;
}
function cpvClassifications(t){return [t?.classification,...(t?.additionalClassifications||[]),...(t?.items||[]).flatMap(i=>[i.classification,...(i.additionalClassifications||[])])].filter(Boolean);}
function foodEvidence(release){
 const codes=cpvClassifications(release.tender).filter(c=>String(c.scheme??'CPV').toUpperCase()==='CPV');
 // CPV 03 also covers timber, landscaping and biodiversity credits; it is not sufficient food evidence.
 const relevant=codes.filter(c=>/^(15|555|032|0331|03131)/.test(String(c.id||'')));
 const title=String(release.tender?.title||'');
 if(!relevant.length&&!/\b(food|catering|grocer(?:y|ies)|milk|meat|fruits?|vegetables?|dairy|rice|wheat|maize|grain|cereal|poultry|beef|coffee|cocoa|tea|fish|seafood)\b/i.test(title))return null;
 return {products:[...new Set(relevant.map(c=>c.description||`CPV ${c.id}`))],codes:relevant.map(c=>String(c.id)),title};
}
export function parseFoodProcurement(releases,checkedAt){
 const out=[];for(const r of releases){const food=foodEvidence(r);if(!food)continue;
  if(!/^\d{6}-\d{4}$/.test(String(r.id)))continue;const sourceUrl=`https://www.find-tender.service.gov.uk/Notice/${r.id}`;
  const products=food.products.length?food.products:['Food-related procurement (title match; inspect notice)'];
  const base={country:'United Kingdom',products,activities:[food.title],website:null,source:'UK Find a Tender published OCDS notice',sourceId:'uk-find-tender',sourceUrl,verification:'Procurement evidence',retrievedAt:checkedAt,noticeDate:r.date||null,noticeStatus:r.tender?.status||null,noticeId:r.id,procurementId:r.ocid||null,cpvCodes:food.codes,license:'Open Government Licence v3.0'};
  if(r.buyer?.name){out.push({...base,id:'fts-buyer-'+String(r.buyer.id||r.buyer.name),name:r.buyer.name,role:'buyer-discovery',roleConfidence:'Named buyer in a published food-related procurement notice; current intent unverified',evidence:`Named buyer for “${food.title}”. Notice ${r.id}; source procurement status ${r.tender?.status||'not specified'}. A published/awarded notice is not a live buying enquiry.`});}
  for(const award of r.awards||[])for(const supplier of award.suppliers||[]){if(!supplier.name||!organisation.test(supplier.name))continue;out.push({...base,id:'fts-supplier-'+String(supplier.id||supplier.name),name:supplier.name,role:'supplier-discovery',roleConfidence:'Named award supplier in a published food-related procurement notice; present availability unverified',noticeStatus:`${r.tender?.status||'unknown'}; award ${award.status||'unspecified'}`,evidence:`Named supplier in award for “${food.title}”. Notice ${r.id}; award status ${award.status||'not specified'}. Historical award evidence does not establish current availability or export capability.`});}
 }
 return out;
}
function dedupCompanyRecords(records,limit){const by=new Map();for(const r of records){const old=by.get(r.id);if(!old||String(r.noticeDate||r.retrievedAt)>String(old.noticeDate||old.retrievedAt))by.set(r.id,r);}return [...by.values()].sort((a,b)=>String(b.noticeDate||'').localeCompare(String(a.noticeDate||''))||a.name.localeCompare(b.name)).slice(0,limit);}
export async function refreshCompanies(previous={records:[]},options={}){
 const checkedAt=new Date().toISOString(),errors=[],statuses=[];let supplierRecords=(previous.records||[]).filter(r=>r.sourceId==='uk-fsa-approved'),procurementRecords=(previous.records||[]).filter(r=>r.sourceId==='uk-find-tender'&&foodEvidence({tender:{title:(r.activities||[]).join(' '),additionalClassifications:(r.cpvCodes||[]).map(id=>({scheme:'CPV',id}))}})),sourceFiles={...(previous.sourceFiles||{})};
 // Read the public catalog to discover the latest released CSV; retain a verified direct file if catalog discovery fails.
 let csvUrl=sourceFiles['uk-fsa-approved']||FSA_FILE,discoveryError=null;
 try{const page=await companyFetch(FSA_PAGE,'html');const links=[...page.matchAll(/href=["']([^"']+)["']/gi)].map(m=>m[1].replace(/&amp;/g,'&'));const latest=links.find(u=>/^https:\/\/fsaopendata\.blob\.core\.windows\.net\/opendatacatalog\//i.test(u)&&/\.csv(?:$|\?)/i.test(u));if(!latest)throw Error('No official FSA CSV link found');csvUrl=latest;}catch(e){discoveryError=e.message;}
 try{supplierRecords=parseApprovedEstablishments(await companyFetch(csvUrl,'csv'),csvUrl,checkedAt,1000);sourceFiles['uk-fsa-approved']=csvUrl;statuses.push({id:'uk-fsa-approved',status:'connected',detail:`Bounded sample of ${supplierRecords.length} plant-level approved establishments. Commercial/export capability not verified.${discoveryError?' Catalog discovery unavailable; retained verified direct-file URL and its source snapshot date.':''}`,lastSuccessAt:checkedAt,lastAttemptAt:checkedAt,count:supplierRecords.length,sourceUrl:csvUrl,...(discoveryError?{discoveryWarning:discoveryError}:{})});}catch(e){errors.push({source:'uk-fsa-approved',error:e.message});statuses.push({id:'uk-fsa-approved',status:'error',detail:'Register refresh failed; earlier establishment evidence retained.',lastAttemptAt:checkedAt,count:supplierRecords.length});}
 let newRecords=[],pages=0,nextAllowedRequestAt=previous.nextAllowedRequestAt||null;
 try{if(nextAllowedRequestAt&&Date.now()<Date.parse(nextAllowedRequestAt)){const error=Error('Procurement provider cooldown is still active');error.cooldown=true;throw error;}let next=FTS_API;const maxPages=Math.max(1,Math.min(6,Number(options.buyerPages)||2));
  while(next&&pages<maxPages){const url=new URL(next);if(url.origin!=='https://www.find-tender.service.gov.uk'||url.pathname!=='/api/1.0/ocdsReleasePackages')throw Error('Unexpected procurement pagination URL');const data=await companyFetch(url.href);if(!Array.isArray(data.releases))throw Error('OCDS release layout changed');newRecords.push(...parseFoodProcurement(data.releases,checkedAt));next=data.links?.next||null;pages++;if(next&&pages<maxPages)await new Promise(resolve=>setTimeout(resolve,1200));}
  // Reconcile evidence by organisation ID; expiry of buying intent is not inferred from old notices.
  procurementRecords=dedupCompanyRecords([...newRecords,...procurementRecords],150);nextAllowedRequestAt=null;statuses.push({id:'uk-find-tender',status:'connected',detail:`${pages} bounded public notice pages checked; ${newRecords.length} food-related buyer/award-supplier evidence rows found. Earlier discovery evidence retained; notices are not live buying intent.`,lastSuccessAt:checkedAt,lastAttemptAt:checkedAt,count:procurementRecords.length});
 }catch(e){if(e.status===429&&e.retryAfter)nextAllowedRequestAt=new Date(Date.now()+e.retryAfter*1000).toISOString();procurementRecords=dedupCompanyRecords([...newRecords,...procurementRecords],150);errors.push({source:'uk-find-tender',error:e.message,...(e.retryAfter?{retryAfterSeconds:e.retryAfter}:{})});statuses.push({id:'uk-find-tender',status:pages?'connected':'error',detail:`${pages} public notice pages completed before the refresh stopped. Earlier and successfully retrieved discovery evidence retained.${e.status===429?' Provider rate limit respected; no immediate retry.':e.cooldown?' Request skipped until the saved provider cooldown expires.':''}`,lastAttemptAt:checkedAt,...(pages?{lastSuccessAt:checkedAt}:{}),count:procurementRecords.length,...(e.retryAfter?{retryAfterSeconds:e.retryAfter}:{}),...(nextAllowedRequestAt?{nextAllowedRequestAt}:{})});}
 return {records:[...supplierRecords,...procurementRecords],retrievedAt:statuses.some(s=>s.status==='connected')?checkedAt:previous.retrievedAt||null,lastAttemptAt:checkedAt,sourceFiles,statuses,errors,nextAllowedRequestAt,notes:COMPANY_NOTES,scope:'England/Wales approved-establishment sample and UK food-related procurement evidence; not a global verified buyer/supplier directory.'};
}
