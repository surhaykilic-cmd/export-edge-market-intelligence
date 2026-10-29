import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {refreshMarketFeeds} from '../worker/market-feeds.mjs';
const parse=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const previous=existsSync('data/market-feeds.json')?parse('data/market-feeds.json'):{prices:{series:[]},news:{items:[]}};
const catalog=parse('data/fpma.json').series;
const result=await refreshMarketFeeds(previous,{fpmaCatalog:catalog});
writeFileSync('data/market-feeds.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({priceSeries:result.prices.series.length,priceObservations:result.prices.series.reduce((n,s)=>n+s.observations.length,0),newsItems:result.news.items.length,statuses:result.statuses,errors:result.errors}));
