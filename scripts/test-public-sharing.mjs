import assert from 'node:assert/strict';
import {createWorker,authorizeMaintenance} from '../worker/index.mjs';
import {AUTH_ENV,OWNER_HEADERS,TEST_OWNER_EMAIL,TEST_SERVICE_TOKEN} from './auth-fixture.mjs';

const origin='https://public.example';
const serviceHeaders={'X-Export-Edge-Update-Token':TEST_SERVICE_TOKEN};
const request=(path,{method='GET',headers={},body}={})=>new Request(origin+path,{method,headers,...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
const rpc=(name,args={},headers={})=>request('/mcp',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}}});

assert.equal(await authorizeMaintenance(request('/',{headers:OWNER_HEADERS}),AUTH_ENV),true,'The verified owner identity must authorize maintenance');
assert.equal(await authorizeMaintenance(request('/',{headers:serviceHeaders}),AUTH_ENV),true,'The same-Site service token must authorize maintenance');
assert.equal(await authorizeMaintenance(request('/',{headers:{'oai-authenticated-user-id':'owner-id','oai-authenticated-user-email':TEST_OWNER_EMAIL.toUpperCase()}}),AUTH_ENV),true,'Verified owner email matching is case-insensitive');
for(const [label,headers,env] of [
 ['anonymous',{},AUTH_ENV],
 ['wrong service token',{'X-Export-Edge-Update-Token':'wrong-test-token'},AUTH_ENV],
 ['platform bypass header alone',{'OAI-Sites-Authorization':'Bearer '+TEST_SERVICE_TOKEN},AUTH_ENV],
 ['invited signed-in visitor',{'oai-authenticated-user-id':'different-site-user','oai-authenticated-user-email':'viewer@example.test'},AUTH_ENV],
 ['owner email without platform user ID',{'oai-authenticated-user-email':TEST_OWNER_EMAIL},AUTH_ENV],
 ['blank platform user ID',{'oai-authenticated-user-id':'   ','oai-authenticated-user-email':TEST_OWNER_EMAIL},AUTH_ENV],
 ['platform ID without matching email',{'oai-authenticated-user-id':'fixture-site-scoped-owner'},AUTH_ENV],
 ['unset owner/service configuration',OWNER_HEADERS,{}],
 ['unset service configuration',serviceHeaders,{}],
 ['malformed service verifier',serviceHeaders,{UPDATE_SERVICE_TOKEN_SHA256:'not-a-sha256-verifier'}]
])assert.equal(await authorizeMaintenance(request('/',{headers}),env),false,label+' must not authorize maintenance');

