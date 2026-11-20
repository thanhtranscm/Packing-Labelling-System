import {workspaceData} from './workspace-store';
// Cache reference indexes, never identity or authorization decisions. Each request
// still reads the current D1 pointer; a save/visibility change selects a new key.
type Index={all:Set<string>,visible:Set<string>};
const pending=new Map<string,{expires:number,value:Promise<Index>}>();
function references(value:any,into:Set<string>){
 if(typeof value==='string'){if(/^(WSV|CTC)\//.test(value))into.add(value);return;}
 if(Array.isArray(value)){for(const child of value)references(child,into);return;}
 if(value&&typeof value==='object')for(const child of Object.values(value))references(child,into);
}
async function build(record:any):Promise<Index>{
 const data=await workspaceData(record),all=new Set<string>(),visible=new Set<string>();references(data,all);
 const months=(data.months||[]).filter((m:any)=>m.show),ids=new Set(months.map((m:any)=>m.id));
 for(const month of months)references(month,visible);
 for(const info of data.information||[])if(info.id)visible.add(info.id);
 for(const item of data.items||[])for(const version of item.versions||[])for(const image of version.images||[])if((image.months||[]).some((id:string)=>ids.has(id)))visible.add(image.id);
 return {all,visible};
}
export function fileAccessIndex(record:any):Promise<Index>{
 const pointer=JSON.parse(record.data);if(!pointer.storageKey)return build(record);
 const key=pointer.storageKey+'|'+record.revision,now=Date.now();
 for(const [old,entry] of pending)if(entry.expires<now)pending.delete(old);
 const existing=pending.get(key);if(existing)return existing.value;
 // Bound retained indexes; concurrent reads of the same revision share one build.
 while(pending.size>=4)pending.delete(pending.keys().next().value!);
 const value=build(record).then(index=>{if(index.all.size>50_000&&pending.get(key)?.value===value)pending.delete(key);return index;}).catch(error=>{if(pending.get(key)?.value===value)pending.delete(key);throw error;});
 pending.set(key,{expires:now+60_000,value});return value;
}
