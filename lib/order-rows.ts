// Excel merged subtotal labels repeat across PO identity columns.
const normalized=(value:any)=>String(value??'').trim().replace(/\s+/g,' ').toUpperCase();
export function isSummaryOrder(order:any):boolean {
 const labels=[order.factoryPo,order.onPo,order.sku].map(normalized).filter(Boolean);
 return labels.length>0&&labels.every(label=>label===labels[0])&&/^(?:TOTAL|SUBTOTAL|SUB TOTAL|GRAND TOTAL)(?:\b|:)/.test(labels[0]);
}
export function reconcileSummaryRows(data:any):boolean {
 let changed=false;
 for(const month of data.months||[]){
  for(const key of ['orders','latest'])if(Array.isArray(month[key])){const cleaned=month[key].filter((o:any)=>!isSummaryOrder(o));if(cleaned.length!==month[key].length){month[key]=cleaned;changed=true;}}
  for(const key of ['changes','cancelled'])if(Array.isArray(month[key])){const cleaned=month[key].filter((r:any)=>!isSummaryOrder(r.po));if(cleaned.length!==month[key].length){month[key]=cleaned;changed=true;}}
  for(const version of month.versions||[])if(version.orders?.some(isSummaryOrder)){
   const warning='This saved file contains an Excel subtotal imported as a PO. Its original quantities are preserved. Reimport the original PO file and generate a corrected version before using this file for purchasing or production.';
   if(!version.historicalWarning?.includes(warning)){version.historicalWarning=[version.historicalWarning,warning].filter(Boolean).join(' ');changed=true;}
  }
 }
 return changed;
}
