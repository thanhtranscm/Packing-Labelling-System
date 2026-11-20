// Short-lived, page-local cache of already authorized image responses only.
// Nothing is persisted or shared between browser sessions; server access rules stay unchanged.
const entries=new Map<string,{url:string,expires:number,size:number}>();
const pending=new Map<string,Promise<string>>();
const ttl=300_000,maxBytes=32*1024*1024;
let bytes=0;
function remove(key:string){const entry=entries.get(key);if(!entry)return;entries.delete(key);bytes-=entry.size;/* Do not revoke a URL still displayed by a mounted image. Browser releases it on page close. */}
// Bound retained blob URLs too, but allow mounted images to finish decoding first.
const retired:{url:string,size:number}[]=[];let retiredBytes=0;
function retire(key:string){const entry=entries.get(key);if(entry){retired.push(entry);retiredBytes+=entry.size;}remove(key);while(retired.length>24||retiredBytes>maxBytes){const old=retired.shift()!;retiredBytes-=old.size;URL.revokeObjectURL(old.url);}}
export function cachedImage(src:string):string|undefined{const value=entries.get(src);if(!value)return;if(value.expires<=Date.now()){retire(src);return;}entries.delete(src);entries.set(src,value);return value.url;}
let active=0;
const queue:(()=>void)[]=[];
async function slot(){if(active>=4)await new Promise<void>(resolve=>queue.push(resolve));else active++;}
function release(){const next=queue.shift();if(next)next();else active--;}
export async function loadCachedImage(src:string):Promise<string>{
 const cached=cachedImage(src);if(cached)return cached;
 const existing=pending.get(src);if(existing)return existing;
 const task=(async()=>{
  await slot();const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);let response:Response;let blob:Blob;try{response=await fetch(src,{credentials:'same-origin',signal:controller.signal});if(!response.ok)throw Error('Image unavailable');blob=await response.blob();}finally{clearTimeout(timer);release();}if(!blob.type.startsWith('image/')||blob.size>maxBytes)throw Error('Image cannot be cached');
  for(const [key,value] of entries)if(value.expires<=Date.now())retire(key);
  while(entries.size>=24||bytes+blob.size>maxBytes)retire(entries.keys().next().value!);
  const url=URL.createObjectURL(blob);entries.set(src,{url,expires:Date.now()+ttl,size:blob.size});bytes+=blob.size;return url;
 })();pending.set(src,task);
 try{return await task;}finally{if(pending.get(src)===task)pending.delete(src);}
}
