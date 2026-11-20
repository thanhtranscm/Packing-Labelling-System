export type PoMonthNotice={sourceMonthId:string;poId:string;newMonth:string};
export const noticeKey=(monthId:string,poId:string)=>JSON.stringify([monthId,poId]);
export function applyPoMonthNotices(workspace:any,updates:any[]):{notes:PoMonthNotice[],changes:any[]}{
 if(!Array.isArray(updates)||!updates.length||updates.length>5000)throw Error('Select between 1 and 5000 POs.');
 const notes:PoMonthNotice[]=Array.isArray(workspace.poMonthNotices)?workspace.poMonthNotices.map((n:any)=>({...n})):[];
 const index=new Map(notes.map((n,i)=>[noticeKey(n.sourceMonthId,n.poId),i]));const seen=new Set<string>(),changes:any[]=[];
 for(const update of updates){
  if(typeof update.sourceMonthId!=='string'||typeof update.poId!=='string'||typeof update.newMonth!=='string')throw Error('Invalid PO month notice.');
  const requestedMonth=update.newMonth.trim(),k=noticeKey(update.sourceMonthId,update.poId);if(seen.has(k)||requestedMonth.length>100||/[\r\n\x00-\x1f]/.test(requestedMonth))throw Error('Invalid or duplicate PO month notice.');seen.add(k);
  const month=(workspace.months||[]).find((m:any)=>m.id===update.sourceMonthId);if(!month||![...(month.controlCleared?[]:month.orders||[]),...(month.latest||[])].some((o:any)=>o.id===update.poId))throw Error('PO no longer exists in that month. Reload and retry.');
  const newMonth=requestedMonth.toUpperCase()===String(month.name||'').trim().toUpperCase()?'':requestedMonth;const i=index.get(k),before=i===undefined?'':notes[i].newMonth;if(before===newMonth)continue;
  changes.push({path:'PO month notice / '+month.name+' / '+update.poId,before,after:newMonth});
  if(i!==undefined){if(newMonth)notes[i]={sourceMonthId:month.id,poId:update.poId,newMonth};else notes[i]=null as any;}else if(newMonth){index.set(k,notes.length);notes.push({sourceMonthId:month.id,poId:update.poId,newMonth});}
 }
 return {notes:notes.filter(Boolean),changes};
}
export function visiblePoMonthNotices(notes:any,months:any[]){const visible=new Set(months.map(m=>m.id));return Array.isArray(notes)?notes.filter(n=>visible.has(n.sourceMonthId)):[];}
