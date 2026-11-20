import fs from 'node:fs/promises';
import ts from 'typescript';
import assert from 'node:assert/strict';
await fs.writeFile('.sites-runtime/check-image-memory.mjs',ts.transpileModule(await fs.readFile('lib/image-memory.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const realFetch=globalThis.fetch,realNow=Date.now,realTimer=globalThis.setTimeout;let now=1000,calls=0,mode='ok';Date.now=()=>now;
globalThis.fetch=async()=>{calls++;await Promise.resolve();return new Response(mode==='ok'?new Blob(['image'],{type:'image/png'}):'Denied',{status:mode==='ok'?200:403});};
try{
 const {loadCachedImage,cachedImage}=await import('../.sites-runtime/check-image-memory.mjs');
 const urls=await Promise.all(Array.from({length:10},()=>loadCachedImage('/api/files?id=WSV/a')));assert.equal(calls,1);assert.equal(new Set(urls).size,1);assert.equal(cachedImage('/api/files?id=WSV/a'),urls[0]);
 assert.equal(await loadCachedImage('/api/files?id=WSV/a'),urls[0]);assert.equal(calls,1);
 now+=300001;assert.equal(cachedImage('/api/files?id=WSV/a'),undefined);assert.notEqual(await loadCachedImage('/api/files?id=WSV/a'),urls[0]);assert.equal(calls,2);
 mode='denied';for(let i=0;i<2;i++)await assert.rejects(()=>loadCachedImage('/api/files?id=CTC/denied'),/unavailable/);assert.equal(cachedImage('/api/files?id=CTC/denied'),undefined);assert.equal(calls,4);
 mode='ok';for(let i=0;i<26;i++)await loadCachedImage('/api/files?id=CTC/'+i);assert.equal(cachedImage('/api/files?id=CTC/0'),undefined);assert.ok(cachedImage('/api/files?id=CTC/25'));
 // A recently viewed image stays available when another image enters the bounded cache.
 const kept=cachedImage('/api/files?id=CTC/2');assert.ok(kept);await loadCachedImage('/api/files?id=CTC/new');assert.equal(cachedImage('/api/files?id=CTC/2'),kept);assert.equal(cachedImage('/api/files?id=CTC/3'),undefined);
 const wsv=await loadCachedImage('/api/files?id=WSV/same-code'),ctc=await loadCachedImage('/api/files?id=CTC/same-code');assert.notEqual(wsv,ctc);
 let inflight=0,peak=0;globalThis.fetch=async()=>{inflight++;peak=Math.max(peak,inflight);await new Promise(r=>setTimeout(r,3));inflight--;return new Response(new Blob(['image'],{type:'image/png'}));};await Promise.all(Array.from({length:12},(_,i)=>loadCachedImage('/api/files?id=queue/'+i)));assert.equal(peak,4);
 globalThis.setTimeout=(fn,ms,...args)=>realTimer(fn,ms===20000?2:ms,...args);let aborted=0;globalThis.fetch=(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{aborted++;reject(new Error('aborted'));},{once:true}));const stalled=await Promise.allSettled(Array.from({length:8},(_,i)=>loadCachedImage('/api/files?id=WSV/stalled/'+i)));assert.equal(aborted,8);assert.ok(stalled.every(r=>r.status==='rejected'));
 console.log('PASS PO image cache: authorized success only, request deduplication, immediate reuse, 5-minute expiry, failures not cached and bounded entries.');
}finally{globalThis.fetch=realFetch;Date.now=realNow;globalThis.setTimeout=realTimer;}
