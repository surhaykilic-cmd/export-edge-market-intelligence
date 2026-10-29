import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {refreshInternationalCompanies} from '../worker/companies-international.mjs';
const file='data/companies-international.json',previous=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{records:[]};
let usedNativeTransport=false;
// The EIC host currently fails Node's TLS negotiation but succeeds with Windows' native,
// certificate-validating HTTP client. Keep that transport choice out of the Worker module.
// Input travels over stdin, not shell interpolation; only the two exact public URLs are allowed.
const nativeScript=`$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
try {
 $request=[Console]::In.ReadToEnd()|ConvertFrom-Json
 $uri=[Uri]$request.url
 if($uri.Scheme -ne 'https' -or $uri.Host -ne 'archive.eicindia.gov.in' -or $uri.AbsolutePath -ne '/WebApp1/pages/menuInfo/approvedCommoditiesList.xhtml' -or $uri.Query -notin @('?CT=MP','?CT=FFP')){throw 'Unexpected public register URL'}
 $headers=@{}; foreach($property in $request.headers.PSObject.Properties){$headers[$property.Name]=[string]$property.Value}
 $arguments=@{Uri=$request.url;Method=$request.method;Headers=$headers;TimeoutSec=16;UseBasicParsing=$true;MaximumRedirection=0}
 if($request.method -eq 'POST'){$arguments.Body=[string]$request.body}
 $response=Invoke-WebRequest @arguments
 $responseHeaders=@{}; foreach($key in $response.Headers.Keys){$responseHeaders[$key]=[string]::Join(', ',[string[]]$response.Headers[$key])}
 [Console]::Write((@{status=[int]$response.StatusCode;headers=$responseHeaders;text=[string]$response.Content}|ConvertTo-Json -Depth 4 -Compress))
}catch{[Console]::Error.Write('Native official-register HTTP request failed'); exit 1}`;
const standardFetch=globalThis.fetch;
if(process.platform==='win32'&&!process.argv.includes('--web-fetch-only'))globalThis.fetch=(input,settings={})=>{
 const url=new URL(String(input));if(url.hostname!=='archive.eicindia.gov.in')return standardFetch(input,settings);
 if(url.protocol!=='https:'||url.pathname!=='/WebApp1/pages/menuInfo/approvedCommoditiesList.xhtml'||!['?CT=MP','?CT=FFP'].includes(url.search))return Promise.reject(Error('Unexpected public register URL'));
 usedNativeTransport=true;
 return new Promise((resolve,reject)=>{
  const child=execFile('pwsh.exe',['-NoProfile','-NonInteractive','-Command',nativeScript],{windowsHide:true,encoding:'utf8',maxBuffer:8_000_000,timeout:18000,signal:settings.signal},(error,stdout)=>{if(error){reject(Error('Windows native public-register request failed'));return;}try{const response=JSON.parse(stdout);resolve(new Response(response.text,{status:response.status,headers:response.headers}));}catch{reject(Error('Invalid native public-register response'));}});
  child.stdin.end(JSON.stringify({url:url.href,method:settings.method||'GET',headers:settings.headers||{},body:settings.body||null}));
 });
};
const result=await refreshInternationalCompanies(previous);
if(usedNativeTransport){
 const source=result.statuses.find(s=>s.id==='in-eic-approved');
 if(source?.status==='connected')Object.assign(source,{status:'snapshot',refreshMode:'snapshot-only',refreshWarning:'Portable Node refresh currently fails SELF_SIGNED_CERT_IN_CHAIN. Certificate-validating Windows import succeeded; hosted automatic refresh has not been verified.',detail:source.detail+' Verified native-HTTP snapshot only; hosted automatic refresh is not connected because Node rejects the source certificate chain.'});
}
if(!result.records.length)throw Error(`No official international establishment evidence retrieved: ${JSON.stringify(result.errors)}`);
mkdirSync('data',{recursive:true});writeFileSync(file,JSON.stringify(result,null,2));
console.log(JSON.stringify({records:result.records.length,countries:[...new Set(result.records.map(r=>r.country))],sources:result.statuses,errors:result.errors}));
