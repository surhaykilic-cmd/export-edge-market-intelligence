import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {refreshProcurementCompanies,parseTedFoodBuyers,mergeProcurementBuyers} from '../worker/companies-procurement.mjs';
const file='data/companies-procurement.json';const previous=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{records:[]};let result;
if(process.argv.includes('--from-verified-sample')){
 const checkedAt=new Date().toISOString(),samples=['research/ted-food-sample.json','research/ted-food-catering-sample.json'].filter(existsSync).map(p=>JSON.parse(readFileSync(p,'utf8'))),records=mergeProcurementBuyers(previous.records,samples.flatMap(sample=>parseTedFoodBuyers(sample,checkedAt)));
 result={records,retrievedAt:checkedAt,lastAttemptAt:checkedAt,statuses:[{id:'eu-ted-food-buyers',status:'connected',detail:`Verified official public TED API samples: ${samples.reduce((n,s)=>n+s.notices.length,0)} food notices, ${new Set(records.map(r=>r.country)).size} reported buyer countries. Historic notice evidence only.`,count:records.length,lastSuccessAt:checkedAt,lastAttemptAt:checkedAt}],errors:[],scope:'Published food-related buyer evidence from the verified official TED samples; no personal contacts.'};
}else result=await refreshProcurementCompanies(previous);
if(!result.records.length)throw Error(JSON.stringify(result.errors));writeFileSync(file,JSON.stringify(result,null,2));
console.log(JSON.stringify({records:result.records.length,countries:[...new Set(result.records.map(r=>r.country))].sort(),sources:result.statuses,errors:result.errors}));
