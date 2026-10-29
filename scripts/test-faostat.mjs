import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {deflateRawSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {parseFaostatCatalog,refreshFaostatCatalog,parseFaostatPrices,refreshFaostatPrices} from '../worker/faostat.mjs';

const rows=Array.from({length:20},(_,i)=>({DatasetCode:`D${i}`,DatasetName:`Food & agriculture ${i}`,DateUpdate:'2026-10-01',FileLocation:`https://bulks-faostat.fao.org/production/d${i}.zip`,FileSize:'1KB',FileRows:'20'}));
const escapeXML=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const catalogXML='<?xml version="1.0" encoding="UTF-8"?><Datasets>'+rows.map(r=>'<Dataset>'+Object.entries(r).map(([k,v])=>`<${k}>${escapeXML(v)}</${k}>`).join('')+'</Dataset>').join('')+'</Datasets>';
const parsedJSON=parseFaostatCatalog({Datasets:{Dataset:rows}}),parsedXML=parseFaostatCatalog(catalogXML,'xml');
assert.deepEqual(parsedXML,parsedJSON,'Official JSON and XML representations must produce the same release catalog');
assert.equal(parsedXML[0].name,'Food & agriculture 0','XML entity labels must be decoded');
for(const invalid of [null,undefined,'not JSON',{},[],{Datasets:{Dataset:rows.slice(0,2)}}])assert.throws(()=>parseFaostatCatalog(invalid),'Malformed or implausibly small JSON catalogs must be rejected');
for(const invalid of [null,'not XML','<Datasets/>',catalogXML.replace('</Datasets>',''),catalogXML.replace('<Datasets>','<WrongRoot>'),catalogXML.replace('<DatasetCode>D0</DatasetCode>','')])assert.throws(()=>parseFaostatCatalog(invalid,'xml'),'Malformed or incomplete XML catalogs must be rejected');
assert.throws(()=>parseFaostatCatalog({Datasets:{Dataset:rows.map((r,i)=>i? r:{...r,FileLocation:'https://evil.example/production/d.zip'})}}),'External download origins must be rejected');
assert.throws(()=>parseFaostatCatalog({Datasets:{Dataset:rows.map((r,i)=>i? r:{...r,FileLocation:'https://bulks-faostat.fao.org.evil.example/production/d.zip'})}}),'Hostname-prefix tricks must be rejected');

const originalFetch=globalThis.fetch;
try{
 const requests=[];globalThis.fetch=async(url,options)=>{requests.push({url:String(url),accept:options.headers.Accept});return String(url).endsWith('.json')?new Response('Forbidden',{status:403}):new Response(catalogXML,{headers:{'Content-Type':'application/xml'}});};
 const fallback=await refreshFaostatCatalog({datasets:[{code:'prior'}]});
 assert.equal(requests.length,2,'A JSON 403 must fall back once to the documented official XML representation');
 assert.equal(requests[1].url,'https://bulks-faostat.fao.org/production/datasets_E.xml');
 assert(requests[1].accept.includes('application/xml'));assert.equal(fallback.connection.representation,'xml');assert.equal(fallback.connection.status,'connected');assert.equal(fallback.connection.attempts[0].status,403);assert.equal(fallback.datasets.length,20);
 const previous={datasets:[{code:'prior',name:'Keep this verified catalog'}],retrievedAt:'2026-10-01'},before=structuredClone(previous);
 globalThis.fetch=async()=>new Response('<Datasets/>',{headers:{'Content-Type':'application/xml'}});
 await assert.rejects(refreshFaostatCatalog(previous),'Empty/malformed representations must fail rather than install an empty catalog');assert.deepEqual(previous,before,'A failed catalog refresh must not mutate its prior snapshot');
 globalThis.fetch=async()=>new Response('Forbidden',{status:403});await assert.rejects(refreshFaostatCatalog(previous));assert.deepEqual(previous,before);
}finally{globalThis.fetch=originalFetch;}

// Minimal valid ZIP archives exercise stored and compressed source members without network calls.
const crc32=buffer=>{let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;};
function zipFixture(files,compress=true){
 const local=[],central=[];let position=0;
 for(const [name,text] of Object.entries(files)){
  const n=Buffer.from(name),plain=Buffer.from(text),body=compress?deflateRawSync(plain):plain,method=compress?8:0,crc=crc32(plain),header=Buffer.alloc(30),directory=Buffer.alloc(46);
  header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(method,8);header.writeUInt32LE(crc,14);header.writeUInt32LE(body.length,18);header.writeUInt32LE(plain.length,22);header.writeUInt16LE(n.length,26);
  directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(method,10);directory.writeUInt32LE(crc,16);directory.writeUInt32LE(body.length,20);directory.writeUInt32LE(plain.length,24);directory.writeUInt16LE(n.length,28);directory.writeUInt32LE(position,42);
  local.push(header,n,body);central.push(directory,n);position+=header.length+n.length+body.length;
 }
 const c=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(c.length,12);end.writeUInt32LE(position,16);
 const output=Buffer.concat([...local,c,end]);return output.buffer.slice(output.byteOffset,output.byteOffset+output.byteLength);
}
const year=new Date().getUTCFullYear()-1,products=['15','27','44','56','236','116','388','403','486','490','515','560','572','656','661','667','687','1182','882','867'];
const header=['Area Code','Area','Item Code','Item','Element Code','Element','Year','Months Code','Months','Unit','Value','Flag'];
const sourceRows=products.map((p,i)=>['21','Brazil',p,`Fixture crop, ${p}`,'5532','Producer Price (USD/tonne)',String(year),'7021','Annual value','USD/tonne',String(i*10),i%2?'E':'A']);
const csvLine=r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',');
const makeSource=(extra=[])=>'\ufeff'+[header,...sourceRows,...extra].map(csvLine).join('\r\n');
const flags='\ufeff"Flag","Description "\r\n"A","Official figure"\r\n"E","Estimated value"';
const files=extra=>({'Prices_E_Flags.csv':flags,'Prices_E_All_Data_(Normalized).csv':makeSource(extra)});
const countries=[{country:'Brazil'}];
const ignored=[{index:10,value:''},{index:10,value:'N/A'},{index:4,value:'5531'},{index:7,value:'7001'},{index:6,value:'2000'},{index:1,value:'Unrequested country'},{index:2,value:'99999'}].map(change=>{const r=[...sourceRows[0]];r[change.index]=change.value;return r;});
for(const compression of [false,true]){
 const data=await parseFaostatPrices(zipFixture(files(ignored),compression),countries);
 assert.equal(data.series.length,20,'Only valid requested annual USD/tonne producer-price series should be imported');
 assert.equal(data.series.reduce((n,s)=>n+s.observations.length,0),20,'Missing values, unrequested dimensions and non-annual rows must remain absent');
 assert.equal(data.series[0].observations[0].value,0,'An explicit reported zero remains valid');
 assert.equal(data.series[0].observations[0].flagDescription,'Official figure');
 assert.equal(data.series[1].observations[0].flagDescription,'Estimated value','Whitespace in the source flags header must not lose flag labels');
 assert.equal(data.series[1].observations[0].unit,'USD/tonne');assert.equal(data.series[1].frequency,'Annual');assert.equal(data.series[1].observations[0].elementCode,'5532');
}
await assert.rejects(parseFaostatPrices(zipFixture(files([sourceRows[0]])),countries),'Duplicate country/item/year observations must be rejected');
await assert.rejects(parseFaostatPrices(new ArrayBuffer(12),countries),'Malformed source archives must be rejected');
const previousPrices={series:[{id:'prior',observations:[{period:String(year),value:123}]}],retrievedAt:'2026-10-01'},priceBefore=structuredClone(previousPrices);
try{globalThis.fetch=async()=>new Response(zipFixture({'Prices_E_Flags.csv':flags,'Prices_E_All_Data_(Normalized).csv':csvLine(header)}));await assert.rejects(refreshFaostatPrices(previousPrices,countries),'An empty new archive must not become an empty successful update');assert.deepEqual(previousPrices,priceBefore);}finally{globalThis.fetch=originalFetch;}

