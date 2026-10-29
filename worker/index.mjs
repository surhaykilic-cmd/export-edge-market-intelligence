// Research reads may be public. Maintenance requires verified owner identity or
// the existing Site service credential, checked against a server-only digest.
import {validateDiscoverySnapshot,mergeDiscoverySnapshots,companyRecordCurrent,discoveryCoverage} from './company-discovery.mjs';
const STATE_KEY='agriculture/current.json';
const WB_PAGE='https://www.worldbank.org/en/research/commodity-markets';
const WB_FALLBACK='https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx';
const FAO_CATALOG='https://bulks-faostat.fao.org/production/datasets_E.json';
const FPMA='https://fpma.fao.org/giews/v4/global/price_module/api/v1/FpmaSerieInternational/';
const USDA='https://apps.fas.usda.gov/PSDOnline/downloads/psd_alldata_csv.zip';
const json=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function upstream(url,kind='json'){
 const response=await fetch(url,{headers:{Accept:kind==='json'?'application/json':'*/*'},signal:AbortSignal.timeout(25000)});
 if(!response.ok){const e=Error(`Source returned HTTP ${response.status}`);e.status=response.status;e.retryAfter=Math.min(10000,Math.max(3000,Number(response.headers.get('retry-after')||3)*1000));throw e;}
 return kind==='json'?response.json():kind==='buffer'?response.arrayBuffer():response.text();
}
function marketURL(country,hs,year){const q=new URLSearchParams({period:String(year),reporterCode:String(country.code),cmdCode:hs,flowCode:'X,M',partnerCode:'0',partner2Code:'0',customsCode:'C00',motCode:'0',maxRecords:'500'});return `https://comtradeapi.un.org/public/v1/preview/C/A/HS?${q}`;}
export function mergeTrade(dataset,country,products,year,response,fetchedAt){
 if(response.error||!Array.isArray(response.data))throw Error(response.error||'Invalid trade response');
 if(response.data.length>=500)throw Error('Preview may be truncated; previous values retained');
 const requested=new Set(products.map(p=>p.hs));
 const keys=new Set();for(const row of response.data){if(!requested.has(row.cmdCode)||+row.reporterCode!==+country.code||+row.partnerCode!==0||+row.period!==+year||!['X','M'].includes(row.flowCode)||!Number.isFinite(row.primaryValue)||row.primaryValue<0||(row.typeCode!=null&&row.typeCode!=='C')||(row.freqCode!=null&&row.freqCode!=='A')||(row.partner2Code!=null&&+row.partner2Code!==0)||(row.motCode!=null&&+row.motCode!==0)||(row.customsCode!=null&&row.customsCode!=='C00'))throw Error('Trade response does not match requested dimensions');const key=row.cmdCode+'/'+row.flowCode;if(keys.has(key))throw Error('Duplicate trade observation');keys.add(key);}
 for(const product of products){
   let m=dataset.markets.find(m=>+m.code===+country.code&&m.hs===product.hs);
   if(!m){m={...product,...country,id:`${country.code}-${product.hs}`,records:[],sourceUrls:[],availability:{}};dataset.markets.push(m);}
   m.availability??={};const rows=response.data.filter(r=>r.cmdCode===product.hs);m.availability[year]={status:rows.length?'available':'not-returned',checkedAt:fetchedAt};
   if(rows.length){
     // A successful response can revise values. Missing rows never erase previous evidence.
     for(const r of rows){const previous=m.records.findIndex(v=>v.year===+year&&v.flow===r.flowCode);const item={year:+year,flow:r.flowCode,value:r.primaryValue,classification:r.classificationCode,isReported:r.isReported,isAggregate:r.isAggregate,netWeightKg:r.netWgt,isNetWeightEstimated:r.isNetWgtEstimated,fobValueUSD:r.fobvalue,cifValueUSD:r.cifvalue,fetchedAt};if(previous>=0)m.records[previous]=item;else m.records.push(item);}
     m.lastSuccessfulFetchAt=fetchedAt;
   }
   const url=marketURL(country,product.hs,year);m.sourceUrls=m.sourceUrls.filter(u=>new URL(u).searchParams.get('period')!==String(year));m.sourceUrls.push(url);m.sourceUrl=url;
 }
 return response.data.length;
}
export function validateImportedMarketPrices(body){
 const series=body?.prices?.series;if(!Array.isArray(series)||!series.length||series.length>200)throw Error('Bounded non-empty price series required');const ids=new Set();
 for(const s of series){const url=new URL(s.sourceUrl);if(url.protocol!=='https:'||!['api.tech.ec.europa.eu','fpma.fao.org'].includes(url.hostname)||!['ec-agrifood-cereal','ec-agrifood-dairy','fao-fpma-observations'].includes(s.sourceId)||!s.name||!s.unit||!['Weekly','Monthly'].includes(s.frequency)||!Array.isArray(s.observations)||!s.observations.length||s.observations.length>1000||ids.has(s.id))throw Error('Invalid source-labelled market price series');
   if(s.sourceId.startsWith('ec-')&&(url.hostname!=='api.tech.ec.europa.eu'||!s.id.startsWith('ec-')||s.currency!=='EUR'))throw Error('EC price provenance mismatch');
   if(s.sourceId==='fao-fpma-observations'&&(url.hostname!=='fpma.fao.org'||!s.id.startsWith('fpma-')))throw Error('FPMA price provenance mismatch');
   ids.add(s.id);const periods=new Set();for(const o of s.observations){if(typeof o.value!=='number'||!Number.isFinite(o.value)||o.value<0||!/^\d{4}-\d{2}(?:-\d{2})?$/.test(o.period)||periods.has(o.period))throw Error('Invalid or duplicate price observation');periods.add(o.period);}
 }return series;
}
export function staleRunnerImports(state,now=Date.now()){
 const stale=[];if(state.faostatRelay?.enabled){if(now-Date.parse(state.faostatRelay.lastCatalogImportAt||'1970-01-01')>172800000)stale.push('FAOSTAT catalog');if(now-Date.parse(state.faostatRelay.lastPricesImportAt||'1970-01-01')>172800000)stale.push('FAOSTAT producer prices');}if(state.marketFeeds?.priceRelayEnabled&&now-Date.parse(state.marketFeeds.prices?.importedAt||'1970-01-01')>172800000)stale.push('EC/FPMA prices');if(state.internationalCompanies?.relayEnabled&&now-Date.parse(state.internationalCompanies.importedAt||'1970-01-01')>172800000)stale.push('International buyer/supplier directory');return stale;
}
export async function authorizeMaintenance(request,env={}){
 const owner=String(env.UPDATE_OWNER_EMAIL||'').trim().toLowerCase(),email=String(request.headers.get('oai-authenticated-user-email')||'').trim().toLowerCase(),userId=request.headers.get('oai-authenticated-user-id');
 // Sites dispatch supplies and verifies these identity headers; browsers cannot
 // establish this identity by sending their own headers to the public origin.
 if(owner&&userId&&email===owner)return true;
 const token=request.headers.get('x-export-edge-update-token'),expected=String(env.UPDATE_SERVICE_TOKEN_SHA256||'').trim().toLowerCase();
 if(!token||token.length>8192||/[\r\n\0]/.test(token)||!(/^[a-f0-9]{64}$/.test(expected)))return false;
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)),actual=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');let difference=0;for(let n=0;n<64;n++)difference|=actual.charCodeAt(n)^expected.charCodeAt(n);return difference===0;
}
export function createWorker(config){
 function directory(state){const records=[...(state.companies?.records||[]),...(state.internationalCompanies?.records||[])].filter(r=>companyRecordCurrent(r));return {...state.companies,records,coverage:discoveryCoverage(records),statuses:[...(state.companies?.statuses||[]),...(state.internationalCompanies?.statuses||[])],errors:[...(state.companies?.errors||[]),...(state.internationalCompanies?.errors||[])],retrievedAt:[state.companies?.retrievedAt,state.internationalCompanies?.retrievedAt].filter(Boolean).sort().at(-1),notes:[state.companies?.notes,state.internationalCompanies?.notes].filter(Boolean).join(' ')};}
 async function read(env){const object=env.BUCKET?await env.BUCKET.get(STATE_KEY):null;const state=object?await object.json():{dataset:structuredClone(config.seed),benchmarks:config.benchmarks||{series:[]},production:config.production||{datasets:[]},supply:config.supply||{records:[]},fpma:config.fpma||{series:[]},sourceStatus:[],runs:[],cursor:0,automaticUpdates:{enabled:false,mode:'configured'}};state.faostatPrices??=structuredClone(config.faostatPrices||{series:[]});state.marketFeeds??=structuredClone(config.marketFeeds||{prices:{series:[]},news:{items:[]}});state.companies??=structuredClone(config.companies||{records:[]});state.internationalCompanies??=structuredClone(config.internationalCompanies||{records:[],statuses:[]});return {etag:object?.etag,state};}
 async function save(env,state,etag){if(!env.BUCKET)throw Error('Persistent storage is not connected');const conditions=etag?{etagMatches:etag}:{etagDoesNotMatch:'*'};const result=await env.BUCKET.put(STATE_KEY,JSON.stringify(state),{onlyIf:conditions,httpMetadata:{contentType:'application/json'}});if(!result){const e=Error('Another update completed concurrently. Retry from the latest snapshot.');e.status=409;throw e;}return result;}
 function status(state){const ms=state.dataset.markets,companies=directory(state);return {lastRun:state.runs?.at(-1)||null,sourceStatus:state.sourceStatus||[],automaticUpdates:state.automaticUpdates||{enabled:false},runnerImports:{faostatCatalog:state.faostatRelay?.lastCatalogImportAt,faostatPrices:state.faostatRelay?.lastPricesImportAt,marketPrices:state.marketFeeds.prices?.importedAt,internationalCompanies:state.internationalCompanies?.importedAt,stale:staleRunnerImports(state)},trade:{markets:ms.length,observations:ms.reduce((n,m)=>n+m.records.length,0),countries:new Set(ms.map(m=>m.code)).size,products:new Set(ms.map(m=>m.hs)).size,latestFetchedAt:state.dataset.retrievedAt},prices:{series:state.benchmarks.series.length+state.faostatPrices.series.length+(state.marketFeeds.prices?.series?.length||0)},news:{items:state.marketFeeds.news?.items?.length||0,retrievedAt:state.marketFeeds.news?.retrievedAt},companies:{records:companies.records.length,buyers:companies.records.filter(r=>r.role==='buyer-discovery').length,suppliers:companies.records.filter(r=>r.role==='supplier-discovery').length,countries:companies.coverage.length,coverage:companies.coverage},faostat:state.production.connection||null,catalog:{countries:config.catalog.countries.length,products:config.catalog.products.length},runs:(state.runs||[]).slice(-10).reverse()};}
 async function refresh(env,args={}){
   const {state,etag}=await read(env);const startedAt=new Date().toISOString(),run={id:crypto.randomUUID(),startedAt,queried:[],errors:[],status:'running'};
   const scope=args.scope||'all',size=Math.max(1,Math.min(6,Number(args.batchSize)||6));state.sourceStatus??=[];
   function mark(id,success,detail,count){let row=state.sourceStatus.find(s=>s.id===id);if(!row){row={id};state.sourceStatus.push(row);}row.lastAttemptAt=new Date().toISOString();row.status=success?'connected':'error';row.detail=detail;if(success){row.lastSuccessAt=row.lastAttemptAt;row.count=count;}}
   const additions=[];
   if(['all','prices','faostat'].includes(scope)&&!state.faostatRelay?.enabled)additions.push((async()=>{try{state.faostatPrices=await refreshFaostatPrices(state.faostatPrices,config.catalog.countries);mark('faostat-producer-prices',true,'Annual national producer prices in original USD/tonne units with source flags; not current export offers.',state.faostatPrices.series.length);}catch(e){run.errors.push({source:'faostat-producer-prices',error:e.message});mark('faostat-producer-prices',false,'Producer-price update failed; previous observations retained.');}})());
   if(['all','prices','news'].includes(scope))additions.push((async()=>{try{const result=await refreshMarketFeeds(state.marketFeeds,{scope:state.marketFeeds.priceRelayEnabled?'news':scope==='all'?'all':scope,fpmaCatalog:state.fpma.series,timeoutMs:20000});state.marketFeeds=result;for(const s of result.statuses||[]){mark(s.id,s.status==='connected'||s.status==='partial',s.detail,s.count);if(s.status==='partial')state.sourceStatus.find(r=>r.id===s.id).status='partial';}run.errors.push(...(result.errors||[]));}catch(e){run.errors.push({source:'market-feeds',error:e.message});mark('market-feeds',false,'Feed refresh failed; prior records retained.');}})());
   if(['all','companies'].includes(scope))additions.push((async()=>{try{const result=await refreshCompanies(state.companies);state.companies=result;for(const s of result.statuses||[])mark(s.id,s.status==='connected',s.detail,s.count);run.errors.push(...(result.errors||[]));}catch(e){run.errors.push({source:'companies',error:e.message});mark('companies',false,'Discovery refresh failed; prior evidence retained.');}})());
   if(scope==='all'||scope==='trade'){
     const latest=new Date().getUTCFullYear()-1,years=[latest-1,latest],jobs=config.catalog.countries.flatMap(country=>years.map(year=>({country,year})));let successful=0;
     for(let n=0;n<size;n++){
       const job=jobs[(state.cursor||0)%jobs.length],url=marketURL(job.country,config.catalog.products.map(p=>p.hs).join(','),job.year);
       try{let result;try{result=await upstream(url);}catch(e){if(e.status!==429)throw e;await sleep(e.retryAfter);result=await upstream(url);}const count=mergeTrade(state.dataset,job.country,config.catalog.products,job.year,result,new Date().toISOString());run.queried.push({country:job.country.country,year:job.year,records:count});successful++;state.cursor=((state.cursor||0)+1)%jobs.length;}
       catch(e){run.errors.push({source:'un-comtrade',country:job.country.country,year:job.year,error:e.message});if(e.status===429)break;state.cursor=((state.cursor||0)+1)%jobs.length;}
       if(n<size-1)await sleep(3300);
     }
     if(successful)state.dataset.retrievedAt=new Date().toISOString();
     mark('un-comtrade',successful>0,`${successful} country/year queries completed in this batch; a full ${jobs.length}-query cycle is spread across runs. Missing results do not erase earlier records.`,run.queried.reduce((n,j)=>n+j.records,0));
   }
   if(scope==='all'||scope==='benchmarks')try{
     const page=await upstream(WB_PAGE,'text');const hrefs=[...page.matchAll(/href=["']([^"']+)["']/gi)].map(m=>m[1].replace(/&amp;/g,'&'));
     const candidates=hrefs.filter(h=>/^https:\/\/thedocs\.worldbank\.org\//i.test(h)&&/CMO-Historical-Data-Monthly\.xlsx/i.test(h));const sourceUrl=candidates[0]||WB_FALLBACK;
     state.benchmarks=await parsePinkSheet(await upstream(sourceUrl,'buffer'),sourceUrl);mark('world-bank-pink-sheet',true,'Monthly international commodity benchmark observations. Not live product offers.',state.benchmarks.series.length);
   }catch(e){run.errors.push({source:'world-bank-pink-sheet',error:e.message});mark('world-bank-pink-sheet',false,'Update failed; previous benchmark observations retained.');}
   if(scope==='all'||scope==='catalogs'){
     if(!state.faostatRelay?.enabled)try{state.production=await refreshFaostatCatalog(state.production);mark('faostat',true,`Official release catalog connected using ${state.production.connection.representation.toUpperCase()}; source catalog metadata only.`,state.production.datasets.length);}catch(e){run.errors.push({source:'faostat',error:e.message,attempts:e.attempts});state.production.connection={status:'error',attempts:e.attempts,lastAttemptAt:new Date().toISOString()};mark('faostat',false,'Official catalog JSON and XML unavailable from website host; task-runner import is available. Previous catalog retained.');}
     try{const data=await upstream(FPMA);if(!Array.isArray(data.results))throw Error('FPMA catalog layout changed');state.fpma={kind:'catalog',retrievedAt:new Date().toISOString(),series:data.results.map(r=>({id:r.uuid,name:r.name||r.serie_name||r.commodity_name,product:r.commodity_name,source:r.source_name,currency:r.currency,unit:r.measure_unit_label,latestPeriod:r.end_date})),note:'International price-series discovery metadata only. Underlying observations may have third-party rights.'};mark('fao-fpma',true,'Catalog metadata connected; selected observations are supplied by the separate FPMA price connector.',data.results.length);}catch(e){run.errors.push({source:'fao-fpma',error:e.message});mark('fao-fpma',false,'Catalog update failed; previous catalog retained.');}
   }
   if(scope==='all'||scope==='production')try{state.supply=await parseUSDA(await upstream(USDA,'buffer'),USDA);mark('usda-psd',true,'Production observations in original units and marketing years; includes estimates, forecasts and aggregate geography labels.',state.supply.records.length);}catch(e){run.errors.push({source:'usda-psd',error:e.message});mark('usda-psd',false,'USDA production update failed; previous observations retained.');}
   await Promise.all(additions);
   if(scope==='all'){const stale=staleRunnerImports(state);if(stale.length)run.errors.push({source:'scheduled-runner-imports',error:`Imports older than 48 hours: ${stale.join(', ')}. Run the helper in /api/update-instructions before marking the update complete.`});}
   run.finishedAt=new Date().toISOString();run.status=run.errors.length?'partial':'succeeded';state.runs=[...(state.runs||[]),run].slice(-30);state.dataset.collection={...(state.dataset.collection||{}),lastCloudRun:run,source:'un-comtrade',cursor:state.cursor};
   await save(env,state,etag);return {run,status:status(state)};
 }
 return {async fetch(request,env,ctx){
   try{
    const url=new URL(request.url),path=url.pathname;
    const maintenanceRead=['/api/faostat-relay-script','/api/market-feeds-module','/api/company-discovery-module','/api/company-discovery-state'].includes(path);
    if(maintenanceRead&&!await authorizeMaintenance(request,env))return json({error:'Owner maintenance access required'},403);
    if(request.method==='POST'){
      const origin=request.headers.get('origin');if(origin&&origin!==url.origin)return json({error:'Cross-origin writes are not allowed'},403);
      if(path!=='/mcp'&&!await authorizeMaintenance(request,env))return json({error:'Owner maintenance access required'},403);
      if(path==='/api/refresh'){const body=await request.json().catch(()=>({}));if(!['all','trade','benchmarks','catalogs','production','prices','news','companies','faostat',undefined].includes(body.scope))return json({error:'Unknown refresh scope'},400);return json(await refresh(env,body));}
      if(path==='/api/schedule-confirmed'){const args=await request.json();if(typeof args.enabled!=='boolean'||typeof args.id!=='string')return json({error:'Schedule identifier and enabled state required'},400);const {state,etag}=await read(env);state.automaticUpdates={enabled:args.enabled,id:args.id,mode:'scheduled',cadence:'Daily at 06:30',timezone:'Europe/London',tradeCycleDays:Math.ceil(config.catalog.countries.length*2/6),verifiedAt:new Date().toISOString()};await save(env,state,etag);return json(state.automaticUpdates);}
      if(path==='/api/faostat/catalog-import'||path==='/api/faostat/prices-import'){
        const isCatalog=path.endsWith('/catalog-import'),sourceUrl=isCatalog?'https://bulks-faostat.fao.org/production/datasets_E.json':'https://bulks-faostat.fao.org/production/Prices_E_All_Data_(Normalized).zip';
        if(request.headers.get('x-source-url')!==sourceUrl)return json({error:'Official FAOSTAT source URL required'},400);
        const bytes=await request.arrayBuffer();if(bytes.byteLength>(isCatalog?300000:20000000))return json({error:'FAOSTAT import size exceeded'},413);
        const {state,etag}=await read(env),retrievedAt=new Date().toISOString();let count;
        if(isCatalog){const datasets=parseFaostatCatalog(JSON.parse(new TextDecoder().decode(bytes)));state.production={kind:'catalog',source:'FAOSTAT',sourceUrl,retrievedAt,datasets,sourceLastModified:request.headers.get('x-source-last-modified'),connection:{status:'connected',representation:'official-json-via-task-runner',importedAt:retrievedAt},note:'Official FAOSTAT release metadata, validated and imported by the private scheduled runner.'};count=datasets.length;}
        else{state.faostatPrices=await parseFaostatPrices(bytes,config.catalog.countries);state.faostatPrices.importedAt=retrievedAt;state.faostatPrices.sourceLastModified=request.headers.get('x-source-last-modified');count=state.faostatPrices.series.length;}
        const id=isCatalog?'faostat':'faostat-producer-prices';state.sourceStatus=state.sourceStatus.filter(s=>s.id!==id);state.sourceStatus.push({id,status:'connected',detail:`Official public FAOSTAT ${isCatalog?'catalog':'producer-price archive'} imported through the authenticated task-runner path; original files and observations validated.`,count,lastAttemptAt:retrievedAt,lastSuccessAt:retrievedAt,sourceUrl});state.faostatRelay={...(state.faostatRelay||{}),enabled:true,[isCatalog?'lastCatalogImportAt':'lastPricesImportAt']:retrievedAt};
        await save(env,state,etag);return json({imported:true,source:id,count,retrievedAt,relay:state.faostatRelay});
      }
      if(path==='/api/company-discovery-import'){
        const raw=await request.text();if(raw.length>6000000)return json({error:'Company discovery import size exceeded'},413);
        const body=JSON.parse(raw);try{validateDiscoverySnapshot(body,config.companySourcePolicies||[]);}catch(e){return json({error:e.message},400);}
        const {state,etag}=await read(env),retrievedAt=new Date().toISOString();
        state.internationalCompanies={...mergeDiscoverySnapshots(state.internationalCompanies,body,config.companySourcePolicies),importedAt:retrievedAt,relayEnabled:true};
        state.sourceStatus??=[];for(const s of body.statuses||[]){state.sourceStatus=state.sourceStatus.filter(v=>v.id!==s.id);state.sourceStatus.push({...s,importedAt:retrievedAt});}
        await save(env,state,etag);const companies=directory(state);return json({imported:true,records:state.internationalCompanies.records.filter(r=>companyRecordCurrent(r)).length,totalRecords:companies.records.length,countries:companies.coverage.length,retrievedAt,sourceStatuses:body.statuses,errors:body.errors||[]});
      }
      if(path==='/api/market-prices-import'){
        const raw=await request.text();if(raw.length>1500000)return json({error:'Price import size exceeded'},413);const body=JSON.parse(raw),series=validateImportedMarketPrices(body),{state,etag}=await read(env),retrievedAt=new Date().toISOString();
        const merged=new Map(state.marketFeeds.prices.series.map(s=>[s.id,s]));for(const s of series){const previous=merged.get(s.id),points=new Map((previous?.observations||[]).map(o=>[o.period,o]));for(const o of s.observations)points.set(o.period,o);merged.set(s.id,{...s,observations:[...points.values()].sort((a,b)=>a.period.localeCompare(b.period))});}
        state.marketFeeds.prices={...body.prices,series:[...merged.values()],importedAt:retrievedAt};state.marketFeeds.priceRelayEnabled=true;const allowed=['ec-agrifood-cereal','ec-agrifood-dairy','fao-fpma-observations'];
        for(const id of allowed){const s=body.statuses?.find(s=>s.id===id);if(!s)continue;const old=state.sourceStatus.find(v=>v.id===id);state.sourceStatus=state.sourceStatus.filter(v=>v.id!==id);state.sourceStatus.push({...old,...s,id,detail:`${s.detail||''} Refreshed through the authenticated scheduled-runner importer.`,lastAttemptAt:retrievedAt,...(s.status==='connected'||s.status==='partial'?{lastSuccessAt:retrievedAt}:{})});}
        await save(env,state,etag);return json({imported:true,series:series.length,totalSeries:merged.size,retrievedAt,sourceStatuses:body.statuses,errors:body.errors||[]});
      }
      if(path==='/mcp'){
       const rpc=await request.json();let result;
       if(rpc.method==='tools/call'&&rpc.params?.name==='refresh_agriculture_data'&&!await authorizeMaintenance(request,env))return json({jsonrpc:'2.0',id:rpc.id??null,error:{code:-32001,message:'Owner maintenance access required'}},403);
       if(rpc.method==='server/discover')result={supportedVersions:['2026-07-28'],capabilities:{tools:{}}};
       else if(rpc.method==='initialize')result={protocolVersion:'2026-07-28',capabilities:{tools:{}},serverInfo:{name:'Export Edge Market Intelligence',version:'4.0.0'}};
       else if(rpc.method==='tools/list')result={tools:[{name:'get_agriculture_update_status',description:'Read source coverage, last refresh, and schedule state for the agriculture research app.',inputSchema:{type:'object',properties:{}}},{name:'refresh_agriculture_data',description:'Owner-only: refresh free trade, price, official news and evidence-linked company discovery sources in bounded batches. For full FAOSTAT, EC/FPMA and international directory updates, run the scheduled-runner helper from /api/update-instructions first. Retains prior data on failure; no purchases or Tridge scraping.',inputSchema:{type:'object',properties:{batchSize:{type:'integer',minimum:1,maximum:6},scope:{type:'string',enum:['all','trade','benchmarks','catalogs','production','prices','news','companies','faostat']}},additionalProperties:false}}]};
       else if(rpc.method==='tools/call'){try{const value=rpc.params.name==='get_agriculture_update_status'?status((await read(env)).state):rpc.params.name==='refresh_agriculture_data'?await refresh(env,rpc.params.arguments||{}):{error:'Unknown tool'};result={content:[{type:'text',text:JSON.stringify(value)}],...(value.error?{isError:true}:{})};}catch(e){result={isError:true,content:[{type:'text',text:e.message}]};}}
       else if(String(rpc.method).startsWith('notifications/'))return new Response(null,{status:202});
       else return json({jsonrpc:'2.0',id:rpc.id,error:{code:-32601,message:'Method not found'}},400);
       return json({jsonrpc:'2.0',id:rpc.id??null,result});
      }
      return json({error:'Not found'},404);
    }
    if(request.method!=='GET'&&request.method!=='HEAD')return json({error:'Method not allowed'},405);
    if(path==='/api/catalog')return json(config.catalog);
    if(path.startsWith('/api/')||path==='/data.json'){
      const {state}=await read(env);
      if(path==='/api/data'||path==='/data.json')return json(state.dataset);
      if(path==='/api/status')return json(status(state));
      if(path==='/api/benchmarks')return json({...state.benchmarks,series:[...state.benchmarks.series,...state.faostatPrices.series,...(state.marketFeeds.prices?.series||[])],note:'Source-specific international benchmarks, weekly market prices and annual national producer prices. Frequencies, definitions, currencies and units differ; no cross-source averaging or automatic matching is applied.'});
      if(path==='/api/news')return json(state.marketFeeds.news||{items:[]});
      if(path==='/api/companies')return json(directory(state));
      if(path==='/api/production')return json({...state.production,records:state.supply?.records||[],productionRetrievedAt:state.supply?.retrievedAt,productionNotes:state.supply?.notes,productionSource:'USDA PSD',periodType:'marketing_year',sourceUrl:USDA});
      if(path==='/api/fpma')return json(state.fpma);
      if(path==='/api/faostat-relay-script')return new Response(config.faostatRelayScript||'',{headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'}});
      if(path==='/api/market-feeds-module')return new Response(config.marketFeedsModule||'',{headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'}});
      if(path==='/api/company-discovery-module')return new Response(config.companyDiscoveryModule||'',{headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'}});
      if(path==='/api/company-discovery-state')return json(state.internationalCompanies);
      if(path==='/api/sources')return json({...config.sources,connections:state.sourceStatus,comparison:config.comparison});
      if(path==='/api/update-instructions')return json({revision:config.revision,publicResearchViews:true,maintenanceRequiresOwner:true,instructions:'Research views are public. Maintenance is owner-only. Obtain the existing Site service credential with Sites get_site (do not generate or rotate it). For protected helper downloads and every HTTP write, send both OAI-Sites-Authorization: Bearer <token> and X-Export-Edge-Update-Token: <token> to this fixed Site origin only. The duplicate header is verified against a server-only SHA256 digest; never send it to upstream data publishers. Native MCP refresh calls require the verified Site owner identity. First refresh FAOSTAT, EC and FPMA prices, plus international buyers and suppliers using the saved task-runner helper at /api/faostat-relay-script (or scripts/relay-faostat.mjs in the linked source). It downloads the two official public FAO files and imports them through the catalog-import and prices-import endpoints, then loads the Site connector module to refresh the selected public EC/FPMA price series and submit market-prices-import, then refresh the official international register and TED modules and submit company-discovery-import. India snapshot rows are retained on a known transport failure, with expiry filtering; do not claim that source refreshed. Pass the existing Site token on hidden stdin, never to FAO, never in files or logs. Then call refresh_agriculture_data as the signed-in owner with scope all and batchSize6, or POST /api/refresh using both Site headers with those arguments. If the service credential is explicitly rotated in the future, the owner must update the runtime verifier before helper imports can resume. This checks trade, World Bank, EC/FPMA prices, official news and evidence-linked companies. Read /api/status and verify FAOSTAT, price and international-directory import dates and per-source statuses. Read /api/companies separately to verify international record and country counts. On a partial source failure retain previous data and respect any Retry-After cooldown. Do not purchase data, sign up, send outreach or scrape Tridge. Stay quiet on routine success or unchanged known failures; notify only on a new material failure, recovery or required action.'});
      return json({error:'Not found'},404);
    }
    const asset=config.assets[path==='/'?'/index.html':path];if(asset)return new Response(request.method==='HEAD'?null:asset.encoding==='base64'?Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)):asset.body,{headers:{'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}});
    return new Response('Not found',{status:404});
   }catch(e){return json({error:e.message},e.status||500);}
 }};
}
