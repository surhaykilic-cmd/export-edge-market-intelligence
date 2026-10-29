import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const workspace=fileURLToPath(new URL('../',import.meta.url));
const credential='site-request-fixture-only-token';
const mock=String.raw`
const origin='https://export-legacy-market-intelligence.surhay-nart.chatgpt.site';
globalThis.fetch=async(url,options={})=>{
 if(process.env.SITE_REQUEST_AUTH_TEST_CASE==='digest')throw Error('Digest-only requests must never use the network');
 if(String(url)!==origin+'/api/status')throw Error('Site request must stay at the approved fixed origin and path');
 if(options.headers?.['OAI-Sites-Authorization']!=='Bearer site-request-fixture-only-token'||options.headers?.['X-Export-Edge-Update-Token']!=='site-request-fixture-only-token')throw Error('Both maintenance authentication headers are required');
 if(options.redirect!=='error')throw Error('Maintenance credentials must not follow redirects');
 return Response.json({checked:true});
};`;
const run=(body,mode='request')=>{
 const result=spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(mock),'scripts/site-request.mjs'],{cwd:workspace,encoding:'utf8',input:(typeof body==='string'?body:JSON.stringify(body))+'\n',timeout:10000,maxBuffer:1_000_000,env:{...process.env,SITE_REQUEST_AUTH_TEST_CASE:mode}});
 assert.ifError(result.error);assert(!result.stdout.includes(credential)&&!result.stderr.includes(credential),'Credentials must stay out of request logs');return result;
};
let result=run({token:credential,digestOnly:true},'digest');assert.equal(result.status,0,result.stderr);
const summaries=result.stdout.split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
assert.deepEqual(summaries,[{sha256:createHash('sha256').update(credential,'utf8').digest('hex')}],'Digest mode must print only the verifier JSON and perform no requests');
result=run({token:credential,actions:[{path:'/api/status'}]});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/"checked":true/);
for(const token of [undefined,'',credential+'\r\ninjected: value',credential+'\0']){
 result=run({token,digestOnly:true},'digest');assert.notEqual(result.status,0);assert(!result.stdout.includes('"sha256"'),'Invalid credentials must not produce a verifier');
}
result=run('{"token":"'+credential+'",','digest');assert.notEqual(result.status,0);assert.match(result.stderr,/Provide one JSON request object/,'Malformed JSON must not echo credential-bearing input in its parse error');
result=run({token:credential,actions:[{path:'https://untrusted.example/api/status'}]});assert.notEqual(result.status,0);assert.match(result.stderr,/Unsupported site operation/);
console.log('Passed: hidden-input verifier generation without network access, both fixed-Site maintenance headers, redirect rejection, invalid-token/JSON rejection and credential-free logs.');