let originalArchiveComparison=null;
if(process.argv.includes('--original')){
 const archive=new URL('../research/faostat-prices.zip',import.meta.url),catalog=JSON.parse(readFileSync(new URL('../data/catalog.json',import.meta.url),'utf8'));
 assert(existsSync(archive),'Download the official FAOSTAT source archive before --original validation');
 const bytes=readFileSync(archive),parsed=await parseFaostatPrices(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),catalog.countries);
 const compact=parsed.series.flatMap(s=>s.observations.map(o=>({areaCode:o.areaCode,itemCode:o.itemCode,year:o.period,value:o.value,unit:o.unit,flag:o.flag,flagDescription:o.flagDescription})));
 const python=process.env.FAOSTAT_VALIDATION_PYTHON||'C:/Users/Surhay/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
 const result=execFileSync(python,['-c',`
import csv,io,json,sys,zipfile
rows=json.load(sys.stdin)
expected={(r['areaCode'],r['itemCode'],r['year']):r for r in rows}
assert len(expected)==len(rows),'Duplicate parsed observation'
seen=set()
with zipfile.ZipFile(sys.argv[1]) as z:
 flags={}
 with io.TextIOWrapper(z.open(next(n for n in z.namelist() if n.endswith('Prices_E_Flags.csv'))),encoding='utf-8-sig') as f:
  reader=csv.DictReader(f)
  for raw in reader:
   r={k.strip():v for k,v in raw.items()};flags[r['Flag']]=r.get('Description') or r.get('Label') or r.get('Flag_Description')
 with io.TextIOWrapper(z.open(next(n for n in z.namelist() if n.endswith('Prices_E_All_Data_(Normalized).csv'))),encoding='utf-8-sig') as f:
  for r in csv.DictReader(f):
   if r['Element Code']!='5532' or r['Months Code']!='7021':continue
   key=(r['Area Code'],r['Item Code'],r['Year'])
   if key not in expected:continue
   assert key not in seen,'Duplicate original source observation'
   seen.add(key);p=expected[key]
   assert float(r['Value'])==p['value'],'Value changed'
   assert r['Unit']==p['unit'],'Unit changed'
   assert r['Flag']==p['flag'],'Flag changed'
   assert (flags.get(r['Flag']) or r['Flag'])==p['flagDescription'],'Flag description changed'
assert len(seen)==len(expected),'Parsed observation absent from original source'
print(json.dumps({'matchedOriginalRows':len(seen),'originalUnitsPreserved':True,'originalFlagsPreserved':True}))
`,new URL(archive).pathname.replace(/^\/([A-Za-z]:)/,'$1')],{input:JSON.stringify(compact),encoding:'utf8',maxBuffer:1024*1024});
 originalArchiveComparison=JSON.parse(result);
}
console.log(JSON.stringify({passed:true,fixtures:['JSON/XML equivalence','official XML fallback after JSON403','malformed/empty catalog rejection','untrusted download URL rejection','stored/deflated producer-price CSV parsing','original flags and zero values','unrequested/empty values excluded','duplicate observation rejection','previous data remains unchanged on failure'],originalArchiveComparison}));
