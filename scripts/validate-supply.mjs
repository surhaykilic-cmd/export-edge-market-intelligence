import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const file=path.join(root,'data/supply.json'),archive=path.join(root,'research/usda-psd.zip');
const data=JSON.parse(await fs.readFile(file,'utf8'));
assert.equal(data.source,'USDA PSD');assert.equal(data.periodType,'marketing_year');
assert(Array.isArray(data.records)&&data.records.length>0,'Supply observations must be present');
const unique=new Set(),products=new Set(),countries=new Set(),units=new Set();let aggregateRows=0;
for(const row of data.records){
 const key=`${row.productCode}|${row.countryCode}|${row.year}`;
 assert(!unique.has(key),`Duplicate production observation: ${key}`);unique.add(key);
 assert.equal(row.source,'USDA PSD');assert.equal(row.sourceId,'usda-psd');assert.equal(row.attribute,'Production');
 assert.equal(row.periodType,'marketing_year');assert.equal(typeof row.unit,'string');assert(row.unit.trim().length>0);
 assert.equal(typeof row.value,'number');assert(Number.isFinite(row.value)&&row.value>=0,`Invalid quantity ${key}`);
 assert(Number.isInteger(row.year));assert(Number.isInteger(row.releaseYear));assert(Number.isInteger(row.releaseMonth)&&row.releaseMonth>=1&&row.releaseMonth<=12);
 const aggregate=/^(European Union|World|Other|Total)$/i.test(row.country)||/\b(world|regional total|other countries)\b/i.test(row.country);
 if(aggregate){assert.equal(row.isAggregate,true,`Aggregate geography mislabelled as country: ${row.country}`);assert.equal(row.geographyType,'aggregate');aggregateRows++;}
 if(row.isAggregate)assert.equal(row.geographyType,'aggregate');
 else {assert.equal(row.geographyType,'country_or_territory');countries.add(row.countryCode);}
 products.add(row.productCode);units.add(row.unit);
 assert.equal(new URL(row.sourceUrl).hostname,'apps.fas.usda.gov');
}
const sha=createHash('sha256').update(await fs.readFile(archive)).digest('hex');assert.equal(data.sourceSha256,sha,'Source ZIP fingerprint must match the imported snapshot');
const bundledPython='C:/Users/Surhay/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const python=process.env.SUPPLY_VALIDATION_PYTHON||bundledPython;
const comparison=JSON.parse(execFileSync(python,['-c',`
import csv,io,json,sys,zipfile
snapshot=json.load(open(sys.argv[1],encoding='utf-8-sig'))
rows={(str(r['productCode']),str(r['countryCode']),str(r['year'])):r for r in snapshot['records']}
seen=set()
with zipfile.ZipFile(sys.argv[2]) as z:
 with io.TextIOWrapper(z.open('psd_alldata.csv'),encoding='utf-8-sig') as f:
  for source in csv.DictReader(f):
   key=(source['Commodity_Code'],source['Country_Code'],source['Market_Year'])
   if source['Attribute_Description']!='Production' or key not in rows: continue
   assert key not in seen, 'Duplicate original source observation: '+repr(key)
   seen.add(key); r=rows[key]
   assert r['unit']==source['Unit_Description'], 'Original unit changed: '+repr(key)
   assert r['value']==float(source['Value']), 'Original production quantity changed: '+repr(key)
   assert r['country']==source['Country_Name'], 'Original geography changed: '+repr(key)
   assert r['product']==source['Commodity_Description'], 'Original product changed: '+repr(key)
   assert r['releaseYear']==int(source['Calendar_Year']) and r['releaseMonth']==int(source['Month']), 'Release vintage changed: '+repr(key)
assert len(seen)==len(rows), 'Snapshot contains observations absent from source ZIP'
print(json.dumps({'matchedOriginalRows':len(seen),'originalUnitsPreserved':True,'originalValuesPreserved':True,'releaseVintagePreserved':True}))
`,file,archive],{encoding:'utf8',maxBuffer:1024*1024}));
console.log(JSON.stringify({passed:true,records:data.records.length,products:products.size,countriesOrTerritories:countries.size,aggregateRows,units:[...units].sort(),...comparison}));
