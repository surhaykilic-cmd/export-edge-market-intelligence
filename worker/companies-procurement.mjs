// Published official procurement evidence only: no private contacts or inferred trade intent.
const TED_SEARCH='https://api.ted.europa.eu/v3/notices/search';
const TED_FIELDS=['publication-number','notice-title','buyer-name','buyer-country','buyer-identifier','publication-date','classification-cpv','notice-type'];
export const PROCUREMENT_SOURCE_POLICIES=[{id:'eu-ted-food-buyers',hosts:['ted.europa.eu'],countries:['Austria','Belgium','Bulgaria','Croatia','Cyprus','Czechia','Denmark','Estonia','Finland','France','Germany','Greece','Hungary','Ireland','Italy','Latvia','Lithuania','Luxembourg','Malta','Netherlands','Poland','Portugal','Romania','Slovakia','Slovenia','Spain','Sweden','Norway','Iceland','Switzerland','Liechtenstein','Moldova','Ukraine','Serbia','Albania','North Macedonia','Montenegro','Bosnia and Herzegovina','Turkiye','Georgia','Armenia','United States','Canada','Australia','New Zealand','Japan','South Korea','India','Brazil','Chile','Peru','South Africa'],roles:['buyer-discovery'],idPrefix:'ted-buyer-'}];
const TED_COUNTRIES={AUT:'Austria',BEL:'Belgium',BGR:'Bulgaria',HRV:'Croatia',CYP:'Cyprus',CZE:'Czechia',DNK:'Denmark',EST:'Estonia',FIN:'Finland',FRA:'France',DEU:'Germany',GRC:'Greece',HUN:'Hungary',IRL:'Ireland',ITA:'Italy',LVA:'Latvia',LTU:'Lithuania',LUX:'Luxembourg',MLT:'Malta',NLD:'Netherlands',POL:'Poland',PRT:'Portugal',ROU:'Romania',SVK:'Slovakia',SVN:'Slovenia',ESP:'Spain',SWE:'Sweden',NOR:'Norway',ISL:'Iceland',CHE:'Switzerland',LIE:'Liechtenstein',MDA:'Moldova',UKR:'Ukraine',SRB:'Serbia',ALB:'Albania',MKD:'North Macedonia',MNE:'Montenegro',BIH:'Bosnia and Herzegovina',TUR:'Turkiye',GEO:'Georgia',ARM:'Armenia',GBR:'United Kingdom',USA:'United States',CAN:'Canada',AUS:'Australia',NZL:'New Zealand',JPN:'Japan',KOR:'South Korea',IND:'India',BRA:'Brazil',CHL:'Chile',PER:'Peru',ZAF:'South Africa'};
const TED_NOTES='International discovery from published TED food-related procurement notices. Buyer-country is reported by TED, not inferred from contract location. Procurement history is not verified current buying intent or an established trading relationship. Notices with ambiguous multiple buyer countries are omitted.';
const textValues=value=>Array.isArray(value)?value.filter(v=>typeof v==='string'):typeof value==='string'?[value]:[];
const titleValue=value=>typeof value==='string'?value:typeof value==='object'&&value?textValues(value.eng)[0]||textValues(value.en)[0]||Object.values(value).flatMap(textValues)[0]||'':'';
const hash=value=>{let n=2166136261;for(const c of value){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return(n>>>0).toString(16);};
const identityName=name=>name.normalize('NFKC').toLocaleLowerCase('und').replace(/\s+/g,' ').trim();
const registrationValue=value=>typeof value==='string'&&value.trim().length>0&&value.length<=200&&!/@|https?:\/\//i.test(value)?value.trim():null;
const buyerIdentity=(country,name,registrationId)=>`ted-buyer-${country.toLowerCase()}-${registrationId?'org-':''}${hash(registrationId||identityName(name))}`;
async function limitedTedJson(response){
 const maxBytes=15*1024*1024;if(Number(response.headers.get('content-length'))>maxBytes){await response.body?.cancel();throw Error('TED response exceeds the 15 MiB safety limit');}
 if(!response.body)throw Error('TED response body is missing');const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0,body='';
 try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>maxBytes)throw Error('TED response exceeds the 15 MiB safety limit');body+=decoder.decode(part.value,{stream:true});}body+=decoder.decode();return JSON.parse(body);}catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
}
function foodCPV(codes){return [...new Set(textValues(codes).filter(code=>/^\d{8}$/.test(code)&&(/^(15|032|0331|555)/.test(code))&&!/^1599/.test(code)))];}
function foodLabel(code){const prefix=code.slice(0,3);return({151:'Meat and meat products',152:'Fish and seafood',153:'Fruit, vegetables and related products',154:'Animal and vegetable oils',155:'Dairy products',156:'Grain and starch products',157:'Animal feed',158:'Food products',159:'Beverages','032':'Cereals, potatoes, vegetables and fruit','033':'Fish and aquaculture products',555:'Catering and canteen services'})[prefix]||'Food and beverage procurement';}
export function parseTedFoodBuyers(payload,checkedAt=new Date().toISOString()){
 if(!payload||!Array.isArray(payload.notices)||payload.notices.length>250)throw Error('TED search response shape changed');const records=[];
 for(const notice of payload.notices){
  const number=String(notice['publication-number']||'');if(!/^\d{1,8}-\d{4}$/.test(number))continue;
  const countries=[...new Set(textValues(notice['buyer-country']))];if(countries.length!==1||!TED_COUNTRIES[countries[0]]||countries[0]==='GBR')continue;
  const cpvCodes=foodCPV(notice['classification-cpv']);if(!cpvCodes.length)continue;
  const title=titleValue(notice['notice-title']).trim().slice(0,1200);if(!title)continue;
  // Tobacco-only notices must not enter a food directory under broad parent CPV15.
  if(/\b(tobacco|cigarettes?|cigars?|tobac|tabac)\b/i.test(title)&&!cpvCodes.some(c=>/^(151|152|153|154|155|156|157|158|032|0331|555)/.test(c)))continue;
  const namesField=notice['buyer-name'];const names=typeof namesField==='object'&&!Array.isArray(namesField)&&namesField?textValues(namesField.eng).length?textValues(namesField.eng):textValues(namesField.en).length?textValues(namesField.en):textValues(Object.values(namesField)[0]):textValues(namesField);
  const date=String(notice['publication-date']||'').match(/^\d{4}-\d{2}-\d{2}/)?.[0]||null;if(!date||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)continue;
  const country=TED_COUNTRIES[countries[0]],sourceUrl=`https://ted.europa.eu/en/notice/-/detail/${number}`,noticeType=String(notice['notice-type']||'published-notice');
  for(const rawName of [...new Set(names)]){const name=rawName.replace(/\s+/g,' ').trim();if(name.length<3||name.length>350||/@|https?:\/\//i.test(name))continue;
   const identifiers=textValues(notice['buyer-identifier']),registrationId=names.length===1&&identifiers.length===1?registrationValue(identifiers[0]):null;
   records.push({id:buyerIdentity(countries[0],name,registrationId),name,country,countryCode:countries[0],role:'buyer-discovery',products:[...new Set(cpvCodes.map(foodLabel))],activities:[title],website:null,source:'TED published public procurement notices',sourceId:'eu-ted-food-buyers',sourceUrl,evidence:`Named buyer in published food-related notice ${number}: “${title}”. TED reports buyer country ${countries[0]}; notice type ${noticeType}. Publication is evidence of procurement activity, not proof of current buying intent, export/import activity or a verified trading relationship.`,verification:'Procurement evidence',retrievedAt:checkedAt,noticeDate:date,noticeDateRaw:notice['publication-date'],noticeStatus:`Published ${noticeType}`,noticeType,noticeId:number,cpvCodes,...(registrationId?{registrationId}:{}),roleConfidence:'Named public-procurement buyer; current intent and commercial trade role unverified',license:'TED published-notice Search API reuse with source attribution; inspect original notice',sourceDocumentation:'https://docs.ted.europa.eu/api/latest/search.html'});
  }
 }
 return records;
}
export function mergeProcurementBuyers(previous,incoming,limit=500){
 const all=[...previous,...incoming].filter(r=>r.sourceId==='eu-ted-food-buyers'),aliases=new Map(),map=new Map();
 // An exact name/country match can reconcile older evidence lacking an identifier,
 // but contradictory official identifiers are never merged by name.
 for(const record of all){const registrationId=registrationValue(record.registrationId);if(!registrationId)continue;const alias=`${record.countryCode}|${identityName(record.name)}`;if(!aliases.has(alias))aliases.set(alias,new Set());aliases.get(alias).add(registrationId);}
 for(const record of all){const alias=`${record.countryCode}|${identityName(record.name)}`,known=aliases.get(alias),registrationId=registrationValue(record.registrationId)||(known?.size===1?[...known][0]:null),id=buyerIdentity(record.countryCode,record.name,registrationId),candidate={...record,id,...(registrationId?{registrationId}:{})},old=map.get(id);if(!old||String(candidate.noticeDate)>String(old.noticeDate))map.set(id,candidate);}
 return [...map.values()].sort((a,b)=>String(b.noticeDate).localeCompare(String(a.noticeDate))||a.country.localeCompare(b.country)||a.name.localeCompare(b.name)).slice(0,limit);
}
export async function refreshProcurementCompanies(previous={records:[]},options={}){
 const checkedAt=new Date().toISOString(),prior=(previous.records||[]).filter(r=>r.sourceId==='eu-ted-food-buyers'),errors=[],statuses=[];let records=prior,nextAllowedRequestAt=previous.nextAllowedRequestAt||null;
 const lastSuccessAt=previous.statuses?.find(s=>s.id==='eu-ted-food-buyers')?.lastSuccessAt;
 if(nextAllowedRequestAt&&Date.parse(nextAllowedRequestAt)>Date.now())return {...previous,records,statuses:[{id:'eu-ted-food-buyers',status:'error',detail:'TED provider cooldown is active; earlier procurement evidence retained.',lastAttemptAt:checkedAt,...(lastSuccessAt?{lastSuccessAt}:{}),count:records.length,nextAllowedRequestAt}],errors:[{source:'eu-ted-food-buyers',error:'Provider cooldown active'}],notes:TED_NOTES};
 const since=new Date(options.now||Date.now());since.setUTCMonth(since.getUTCMonth()-18);const date=since.toISOString().slice(0,10).replace(/-/g,'');
 // One hierarchy-aware food query gives international breadth without per-country request bursts.
 const queries=[`classification-cpv=15000000 AND publication-date>=${date} SORT BY publication-date DESC`,`(classification-cpv=03200000 OR classification-cpv=03310000 OR classification-cpv=55500000) AND publication-date>=${date} SORT BY publication-date DESC`];let completed=0,incomingCount=0;
 try{
  for(const query of queries){
  const response=await(options.fetch||fetch)(TED_SEARCH,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({query,fields:TED_FIELDS,limit:100,page:1,scope:'ALL',paginationMode:'PAGE_NUMBER'}),signal:AbortSignal.timeout(20000)});
  if(!response.ok){const e=Error(`TED Search API HTTP ${response.status}`);e.status=response.status;const rawRetry=response.headers.get('retry-after'),seconds=Number(rawRetry),dateRetry=Date.parse(rawRetry||'');e.retryAfter=Number.isFinite(seconds)&&seconds>0?Math.min(86400,seconds):Number.isFinite(dateRetry)&&dateRetry>Date.now()?Math.min(86400,Math.ceil((dateRetry-Date.now())/1000)):response.status===429?120:null;await response.body?.cancel();throw e;}
  const payload=await limitedTedJson(response);const incoming=parseTedFoodBuyers(payload,checkedAt);if(!incoming.length)throw Error('TED returned no unambiguous food buyers; prior records retained');
  records=mergeProcurementBuyers(records,incoming,500);completed++;incomingCount+=incoming.length;nextAllowedRequestAt=null;if(completed<queries.length)await new Promise(r=>setTimeout(r,800));
  }
  statuses.push({id:'eu-ted-food-buyers',status:'connected',detail:`${completed} bounded official TED food queries; ${incomingCount} unambiguous food-buyer evidence rows; ${new Set(records.map(r=>r.country)).size} reported buyer countries. Published notice history is not live buying intent.`,count:records.length,lastAttemptAt:checkedAt,lastSuccessAt:checkedAt,sourceUrl:TED_SEARCH});
 }catch(e){if(e.status===429&&e.retryAfter)nextAllowedRequestAt=new Date(Date.now()+e.retryAfter*1000).toISOString();errors.push({source:'eu-ted-food-buyers',error:e.message,...(e.retryAfter?{retryAfterSeconds:e.retryAfter}:{})});statuses.push({id:'eu-ted-food-buyers',status:completed?'partial':'error',detail:`${completed} TED queries completed before refresh stopped; earlier and successfully retrieved procurement evidence retained. No automatic immediate retry.`,count:records.length,lastAttemptAt:checkedAt,...(completed?{lastSuccessAt:checkedAt}:lastSuccessAt?{lastSuccessAt}:{}),...(nextAllowedRequestAt?{nextAllowedRequestAt}:{})});}
 return {records,retrievedAt:completed?checkedAt:previous.retrievedAt||null,lastAttemptAt:checkedAt,statuses,errors,nextAllowedRequestAt,notes:TED_NOTES,scope:'Bounded published food-procurement buyers reported by TED, beyond the UK. No inferred suppliers or personal contacts.'};
}
