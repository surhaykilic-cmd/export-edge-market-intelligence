import {readFileSync} from 'node:fs';
import {SOURCE_POLICIES as americas} from '../worker/companies-americas.mjs';
import {SOURCE_POLICIES as international} from '../worker/companies-international.mjs';
import {PROCUREMENT_SOURCE_POLICIES as procurement} from '../worker/companies-procurement.mjs';
export const companySourcePolicies=[...americas,...international,...procurement];
export const companySourceGroups=[{key:'americas',sourceIds:americas.map(s=>s.id)},{key:'international',sourceIds:international.map(s=>s.id)},{key:'procurement',sourceIds:procurement.map(s=>s.id)}];
export function companySeed(){
 const parts=['americas','international','procurement'].map(name=>JSON.parse(readFileSync('data/companies-'+name+'.json','utf8').replace(/^\uFEFF/,'')));
 return {records:parts.flatMap(p=>p.records),statuses:parts.flatMap(p=>p.statuses||[]),errors:parts.flatMap(p=>p.errors||[]),retrievedAt:parts.map(p=>p.retrievedAt).filter(Boolean).sort().at(-1),notes:'Official international food establishment registers and published procurement evidence. Listing does not verify a trading relationship, current offer or export eligibility.'};
}
export function moduleWrapper(file,names){const body=readFileSync(file,'utf8').replace(/^import[^\n]+\n/gm,'').replace(/\bexport\s+(?=(?:async\s+)?function|const|class)/g,'');return `const {${names.join(',')}}=(()=>{${body}\nreturn {${names.join(',')}};})();\n`;}
export function companyBundle(){return moduleWrapper('worker/companies-americas.mjs',['refreshAmericasCompanies'])+moduleWrapper('worker/companies-international.mjs',['refreshInternationalCompanies'])+moduleWrapper('worker/companies-procurement.mjs',['refreshProcurementCompanies'])+moduleWrapper('worker/company-discovery.mjs',['refreshInternationalDirectory','validateDiscoverySnapshot','mergeDiscoverySnapshots','companyRecordCurrent','discoveryCoverage']);}
export function companyModule(){return readFileSync('worker/parsers.mjs','utf8')+'\n'+companyBundle()+'\nexport {refreshInternationalDirectory};\nexport const companySourceGroups='+JSON.stringify(companySourceGroups)+';';}
