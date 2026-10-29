import assert from 'node:assert/strict';
import {staleRunnerImports} from '../worker/index.mjs';
const now=Date.parse('2026-10-29T14:00:00Z'),fresh='2026-10-29T13:45:00Z',old='2026-10-26T06:30:00Z';
assert.deepEqual(staleRunnerImports({},now),[]);
assert.deepEqual(staleRunnerImports({faostatRelay:{enabled:true,lastCatalogImportAt:fresh,lastPricesImportAt:fresh},marketFeeds:{priceRelayEnabled:true,prices:{importedAt:fresh}}},now),[]);
assert.deepEqual(staleRunnerImports({faostatRelay:{enabled:true,lastCatalogImportAt:old,lastPricesImportAt:fresh},marketFeeds:{priceRelayEnabled:true,prices:{importedAt:old}}},now),['FAOSTAT catalog','EC/FPMA prices']);
assert.equal(staleRunnerImports({faostatRelay:{enabled:true}},now).length,2);
console.log('Passed: fresh imports accepted, stale or missing enabled imports flagged, unused import paths ignored.');
