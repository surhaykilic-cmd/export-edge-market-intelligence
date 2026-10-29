import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {refreshAmericasCompanies} from '../worker/companies-americas.mjs';

const file='data/companies-americas.json',previous=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{records:[]};
const result=await refreshAmericasCompanies(previous,{ignoreCooldown:process.argv.includes('--retry')});
mkdirSync('data',{recursive:true});writeFileSync(file,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({records:result.records.length,countries:Object.fromEntries([...new Set(result.records.map(r=>r.country))].map(country=>[country,result.records.filter(r=>r.country===country).length])),statuses:result.statuses,errors:result.errors},null,2));
if(result.statuses.some(s=>s.status==='error'))process.exitCode=1;
