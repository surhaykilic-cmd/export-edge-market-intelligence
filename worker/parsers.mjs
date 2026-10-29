// Bounded XLSX reader for the World Bank's public monthly price workbook.
const decode = s => s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n));
export async function unzipXML(buffer) {
  const bytes=new Uint8Array(buffer),view=new DataView(buffer); let eocd=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65558);i--)if(view.getUint32(i,true)===0x06054b50){eocd=i;break;}
  if(eocd<0)throw Error('Workbook is not a ZIP archive');
  const count=view.getUint16(eocd+10,true); let offset=view.getUint32(eocd+16,true);const files={};
  if(count>500)throw Error('Workbook contains too many entries');
  for(let i=0;i<count;i++){
    if(view.getUint32(offset,true)!==0x02014b50)throw Error('Invalid ZIP directory');
    const method=view.getUint16(offset+10,true),size=view.getUint32(offset+20,true),unpacked=view.getUint32(offset+24,true),nl=view.getUint16(offset+28,true),el=view.getUint16(offset+30,true),cl=view.getUint16(offset+32,true),start=view.getUint32(offset+42,true),name=new TextDecoder().decode(bytes.subarray(offset+46,offset+46+nl));
    offset+=46+nl+el+cl;
    if(!/^(xl\/(sharedStrings\.xml|workbook\.xml|_rels\/workbook.xml.rels|worksheets\/sheet\d+\.xml))$/.test(name))continue;
    if(unpacked>12_000_000)throw Error('Workbook sheet too large');
    const dataStart=start+30+view.getUint16(start+26,true)+view.getUint16(start+28,true),compressed=bytes.slice(dataStart,dataStart+size);
    const result=method===0?compressed:method===8?new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()):null;
    if(!result)throw Error('Unsupported workbook compression');
    files[name]=new TextDecoder().decode(result);
  }return files;
}
export function readSheet(xml,sharedXML=''){
  const shared=[...sharedXML.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(m=>[...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(t=>decode(t[1])).join(''));
  return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(row=>{
    const out={};for(const c of row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)){
      const ref=c[1].match(/\br="([A-Z]+)\d+"/)?.[1],type=c[1].match(/\bt="([^"]+)"/)?.[1],v=c[2].match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1];
      if(ref)out[ref]=type==='s'?shared[+v]:type==='inlineStr'?decode(c[2].match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/)?.[1]||''):v==null?'':Number.isFinite(+v)&&v!==''?+v:decode(v);
    }return out;
  });
}
export async function parsePinkSheet(buffer,sourceUrl){
  const files=await unzipXML(buffer),workbook=files['xl/workbook.xml'];
  const sheets=[...workbook.matchAll(/<sheet\b([^>]+)\/?\s*>/g)].map(m=>({name:m[1].match(/\bname="([^"]+)"/)?.[1],id:m[1].match(/r:id="([^"]+)"/)?.[1]}));
  const sheet=sheets.find(s=>/monthly.*price/i.test(s.name));if(!sheet)throw Error('Monthly price worksheet missing');
  const rel=[...files['xl/_rels/workbook.xml.rels'].matchAll(/<Relationship\b([^>]+)\/?\s*>/g)].find(m=>m[1].includes(`Id="${sheet.id}"`));
  let target=rel?.[1].match(/Target="([^"]+)"/)?.[1];if(!target)throw Error('Worksheet relationship missing');target=target.replace(/^\//,'');if(!target.startsWith('xl/'))target='xl/'+target;
  const rows=readSheet(files[target],files['xl/sharedStrings.xml']);
  const headerIndex=rows.findIndex(r=>Object.values(r).some(v=>/^Coffee,?\s*Arabica$/i.test(String(v))));if(headerIndex<0)throw Error('Price header layout changed');
  const headers=rows[headerIndex],units=rows[headerIndex+1];const series=[];
  const agriculture=/^(Cocoa|Coffee|Tea|Coconut oil|Groundnut oil|Palm oil|Palm kernel|Soybean|Soybeans|Barley|Maize|Rice|Wheat|Banana|Orange|Sugar|Beef|Chicken|Fish|Shrimp)/i;
  for(const [col,name] of Object.entries(headers)){
    if(!agriculture.test(String(name)))continue;
    const observations=[];for(const r of rows.slice(headerIndex+2)){
      const date=String(r.A??'');const match=date.match(/^(\d{4})M(\d{2})$/);if(!match)continue;
      const period=`${match[1]}-${match[2]}`;if(period<'2020-01'||typeof r[col]!=='number'||!Number.isFinite(r[col]))continue;
      observations.push({period,value:r[col]});
    }
    if(observations.length)series.push({id:String(name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,''),name:String(name),unit:String(units[col]||'See source workbook'),source:'World Bank Pink Sheet',sourceUrl,frequency:'Monthly',observations});
  }
  if(series.length<10)throw Error('Too few recognised agriculture benchmark series');
  return {series,retrievedAt:new Date().toISOString(),source:'World Bank Pink Sheet',sourceUrl,kind:'benchmark',note:'International commodity benchmark prices, not live offers or HS-specific customs unit prices.'};
}

