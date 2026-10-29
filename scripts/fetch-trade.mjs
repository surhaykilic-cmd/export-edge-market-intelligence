import fs from 'node:fs/promises';
import path from 'node:path';
import {mergeReturnedObservations} from './trade-merge.mjs';
const root=path.resolve(import.meta.dirname,'..');
const dataPath=path.join(root,'dist/data.json');
const catalog=JSON.parse(await fs.readFile(path.join(root,'data/catalog.json'),'utf8'));
const prior=JSON.parse(await fs.readFile(dataPath,'utf8'));
const existing=new Map(prior.markets.map(m=>[`${m.code}-${m.hs}`,m]));
const checkpointPath=path.join(root,'data/trade-checkpoint.json');
let checkpoint={queries:{},startedAt:new Date().toISOString()};
try{checkpoint=JSON.parse(await fs.readFile(checkpointPath,'utf8'));}catch{}
const limit=Number(process.argv.find(a=>a.startsWith('--limit='))?.split('=')[1]??Infinity);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const stats={attempted:0,completed:0,failed:0,empty:0,records:0,errors:[]};
const queryUrl=(code,hs,year)=>`https://comtradeapi.un.org/public/v1/preview/C/A/HS?period=${year}&reporterCode=${code}&cmdCode=${hs}&flowCode=X,M&partnerCode=0&partner2Code=0&customsCode=C00&motCode=0&maxRecords=500`;
async function writeJson(file,obj){const temp=file+'.tmp';await fs.writeFile(temp,JSON.stringify(obj,null,2));await fs.rename(temp,file);}
function snapshot(){
 const markets=[];
 for(const country of catalog.countries)for(const product of catalog.products){
  const key=`${country.code}-${product.hs}`,old=existing.get(key);
  const market={...country,...product,id:old?.id??key,records:[...(old?.records??[])],sourceUrls:[...(old?.sourceUrls??[])],sourceUrl:old?.sourceUrl??queryUrl(country.code,product.hs,catalog.years.at(-1)),lastSuccessfulFetchAt:old?.lastSuccessfulFetchAt??(old?.records?.length?prior.retrievedAt:null),availability:{}};
  for(const year of catalog.years){
   const q=checkpoint.queries[`${country.code}-${year}`];const url=queryUrl(country.code,product.hs,year);
   market.sourceUrls=[...new Set([...market.sourceUrls.filter(s=>new URL(s).searchParams.get('period')!==String(year)),url])];
   if(q?.status==='success'){
    const matches=q.data.filter(r=>r.hs===product.hs);
    if(matches.length){
     market.records=mergeReturnedObservations(market.records,matches.map(({hs,...r})=>r));
     market.lastSuccessfulFetchAt=q.fetchedAt;
    }
    market.availability[year]={status:matches.length?'available':(market.records.some(r=>r.year===year)?'retained':'not_returned'),checkedAt:q.fetchedAt};
   }else market.availability[year]={status:q?.status==='failed'?'fetch_failed':'not_checked',checkedAt:q?.attemptedAt??null};
  }
  market.records.sort((a,b)=>a.year-b.year||a.flow.localeCompare(b.flow));
  market.sourceUrl=queryUrl(country.code,product.hs,catalog.years.at(-1));
  markets.push(market);
 }
 const allQueries=Object.values(checkpoint.queries);
 return {retrievedAt:new Date().toISOString(),source:'UN Comtrade',frequency:'Annual',partner:'World',markets,catalog:{products:catalog.products.length,countries:catalog.countries.length,markets:markets.length},collection:{startedAt:checkpoint.startedAt,lastRunAt:new Date().toISOString(),targetQueries:catalog.countries.length*catalog.years.length,completedQueries:allQueries.filter(q=>q.status==='success').length,failedQueries:allQueries.filter(q=>q.status==='failed').length,emptyQueries:allQueries.filter(q=>q.status==='success'&&q.data.length===0).length,observations:markets.reduce((n,m)=>n+m.records.length,0),marketsWithData:markets.filter(m=>m.records.length).length,errors:allQueries.filter(q=>q.status==='failed').map(q=>({countryCode:q.countryCode,year:q.year,message:q.message})),sourceLimit:'Public API preview, 500 records per request. Missing responses are not zero trade. No company-level transaction data.'}};
}
let requests=0;
outer:for(const country of catalog.countries)for(const year of catalog.years){
 const key=`${country.code}-${year}`;
 if(checkpoint.queries[key]?.status==='success'&&!process.argv.includes('--refresh'))continue;
 if(requests>=limit)break outer;
 requests++;stats.attempted++;
 const url=queryUrl(country.code,catalog.products.map(p=>p.hs).join(','),year);
 try{
  let result;
  for(let attempt=0;attempt<5;attempt++){
   const response=await fetch(url,{signal:AbortSignal.timeout(45000)});
   if(response.status===429){const retry=Number(response.headers.get('retry-after'))||5*(attempt+1);console.log(`${country.country} ${year}: rate limited, waiting ${retry}s`);await pause(Math.min(retry,30)*1000);continue;}
   if(!response.ok)throw Error(`HTTP ${response.status}: ${(await response.text()).slice(0,250)}`);
   result=await response.json();break;
  }
  if(!result)throw Error('Rate limit persisted after backoff');
  if(result.error)throw Error(String(result.error));
  if(!Array.isArray(result.data))throw Error('API did not return a data array');
  if(result.data.length>=500)throw Error('Preview row limit reached; split product batch before accepting data');
  const rows=result.data.filter(r=>catalog.products.some(p=>p.hs===r.cmdCode)&&r.reporterCode===country.code&&+r.period===year&&r.partnerCode===0&&['M','X'].includes(r.flowCode));
  const data=rows.map(r=>({hs:r.cmdCode,year,flow:r.flowCode,value:r.primaryValue,classification:r.classificationCode,isReported:r.isReported,isAggregate:r.isAggregate,netWeightKg:r.netWgt??null,isNetWeightEstimated:r.isNetWgtEstimated??null,fobValueUSD:r.fobvalue??null,cifValueUSD:r.cifvalue??null}));
  if(data.some(r=>typeof r.value!=='number'||!Number.isFinite(r.value)||r.value<0))throw Error('Invalid primary trade value');
  const unique=new Set(data.map(r=>`${r.hs}-${r.flow}`));if(unique.size!==data.length)throw Error('Duplicate country-product-year-flow observations');
  checkpoint.queries[key]={countryCode:country.code,year,status:'success',fetchedAt:new Date().toISOString(),url,data};
  stats.completed++;stats.records+=data.length;if(!data.length)stats.empty++;
  console.log(`${country.country} ${year}: ${data.length} observations`);
 }catch(error){
  checkpoint.queries[key]={countryCode:country.code,year,status:'failed',attemptedAt:new Date().toISOString(),url,message:error.message};stats.failed++;stats.errors.push(`${key}: ${error.message}`);console.log(`${country.country} ${year}: FAILED ${error.message}`);
 }
 await writeJson(checkpointPath,checkpoint);await writeJson(dataPath,snapshot());
 await pause(3300);
}
await writeJson(dataPath,snapshot());
console.log(JSON.stringify({run:stats,collection:snapshot().collection}));
