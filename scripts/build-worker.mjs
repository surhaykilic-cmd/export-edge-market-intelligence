import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {companySeed,companyBundle,companyModule,companySourcePolicies,companySourceGroups} from './company-config.mjs';
const readJSON=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const manifest=readJSON('.openai/hosting.json');
if(manifest.static)throw Error('Remove static hosting before building the Worker');
const assets={};for(const [name,type] of Object.entries({'index.html':'text/html; charset=utf-8','style.css':'text/css; charset=utf-8','app.js':'text/javascript; charset=utf-8'}))assets['/'+name]={body:readFileSync('dist/'+name,'utf8'),type};
const config={revision:'agriculture-data-v3',catalog:readJSON('data/catalog.json'),seed:readJSON('dist/data.json'),sources:readJSON('research/sources.json'),benchmarks:existsSync('data/benchmarks.json')?readJSON('data/benchmarks.json'):{series:[]},production:existsSync('data/production.json')?readJSON('data/production.json'):{datasets:[]},fpma:existsSync('data/fpma.json')?readJSON('data/fpma.json'):{series:[]},supply:readJSON('data/supply.json'),faostatPrices:readJSON('data/faostat-prices.json'),marketFeeds:readJSON('data/market-feeds.json'),companies:readJSON('data/companies.json'),comparison:existsSync('research/tridge-comparison.json')?readJSON('research/tridge-comparison.json'):null,assets};
mkdirSync('dist/server',{recursive:true});mkdirSync('dist/.openai',{recursive:true});
const parsers=readFileSync('worker/parsers.mjs','utf8'),worker=readFileSync('worker/index.mjs','utf8').replace(/^import[^\n]+\n/gm,'');
function moduleWrapper(file,names){const body=readFileSync(file,'utf8').replace(/^import[^\n]+\n/gm,'').replace(/\bexport\s+(?=(?:async\s+)?function|const|class)/g,'');return `const {${names.join(',')}}=(()=>{${body}\nreturn {${names.join(',')}};})();\n`;}
config.faostatRelayScript=readFileSync('scripts/relay-faostat.mjs','utf8');
config.marketFeedsModule=readFileSync('worker/market-feeds.mjs','utf8');
config.revision='agriculture-data-v4';config.internationalCompanies=companySeed();config.companySourcePolicies=companySourcePolicies;config.companySourceGroups=companySourceGroups;config.companyDiscoveryModule=companyModule();
const connectors=moduleWrapper('worker/faostat.mjs',['refreshFaostatCatalog','refreshFaostatPrices','parseFaostatCatalog','parseFaostatPrices'])+moduleWrapper('worker/market-feeds.mjs',['refreshMarketFeeds'])+moduleWrapper('worker/companies.mjs',['refreshCompanies']);
writeFileSync('dist/server/index.js',parsers+'\n'+connectors+'\n'+companyBundle()+'\n'+worker+'\nexport default createWorker('+JSON.stringify(config)+');\n');
writeFileSync('dist/.openai/hosting.json',JSON.stringify(manifest,null,2));
console.log(JSON.stringify({built:true,markets:config.seed.markets.length,products:config.catalog.products.length,countries:config.catalog.countries.length,benchmarkSeries:config.benchmarks.series.length,workerBytes:Buffer.byteLength(readFileSync('dist/server/index.js'))}));
