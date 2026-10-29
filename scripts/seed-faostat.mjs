import {readFileSync,writeFileSync} from 'node:fs';
import {parseFaostatPrices,refreshFaostatCatalog} from '../worker/faostat.mjs';
const catalog=JSON.parse(readFileSync('data/catalog.json','utf8')),b=readFileSync('research/faostat-prices.zip');
const output=await parseFaostatPrices(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),catalog.countries);
writeFileSync('data/faostat-prices.json',JSON.stringify(output));
const releases=await refreshFaostatCatalog();writeFileSync('data/production.json',JSON.stringify(releases));
console.log(JSON.stringify({priceSeries:output.series.length,priceObservations:output.series.reduce((n,s)=>n+s.observations.length,0),latestYears:[...new Set(output.series.map(s=>s.observations.at(-1).period))],catalogDatasets:releases.datasets.length,representation:releases.connection.representation}));
