// Service credential is accepted only on hidden stdin and sent only to this fixed Site.
import {createHash} from 'node:crypto';
const raw=await new Promise((resolve,reject)=>{
 let value='';const terminal=process.stdin.isTTY;
 const finish=error=>{process.stdin.removeListener('data',onData);process.stdin.removeListener('end',onEnd);if(terminal)process.stdin.setRawMode(false);process.stdin.pause();error?reject(error):resolve(value);};
 const onData=chunk=>{value+=chunk;if(value.includes('\u0003'))finish(Error('Request cancelled'));else if(value.length>65536)finish(Error('Input too large'));else if(value.includes('\n')||value.includes('\r'))finish();};
 const onEnd=()=>finish();if(terminal)process.stdin.setRawMode(true);process.stdin.setEncoding('utf8');process.stdin.on('data',onData);process.stdin.once('end',onEnd);process.stdin.resume();console.log('Ready for site request JSON on stdin (input is hidden).');
});
let args;try{args=JSON.parse(raw);}catch{throw Error('Provide one JSON request object on hidden stdin');}
if(!args||typeof args.token!=='string'||!args.token||/[\r\n\0]/.test(args.token))throw Error('A valid Site service credential is required');
const origin='https://export-legacy-market-intelligence.surhay-nart.chatgpt.site';
if(args.digestOnly===true){
 console.log(JSON.stringify({sha256:createHash('sha256').update(args.token,'utf8').digest('hex')}));
}else{
if(!Array.isArray(args.actions))throw Error('A request actions array is required');
for(const action of args.actions){
 if(!/^\/api\/(refresh|status|update-instructions|schedule-confirmed|benchmarks|production|sources|data|news|companies)$/.test(action.path))throw Error('Unsupported site operation');
 const response=await fetch(origin+action.path,{method:action.method||'GET',headers:{'OAI-Sites-Authorization':'Bearer '+args.token,'X-Export-Edge-Update-Token':args.token,'Content-Type':'application/json'},...(action.body?{body:JSON.stringify(action.body)}:{}),redirect:'error',signal:AbortSignal.timeout(240000)});
 const content=await response.json();if(!response.ok)throw Error(`Site request failed (${response.status}): ${JSON.stringify(content)}`);
 if(action.path==='/api/data')console.log(JSON.stringify({path:action.path,markets:content.markets.length,observations:content.markets.reduce((n,m)=>n+m.records.length,0),retrievedAt:content.retrievedAt}));
 else if(action.path==='/api/production')console.log(JSON.stringify({path:action.path,productionRecords:content.records.length,faoDatasets:content.datasets.length,productionRetrievedAt:content.productionRetrievedAt}));
 else if(action.path==='/api/benchmarks')console.log(JSON.stringify({path:action.path,series:content.series.length,latest:content.series[0]?.observations.at(-1),retrievedAt:content.retrievedAt}));
 else if(action.path==='/api/news')console.log(JSON.stringify({path:action.path,items:content.items.length,retrievedAt:content.retrievedAt}));
 else if(action.path==='/api/companies')console.log(JSON.stringify({path:action.path,records:content.records.length,buyers:content.records.filter(r=>r.role==='buyer-discovery').length,suppliers:content.records.filter(r=>r.role==='supplier-discovery').length,countries:new Set(content.records.map(r=>r.country)).size,coverage:content.coverage,statuses:content.statuses?.map(s=>({id:s.id,status:s.status,count:s.count,refreshMode:s.refreshMode})),retrievedAt:content.retrievedAt}));
 else console.log(JSON.stringify({path:action.path,result:content}));
}
}
