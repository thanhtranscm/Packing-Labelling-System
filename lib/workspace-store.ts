import {bucket} from './server';
import {auditSummary} from './audit-summary';

// Retry only reads of the same immutable snapshot, never a write or an older revision.
export async function workspaceData(record:any,read:(name:string,fn:()=>Promise<any>,timeoutMs?:number)=>Promise<any>=(_name,fn)=>fn()){
 const stored=JSON.parse(record.data);
 if(!stored.storageKey)return stored;
 let text='',snapshotSize=0;
 for(let attempt=0;attempt<2;attempt++){
  let abandoned=false;
  try{
   text=await read('workspace snapshot '+(attempt+1),async()=>{
    const object=await bucket().get(stored.storageKey);
    if(!object)throw Error('Workspace data unavailable');
    snapshotSize=object.size||snapshotSize;
    console.info('Workspace snapshot bytes:',object.size,'attempt:',attempt+1);
    if(abandoned){void object.body?.cancel().catch(()=>{});throw Error('Workspace read abandoned');}
    return object.text();
   },attempt===0?20000:30000);
   break;
  }catch(error){
   abandoned=true;
   const message=error instanceof Error?error.message:String(error);
   if(!/(timed out|temporar|network|connection|internal error|fetch failed)/i.test(message))throw error;
   if(attempt){
    if(!Number.isSafeInteger(snapshotSize)||snapshotSize<=0||snapshotSize>128*1024*1024)throw error;
    console.warn('Workspace snapshot: attempting range recovery');
    text=await read('workspace range recovery',async()=>{
     const chunkSize=1024*1024,count=Math.ceil(snapshotSize/chunkSize),parts:Uint8Array[]=new Array(count);let next=0;
     const worker=async()=>{while(next<count){const i=next++,offset=i*chunkSize,length=Math.min(chunkSize,snapshotSize-offset);const part=await bucket().get(stored.storageKey,{range:{offset,length}});if(!part)throw Error('Workspace range unavailable');const bytes=new Uint8Array(await part.arrayBuffer());if(bytes.length!==length)throw Error('Workspace range incomplete');parts[i]=bytes;}};
     await Promise.all(Array.from({length:Math.min(3,count)},worker));
     const decoder=new TextDecoder('utf-8',{fatal:true});return parts.map((part,i)=>decoder.decode(part,{stream:i<count-1})).join('');
    },30000);
    break;
   }
   console.warn('Workspace snapshot retry:',message);
  }
 }
 return JSON.parse(text);
}

function sameValue(a:any,b:any):boolean{
  if(Object.is(a,b))return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
  if(Array.isArray(a)!==Array.isArray(b))return false;
  if(Array.isArray(a)){
    if(a.length!==b.length)return false;
    for(let i=0;i<a.length;i++)if(!sameValue(a[i],b[i]))return false;
    return true;
  }
  const ka=Object.keys(a),kb=Object.keys(b);
  if(ka.length!==kb.length)return false;
  for(const k of ka)if(!Object.prototype.hasOwnProperty.call(b,k)||!sameValue(a[k],b[k]))return false;
  return true;
}

export function auditChanges(before:any,after:any){
  const changes:any[]=[];
  function walk(a:any,b:any,path:string){
    if(sameValue(a,b))return;
    if(Array.isArray(a)&&Array.isArray(b)&&[...a,...b].every(v=>v&&typeof v==='object'&&v.id)){
      const x=new Map(a.map(v=>[v.id,v])),y=new Map(b.map(v=>[v.id,v]));
      for(const id of new Set([...x.keys(),...y.keys()])){const old=x.get(id),cur=y.get(id),v=cur||old;const label=v.destination?`${v.destination} No.${v.list_no}`:v.name||v.item_code||v.factoryPo||v.onPo||v.text||id;walk(old,cur,path+' / '+label);}return;
    }
    if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){
      for(const key of new Set([...Object.keys(a),...Object.keys(b)]))walk(a[key],b[key],path?path+'.'+key:key);return;
    }
    const describe=(v:any)=>v?.result&&v?.orders?{name:v.name,created:v.created,POs:v.orders.map((o:any)=>o.factoryPo||o.onPo),pairs:v.orders.reduce((n:number,o:any)=>n+(o.total||0),0),actor:v.actor}:v;
    changes.push({path,before:describe(a),after:describe(b)});
  }
  walk(before,after,'');return {changes};
}

/** The optimistic write and its audit record commit in one D1 transaction. */
export async function commitWorkspace(database:any,company:string,revision:number,storageKey:string,actor:string,action:string,detail:any){
  const pointer=JSON.stringify({storageKey});
  let auditDetail=JSON.stringify(detail);
  // Keep large change records in R2; D1 rows have a 2 MB limit.
  if(auditDetail.length>400_000&&new TextEncoder().encode(auditDetail).byteLength>512_000){
    const auditKey=company+'/audit/'+crypto.randomUUID();
    await bucket().put(auditKey,auditDetail,{httpMetadata:{contentType:'application/json'}});
    const summary=auditSummary(detail,action,true).slice(0,120).map(row=>({label:row.label.slice(0,300),before:row.before.slice(0,1000),after:row.after.slice(0,1000)}));
    auditDetail=JSON.stringify({storageKey:auditKey,summary});
  }
  const results=await database.batch([
    database.prepare('UPDATE workspaces SET data = ?, revision = revision + 1 WHERE company = ? AND revision = ?').bind(pointer,company,revision),
    database.prepare('INSERT INTO audit(company,actor,action,detail,created) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM workspaces WHERE company = ? AND revision = ? AND data = ?)').bind(company,actor,action,auditDetail,new Date().toISOString(),company,revision+1,pointer),
  ]);
  return results[0].meta.changes>0;
}