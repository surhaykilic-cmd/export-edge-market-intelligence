import {csvFields} from './parsers.mjs';
const FAOSTAT_JSON='https://bulks-faostat.fao.org/production/datasets_E.json';
const FAOSTAT_XML='https://bulks-faostat.fao.org/production/datasets_E.xml';
const FAOSTAT_PRICES='https://bulks-faostat.fao.org/production/Prices_E_All_Data_(Normalized).zip';
const FAO_USER_AGENT='ExportEdgeResearch/0.3 (+https://export-legacy-market-intelligence.surhay-nart.chatgpt.site; public-statistics-import)';
const faoText=s=>String(s??'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
export function parseFaostatCatalog(value,format='json'){
 if(format==='xml'&&(typeof value!=='string'||!/^(?:\s*<\?xml[^>]*\?>)?\s*<Datasets\b[^>]*>[\s\S]*<\/Datasets>\s*$/.test(value)))throw Error('FAOSTAT XML catalog is incomplete or malformed');
 if(format!=='xml'&&(!value||typeof value!=='object'))throw Error('FAOSTAT JSON catalog is invalid');
 let rows;if(format==='xml')rows=[...value.matchAll(/<Dataset\b[^>]*>([\s\S]*?)<\/Dataset>/g)].map(m=>Object.fromEntries([...m[1].matchAll(/<([A-Za-z][\w]*)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(x=>[x[1],faoText(x[2])])));else rows=Array.isArray(value)?value:value.Datasets?.Dataset||value.Datasets||value.datasets||value.data;
 if(!Array.isArray(rows)||rows.length<20||rows.some(r=>!r.DatasetCode||!r.DatasetName||!/^https:\/\/bulks-faostat\.fao\.org\/production\//.test(r.FileLocation)))throw Error('FAOSTAT catalog shape or official download URLs changed');
 return rows.map(r=>({code:r.DatasetCode,name:r.DatasetName,updatedAt:r.DateUpdate,url:r.FileLocation,size:r.FileSize,rows:r.FileRows}));
}
export async function refreshFaostatCatalog(previous={datasets:[]}){
 const attempts=[];for(const [url,format] of [[FAOSTAT_JSON,'json'],[FAOSTAT_XML,'xml']])try{
   const response=await fetch(url,{headers:{Accept:format==='xml'?'application/xml,text/xml':'application/json','User-Agent':FAO_USER_AGENT},signal:AbortSignal.timeout(15000)});
   if(!response.ok){attempts.push({url,status:response.status});await response.body?.cancel();continue;}
   const datasets=parseFaostatCatalog(format==='json'?await response.json():await response.text(),format);
   return {kind:'catalog',source:'FAOSTAT',sourceUrl:url,retrievedAt:new Date().toISOString(),datasets,connection:{status:'connected',representation:format,attempts},note:'Official release metadata. Annual producer-price observations are shown separately under Prices.'};
 }catch(e){attempts.push({url,error:e.message});}
 const error=Error('Official FAOSTAT catalog representations are unavailable from this runtime');error.attempts=attempts;throw error;
}
function faostatMember(buffer,pattern){
 const bytes=new Uint8Array(buffer),v=new DataView(buffer);let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65558);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0)throw Error('FAOSTAT source is not a ZIP archive');let off=v.getUint32(end+16,true);for(let n=0;n<v.getUint16(end+10,true);n++){
  if(v.getUint32(off,true)!==0x02014b50)throw Error('Invalid FAOSTAT ZIP directory');const method=v.getUint16(off+10,true),size=v.getUint32(off+20,true),expanded=v.getUint32(off+24,true),nl=v.getUint16(off+28,true),el=v.getUint16(off+30,true),cl=v.getUint16(off+32,true),start=v.getUint32(off+42,true),name=new TextDecoder().decode(bytes.subarray(off+46,off+46+nl));off+=46+nl+el+cl;
  if(!pattern.test(name))continue;if(expanded>280_000_000||size>20_000_000)throw Error('FAOSTAT archive size limit exceeded');
  const payload=start+30+v.getUint16(start+26,true)+v.getUint16(start+28,true);let stream=new Blob([bytes.subarray(payload,payload+size)]).stream();if(method===8)stream=stream.pipeThrough(new DecompressionStream('deflate-raw'));else if(method!==0)throw Error('Unsupported FAOSTAT archive compression');return stream;
 }throw Error('Expected FAOSTAT CSV member missing');
}
const normalArea=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export async function parseFaostatPrices(buffer,countries){
 const countrySet=new Set(countries.map(c=>normalArea(c.country)));for(const c of countries){if(c.country==='United States')countrySet.add('unitedstatesofamerica');if(c.country==='United Kingdom')countrySet.add('unitedkingdomofgreatbritainandnorthernireland');if(c.country==='China')countrySet.add('chinamainland');}
 const products=new Set(['15','27','44','56','236','116','388','403','486','490','515','560','572','656','661','667','687','1182','882','867','1058','1062','221','222','257']);
 const flagLabels={};const flagText=await new Response(faostatMember(buffer,/Prices_E_Flags\.csv$/i)).text();const flagLines=flagText.trim().split(/\r?\n/).map(csvFields);const flagHeaders=flagLines.shift();for(const fields of flagLines){const r=Object.fromEntries(flagHeaders.map((h,i)=>[h.replace(/^\uFEFF/,'').trim(),fields[i]]));flagLabels[r.Flag??r.Code]=r.Description??r.Label??r.Flag_Description;}
 const reader=faostatMember(buffer,/Prices_E_All_Data_\(Normalized\)\.csv$/i).pipeThrough(new TextDecoderStream()).getReader();let tail='',headers,total=0;const map=new Map(),keys=new Set(),since=new Date().getUTCFullYear()-6;
 const consume=line=>{
   if(!line)return;if(!headers){headers=csvFields(line.replace(/^\uFEFF/,'').replace(/\r$/,''));if(!headers.includes('Element Code')||!headers.includes('Months Code'))throw Error('FAOSTAT price headers changed');return;}
   if(!line.includes('Producer Price (USD/tonne)')||!line.includes('Annual value'))return;
   const fields=csvFields(line.replace(/\r$/,'')),r=Object.fromEntries(headers.map((h,i)=>[h,fields[i]]));if(r['Element Code']!=='5532'||r['Months Code']!=='7021'||+r.Year<since||!products.has(r['Item Code'])||!countrySet.has(normalArea(r.Area)))return;
   if(!r.Value?.trim()||!Number.isFinite(+r.Value)||+r.Value<0)return;
   const id=`faostat-pp-${r['Area Code']}-${r['Item Code']}`,key=id+'/'+r.Year;if(keys.has(key))throw Error('Duplicate FAOSTAT producer-price observation');keys.add(key);
   if(!map.has(id))map.set(id,{id,name:`${r.Item} · ${r.Area}`,product:r.Item,country:r.Area,currency:'USD',unit:'USD/tonne',source:'FAO FAOSTAT Producer Prices',sourceId:'faostat-producer-prices',sourceUrl:FAOSTAT_PRICES,frequency:'Annual',retrievedAt:new Date().toISOString(),notes:'Annual national producer price in USD per tonne. This is not an export quote or a wholesale market offer. Country and product definitions follow FAOSTAT; flags are retained for each year.',observations:[]});
   map.get(id).observations.push({period:String(r.Year),value:+r.Value,flag:r.Flag,flagDescription:flagLabels[r.Flag]||r.Flag,unit:r.Unit,areaCode:r['Area Code'],itemCode:r['Item Code'],elementCode:r['Element Code']});
 };
 while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>280_000_000)throw Error('FAOSTAT decompression limit exceeded');const parts=(tail+value).split('\n');tail=parts.pop();for(const line of parts)consume(line);if(tail.length>100000)throw Error('FAOSTAT CSV line too long');}consume(tail);
 const series=[...map.values()];for(const s of series)s.observations.sort((a,b)=>a.period.localeCompare(b.period));if(series.length<20)throw Error('Too few recognised FAOSTAT producer-price series');return {series,retrievedAt:new Date().toISOString(),source:'FAOSTAT',sourceUrl:FAOSTAT_PRICES,kind:'producer-prices',countries:countrySet.size};
}
export async function refreshFaostatPrices(previous,countries){
 const response=await fetch(FAOSTAT_PRICES,{headers:{'User-Agent':FAO_USER_AGENT},signal:AbortSignal.timeout(25000)});if(!response.ok){await response.body?.cancel();throw Error(`FAOSTAT producer-price archive HTTP ${response.status}`);}return parseFaostatPrices(await response.arrayBuffer(),countries);
}
