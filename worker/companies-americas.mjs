import {csvFields} from './parsers.mjs';

// Only organisation/plant fields are retained. Source contact/address columns are discarded.
export const SOURCE_POLICIES = [
  {id:'usda-ams-dairy-approved',hosts:['apps.ams.usda.gov'],countries:['United States'],roles:['supplier-discovery'],idPrefix:'usda-ams-dairy-'},
  {id:'ca-ontario-meat-plants',hosts:['data.ontario.ca'],countries:['Canada'],roles:['supplier-discovery'],idPrefix:'ca-ontario-meat-'}
];
export const AMERICAS_SOURCE_URLS = {
  usa:'https://apps.ams.usda.gov/dairy/ApprovedPlantList/',
  canadaMetadata:'https://data.ontario.ca/api/3/action/package_show?id=provincially-licensed-meat-plants',
  canada:'https://data.ontario.ca/dataset/a763088c-018d-48b7-bf47-3027a8c725b8/resource/ee6d559a-78de-40e6-b2ba-ad3c4a674b96/download/1._all_meat_plants.csv'
};
const AMERICAS_NOTES = [
  'Plant-level discovery candidates from official public registries; an organisation can operate several plants. Registry listing does not verify a commercial offer, current capacity, contact, or export eligibility.',
  'Canada coverage in this connector is Ontario provincially licensed meat plants. These are domestic candidates; provincial licensing does not establish permission to export outside Ontario.',
  'USDA dairy approval is specific to listed operations/product codes. Section II plant operations meet facilities/sanitation requirements; product grading eligibility is conditional on approved dairy ingredients and inspection.',
  'CFIA federal meat registry and USDA FSIS MPI are documented source candidates. CFIA redistribution/adaptation requires Crown copyright review; the FSIS host returned HTTP 403. Neither is counted as a connected open-data feed.'
];
const americasBusiness = /\b(ltd|limited|inc|incorporated|llc|llp|corp|corporation|company|co[.-]?op(?:erative)?|cooperative|foods?|meats?|packers?|packing|abattoirs?|butchers?|boucherie|charcuterie|sausage|poultry|fisheries|seafoods?|dair(?:y|ies|ymen)|cream(?:ery)?|cheese|milk|farms?|producers?|processing|processors?|provisions|produce|wholesale|trading|group|lactalis|agropur|saputo|nestle|leprino|darigold|kraft|glanbia|hilmar|mwc)\b/i;
const americasPublicAgency = /\b(university|universit[eé]|college|ministry|minist[eè]re|government|gouvernement|inspection agency|usda|cfia)\b/i;
const americasText = value => String(value||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/&#x([\da-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&apos;|&#39;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/\s+/g,' ').trim();
const americasCleanName = name => {
  const value=americasText(name).replace(/\*+$/,'').trim();
  if(value.length<3||value.length>240||americasPublicAgency.test(value)||!americasBusiness.test(value)||/@|https?:|\b(?:phone|email|contact)\b/i.test(value))return null;
  return value;
};
const americasCellValues = row => [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>americasText(m[1]));
const americasLimit = (value,fallback,max) => Number.isInteger(value)&&value>0?Math.min(value,max):fallback;

const AMERICAS_US_STATES = new Map([
  ['01','Alabama'],['02','Alaska'],['04','Arizona'],['05','Arkansas'],['06','California'],['08','Colorado'],['09','Connecticut'],['10','Delaware'],['11','District of Columbia'],['12','Florida'],['13','Georgia'],['15','Hawaii'],['16','Idaho'],['17','Illinois'],['18','Indiana'],['19','Iowa'],['20','Kansas'],['21','Kentucky'],['22','Louisiana'],['23','Maine'],['24','Maryland'],['25','Massachusetts'],['26','Michigan'],['27','Minnesota'],['28','Mississippi'],['29','Missouri'],['30','Montana'],['31','Nebraska'],['32','Nevada'],['33','New Hampshire'],['34','New Jersey'],['35','New Mexico'],['36','New York'],['37','North Carolina'],['38','North Dakota'],['39','Ohio'],['40','Oklahoma'],['41','Oregon'],['42','Pennsylvania'],['44','Rhode Island'],['45','South Carolina'],['46','South Dakota'],['47','Tennessee'],['48','Texas'],['49','Utah'],['50','Vermont'],['51','Virginia'],['53','Washington'],['54','West Virginia'],['55','Wisconsin'],['56','Wyoming']
]);
const AMERICAS_DAIRY_GROUPS = {B:'Butter and milkfat',C:'Cheese',D:'Dry milk and dairy powders',F:'Frozen dairy products',M:'Milk and liquid dairy',W:'Whey and whey products',S:'Dairy specialty products',P:'Dairy processing and packaging'};

export function parseUSDADairyPlants(html,sourceUrl=AMERICAS_SOURCE_URLS.usa,retrievedAt=new Date().toISOString(),limit=1000) {
  if(!/Dairy Plants|Surveyed and|Approved for USDA/i.test(html)||!(/Plant Name/i.test(html)&&/Plt No/i.test(html)))throw Error('USDA dairy table identity/layout changed');
  const publication=americasText(html).match(/\b(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (20\d{2})\b/i);
  const sourcePublishedAt=publication?new Date(`${publication[1]} ${publication[2]}, ${publication[3]} 00:00:00 GMT`).toISOString().slice(0,10):null;
  const records=new Map();let state=null,stateCode=null,eligible=0;
  for(const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const cells=americasCellValues(match[1]);
    if(cells.length===1&&/colspan\s*=\s*["']?5\b/i.test(match[1])){
      const heading=cells[0].match(/^(\d{2})\s*-\s*(.+?)(?:\s+Continued)?$/i);
      // Assign country from the establishment's actual state section, never a destination market.
      if(heading&&AMERICAS_US_STATES.has(heading[1])&&heading[2].replace(/\s+Continued$/i,'').toUpperCase()===AMERICAS_US_STATES.get(heading[1]).toUpperCase()){
        stateCode=heading[1];state=AMERICAS_US_STATES.get(stateCode);
      }else {state=null;stateCode=null;}
      continue;
    }
    if(cells.length!==5||!state||!stateCode)continue;
    const [plantNo,,rawName,,codeText]=cells,name=americasCleanName(rawName),codes=[...new Set(codeText.match(/\b[BCDFMSWP]\d+\b/g)||[])];
    if(!name||!/^\d[\dA-Za-z-]{0,19}$/.test(plantNo)||!codes.length)continue;
    const id=`usda-ams-dairy-${stateCode}-${plantNo}`,products=[...new Set(codes.map(c=>AMERICAS_DAIRY_GROUPS[c[0]]).filter(Boolean))];
    const sectionII=codes.some(c=>c.startsWith('P'));
    if(records.has(id)){
      const record=records.get(id);if(record.name!==name)throw Error('Conflicting USDA establishment identity');record.products=[...new Set([...record.products,...products])];
      const combinedCodes=[...new Set([...record.productCodes,...codes])];record.productCodes=combinedCodes;
      record.activities=[...new Set([...record.activities,sectionII?'USDA Section II processing/packaging operations':'USDA Section I dairy operations'])];
      record.evidence=`USDA AMS dairy plant ${record.establishmentId}; listed operation/product codes: ${combinedCodes.join(', ')}. Section II P-code operations meet facilities/sanitation requirements; grading eligibility is conditional. Plant-level listing; commercial supply and export eligibility not verified.`;
      continue;
    }
    eligible++;
    records.set(id,{id,name,country:'United States',region:state,role:'supplier-discovery',products,activities:[sectionII?'USDA Section II processing/packaging operations':'USDA Section I dairy operations'],website:null,source:'USDA AMS — Dairy Plants Surveyed and Approved for USDA Grading Service',sourceId:'usda-ams-dairy-approved',sourceUrl,evidence:`USDA AMS dairy plant ${stateCode}-${plantNo}; listed operation/product codes: ${codes.join(', ')}. ${sectionII?'Section II P-code operations meet facilities/sanitation requirements; grading eligibility is conditional. ':''}Plant-level listing; commercial supply and export eligibility not verified.`,verification:'Registry-listed',retrievedAt,sourcePublishedAt,establishmentId:`${stateCode}-${plantNo}`,sourcePlantNumber:plantNo,productCodes:codes,license:'US Government public-domain information; attribution: U.S. Department of Agriculture',roleConfidence:'Official plant listing; supplier suitability and export permission require review'});
  }
  return {records:[...records.values()].slice(0,americasLimit(limit,1000,1000)),eligible,sourcePublishedAt};
}

const AMERICAS_ONTARIO_PRODUCTS = [
  [/^Beef_/i,'Beef'],[/^Buffalo,Yak_/i,'Buffalo and yak meat'],[/^Veal, Light Calves_/i,'Veal'],[/^Goats, Lamb, Sheep_/i,'Lamb, sheep and goat meat'],[/^Deer, Elk_/i,'Venison'],[/^Pigs_/i,'Pork'],[/^Chicken, Fowl_/i,'Chicken and poultry'],[/^Turkeys_/i,'Turkey'],[/^Ducks, Geese_/i,'Duck and goose meat'],[/^Fancy Poultry_/i,'Specialty poultry'],[/^Rabbits_/i,'Rabbit meat'],[/^Emus, Ostrich, Rhea_/i,'Ratite meat'],[/^Alpaca, Llama_/i,'Alpaca and llama meat']
];
export function parseOntarioMeatPlants(csv,sourceUrl=AMERICAS_SOURCE_URLS.canada,retrievedAt=new Date().toISOString(),sourcePublishedAt=null,limit=800) {
  const lines=String(csv).replace(/^\uFEFF/,'').split(/\r?\n/).filter(line=>line.trim()),headers=csvFields(lines.shift()||'');
  const findIndex=pattern=>headers.findIndex(h=>pattern.test(h));
  const nameIndex=findIndex(/^Plant Name_/i),idIndex=findIndex(/^Plant Number_/i),provinceIndex=headers.indexOf('Province'),fsmpIndex=findIndex(/^FSMP_/i),fpIndex=findIndex(/^FP_/i);
  if(nameIndex<0||idIndex<0||provinceIndex<0||fsmpIndex<0||fpIndex<0)throw Error('Ontario meat plant CSV headers changed');
  const mappings=AMERICAS_ONTARIO_PRODUCTS.map(([pattern,product])=>[findIndex(pattern),product]);
  if(mappings.some(([index])=>index<0))throw Error('Ontario animal-class columns changed');
  const records=new Map();
  for(const line of lines){
    const cells=csvFields(line);if(cells.length!==headers.length)throw Error('Ontario meat plant CSV row width changed');
    const name=americasCleanName(cells[nameIndex]),plantNo=cells[idIndex]?.trim();
    // Only the establishment location field sets geography. Do not emit any address/contact fields.
    if(!name||cells[provinceIndex]?.trim()!=='ON'||!/^\d{1,8}$/.test(plantNo))continue;
    const products=mappings.filter(([i])=>cells[i]?.trim()==='1').map(([,label])=>label),activities=[];
    if(products.length)activities.push('Provincially licensed abattoir');
    if(cells[fsmpIndex]?.trim()==='1')activities.push('Freestanding meat processing');
    if(cells[fpIndex]?.trim()==='1')activities.push('Further meat processing at abattoir');
    if(!products.length&&!activities.length)continue;
    if(!products.length)products.push('Meat and meat products');
    const id=`ca-ontario-meat-${plantNo}`;if(records.has(id))throw Error('Duplicate Ontario establishment number');
    records.set(id,{id,name,country:'Canada',region:'Ontario',role:'supplier-discovery',products,activities,website:null,source:'Ontario Ministry of Agriculture, Food and Agribusiness — Provincially licensed meat plants',sourceId:'ca-ontario-meat-plants',sourceUrl,evidence:`Ontario provincially licensed meat plant ${plantNo}. Domestic supplier-discovery candidate; provincial plant licensing does not establish permission to trade outside Ontario or export internationally. Current offers/capacity not verified.`,verification:'Registry-listed',retrievedAt,sourcePublishedAt,establishmentId:plantNo,license:'Open Government Licence – Ontario; contains information licensed under the Open Government Licence – Ontario',roleConfidence:'Official provincial plant listing; domestic supplier suitability requires review'});
  }
  return {records:[...records.values()].slice(0,americasLimit(limit,800,800)),eligible:records.size,sourcePublishedAt};
}

async function americasFetch(url,options={}) {
  const response=await (options.fetch||fetch)(url,{headers:{Accept:options.accept||'text/html,application/json,text/csv;q=0.9'},signal:options.signal||AbortSignal.timeout(options.timeoutMs||18000),redirect:'error'});
  if(!response.ok){const error=Error(`Official source returned HTTP ${response.status}`);error.status=response.status;const retry=Number(response.headers.get('retry-after'));if(Number.isFinite(retry)&&retry>0)error.retryAfter=Math.min(retry,86400);throw error;}
  if(Number(response.headers.get('content-length'))>1_500_000)throw Error('Official company source exceeds size limit');
  const buffer=await response.arrayBuffer();if(buffer.byteLength>1_500_000)throw Error('Official company source exceeds size limit');
  return {response,buffer};
}

export async function refreshAmericasCompanies(previous={records:[]},options={}) {
  const checkedAt=options.checkedAt||new Date().toISOString(),checkedMs=Date.parse(checkedAt),priorRecords=Array.isArray(previous.records)?previous.records:[],owned=new Set(SOURCE_POLICIES.map(s=>s.id));
  const next=[...priorRecords.filter(r=>!owned.has(r.sourceId))],statuses=[],errors=[],notes=[...AMERICAS_NOTES];let successes=0;
  const jobs=[
    {id:'usda-ams-dairy-approved',url:AMERICAS_SOURCE_URLS.usa,run:async()=>{
      const {buffer}=await americasFetch(AMERICAS_SOURCE_URLS.usa,{...options,signal:AbortSignal.timeout(options.timeoutMs||18000)});
      return parseUSDADairyPlants(new TextDecoder().decode(buffer),AMERICAS_SOURCE_URLS.usa,checkedAt,options.limitUSA);
    }},
    {id:'ca-ontario-meat-plants',url:AMERICAS_SOURCE_URLS.canada,run:async()=>{
      const sourceOptions={...options,signal:AbortSignal.timeout(options.timeoutMs||18000)}, {buffer:metadataBuffer}=await americasFetch(AMERICAS_SOURCE_URLS.canadaMetadata,{...sourceOptions,accept:'application/json'}),metadata=JSON.parse(new TextDecoder().decode(metadataBuffer));
      if(!metadata.success||metadata.result?.license_id!=='OGL-ON-1.0')throw Error('Ontario dataset open-licence metadata changed');
      const resource=metadata.result.resources?.find(r=>r.id==='ee6d559a-78de-40e6-b2ba-ad3c4a674b96'),url=resource?.url;
      if(!url||new URL(url).hostname!=='data.ontario.ca'||new URL(url).protocol!=='https:'||!url.includes('/download/'))throw Error('Ontario official resource URL changed');
      const published=resource.last_modified&&/^20\d{2}-\d{2}-\d{2}/.test(resource.last_modified)?resource.last_modified.slice(0,10):null;
      const {buffer}=await americasFetch(url,{...sourceOptions,accept:'text/csv'});
      // Ontario CSV currently uses Windows-1252; the bilingual header labels contain accented text.
      return parseOntarioMeatPlants(new TextDecoder('windows-1252').decode(buffer),url,checkedAt,published,options.limitCanada);
    }}
  ];
  await Promise.all(jobs.map(async job=>{
    const oldStatus=previous.statuses?.find(s=>s.id===job.id),retained=priorRecords.filter(r=>r.sourceId===job.id);
    if(oldStatus?.nextRetryAt&&Date.parse(oldStatus.nextRetryAt)>checkedMs&&!options.ignoreCooldown){
      next.push(...retained);statuses.push({...oldStatus,status:'cooldown',count:retained.length,lastAttemptAt:oldStatus.lastAttemptAt,detail:`Source retry cooldown; ${retained.length} prior records retained.`});return;
    }
    try{
      const result=await job.run();if(result.records.length<10)throw Error('Too few recognised food establishments; prior source records retained');
      if(retained.length>=40&&result.records.length<retained.length/2)throw Error('Unexpected source count reduction; prior records retained pending review');
      next.push(...result.records);successes++;
      statuses.push({id:job.id,status:'connected',detail:`${result.records.length} of ${result.eligible} eligible organisation-named plants retained from official source. Plant-level discovery evidence; commercial/export suitability requires review.`,count:result.records.length,sourceEligibleCount:result.eligible,sourceUrl:result.records[0]?.sourceUrl||job.url,sourcePublishedAt:result.sourcePublishedAt,lastSuccessAt:checkedAt,lastAttemptAt:checkedAt});
    }catch(error){
      const cooldown=error.retryAfter||(error.status===429?21600:error.status===403?86400:3600),nextRetryAt=new Date(checkedMs+cooldown*1000).toISOString();
      next.push(...retained);errors.push({source:job.id,error:error.message,at:checkedAt});statuses.push({id:job.id,status:'error',detail:`${error.message}; ${retained.length} previous source records retained.`,count:retained.length,sourceUrl:job.url,lastSuccessAt:oldStatus?.lastSuccessAt||retained[0]?.retrievedAt||null,lastAttemptAt:checkedAt,nextRetryAt});
    }
  }));
  return {kind:'company-discovery',records:next.sort((a,b)=>a.id.localeCompare(b.id)),retrievedAt:successes?checkedAt:previous.retrievedAt||null,lastAttemptAt:checkedAt,statuses:statuses.sort((a,b)=>a.id.localeCompare(b.id)),errors,notes};
}
