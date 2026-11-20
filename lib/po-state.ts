import {isSummaryOrder} from './order-rows';
// Generate history is independent of the file selected for published PO information.
export function sameOrder(a: any, b: any): boolean {
  if (!a || !b) return false;
  const clean = (o: any) => Object.fromEntries(Object.entries(o)
    .filter(([k]) => !['status', 'previousOnly', 'updatedCount', 'source'].includes(k))
    .sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify(clean(a)) === JSON.stringify(clean(b));
}
export function runHistory(month: any): any[] {
  return month.runs ?? [...(month.versions || [])]
    .filter(v => v.kind !== 'upload')
    .sort((a, b) => String(a.created).localeCompare(String(b.created)))
    .map(v => ({id: v.id, created: v.created, orders: v.orders}));
}
export function generateState(month: any, version: any) {
  const runs = runHistory(month), previous = runs.at(-1);
  const before = new Map<string, any>((previous?.orders || []).map((o: any) => [o.id, o]));
  const after = new Map<string, any>(version.orders.map((o: any) => [o.id, o]));
  const updatedCounts = {...(month.updatedCounts || {})};
  const changes = previous ? [...new Set([...before.keys(), ...after.keys()])].map(id => {
    const old = before.get(id), current = after.get(id);
    const status = !old ? 'New' : !current ? 'Cancelled' : sameOrder(old, current) ? 'Unchanged' : 'Updated';
    if (status === 'Updated') updatedCounts[id] = (updatedCounts[id] || 0) + 1;
    return {po: current || old, status, updatedCount: updatedCounts[id] || 0};
  }) : version.orders.map((po: any) => ({po, status: 'Processed', updatedCount: 0}));
  const cancelled = new Map<string, any>((month.cancelled || []).map((c: any) => [c.po.id, c]));
  for (const change of changes) if (change.status === 'Cancelled') {
    const old = cancelled.get(change.po.id);
    cancelled.set(change.po.id, {...change, events: [...(old?.events || []), {runId: version.id, created: version.created}]});
  }
  return {runs: [...runs, {id: version.id, created: version.created, orders: structuredClone(version.orders)}],
    changes, cancelled: [...cancelled.values()], updatedCounts, generatedImportRevision: month.importRevision || 0, controlCleared: false};
}
export function orderStatus(month: any, order: any): string {
  const last = runHistory(month).at(-1);
  const generated = last?.orders.find((o: any) => o.id === order.id);
  if (!generated || !sameOrder(generated, order)) return 'Not Run';
  if ((month.importRevision || 0) > (month.generatedImportRevision || 0)) return 'Unchanged';
  return month.changes?.find((c: any) => c.po.id === order.id)?.status || 'Processed';
}
export function orderStatuses(month:any):Map<string,string>{
  const generated=new Map<string,any>((runHistory(month).at(-1)?.orders||[]).map((o:any)=>[o.id,o]));
  const changes=new Map<string,string>((month.changes||[]).map((c:any)=>[c.po.id,c.status]));
  const reimported=(month.importRevision||0)>(month.generatedImportRevision||0);
  return new Map((month.orders||[]).map((o:any)=>[o.id,!sameOrder(generated.get(o.id),o)?'Not Run':reimported?'Unchanged':changes.get(o.id)||'Processed']));
}
export function controlOrders(month: any): any[] {
  if (month.controlCleared) return [];
  const current = month.orders || [], ids = new Set(current.map((o: any) => o.id));
  const archived = new Map<string, any>();
  for (const c of month.cancelled || []) if (!ids.has(c.po.id))
    archived.set(c.po.id, {...c.po, previousOnly: true, status: 'Cancelled'});
  for (const o of runHistory(month).at(-1)?.orders || []) if (!ids.has(o.id) && !archived.has(o.id))
    archived.set(o.id, {...o, previousOnly: true, status: 'Previous run only'});
  const rows=[...current, ...archived.values()].filter(o=>!isSummaryOrder(o));
  // Imported source rows preserve workbook order, including archived POs.
  const sourceRanks=new Map<string,number>();
  for(const file of [...(month.imports||[])].reverse())for(const [index,o] of (file.orders||[]).entries())if(!sourceRanks.has(o.id))sourceRanks.set(o.id,index);
  const rank=(o:any)=>Number.isFinite(o.source?.row)?o.source.row:sourceRanks.get(o.id)??Number.MAX_SAFE_INTEGER;
  return rows.sort((a:any,b:any)=>Number(!!a.previousOnly)-Number(!!b.previousOnly)||rank(a)-rank(b));
}
export function clearControl(month: any) {
  if (!month.versions.length) return {orders: [], latest: [], latestVersion: '', runs: [],
    changes: [], cancelled: [], updatedCounts: {}, imports: [], controlCleared: true};
  return {orders: [], controlCleared: true};
}
export function pendingCount(month: any): number {
  if (month.controlCleared) return 0;
  const baseline = new Map<string,any>((runHistory(month).at(-1)?.orders||[]).map((o:any)=>[o.id,o]));
  return (month.orders || []).filter((o: any) => !sameOrder(o, baseline.get(o.id))).length;
}

export function reconcilePoFilters(filter:Record<string,string[]>,options:Record<string,string[]>){
  const next:Record<string,string[]>={};
  for(const [key,values] of Object.entries(filter)){
    const valid=values.filter(value=>(options[key]||[]).includes(value));
    if(valid.length)next[key]=valid;
  }
  return JSON.stringify(next)===JSON.stringify(filter)?filter:next;
}

// Count only current rows whose exact data appears in the last generated Excel.
export function generatedQuantity(month:any,orders:any[]){
 const generated=new Map<string,any>((month?runHistory(month).at(-1)?.orders||[]:[]).map((o:any)=>[o.id,o]));
 let count=0,total=0;const seen=new Set<string>();
 for(const order of orders){if(seen.has(order.id)||order.previousOnly||isSummaryOrder(order)||!sameOrder(generated.get(order.id),order))continue;seen.add(order.id);count++;total+=order.total||0;}
 return {count,total};
}

// Only the current PO Control rows can enter a new purchase workbook.
export function purchaseRunOrders(month:any,ids:string[],settingsDirty=false,itemsDirty=false){
 if(settingsDirty||itemsDirty)throw Error('Save pending monthly settings / Master Data changes before generating Excel.');
 if(month.controlCleared||!ids.length)throw Error('Select at least one current PO in PO Control.');
 const selected=new Set(ids),orders=(month.orders||[]).filter((o:any)=>selected.has(o.id)&&!o.previousOnly&&!isSummaryOrder(o)&&!/cancel/i.test(o.status||''));
 if(orders.length!==selected.size)throw Error('PO Control changed. Select the current POs again before generating Excel.');
 return orders;
}
