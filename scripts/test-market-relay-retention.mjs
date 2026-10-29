import assert from 'node:assert/strict';
import {refreshMarketFeeds} from '../worker/market-feeds.mjs';

const now='2026-10-29T16:00:00.000Z',importedAt='2026-10-29T14:00:00.000Z';
const priceStatuses=[
 {id:'ec-agrifood-cereal',status:'connected',count:2,lastAttemptAt:importedAt,lastSuccessAt:importedAt,detail:'Imported by the private relay'},
 {id:'ec-agrifood-dairy',status:'connected',count:1,lastAttemptAt:importedAt,lastSuccessAt:importedAt,detail:'Imported by the private relay'},
 {id:'fao-fpma-observations',status:'partial',count:1,lastAttemptAt:importedAt,lastSuccessAt:importedAt,detail:'One batch retained prior observations'}
];
const previous={
 priceRelayEnabled:true,
 prices:{importedAt,retrievedAt:'2026-10-29T13:59:00.000Z',relaySource:'private scheduled import',series:[
  {id:'ec-cereal-fixture',sourceId:'ec-agrifood-cereal',currency:'EUR',unit:'EUR / TONNES',observations:[{period:'2026-10-19',value:307.79,reportedPrice:'€307,79'}]},
  {id:'fpma-fixture',sourceId:'fao-fpma-observations',currency:'USD',unit:'USD / tonne',observations:[{period:'2026-08',value:0},{period:'2026-09',value:321.5}]}
 ]},
 news:{retrievedAt:'2026-10-20T12:00:00.000Z',feedPolicy:'official headlines only',items:[{id:'prior-fao',sourceId:'fao-newsroom',title:'Prior official report',publishedAt:'2026-10-20T12:00:00.000Z',url:'https://www.fao.org/newsroom/old-report'}]},
 statuses:[...priceStatuses,{id:'fao-newsroom',status:'error',lastSuccessAt:'2026-10-20T12:00:00.000Z',detail:'Earlier feed outage'}],errors:[]
};
const untouched=structuredClone(previous),requests=[];
const feeds=new Map([
 ['https://www.fao.org/feeds/fao-newsroom-rss',{url:'https://www.fao.org/newsroom/fixture-report',title:'New food and agriculture report'}],
 ['https://fews.net/taxonomy/term/41/feed',{url:'https://fews.net/fixture-market-report',title:'New market conditions report'}]
]);
const result=await refreshMarketFeeds(previous,{scope:'news',now,timeoutMs:500,fetch:async url=>{
 const address=String(url);requests.push(address);const item=feeds.get(address);
 assert(item,'A news-only update must never request EC/FPMA price sources: '+address);
 return new Response('<rss><channel><item><title>'+item.title+'</title><link>'+item.url+'</link><pubDate>Thu, 29 Oct 2026 15:00:00 GMT</pubDate></item></channel></rss>',{headers:{'content-type':'application/rss+xml'}});
}});

assert.deepEqual(requests.sort(),[...feeds.keys()].sort(),'Only the two official news feeds are requested');
assert.equal(result.priceRelayEnabled,true,'News refresh must retain the flag that prevents hosted price-fetch retries');
assert.equal(result.prices.importedAt,importedAt,'Relay import time must survive news refresh');
assert.equal(result.prices.retrievedAt,previous.prices.retrievedAt,'News updates must not claim new price observations');
assert.equal(result.prices.relaySource,previous.prices.relaySource,'Price provenance metadata must survive a scoped update');
assert.deepEqual(result.prices.series,previous.prices.series,'All imported price observations, including source-reported zero, must remain intact');
for(const status of priceStatuses)assert.deepEqual(result.statuses.find(s=>s.id===status.id),status,'Untouched price-source status must retain its provenance and dates');
for(const id of ['fao-newsroom','fews-net-markets']){
 const status=result.statuses.find(s=>s.id===id);assert.equal(status?.status,'connected');assert.equal(status.lastSuccessAt,now);
 assert.equal(result.statuses.filter(s=>s.id===id).length,1,'A refreshed news status replaces its earlier status');
}
assert.equal(result.news.retrievedAt,now);assert.equal(result.news.feedPolicy,previous.news.feedPolicy);
assert.equal(result.news.items.length,3,'Earlier headlines are retained while both official feeds refresh');
assert(result.news.items.some(i=>i.title==='New food and agriculture report'));
assert(result.news.items.some(i=>i.title==='New market conditions report'));
assert.deepEqual(result.errors,[]);assert.deepEqual(previous,untouched,'Scoped refresh must not mutate the saved input snapshot');
console.log('Passed: news-only refresh preserves relay mode, imported price observations and provenance, untouched price-source statuses and metadata while refreshing both official news feeds.');