const initial={dataset:{markets:[],retrievedAt:'2026-10-29'},benchmarks:{series:[]},production:{datasets:[]},supply:{records:[]},fpma:{series:[]},faostatPrices:{series:[]},marketFeeds:{prices:{series:[]},news:{items:[]}},companies:{records:[]},internationalCompanies:{records:[],statuses:[]},sourceStatus:[],runs:[],cursor:0,automaticUpdates:{enabled:true,id:'fixture-existing-daily'}};
let persisted=structuredClone(initial),etag='v0',writes=0,upstreamCalls=0;
const BUCKET={async get(){return {etag,json:async()=>structuredClone(persisted)};},async put(key,body,options){assert.equal(key,'agriculture/current.json');assert.equal(options.onlyIf.etagMatches,etag);persisted=JSON.parse(body);etag='v'+(++writes);return {etag};}};
const env={...AUTH_ENV,BUCKET};
const app=createWorker({seed:initial.dataset,catalog:{countries:[],products:[]},sources:{sources:[]},assets:{'/index.html':{body:'<title>Export Edge Market Intelligence</title>',type:'text/html'},'/style.css':{body:':root{--primary:#273fa8}',type:'text/css'}},faostatRelayScript:'export const relay=true;',marketFeedsModule:'export const marketFeeds=true;',companyDiscoveryModule:'export const companyDiscovery=true;',revision:'public-sharing-auth-test'});
const originalFetch=globalThis.fetch,originalCompanies=globalThis.refreshCompanies;
globalThis.fetch=async()=>{upstreamCalls++;throw Error('An authorization fixture must not contact an upstream source');};
globalThis.refreshCompanies=async previous=>({...previous,statuses:[],errors:[]});
const mutations=['/api/refresh','/api/schedule-confirmed','/api/faostat/catalog-import','/api/faostat/prices-import','/api/company-discovery-import','/api/market-prices-import'];
const maintenance=['/api/faostat-relay-script','/api/market-feeds-module','/api/company-discovery-module','/api/company-discovery-state'];
const badActors=[
 {label:'anonymous',headers:{},env},
 {label:'wrong service token',headers:{'X-Export-Edge-Update-Token':'wrong-test-token'},env},
 {label:'non-owner signed-in viewer',headers:{'oai-authenticated-user-id':'viewer-site-id','oai-authenticated-user-email':'viewer@example.test'},env},
 {label:'email-only impersonation',headers:{'oai-authenticated-user-email':TEST_OWNER_EMAIL},env},
 {label:'unset server authorization',headers:{...OWNER_HEADERS,...serviceHeaders},env:{BUCKET}}
];
let denied=0;
async function assertDenied(req,bindings,label,{mcp=false}={}){
 const before=structuredClone(persisted),beforeWrites=writes,beforeUpstream=upstreamCalls,response=await app.fetch(req,bindings),text=await response.text();
 if(mcp&&response.status===200){const result=JSON.parse(text);assert.equal(result.result?.isError,true,label+' must return an MCP authorization error');}
 else assert.equal(response.status,403,label+' must be denied');
 assert.deepEqual(persisted,before,label+' must not modify saved data');assert.equal(writes,beforeWrites,label+' must never invoke the storage writer');assert.equal(upstreamCalls,beforeUpstream,label+' must not trigger upstream calls');
 assert(!text.includes(TEST_SERVICE_TOKEN),'Responses must not echo service tokens');assert(!text.includes(AUTH_ENV.UPDATE_SERVICE_TOKEN_SHA256),'Responses must not expose configured token verifiers');denied++;
}
try{
 for(const actor of badActors){
  for(const path of mutations)await assertDenied(request(path,{method:'POST',headers:actor.headers,body:'deliberately invalid JSON'}),actor.env,actor.label+' '+path);
  for(const path of maintenance)for(const method of ['GET','HEAD'])await assertDenied(request(path,{method,headers:actor.headers}),actor.env,actor.label+' '+method+' '+path);
  await assertDenied(rpc('refresh_agriculture_data',{scope:'companies'},actor.headers),actor.env,actor.label+' MCP refresh',{mcp:true});
 }
 assert.equal(writes,0);assert.equal(upstreamCalls,0);

 for(const path of ['/','/style.css','/data.json','/api/catalog','/api/data','/api/status','/api/benchmarks','/api/news','/api/companies','/api/production','/api/fpma','/api/sources','/api/update-instructions']){
  const response=await app.fetch(request(path),env);assert.equal(response.status,200,'Public research must stay readable: '+path);const body=await response.text();assert(!body.includes(TEST_SERVICE_TOKEN)&&!body.includes(AUTH_ENV.UPDATE_SERVICE_TOKEN_SHA256),'Public routes must not contain update credentials');
 }
 let response=await app.fetch(rpc('get_agriculture_update_status'),env);assert.equal(response.status,200);let value=await response.json();assert(!value.result?.isError,'Anonymous MCP status is read-only');
 for(const method of ['server/discover','initialize','tools/list']){response=await app.fetch(request('/mcp',{method:'POST',body:{jsonrpc:'2.0',id:1,method}}),env);assert.equal(response.status,200,'MCP '+method+' must remain discoverable');}
 assert.equal(writes,0);assert.equal(upstreamCalls,0);

 for(const [label,headers] of [['scheduled service',serviceHeaders],['verified owner',OWNER_HEADERS]]){
  for(const path of maintenance){response=await app.fetch(request(path,{headers}),env);assert.equal(response.status,200,label+' must read required maintenance material: '+path);}
  response=await app.fetch(request('/api/schedule-confirmed',{method:'POST',headers,body:{enabled:true,id:'fixture-'+label}}),env);assert.equal(response.status,200,label+' must retain the authorized writer');assert.equal(persisted.automaticUpdates.id,'fixture-'+label);
  response=await app.fetch(rpc('refresh_agriculture_data',{scope:'companies'},headers),env);assert.equal(response.status,200);value=await response.json();assert(!value.result?.isError,label+' must invoke the authorized MCP updater');
  await assertDenied(request('/api/schedule-confirmed',{method:'POST',headers:{...headers,Origin:'https://other.example'},body:{enabled:false,id:'cross-origin'}}),env,label+' cross-origin write');
 }
 assert.equal(writes,4,'Only the two authorized schedule writes and two authorized MCP refreshes should persist');assert.equal(upstreamCalls,0);
 console.log(JSON.stringify({passed:true,deniedRequests:denied,authorizedWrites:writes,upstreamCalls,checked:['anonymous and invited viewers cannot write','unset credentials fail closed','owner email requires platform identity','same-Site service verifier','public research and MCP status','protected maintenance modules and raw state','MCP mutation authorization','cross-origin protection','no credential echo','no writes or upstream work before authorization']}));
}finally{globalThis.fetch=originalFetch;if(originalCompanies===undefined)delete globalThis.refreshCompanies;else globalThis.refreshCompanies=originalCompanies;}
