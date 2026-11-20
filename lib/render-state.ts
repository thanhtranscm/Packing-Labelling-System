// JSON workspace responses may contain fresh objects for otherwise unchanged data.
// Preserve those references so memoized PO calculations remain valid after saves.
export function shareUnchanged<T>(previous:T,next:T):T {
  if(previous===next)return previous;
  if(!previous||!next||typeof previous!=='object'||typeof next!=='object')return next;
  if(Array.isArray(previous)!==Array.isArray(next))return next;
  const old=previous as any,value=next as any;
  const keys=Object.keys(value);
  let unchanged=keys.length===Object.keys(old).length;
  const result:any=Array.isArray(value)?[]:{};
  for(const key of keys){
    const present=Object.prototype.hasOwnProperty.call(old,key);
    result[key]=present?shareUnchanged(old[key],value[key]):value[key];
    if(!present||result[key]!==old[key])unchanged=false;
  }
  return unchanged?previous:result;
}

// Return the same selection reference when possible to avoid needless rerenders.
export function existingSelection(ids:string[],available:Set<string>):string[]{
 const next=ids.filter(id=>available.has(id));return next.length===ids.length?ids:next;
}
