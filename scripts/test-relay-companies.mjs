import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Run the real relay in a fresh process. Every request is intercepted before the
// relay starts; these fixtures never contact a Site or an official data source.
const workspace=fileURLToPath(new URL('../',import.meta.url));
const credential='relay-fixture-private-token';
const mock=String.raw`
const origin='https://export-legacy-market-intelligence.surhay-nart.chatgpt.site';
const privatePaths=['/api/company-discovery-module','/api/company-discovery-state','/api/company-discovery-import','/api/market-feeds-module'];
globalThis.fetch=async(url,options={})=>{
 url=String(url);const auth=options.headers?.['OAI-Sites-Authorization'];
 if(!url.startsWith(origin)&&auth)throw Error('Credential must never reach a public source');
 if(url.startsWith(origin)){
  const path=new URL(url).pathname;
  if(!privatePaths.includes(path))throw Error('Unexpected private endpoint');
  if(auth!=='Bearer relay-fixture-private-token'||options.redirect!=='error')throw Error('Private request must authenticate and reject redirects');
 }
 if(url===origin+'/api/company-discovery-module')return new Response(
  "export const companySourceGroups=[{id:'fixture-group'}];export async function refreshInternationalDirectory(previous,options){if(options.timeoutMs!==20000||options.sourceGroups?.[0]?.id!=='fixture-group')throw Error('Wrong directory refresh options');if(previous.records.length!==2)throw Error('Saved records were not supplied');return {...previous,statuses:[{id:'India',status:'snapshot'}],errors:[{source:'India',error:'Source unavailable; saved snapshot retained'}]};}",
  {headers:{'content-type':'text/javascript'}});
 if(url===origin+'/api/company-discovery-state')return Response.json({records:[{name:'Fixture supplier name',country:'India'},{name:'Fixture buyer name',country:'France'}]});
 if(url===origin+'/api/company-discovery-import'){
  if(options.method!=='POST')throw Error('Directory import must use POST');
  const body=JSON.parse(new TextDecoder().decode(options.body));
  if(body.records.length!==2||body.errors.length!==1||body.statuses[0].status!=='snapshot')throw Error('Directory evidence or source failures were discarded');
  return Response.json({records:2});
 }
 if(process.env.EXPORT_LEGACY_RELAY_TEST_CASE==='companiesOnly')throw Error('Focused directory mode requested an unrelated source');
 if(url===origin+'/api/market-feeds-module')return new Response('Fixture price connector outage',{status:503});
 if(url.startsWith('https://bulks-faostat.fao.org/'))return new Response('Fixture FAOSTAT outage',{status:503});
 throw Error('Unexpected fixture request');
};`;

for(const mode of ['companiesOnly','earlierFailure','faostatOnly']){
 const flags={token:credential,...(mode==='companiesOnly'?{companiesOnly:true}:mode==='faostatOnly'?{faostatOnly:true}:{})};
 const run=spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(mock),'scripts/relay-faostat.mjs'],{
  cwd:workspace,encoding:'utf8',input:JSON.stringify(flags)+'\n',timeout:10000,maxBuffer:1_000_000,env:{...process.env,EXPORT_LEGACY_RELAY_TEST_CASE:mode}
 });
 assert.ifError(run.error);
 assert(!run.stdout.includes(credential)&&!run.stderr.includes(credential),'Private credentials must stay out of all relay logs');
 assert(!run.stdout.includes('Fixture supplier name')&&!run.stdout.includes('Fixture buyer name'),'Relay logs must contain summaries rather than record details');
 const summaries=run.stdout.split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
 const directory=summaries.find(s=>s.source==='International buyer and supplier discovery');
 if(mode==='companiesOnly'){
  assert.equal(run.status,0,run.stderr);assert.equal(summaries.length,1,'Focused mode must skip all FAOSTAT and price legs');
  assert.equal(directory?.records,2);assert.equal(directory.countries,2);assert.equal(directory.sourceErrors,1);assert.equal(directory.sourceStatusIssues,1);assert.equal(directory.imported,true);
 }else if(mode==='earlierFailure'){
  assert.equal(run.status,1,'Material failures must remain visible to the scheduler');
  assert.equal(directory?.records,2,'Directory import must still run after failures in every earlier leg');assert.equal(directory.imported,true);
  assert.match(run.stderr,/"failedLegs":3/,'Each independent FAOSTAT/catalog, FAOSTAT/prices and EC/FPMA failure is counted');
 }else{
  assert.equal(run.status,1,'Fixture FAOSTAT outages remain material failures');assert.equal(directory,undefined,'faostatOnly must skip directory refresh');
  assert(!run.stderr.includes('Public EC and FPMA'),'faostatOnly must skip the public-price connector');assert.match(run.stderr,/"failedLegs":2/);
 }
}
console.log('Passed: focused directory refresh, retained-snapshot error reporting, earlier-leg failure isolation, FAOSTAT-only isolation, private authentication, no credential leakage and summary-only logs.');
