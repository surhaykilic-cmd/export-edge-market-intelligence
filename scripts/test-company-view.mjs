import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync('dist/app.js','utf8');
const context=vm.createContext({localStorage:{getItem:()=>null},URL,Intl,Date,console});
vm.runInContext(app.slice(0,app.indexOf('function filteredProduction()'))+'\nglobalThis.view={state,filteredCompanies,companies,companyCard,companyCsvRows,csvCell};',context);
const v=context.view;
const registry={id:'supplier-1',name:'=Example <Foods>',country:'India',region:'Kerala',role:'supplier-discovery',products:['Fish'],activities:['Processing'],verification:'Registry-listed',source:'Official food register',sourceId:'registry',sourceUrl:'https://example.gov/list',sourcePublishedAt:'2026-10-01',approvalExpiresAt:'2027-01-01',approvalStatus:'Approved',destinationMarkets:['European Union','Japan'],retrievedAt:'2026-10-29T12:00:00Z',establishmentId:'A123'};
const buyer={id:'buyer-1',name:'Public Food Authority',country:'Romania',role:'buyer-discovery',products:['Bread'],activities:['Bread supply'],verification:'Procurement evidence',source:'TED',sourceId:'ted',sourceUrl:'https://ted.europa.eu/en/notice/-/detail/123-2026',noticeDate:'2026-10-20',noticeStatus:'Published can-standard'};
v.state.companies={records:[registry,buyer],retrievedAt:'2026-10-29'};
const reset=()=>Object.assign(v.state.companyFilters,{query:'',country:'',role:'',activity:'',source:'',evidence:'',page:1});
reset();assert.equal(v.filteredCompanies().length,2);
for(const [field,value,id] of [['country','India','supplier-1'],['source','ted','buyer-1'],['role','buyer-discovery','buyer-1'],['evidence','Registry-listed','supplier-1'],['activity','Processing','supplier-1'],['query','Japan','supplier-1']]){reset();v.state.companyFilters[field]=value;assert.equal(v.filteredCompanies().length,1);assert.equal(v.filteredCompanies()[0].id,id);}
reset();const output=v.companies();assert.match(output,/data-company-filter="source"/);assert.match(output,/data-company-filter="evidence"/);assert.match(output,/Reported countries/);assert.match(output,/Buyer records/);assert.match(output,/Supplier records/);assert.match(output,/Records \/ establishments/);assert(!output.includes('=Example <Foods>'));assert.match(output,/=Example &lt;Foods&gt;/);
const card=v.companyCard(registry);for(const label of ['Source published','1 Oct 2026','Approval expiry','1 Jan 2027','Approved','Listed destinations','European Union; Japan','Reported country','India · Kerala'])assert(card.includes(label),label+' should be visible');assert.match(card,/current availability unverified/);
assert.match(v.companyCard({...registry,approvalExpiresAt:null}),/Not supplied by source/);
const rows=v.companyCsvRows();assert.equal(rows.length,3);assert.equal(rows[0].length,rows[1].length);for(const label of ['Source publication date','Approval expiry as supplied','Source-listed destination markets (not current availability)'])assert(rows[0].includes(label));assert.match(v.csvCell(registry.name),/^"'=/,'Directory CSV formula strings must be escaped');
v.state.companies.records=Array.from({length:25},(_,i)=>({...buyer,id:String(i),name:'Buyer '+String(i).padStart(2,'0')}));reset();assert.equal((v.companies().match(/company-card/g)||[]).length,24);v.state.companyFilters.page=2;assert.equal((v.companies().match(/company-card/g)||[]).length,1);assert.equal(v.companyCsvRows().length,26,'CSV includes every filtered row beyond the current page');
console.log('Passed: company country/source/role/evidence/activity/search filters; actual coverage; source dates, expiry and destination scope; escaping; 24-record pagination and full filtered CSV.');
