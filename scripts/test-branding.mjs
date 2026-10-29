import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync('dist/app.js','utf8');
const startup=app.slice(0,app.indexOf('const views='));
function savedWith(initial,{blockWrite=false}={}){
 const storage=new Map(Object.entries(initial)),writes=[];
 const context=vm.createContext({localStorage:{getItem:key=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>{if(blockWrite)throw Error('Browser storage unavailable');storage.set(key,value);writes.push(key);}},console});
 vm.runInContext(startup+'\nglobalThis.saved=state.saved;',context);
 return {saved:Array.from(context.saved),storage,writes};
}
const oldKey='export-legacy-watchlist',newKey='export-edge-watchlist';
let result=savedWith({[oldKey]:JSON.stringify(['76-0901',12,'76-0901','250-1001'])});
assert.deepEqual(result.saved,['76-0901','250-1001']);
assert.deepEqual(JSON.parse(result.storage.get(newKey)),result.saved,'Existing saved markets migrate to the new brand');
assert.equal(result.storage.get(oldKey),JSON.stringify(['76-0901',12,'76-0901','250-1001']),'Original browser data remains available');
assert.deepEqual(result.writes,[newKey]);
result=savedWith({[oldKey]:'["old"]',[newKey]:'["current"]'});assert.deepEqual(result.saved,['current']);assert.equal(result.writes.length,0);
result=savedWith({[oldKey]:'["old"]',[newKey]:'[]'});assert.deepEqual(result.saved,[],'An intentionally cleared current watchlist must not recover old entries');
result=savedWith({[oldKey]:'["retained"]'},{blockWrite:true});assert.deepEqual(result.saved,['retained'],'Storage write failure must not erase the in-memory watchlist');
assert.deepEqual(savedWith({[oldKey]:'invalid JSON'}).saved,[]);
assert.deepEqual(savedWith({}).saved,[]);
const html=readFileSync('dist/index.html','utf8');
assert.match(html,/<title>Export Edge \| Food & Agriculture<\/title>/);
assert.match(html,/aria-label="Export Edge home"/);
assert.match(html,/class="brand-light">edge<\/span>/);
assert.match(html,/class="footer-brand">export<span>edge<\/span>/);
assert(!html.includes('Export Legacy')&&!html.includes('>legacy<'));
assert(!app.includes('export-legacy-price')&&!app.includes('export-legacy-discovery')&&!app.includes('export-legacy-usda')&&!app.includes('`export-legacy-${year()}'));
assert(!app.includes("localStorage.setItem('export-legacy-watchlist'"));
assert.match(readFileSync('worker/index.mjs','utf8'),/name:'Export Edge Agriculture'/);
assert.match(readFileSync('worker/faostat.mjs','utf8'),/ExportEdgeResearch\/0\.3 \(\+https:\/\/export-legacy-market-intelligence\.surhay-nart\.chatgpt\.site/,'Branding must not rewrite the working source-import origin');
console.log('Passed: Export Edge title, wordmarks, accessible name, exports and service labels; watchlist migration, current/empty-list precedence, original-data retention and unavailable-storage fallback.');
