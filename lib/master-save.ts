const equal=(a:any,b:any)=>JSON.stringify(a)===JSON.stringify(b);
// Reapply only local differences; unchanged fields accept the saved response.
export function rebaseMasterDraft(base:any,draft:any,saved:any):any{
 if(equal(base,draft))return structuredClone(saved);
 if(Array.isArray(base)&&Array.isArray(draft)&&Array.isArray(saved)&&[...base,...draft,...saved].every(a=>a&&typeof a==='object'&&a.id)){
  const b=new Map(base.map(a=>[a.id,a])),d=new Map(draft.map(a=>[a.id,a]));
  const rows=saved.filter(a=>!b.has(a.id)||d.has(a.id)).map(a=>d.has(a.id)?rebaseMasterDraft(b.get(a.id),d.get(a.id),a):structuredClone(a));
  for(const a of draft)if(!b.has(a.id)&&!rows.some(r=>r.id===a.id))rows.push(structuredClone(a));
  return rows;
 }
 if(base&&draft&&saved&&!Array.isArray(draft)&&typeof base==='object'&&typeof draft==='object'&&typeof saved==='object'){
  const out={...saved};for(const key of new Set([...Object.keys(base),...Object.keys(draft)]))if(!equal(base[key],draft[key])){if(!(key in draft))delete out[key];else out[key]=rebaseMasterDraft(base[key],draft[key],saved[key]);}return out;
 }
 return structuredClone(draft);
}
export function automaticMasterChanges(saved:any[],before:any[],after:any[]):any[]{
 const next=structuredClone(saved);
 for(const item of after){const old=before.find(a=>a.id===item.id);if(!old)continue;
  for(const version of item.versions){const previous=old.versions.find((a:any)=>a.id===version.id);if(!previous)continue;
   const fields=['months','all','images'].filter(key=>!equal(previous[key],version[key]));if(!fields.length)continue;
   const target=next.find(a=>a.id===item.id)?.versions.find((a:any)=>a.id===version.id);
   if(!target)throw Error('Save the new No. or version with Save all before uploading images or applying months.');
   for(const key of fields)target[key]=rebaseMasterDraft(previous[key],version[key],target[key]);
  }
 }
 return next;
}

// Failed optimistic reuse writes must display the last acknowledged values.
// Keep unsaved text, quantities, month coverage and newly uploaded images intact.
export function restoreSavedReuse(saved:any[],draft:any[]):any[]{
 const images=new Map<string,any>();
 for(const item of saved)for(const version of item.versions||[])for(const image of version.images||[])images.set(item.id+'|'+version.id+'|'+image.id,image);
 return draft.map(item=>({...item,versions:item.versions.map((version:any)=>({...version,images:version.images.map((image:any)=>{
  const stored=images.get(item.id+'|'+version.id+'|'+image.id);
  if(!stored)return image;
  const next={...image};for(const key of ['conditions','reuse']){if(key in stored)next[key]=structuredClone(stored[key]);else delete next[key];}return next;
 })}))}));
}
