// Revisions replace only observations actually returned by the official source.
// A missing import/export flow is not evidence that its previous value was zero.
export function mergeReturnedObservations(previousRecords,returnedRecords){
 const next=previousRecords.map(r=>({...r})),keys=new Set();
 for(const row of returnedRecords){
  if(!Number.isInteger(row.year)||!['M','X'].includes(row.flow)||!Number.isFinite(row.value)||row.value<0)throw Error('Invalid annual trade observation');
  const key=`${row.year}-${row.flow}`;if(keys.has(key))throw Error('Duplicate returned trade observation');keys.add(key);
  const index=next.findIndex(r=>r.year===row.year&&r.flow===row.flow);
  if(index>=0)next[index]={...row};else next.push({...row});
 }
 return next;
}
