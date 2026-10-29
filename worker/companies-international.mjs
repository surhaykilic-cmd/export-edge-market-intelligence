// Only public food-establishment registers; neither source establishes a commercial offer.
export const SOURCE_POLICIES = [
 {id:'in-eic-approved',hosts:['archive.eicindia.gov.in'],countries:['India'],roles:['supplier-discovery'],idPrefix:'in-eic-'},
 {id:'ie-fsai-approved',hosts:['oapi.fsai.ie'],countries:['Ireland'],roles:['supplier-discovery'],idPrefix:'ie-fsai-'}
];
const EIC_BASE='https://archive.eicindia.gov.in/WebApp1/pages/menuInfo/approvedCommoditiesList.xhtml';
const IRELAND_URL='https://oapi.fsai.ie/HSEApprovedEstablishments.aspx';
const INTERNATIONAL_NOTES='Official establishment approval is discovery evidence, not a verified supplier, current export offer, commercial availability, product quality or willingness to trade. India approvals with a past listed expiry or an explicit suspended/withdrawn status are excluded. Ireland does not publish an approval expiry in this list. No private contact details are imported.';
const disallowedStatus=/\b(withdrawn|suspended|inactive|revoked|cancelled|canceled)\b/i;
function plain(value){return String(value||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>{const cp=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):parseInt(n,10);return cp>0&&cp<=0x10ffff?String.fromCodePoint(cp):' ';}).replace(/&(amp|lt|gt|quot|apos|nbsp|ndash|mdash|rsquo|lsquo|rdquo|ldquo);/g,(_,n)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'-',mdash:'-',rsquo:"'",lsquo:"'",rdquo:'"',ldquo:'"'}[n])).replace(/\s+/g,' ').trim();}
function stableId(value){let hash=2166136261;for(const c of value){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(36);}
function isoDay(value){const m=String(value||'').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(!m)return null;const day=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;return Number.isNaN(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day?null:day;}
function eligiblePrevious(record,day){return !disallowedStatus.test(String(record.approvalStatus||record.registryStatus||''))&&(!record.approvalExpiresAt||/^\d{4}-\d{2}-\d{2}$/.test(record.approvalExpiresAt)&&record.approvalExpiresAt>=day);}
function eicBody(text){const body=text.match(/<tbody\b[^>]*\bid=["']form:mstdatatable_data["'][^>]*>([\s\S]*?)<\/tbody>/i);if(body)return body[1];const partial=text.match(/<update\b[^>]*\bid=["']form:mstdatatable["'][^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]><\/update>/i);if(partial)return partial[1];throw Error('EIC public register table layout changed');}
export function parseIndiaApprovedEstablishments(text,commodity,checkedAt,sourceUrl=`${EIC_BASE}?CT=${commodity}`){
 if(!['MP','FFP'].includes(commodity))throw Error('Unsupported EIC commodity register');
 const body=eicBody(text),out=[],day=checkedAt.slice(0,10),sourceName=commodity==='MP'?'milk and dairy products':'fish and fishery products';
 for(const tr of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
  const cells=[...tr[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>plain(m[1]));
  if(cells.length!==6||!/^\d+$/.test(cells[0]))continue;
  const [,name,,approval,scope,expiry]=cells,approvalExpiresAt=isoDay(expiry);
  if(!name||!approval||!scope||name.length>250||disallowedStatus.test(`${name} ${scope}`)||/unfit for human consumption/i.test(scope)||expiry&&!approvalExpiresAt||approvalExpiresAt&&approvalExpiresAt<day)continue;
  out.push({id:'in-eic-'+stableId(`${commodity}|${approval}|${name.toLowerCase()}`),name,country:'India',role:'supplier-discovery',products:[commodity==='MP'?'Milk and dairy':'Fish and seafood'],activities:[scope],website:null,source:`India Export Inspection Council approved ${sourceName} establishments`,sourceId:'in-eic-approved',sourceUrl,sourcePublishedAt:null,evidence:`Listed in the official EIC ${sourceName} approval table. Approval ${approval}; listed expiry ${approvalExpiresAt||'not supplied'}. Scope: ${scope}. Establishment approval does not verify a current commercial supplier or export offer.`,verification:'Registry-listed',establishmentId:approval,approvalExpiresAt,approvalStatus:null,registerCategory:commodity,license:'Public official register; no open licence asserted (source terms apply)',roleConfidence:'Official approval scope; current commercial supplier role and export availability unverified',retrievedAt:checkedAt});
 }
 // A page entirely past expiry is a valid empty result, but an unrecognisable table is not.
 if(!/<td\b/i.test(body)||!/(?:data-ri=|ui-datatable-empty-message)/i.test(body))throw Error('EIC public register rows changed');
 return out;
}
function gridRows(table){
 const rows=[],spans=new Map();
 for(const match of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
  const row=[];for(const [column,span] of spans){row[column]=span.value;span.left--;if(span.left<=0)spans.delete(column);}
  let column=0;
  for(const cell of match[1].matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)){
   while(row[column]!==undefined)column++;
   const value=plain(cell[2]),rowspan=+(cell[1].match(/\browspan=["'](\d+)["']/i)?.[1]||1),colspan=+(cell[1].match(/\bcolspan=["'](\d+)["']/i)?.[1]||1);
   if(rowspan>100||colspan>10)throw Error('Unexpected food-register table span');
   for(let n=0;n<colspan;n++){row[column+n]=value;if(rowspan>1)spans.set(column+n,{value,left:rowspan-1});}column+=colspan;
  }
  rows.push(row);
 }
 return rows;
}
function irelandProducts(activity,species){const values=[];for(const [pattern,label] of [[/\bBovine\b/i,'Beef'],[/\bPorcine\b/i,'Pork'],[/\bOvine\b/i,'Lamb and mutton'],[/\bCaprine\b/i,'Goat meat'],[/\bPoultry\b/i,'Poultry meat'],[/\b(?:Fish|Fishery|Mollusc|Shellfish)\b/i,'Fish and seafood'],[/\b(?:Milk|Dairy|Cheese|Cream)\b/i,'Milk and dairy'],[/\bEggs?\b/i,'Eggs and egg products']])if(pattern.test(`${activity} ${species}`))values.push(label);return values.length?values:['Food of animal origin'];}
export function parseIrelandApprovedEstablishments(text,checkedAt,limit=400){
 if(!/Approved food establishments under HSE supervision/i.test(text)||!/>\s*Approval_Number\s*</i.test(text))throw Error('Ireland public food-register layout changed');
 const sourcePublishedAt=isoDay(text.match(/Last refreshed on\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1]),by=new Map();
 if(!sourcePublishedAt)throw Error('Ireland food-register snapshot date missing');
 for(const table of text.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi))for(const row of gridRows(table[1])){
  const [approval,name,,county,type,activity,species]=row;
  if(!/^\d{3,6}$/.test(approval||'')||!name||!county||!activity||!/^Manufacturer$|^Wholesale$|^Wholesaling$/i.test(type||'')||/\b(hospital|HSE|health|nursing|residential|prison)\b/i.test(name)||disallowedStatus.test(`${name} ${activity}`))continue;
  let record=by.get(approval);
  if(!record){record={id:'ie-fsai-'+approval,name,country:'Ireland',region:county,role:'supplier-discovery',products:[],activities:[],website:null,source:'Food Safety Authority of Ireland - HSE approved food establishments',sourceId:'ie-fsai-approved',sourceUrl:IRELAND_URL,sourcePublishedAt,evidence:'',verification:'Registry-listed',establishmentId:approval,approvalExpiresAt:null,approvalStatus:null,license:'Public official register; no open licence asserted (source terms apply)',roleConfidence:'Official manufacturing/wholesale establishment activity; commercial supplier role and export capability unverified',retrievedAt:checkedAt};by.set(approval,record);}
  else if(record.name!==name)throw Error('Ireland approval identifier has conflicting establishment names');
  record.products=[...new Set([...record.products,...irelandProducts(activity,species)])];
  record.activities=[...new Set([...record.activities,`${type}: ${activity}${species?' ('+species+')':''}`])];
 }
 const records=[...by.values()].sort((a,b)=>a.name.localeCompare(b.name)).slice(0,Math.max(1,Math.min(400,limit)));
 if(records.length<20)throw Error('Too few eligible Irish manufacturing/wholesale establishments');
 for(const record of records)record.evidence=`Approval ${record.establishmentId} in the official HSE list refreshed ${sourcePublishedAt}. Listed activities: ${record.activities.join('; ')}. No approval expiry is supplied by this list. Establishment approval is not a current commercial supplier or export offer.`;
 return records;
}
function publicSessionCookie(response){const cookie=response.headers.get('set-cookie')||'',session=cookie.match(/(?:^|[,;]\s*)(JSESSIONID=[^;,\s]+)/i)?.[1];return session||null;}
async function fetchRegister(url,settings,deadline){
 const response=await fetch(url,{...settings,signal:AbortSignal.timeout(Math.max(1,Math.min(18000,deadline-Date.now())))});
 if(!response.ok)throw Error(`Official public register returned HTTP ${response.status}`);
 if(+(response.headers.get('content-length')||0)>3_000_000)throw Error('Public register exceeds safe response size');
 const text=await response.text();if(text.length>3_000_000)throw Error('Public register exceeds safe response size');
 return {text,response};
}
function indiaPageState(text){const state=text.match(/name=["']javax\.faces\.ViewState["'][^>]*value=["']([^"']+)["']/i)?.[1]||text.match(/<update\b[^>]*id=["'](?:[\w:-]*:)?javax\.faces\.ViewState(?:[\w:-]*)["'][^>]*>\s*<!\[CDATA\[([^<]+)\]\]>/i)?.[1];return state?plain(state):null;}
async function fetchIndiaCategory(commodity,checkedAt,deadline,pages){
 const url=`${EIC_BASE}?CT=${commodity}`,first=await fetchRegister(url,{headers:{Accept:'text/html'}},deadline),cookie=publicSessionCookie(first.response),state=indiaPageState(first.text),rowCount=+(first.text.match(/rowCount:(\d+)/)?.[1]||0);
 // Use the site's own public pagination action. A missing public session fails closed.
 if(!cookie||!state||!rowCount)throw Error('EIC public pagination session or row count missing');
 let view=state,records=[],fetched=0;
 for(let page=0;page<pages&&page*60<rowCount;page++){
  const body=new URLSearchParams({'javax.faces.partial.ajax':'true','javax.faces.source':'form:mstdatatable','javax.faces.partial.execute':'form:mstdatatable','javax.faces.partial.render':'form:mstdatatable','form:mstdatatable':'form:mstdatatable','form:mstdatatable_pagination':'true','form:mstdatatable_first':String(page*60),'form:mstdatatable_rows':'60','form:mstdatatable_encodeFeature':'true',form:'form','javax.faces.ViewState':view});
  const partial=await fetchRegister(url,{method:'POST',headers:{Accept:'application/xml','Content-Type':'application/x-www-form-urlencoded;charset=UTF-8','Faces-Request':'partial/ajax',Cookie:cookie},body:body.toString()},deadline);
  const parsed=parseIndiaApprovedEstablishments(partial.text,commodity,checkedAt,url);records.push(...parsed);fetched++;
  view=indiaPageState(partial.text)||view;
 }
 return {records,totalListed:rowCount,pages:fetched};
}
export async function refreshInternationalCompanies(previous={records:[]},options={}){
 const checkedAt=new Date().toISOString(),day=checkedAt.slice(0,10),deadline=Date.now()+25000,errors=[],statuses=[],pages=Math.max(1,Math.min(2,Number(options.indiaPages)||2));
 const prior=(previous.records||[]).filter(r=>SOURCE_POLICIES.some(s=>s.id===r.sourceId)&&eligiblePrevious(r,day));
 const previousStatus=id=>(previous.statuses||[]).find(s=>s.id===id),tasks=await Promise.allSettled([fetchIndiaCategory('MP',checkedAt,deadline,pages),fetchIndiaCategory('FFP',checkedAt,deadline,pages),fetchRegister(IRELAND_URL,{headers:{Accept:'text/html'}},deadline).then(({text})=>parseIrelandApprovedEstablishments(text,checkedAt))]);
 let india=[],successfulIndia=0;const indiaDetails=[];
 for(const [index,category] of ['MP','FFP'].entries()){
  const outcome=tasks[index];if(outcome.status==='fulfilled'){india.push(...outcome.value.records);successfulIndia++;indiaDetails.push(`${category==='MP'?'dairy':'seafood'}: ${outcome.value.records.length} eligible records from ${outcome.value.pages*60} bounded source rows (${outcome.value.totalListed} rows listed)`);}
  else{india.push(...prior.filter(r=>r.sourceId==='in-eic-approved'&&r.registerCategory===category));errors.push({source:'in-eic-approved',category,error:String(outcome.reason?.message||outcome.reason),...(outcome.reason?.cause?.code?{code:String(outcome.reason.cause.code)}:{})});indiaDetails.push(`${category==='MP'?'dairy':'seafood'} refresh failed; earlier unexpired evidence retained`);}
 }
 india=[...new Map(india.map(r=>[r.id,r])).values()];
 const oldIndia=previousStatus('in-eic-approved'),retainedSnapshot=successfulIndia===0&&india.length>0&&(oldIndia?.refreshMode==='snapshot-only'||oldIndia?.status==='snapshot');
 statuses.push({id:'in-eic-approved',status:successfulIndia===2?'connected':successfulIndia===1?'partial':retainedSnapshot?'snapshot':'error',detail:`${indiaDetails.join('; ')}. Explicit past expiry and suspended/withdrawn entries excluded. This is a bounded discovery sample, not the complete register.${retainedSnapshot?' Verified snapshot retained; hosted automatic refresh remains unconnected.':''}`,count:india.length,lastAttemptAt:checkedAt,...(successfulIndia===2?{lastSuccessAt:checkedAt,refreshMode:'automatic'}:oldIndia?.lastSuccessAt?{lastSuccessAt:oldIndia.lastSuccessAt}:{}),...(successfulIndia===1?{partialRefresh:true,refreshMode:'partial',refreshWarning:'Only one commodity register refreshed; the other retains prior eligible evidence. A complete current source refresh has not succeeded.'}:{}),...(retainedSnapshot?{refreshMode:'snapshot-only',refreshWarning:oldIndia.refreshWarning||'Verified source snapshot retained; hosted automatic refresh has not been verified.'}:{}),sourceUrl:EIC_BASE});
 let ireland;const ie=tasks[2],oldIreland=previousStatus('ie-fsai-approved');
 if(ie.status==='fulfilled'){ireland=ie.value;statuses.push({id:'ie-fsai-approved',status:'connected',detail:`${ireland.length} manufacturing/wholesale food establishments; plant-level HSE approvals, with source snapshot date retained. This list supplies no approval expiry or export verification.`,count:ireland.length,lastSuccessAt:checkedAt,lastAttemptAt:checkedAt,sourceUrl:IRELAND_URL});}
 else{ireland=prior.filter(r=>r.sourceId==='ie-fsai-approved');errors.push({source:'ie-fsai-approved',error:String(ie.reason?.message||ie.reason)});statuses.push({id:'ie-fsai-approved',status:'error',detail:'Irish register refresh failed; earlier manufacturing/wholesale establishment evidence and its source date retained.',count:ireland.length,lastAttemptAt:checkedAt,...(oldIreland?.lastSuccessAt?{lastSuccessAt:oldIreland.lastSuccessAt}:{}),sourceUrl:IRELAND_URL});}
 return {records:[...india,...ireland],retrievedAt:successfulIndia||ie.status==='fulfilled'?checkedAt:previous.retrievedAt||null,lastAttemptAt:checkedAt,statuses,errors,notes:INTERNATIONAL_NOTES,scope:'India EIC dairy/seafood approval samples and Irish HSE food-manufacturing/wholesale establishments; no verified commercial offers or personal contacts.'};
}