export function csvFields(line){
 const fields=[];let value='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){fields.push(value);value='';}else value+=c;}if(quoted)throw Error('Unexpected multiline CSV field');fields.push(value);return fields;
}
export async function parseUSDA(buffer,sourceUrl){
 const selected=new Set(['Wheat','Corn','Rice, Milled','Coffee, Green','Oil, Palm','Oil, Soybean','Oil, Sunflowerseed','Oilseed, Soybean','Sugar, Centrifugal','Barley','Sorghum','Almonds, Shelled Basis','Pistachios, Inshell Basis','Walnuts, Inshell Basis','Apples, Fresh','Oranges, Fresh','Meat, Beef and Veal','Meat, Chicken','Dairy, Milk, Fluid']);
 const bytes=new Uint8Array(buffer),v=new DataView(buffer);let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65558);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break;}if(end<0)throw Error('USDA source is not a ZIP file');
 let off=v.getUint32(end+16,true),entry;for(let n=0;n<v.getUint16(end+10,true);n++){
  if(v.getUint32(off,true)!==0x02014b50)throw Error('Invalid USDA archive');const method=v.getUint16(off+10,true),size=v.getUint32(off+20,true),expanded=v.getUint32(off+24,true),nl=v.getUint16(off+28,true),el=v.getUint16(off+30,true),cl=v.getUint16(off+32,true),start=v.getUint32(off+42,true),name=new TextDecoder().decode(bytes.subarray(off+46,off+46+nl));off+=46+nl+el+cl;
  if(/psd_alldata\.csv$/i.test(name)){entry={method,size,expanded,start};break;}
 }
 if(!entry||entry.expanded>260_000_000||entry.size>20_000_000)throw Error('Unexpected USDA archive layout or size');
 const start=entry.start+30+v.getUint16(entry.start+26,true)+v.getUint16(entry.start+28,true),compressed=bytes.subarray(start,start+entry.size);let stream=new Blob([compressed]).stream();if(entry.method===8)stream=stream.pipeThrough(new DecompressionStream('deflate-raw'));else if(entry.method!==0)throw Error('Unsupported USDA compression');
 const reader=stream.pipeThrough(new TextDecoderStream()).getReader();let tail='',headers,total=0;const records=[],keys=new Set(),latest=new Date().getUTCFullYear();
 const consume=line=>{
  if(!line)return;if(!headers){headers=csvFields(line.replace(/^\uFEFF/,'').replace(/\r$/,''));if(!headers.includes('Attribute_Description')||!headers.includes('Market_Year'))throw Error('USDA CSV headers changed');return;}
  if(!line.includes('Production'))return;const values=csvFields(line.replace(/\r$/,'')),r=Object.fromEntries(headers.map((h,i)=>[h,values[i]]));
  if(r.Attribute_Description!=='Production'||!selected.has(r.Commodity_Description)||+r.Market_Year<latest-3||+r.Market_Year>latest)return;
  const value=Number(r.Value);if(!r.Value?.trim()||!Number.isFinite(value)||value<0)throw Error('Invalid USDA production value');
  const key=`${r.Commodity_Code}/${r.Country_Code}/${r.Market_Year}`;if(keys.has(key))throw Error('Duplicate USDA production observation');keys.add(key);
  records.push({country:r.Country_Name,countryCode:r.Country_Code,isAggregate:['European Union','Other'].includes(r.Country_Name),geographyType:['European Union','Other'].includes(r.Country_Name)?'aggregate':'country_or_territory',product:r.Commodity_Description,productCode:r.Commodity_Code,year:+r.Market_Year,periodType:'marketing_year',attribute:'Production',unit:r.Unit_Description,value,source:'USDA PSD',sourceId:'usda-psd',sourceUrl,releaseYear:+r.Calendar_Year,releaseMonth:+r.Month,status:'USDA estimate/forecast; see marketing year and release vintage'});
 };
 while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>260_000_000)throw Error('USDA decompression limit exceeded');const parts=(tail+value).split('\n');tail=parts.pop();for(const line of parts)consume(line);if(tail.length>100_000)throw Error('USDA line limit exceeded');}consume(tail);
 if(records.length<100)throw Error('Too few recognised USDA production records');
 return {kind:'production-observations',retrievedAt:new Date().toISOString(),source:'USDA PSD',sourceUrl,periodType:'marketing_year',notes:'Production quantities in original commodity-specific units. Marketing years differ from calendar years. Recent years include USDA estimates/forecasts; release year/month is the source vintage. Geography labels can include regional aggregates. No cross-unit or cross-product totals are calculated.',records};
}
