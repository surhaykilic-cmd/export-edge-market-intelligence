import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {refreshCompanies,parseApprovedEstablishments} from '../worker/companies.mjs';
const file='data/companies.json';let previous={records:[]};if(existsSync(file))previous=JSON.parse(readFileSync(file,'utf8'));
let result;
if(process.argv.includes('--fsa-only')){
 const sourceUrl=previous.sourceFiles?.['uk-fsa-approved'];if(!sourceUrl||!/^https:\/\/fsaopendata\.blob\.core\.windows\.net\/opendatacatalog\//.test(sourceUrl))throw Error('Verified FSA source URL is required');
 const response=await fetch(sourceUrl,{headers:{Accept:'text/csv'},signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error(`FSA source returned HTTP ${response.status}`);
 const checkedAt=new Date().toISOString(),eligible=parseApprovedEstablishments(await response.text(),sourceUrl,checkedAt,10000),suppliers=eligible.slice(0,1000),retained=(previous.records||[]).filter(r=>r.sourceId!=='uk-fsa-approved');
 result={...previous,records:[...suppliers,...retained],retrievedAt:checkedAt,lastAttemptAt:checkedAt,fsaEligibleCorporateEstablishments:eligible.length,statuses:[...(previous.statuses||[]).filter(s=>s.id!=='uk-fsa-approved'),{id:'uk-fsa-approved',status:'connected',detail:`Bounded sample of ${suppliers.length} of ${eligible.length} eligible corporate/business-named plant-level approved establishments in this source snapshot. Commercial/export capability not verified.`,lastSuccessAt:checkedAt,lastAttemptAt:checkedAt,count:suppliers.length,sourceUrl}],errors:(previous.errors||[]).filter(e=>e.source!=='uk-fsa-approved')};
}else result=await refreshCompanies(previous,{buyerPages:2});mkdirSync('data',{recursive:true});writeFileSync(file,JSON.stringify(result,null,2));
console.log(JSON.stringify({records:result.records.length,suppliers:result.records.filter(r=>r.role==='supplier-discovery').length,buyers:result.records.filter(r=>r.role==='buyer-discovery').length,...(result.fsaEligibleCorporateEstablishments?{fsaEligibleCorporateEstablishments:result.fsaEligibleCorporateEstablishments}:{}),sources:result.statuses,errors:result.errors}));
