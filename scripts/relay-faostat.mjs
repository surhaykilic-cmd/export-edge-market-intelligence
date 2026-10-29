// Standalone scheduled-run helper. All source downloads are public; the private
// Site credential is read from hidden stdin and sent only to the fixed Site.
const SITE_ORIGIN='https://export-legacy-market-intelligence.surhay-nart.chatgpt.site';
const CATALOG_URL='https://bulks-faostat.fao.org/production/datasets_E.json';
const PRICES_URL='https://bulks-faostat.fao.org/production/Prices_E_All_Data_(Normalized).zip';

const readHiddenInput=()=>new Promise((resolve,reject)=>{
 let value='',finished=false;const terminal=process.stdin.isTTY;
 const finish=error=>{if(finished)return;finished=true;process.stdin.removeListener('data',onData);process.stdin.removeListener('end',onEnd);if(terminal)process.stdin.setRawMode(false);process.stdin.pause();error?reject(error):resolve(value);};
 const onData=chunk=>{value+=chunk;if(value.includes('\u0003'))finish(Error('FAOSTAT relay cancelled'));else if(value.length>65536)finish(Error('Input exceeds the request limit'));else if(value.includes('\n')||value.includes('\r'))finish();};
 const onEnd=()=>finish();if(terminal)process.stdin.setRawMode(true);process.stdin.setEncoding('utf8');process.stdin.on('data',onData);process.stdin.once('end',onEnd);process.stdin.resume();console.log('Ready for FAOSTAT relay JSON on stdin (input is hidden).');
});
async function boundedBody(response,maxBytes){
 const length=Number(response.headers.get('content-length'));if(Number.isFinite(length)&&length>maxBytes){await response.body?.cancel();throw Error('Response exceeds the download limit');}
 if(!response.body)throw Error('Source returned no body');const reader=response.body.getReader(),parts=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw Error('Response exceeds the download limit');}parts.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}return bytes;
}
async function getOfficialSource(url,type,limit,force){
 const response=await fetch(url,{headers:{Accept:type,...(force?{'Cache-Control':'no-cache'}:{})},signal:AbortSignal.timeout(25000)});
 if(!response.ok){await response.body?.cancel();throw Error(`Official FAOSTAT source returned HTTP ${response.status}`);}
 const finalHost=new URL(response.url||url).hostname;if(finalHost!=='bulks-faostat.fao.org'){await response.body?.cancel();throw Error('Official source redirected outside its expected host');}
 const bytes=await boundedBody(response,limit);if(!bytes.length)throw Error('Official FAOSTAT source is empty');
 return {bytes,lastModified:response.headers.get('last-modified')};
}
async function importAtSite(path,download,type,sourceUrl,token){
 const headers={'OAI-Sites-Authorization':'Bearer '+token,'X-Export-Edge-Update-Token':token,'Content-Type':type};if(sourceUrl)headers['X-Source-URL']=sourceUrl;if(download.lastModified)headers['X-Source-Last-Modified']=download.lastModified;
 const response=await fetch(SITE_ORIGIN+path,{method:'POST',headers,body:download.bytes,redirect:'error',signal:AbortSignal.timeout(120000)});
 if(!response.ok){await response.body?.cancel();throw Error(`Private Site import returned HTTP ${response.status}; previous data remains available`);}
 const bytes=await boundedBody(response,2_000_000);let result;try{result=JSON.parse(new TextDecoder().decode(bytes));}catch{throw Error('Private Site import did not return valid JSON');}return result;
}
const count=(result,names)=>{for(const name of names){const value=result?.[name]??result?.result?.[name];if(typeof value==='number'&&Number.isFinite(value))return value;if(Array.isArray(value))return value.length;}return null;};
const asOf=result=>{for(const key of ['retrievedAt','importedAt','updatedAt','asOf']){const value=result?.[key]??result?.result?.[key];if(typeof value==='string'&&Number.isFinite(Date.parse(value)))return value;}return null;};
async function privateDownload(path,type,limit,token){
 // Every authenticated request uses this fixed private origin and rejects redirects.
 const response=await fetch(SITE_ORIGIN+path,{headers:{'OAI-Sites-Authorization':'Bearer '+token,'X-Export-Edge-Update-Token':token,Accept:type},redirect:'error',signal:AbortSignal.timeout(120000)});
 if(!response.ok){await response.body?.cancel();throw Error('Private connector download returned HTTP '+response.status);}
 const contentType=response.headers.get('content-type')||'';
 if(type==='text/javascript, application/javascript'&&!/(?:application|text)\/(?:java|ecma)script/i.test(contentType)){await response.body?.cancel();throw Error('Private connector did not return JavaScript');}
 if(type==='application/json'&&!/application\/(?:[a-z.+-]*\+)?json/i.test(contentType)){await response.body?.cancel();throw Error('Private connector state did not return JSON');}
 return boundedBody(response,limit);
}
try{
 let args;try{args=JSON.parse(await readHiddenInput());}catch{throw Error('Provide the relay inputs as one JSON object on hidden stdin');}
 if(!args||typeof args.token!=='string'||!args.token||/[\r\n\0]/.test(args.token))throw Error('A valid private Site service credential is required');
 if(args.companiesOnly===true&&args.faostatOnly===true)throw Error('Choose either companiesOnly or faostatOnly for a focused refresh');
 const failures=[];
 const runLeg=async(name,run)=>{try{await run();}catch(error){failures.push(name);console.error(JSON.stringify({source:name,imported:false,error:error.message}));}};
 if(args.companiesOnly!==true){
  await runLeg('FAOSTAT catalog',async()=>{
   const catalog=await getOfficialSource(CATALOG_URL,'application/json',2_000_000,args.force===true);
   let parsed;try{parsed=JSON.parse(new TextDecoder().decode(catalog.bytes).replace(/^\uFEFF/,''));}catch{throw Error('Official FAOSTAT catalog is not valid JSON');}
   const rows=parsed?.Datasets?.Dataset;if(!Array.isArray(rows)||rows.length<20)throw Error('Official FAOSTAT catalog shape is incomplete');
   const imported=await importAtSite('/api/faostat/catalog-import',catalog,'application/json',CATALOG_URL,args.token);
   console.log(JSON.stringify({source:'FAOSTAT catalog',datasets:count(imported,['datasets','datasetCount','count'])??rows.length,sourceLastModified:catalog.lastModified,asOf:asOf(imported),imported:true}));
  });
  await runLeg('FAOSTAT producer prices',async()=>{
   const prices=await getOfficialSource(PRICES_URL,'application/zip',20_000_000,args.force===true);
   if(prices.bytes[0]!==0x50||prices.bytes[1]!==0x4b)throw Error('Official FAOSTAT price download is not a ZIP archive');
   const imported=await importAtSite('/api/faostat/prices-import',prices,'application/zip',PRICES_URL,args.token);
   console.log(JSON.stringify({source:'FAOSTAT producer prices',series:count(imported,['series','seriesCount','count']),observations:count(imported,['observations','observationCount','records']),sourceLastModified:prices.lastModified,asOf:asOf(imported),imported:true}));
  });
 }
 if(args.faostatOnly!==true&&args.companiesOnly!==true){
  await runLeg('Public EC and FPMA price connectors',async()=>{
   // Published project connector only; public source publishers never receive the token.
   const moduleBytes=await privateDownload('/api/market-feeds-module','text/javascript, application/javascript',1_000_000,args.token),connector=await import('data:text/javascript,'+encodeURIComponent(new TextDecoder().decode(moduleBytes)));
   if(typeof connector.refreshMarketFeeds!=='function')throw Error('Private price connector is missing its supported refresh function');
   const result=await connector.refreshMarketFeeds({}, {scope:'prices',timeoutMs:20000});
   if(!Array.isArray(result?.prices?.series)||!result.prices.series.length)throw Error('Public price sources returned no observations; prior Site prices retained');
   const payload=new TextEncoder().encode(JSON.stringify({prices:result.prices,statuses:result.statuses||[],errors:result.errors||[]}));if(payload.byteLength>1_000_000)throw Error('Price import exceeds its supported size');
   const imported=await importAtSite('/api/market-prices-import',{bytes:payload},'application/json',null,args.token);
   console.log(JSON.stringify({source:'Public EC and FPMA price connectors',series:count(imported,['series','seriesCount','count'])??result.prices.series.length,observations:count(imported,['observations','observationCount','records'])??result.prices.series.reduce((n,s)=>n+s.observations.length,0),asOf:asOf(imported)??result.prices.retrievedAt??null,sourceErrors:result.errors?.length||0,imported:true}));
  });
 }
 if(args.faostatOnly!==true){
  await runLeg('International buyer and supplier discovery',async()=>{
   const moduleBytes=await privateDownload('/api/company-discovery-module','text/javascript, application/javascript',1_500_000,args.token),connector=await import('data:text/javascript,'+encodeURIComponent(new TextDecoder().decode(moduleBytes)));
   if(typeof connector.refreshInternationalDirectory!=='function'||!connector.companySourceGroups)throw Error('Private directory connector is missing its supported refresh exports');
   const stateBytes=await privateDownload('/api/company-discovery-state','application/json',6_000_000,args.token);let previous;
   try{previous=JSON.parse(new TextDecoder().decode(stateBytes));}catch{throw Error('Private directory state is not valid JSON');}
   if(!previous||!Array.isArray(previous.records))throw Error('Private directory state is missing its saved records');
   const result=await connector.refreshInternationalDirectory(previous,{sourceGroups:connector.companySourceGroups,timeoutMs:20000});
   if(!Array.isArray(result?.records)||!result.records.length)throw Error('Directory refresh returned no records; prior Site discovery data retained');
   const payload=new TextEncoder().encode(JSON.stringify(result));if(payload.byteLength>6_000_000)throw Error('Directory import exceeds its supported size');
   const imported=await importAtSite('/api/company-discovery-import',{bytes:payload},'application/json',null,args.token);
   const sourceErrors=Array.isArray(result.errors)?result.errors.length:0,statusIssues=Array.isArray(result.statuses)?result.statuses.filter(s=>['error','snapshot','partial','unavailable'].includes(s.status)).length:0;
   console.log(JSON.stringify({source:'International buyer and supplier discovery',records:count(imported,['records','recordCount','count'])??result.records.length,countries:new Set(result.records.map(r=>r.country).filter(Boolean)).size,sourceErrors,sourceStatusIssues:statusIssues,imported:true}));
  });
 }
 if(failures.length){console.error(JSON.stringify({relay:'completed with import failures',failedLegs:failures.length}));process.exitCode=1;}
}catch(error){console.error('FAOSTAT relay failed: '+error.message);process.exitCode=1;}
