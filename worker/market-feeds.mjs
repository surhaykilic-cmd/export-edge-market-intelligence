// Public publisher feeds only. No full news articles, paid keys, or arbitrary URL proxying.
const FEED_DEFINITIONS=[
 {id:'fao-newsroom',publisher:'FAO Newsroom',url:'https://www.fao.org/feeds/fao-newsroom-rss',hosts:['www.fao.org','fao.org'],tags:['Food & agriculture','Policy & research']},
 {id:'fews-net-markets',publisher:'FEWS NET',url:'https://fews.net/taxonomy/term/41/feed',hosts:['fews.net','www.fews.net'],tags:['Markets & trade','Food security']}
];
const FPMA_BASE='https://fpma.fao.org/giews/v4/global/price_module/api/v1/FpmaSeriePrice/';
const EC_BASE='https://api.tech.ec.europa.eu/agrifood/api/';
const FPMA_SELECTED=[
 {id:'050a093f-268a-415b-8e1a-a87033d1908f',name:'Dairy: Skim Milk Powder (European & Oceania average indicative export prices, f.o.b)',source:'Dairy Market News (USDA)',currency:'USD',unit:'tonne'},
 {id:'23397429-69b2-472f-bfed-19d0bd943937',name:'Dairy: Cheddar Cheese (European & Oceania average indicative export prices, f.o.b)',source:'Dairy Market News (USDA)',currency:'USD',unit:'tonne'},
 {id:'70d0099b-3cda-4997-9bf1-dfc86ed1927c',name:'Dairy: Whole Milk Powder (European & Oceania average indicative export prices, f.o.b)',source:'Dairy Market News (USDA)',currency:'USD',unit:'tonne'},
 {id:'a2d52862-666a-45d6-8887-2f6a56205000',name:'Dairy: Butter (European & Oceania average indicative export prices, f.o.b)',source:'Dairy Market News (USDA)',currency:'USD',unit:'tonne'},
 {id:'5db69fc0-1005-440b-9e6c-065d1acec33e',name:'Maize (US No. 2, Yellow)',source:'USDA',currency:'USD',unit:'tonne'},
 {id:'e8861d50-8c9a-4da7-badc-ef1699139ea4',name:'Soybean (US, No. 1 yellow, f.o.b.)',source:'USDA',currency:'USD',unit:'tonne'},
 {id:'1351def4-604a-4b21-815f-1e24792a5942',name:'Rice (Super Kernel White Basmati 2%)',source:'FAO rice price update',currency:'USD',unit:'tonne'},
 {id:'d01dd4c4-6815-4af9-aabf-3bf1c6b02bb3',name:'Rice (US No. 2, 4% Long Grain)',source:'FAO rice price update',currency:'USD',unit:'tonne'}
];
const entityText=value=>String(value??'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#x([a-f0-9]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&amp;/g,'&');
const plain=value=>entityText(entityText(value)).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const slug=value=>String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const stableId=value=>{let hash=2166136261;for(const c of String(value)){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16);};
const tag=(item,name)=>item.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`,'i'))?.[1]??'';
const isoDate=value=>{const match=String(value??'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return match?`${match[3]}-${match[2]}-${match[1]}`:null;};
const dateText=date=>`${String(date.getUTCDate()).padStart(2,'0')}/${String(date.getUTCMonth()+1).padStart(2,'0')}/${date.getUTCFullYear()}`;
export function parseOfficialFeed(xml,definition,retrievedAt=new Date().toISOString()){
 if(typeof xml!=='string'||!/<rss\b|<feed\b/i.test(xml)||xml.length>1_000_000)throw Error('Invalid or oversized official feed');
 const entries=[...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];const items=[];
 for(const [,entry] of entries.slice(0,40)){
  const title=plain(tag(entry,'title')).slice(0,350),url=entityText(tag(entry,'link')).trim();let resolved;
  try{resolved=new URL(url);if(resolved.protocol!=='https:'||!definition.hosts.includes(resolved.hostname))continue;}catch{continue;}
  const rawDate=plain(tag(entry,'pubDate')||tag(entry,'dc:date')),parsed=Date.parse(rawDate);
  if(!title||!Number.isFinite(parsed))continue;
  items.push({id:`${definition.id}-${stableId(resolved.href)}`,title,url:resolved.href,publisher:definition.publisher,sourceId:definition.id,publishedAt:new Date(parsed).toISOString(),dateType:'publisher_feed_date',summary:'Publisher-listed report or news item. Open the official source for the complete analysis.',tags:definition.tags,retrievedAt,sourceUrl:definition.url,notes:'Feed publication/update date as supplied by the publisher; not independently established as the original report date.'});
 }
 if(!items.length)throw Error('Official feed returned no valid dated items');return items;
}
export function parseECPrice(value){
 if(typeof value!=='string'||!/^\s*€/.test(value))return null;
 let cleaned=value.replace(/[€\s\u00a0]/g,'');if(cleaned.includes(',')&&cleaned.includes('.'))cleaned=cleaned.lastIndexOf(',')>cleaned.lastIndexOf('.')?cleaned.replace(/\./g,'').replace(',','.'):cleaned.replace(/,/g,'');else if(cleaned.includes(','))cleaned=cleaned.replace(',','.');
 if(!/^\d+(\.\d+)?$/.test(cleaned))return null;const amount=+cleaned;return Number.isFinite(amount)&&amount>=0?amount:null;
}
export function normalizeECPrices(rows,sector,sourceUrl,retrievedAt=new Date().toISOString()){
 if(!Array.isArray(rows)||rows.length>5000)throw Error('Invalid or oversized EC price response');const grouped=new Map();
 for(const r of rows){
  if(!['FR','DE','NL'].includes(r.memberStateCode))throw Error('EC response includes an unrequested country');
  const value=parseECPrice(r.price),period=isoDate(r.beginDate),endDate=isoDate(r.endDate),unit=String(r.unit??'');if(value==null||!period||!endDate||!['TONNES','100KG'].includes(unit))continue;
  const product=r.productName||r.product;if(!product||!r.memberStateName)continue;
  const signature=[sector,r.memberStateCode,product,r.marketName||'',r.stageName||'',unit],id=`ec-${sector}-${stableId(signature.join('|'))}`;
  if(!grouped.has(id))grouped.set(id,{id,name:[product,r.memberStateName,r.marketName].filter(Boolean).join(' · '),product,country:r.memberStateName,countryCode:r.memberStateCode,market:r.marketName??null,stage:r.stageName??null,unit:`EUR / ${unit}`,originalUnit:unit,currency:'EUR',source:'European Commission DG AGRI',sourceId:`ec-agrifood-${sector}`,sourceUrl,frequency:'Weekly',retrievedAt,license:'European Commission reuse policy; retain attribution and source definitions.',termsUrl:'https://commission.europa.eu/legal-notice_en',notes:'Reported representative market prices, not supplier offers. Currency and original source unit are preserved; no unit conversion or HS matching is applied.',observations:[]});
  const series=grouped.get(id);if(series.observations.some(o=>o.period===period)){const previous=series.observations.find(o=>o.period===period);if(previous.value!==value)throw Error('Conflicting EC observations share a series and reporting period');continue;}
  series.observations.push({period,endDate,value,reportedPrice:r.price,sourceReferencePeriod:r.referencePeriod??null,weekNumber:r.weekNumber??null});
 }
 for(const series of grouped.values())series.observations.sort((a,b)=>a.period.localeCompare(b.period));
 if(!grouped.size)throw Error('No supported euro-denominated EC price observations');return [...grouped.values()];
}
export function normalizeFPMAPrices(response,selection,sourceUrl,retrievedAt=new Date().toISOString()){
 if(response?.next)throw Error('FPMA response is paginated; incomplete batch retained without replacement');if(!Array.isArray(response?.results))throw Error('Invalid FPMA price response');
 const definitions=new Map(selection.map(s=>[s.id,s])),out=[];
 for(const r of response.results){const d=definitions.get(r.uuid);if(!d)throw Error('Unrequested FPMA series returned');const observations=[],keys=new Set();
  if(!Array.isArray(r.datapoints))throw Error('Invalid FPMA datapoints');
  for(const point of r.datapoints){const period=String(point.date??'').slice(0,7),value=point.price_value;if(!/^\d{4}-\d{2}$/.test(period)||period<'2020-01')continue;if(value==null||value===''||!Number.isFinite(+value)||+value<0)continue;if(keys.has(period))throw Error('Duplicate FPMA monthly observation');keys.add(period);observations.push({period,value:+value,sourceDate:point.date,periodicity:point.periodicity,conversionFactor:point.conversion_factor??null});}
  observations.sort((a,b)=>a.period.localeCompare(b.period));if(!observations.length)continue;
  out.push({id:`fpma-${d.id}`,name:d.name,unit:`${d.currency} / ${d.unit}`,originalUnit:d.unit,currency:d.currency,source:`${d.source} via FAO FPMA`,underlyingSource:d.source,sourceId:'fao-fpma-observations',sourceSeriesId:d.id,sourceUrl,frequency:'Monthly',retrievedAt,metadataCheckedAt:'2026-10-29',notes:'International reference price, not a live offer. Original price_value, currency and unit are preserved. USD/real adjustments are not substituted. Historical series may be discontinued.',termsUrl:'https://www.fao.org/contact-us/terms/db-terms-of-use/en/',license:'FAO database terms and source-specific exceptions apply; retain original USDA/FAO publisher attribution.',observations});
 }if(!out.length)throw Error('FPMA batch returned no valid selected observations');return out;
}
function mergeSeries(previous,incoming){const result=new Map(previous.map(s=>[s.id,s]));for(const s of incoming){const prior=result.get(s.id);if(prior){const points=new Map((prior.observations||[]).map(o=>[o.period,o]));for(const p of s.observations)points.set(p.period,p);s.observations=[...points.values()].sort((a,b)=>a.period.localeCompare(b.period));}result.set(s.id,s);}return [...result.values()];}
export async function refreshMarketFeeds(previous={prices:{series:[]},news:{items:[]}},options={}){
 const now=new Date(options.now||Date.now()),retrievedAt=now.toISOString(),fetcher=options.fetch||fetch,timeoutMs=Math.min(25000,Math.max(500,options.timeoutMs||20000)),statuses=[],errors=[];
 let series=[...(previous.prices?.series||[])],items=[...(previous.news?.items||[])],priceSuccess=false,newsSuccess=false;const tasks=[];
 const read=async(url,kind)=>{const response=await fetcher(url,{headers:{Accept:kind==='json'?'application/json':'application/rss+xml, application/xml'},signal:AbortSignal.timeout(timeoutMs)});if(!response.ok)throw Error(`Source returned HTTP ${response.status}`);const body=await response.text();if(body.length>4_000_000)throw Error('Source response exceeds connector limit');return kind==='json'?JSON.parse(body):body;};
 const mark=(id,count,detail)=>statuses.push({id,status:'connected',detail,count,lastAttemptAt:retrievedAt,lastSuccessAt:retrievedAt});
 const fail=(id,error)=>{errors.push({source:id,error:error.message});const prior=previous.statuses?.find(s=>s.id===id);statuses.push({id,status:'error',detail:'Update failed; earlier source observations or items retained.',lastAttemptAt:retrievedAt,...(prior?.lastSuccessAt?{lastSuccessAt:prior.lastSuccessAt}:{})});};
 const from=new Date(now);from.setUTCDate(from.getUTCDate()-180);
 if(options.scope!=='news')for(const sector of ['cereal','dairy'])tasks.push(async()=>{const id=`ec-agrifood-${sector}`,url=new URL(EC_BASE+sector+'/prices');url.searchParams.set('memberStateCodes',sector==='cereal'?'FR':'DE,FR,NL');url.searchParams.set('beginDate',dateText(from));url.searchParams.set('endDate',dateText(now));try{const incoming=normalizeECPrices(await read(url.href,'json'),sector,url.href,retrievedAt);series=mergeSeries(series,incoming);priceSuccess=true;mark(id,incoming.length,'Weekly representative EU market prices; original units, market and stage definitions preserved.');}catch(e){fail(id,e);}});
 const catalog=new Map((options.fpmaCatalog||[]).map(s=>[s.id||s.uuid,s]));const selected=FPMA_SELECTED.map(s=>{const live=catalog.get(s.id);return live?{...s,name:live.name||live.commodity_name||s.name,source:live.source||live.source_name||s.source,currency:live.currency||s.currency,unit:live.unit||live.measure_unit_label||s.unit}:s;});
 const fpmaResults=[];if(options.scope!=='news')for(let n=0;n<selected.length;n+=4){const batch=selected.slice(n,n+4);tasks.push(async()=>{const url=new URL(FPMA_BASE);url.searchParams.set('uuid__in',batch.map(s=>s.id).join(','));url.searchParams.set('periodicity','monthly');try{fpmaResults.push({series:normalizeFPMAPrices(await read(url.href,'json'),batch,url.href,retrievedAt)});}catch(e){fpmaResults.push({error:e});}});}
 if(options.scope!=='prices')for(const definition of FEED_DEFINITIONS)tasks.push(async()=>{try{const incoming=parseOfficialFeed(await read(definition.url,'xml'),definition,retrievedAt);const map=new Map(items.map(i=>[i.id,i]));for(const item of incoming)map.set(item.id,item);items=[...map.values()];newsSuccess=true;mark(definition.id,incoming.length,'Official feed headlines, publisher dates and links only; no full article copying.');}catch(e){fail(definition.id,e);}});
 let cursor=0;await Promise.all(Array.from({length:3},async()=>{while(cursor<tasks.length){const task=tasks[cursor++];await task();}}));
 const good=fpmaResults.filter(r=>r.series),bad=fpmaResults.filter(r=>r.error);for(const r of good)series=mergeSeries(series,r.series);
 if(good.length){priceSuccess=true;mark('fao-fpma-observations',good.reduce((n,r)=>n+r.series.length,0),`${good.length} selected monthly-price batches connected${bad.length?'; incomplete batches retained previous observations':''}. Only selected USDA/FAO-labelled origins are imported.`);}
 if(bad.length){if(!good.length){fail('fao-fpma-observations',bad[0].error);for(const r of bad.slice(1))errors.push({source:'fao-fpma-observations',error:r.error.message});}else{for(const r of bad)errors.push({source:'fao-fpma-observations',error:r.error.message});const status=statuses.find(s=>s.id==='fao-fpma-observations');status.status='partial';}}
 items=items.filter(i=>Number.isFinite(Date.parse(i.publishedAt))).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));const perSource=new Map();items=items.filter(i=>{const count=(perSource.get(i.sourceId)||0)+1;perSource.set(i.sourceId,count);return count<=40;});
 const nextStatuses=new Map((previous.statuses||[]).map(s=>[s.id,s]));for(const s of statuses)nextStatuses.set(s.id,s);const queried=new Set(statuses.map(s=>s.id));const retainedErrors=(previous.errors||[]).filter(e=>!queried.has(e.source||e.sourceId));
 return {...previous,prices:{...previous.prices,series,retrievedAt:priceSuccess?retrievedAt:previous.prices?.retrievedAt??null,lastAttemptAt:retrievedAt,notes:'Multiple public reference-price publishers. Preserve each series currency, unit, specification and frequency; do not treat these as supplier offers.'},news:{...previous.news,items:items.slice(0,80),retrievedAt:newsSuccess?retrievedAt:previous.news?.retrievedAt??null,lastAttemptAt:retrievedAt,notes:'Publisher feed dates may describe republication or update dates. Open the official source to verify context and currency.'},statuses:[...nextStatuses.values()],errors:[...retainedErrors,...errors]};
}
