import {visiblePoMonthNotices,applyPoMonthNotices} from '@/lib/po-month-notices';
import {readStage} from '@/lib/read-stage';
import {validateImageMonthChanges,validateVersionImages} from '@/lib/image-application';
import {syncStandard} from '@/lib/material-state';
import {reconcileSummaryRows} from '@/lib/order-rows';
import {workspaceData,auditChanges,commitWorkspace,sameValue} from '@/lib/workspace-store';
import {db,bucket,identity,fail} from '@/lib/server';
import {prepareMonthSettings,validateSizeProfile} from '@/lib/size-settings';
import {validateWorkspaceShape,validateWorkspaceCompany} from '@/lib/workspace-validation';
import {makeWorkspace} from '@/lib/bootstrap';
import {validateStandardAdditions} from '@/lib/master-validation';

let isolateBornAt=Date.now();
let lastHeavyAt=0;
let heavyWriteCount=0;

function markHeavy(bytes:number){
 if(bytes>=2*1048576){
  const now=Date.now();
  if(now-lastHeavyAt>25000)heavyWriteCount=0;
  lastHeavyAt=now;
  heavyWriteCount++;
 }
}

function validateItemsPayload(beforeItems:any[],rawItems:any[]){
 validateStandardAdditions(beforeItems,rawItems);
 validateImageMonthChanges(beforeItems,rawItems);
 const nextItems=syncStandard(beforeItems,rawItems);
 for(const m of nextItems){
  const vs=m.versions||[];
  if(new Set(vs.map((v:any)=>JSON.stringify([String(v.item_code||'').trim().toUpperCase().replace(/×/g,'*').replace(/\s+/g,' '),String(v.description||'').trim().toUpperCase().replace(/×/g,'*').replace(/\s+/g,' ')]))).size!==vs.length)throw Error('Duplicate item code and description version');
  if(vs.filter((v:any)=>v.all).length>1)throw Error('Only one default version per No.');
  const months=vs.flatMap((v:any)=>v.months);
  if(new Set(months).size!==months.length)throw Error('Conflicting version month assignments');
  for(const v of vs){
   validateVersionImages(v.images||[]);
   if(vs.length>1&&(v.images||[]).some((im:any)=>im.months.some((id:string)=>!v.months.includes(id))))throw Error('Image month is outside version coverage');
  }
 }
 return nextItems;
}

function diffChangedItems(beforeItems:any[],nextItems:any[]){
 const beforeMap=new Map<string,string>(beforeItems.map((m:any)=>[m.id,JSON.stringify(m)]));
 const nextMap=new Map<string,string>(nextItems.map((m:any)=>[m.id,JSON.stringify(m)]));
 return auditChanges(
  {items:beforeItems.filter((m:any)=>beforeMap.get(m.id)!==nextMap.get(m.id))},
  {items:nextItems.filter((m:any)=>beforeMap.get(m.id)!==nextMap.get(m.id))}
 );
}

function timedJson(body:any,t0:number,bytes=0){
 return Response.json(body,{headers:{'X-Worker-Ms':String(Date.now()-t0),...(bytes?{'X-Workspace-Bytes':String(bytes)}:{})}});
}

export async function GET(req:Request){
 const t0=Date.now();
 try{
  const url=new URL(req.url);
  if(url.searchParams.get('ping')==='1'){
   const now=Date.now();
   const sinceHeavyMs=lastHeavyAt>0?now-lastHeavyAt:999999;
   const requiredRestMs=heavyWriteCount>=3?15000:heavyWriteCount===2?11000:heavyWriteCount===1?7000:0;
   const cooling=sinceHeavyMs<requiredRestMs;
   return Response.json(
    {ok:true,ts:now,cooling,sinceHeavyMs,heavyWriteCount,isolateAgeMs:now-isolateBornAt},
    {headers:{'Cache-Control':'no-store','X-Worker-Ms':String(now-t0)}}
   );
  }
  const user=await readStage('account/database',()=>identity());
  const company=url.searchParams.get('company');
  if(!['WSV','CTC'].includes(company||''))throw Error('Invalid workspace');
  let r:any=await readStage('workspace database',()=>db().prepare('SELECT * FROM workspaces WHERE company = ?').bind(company).first());
  if(!r){
   const data=makeWorkspace(company!);
   await db().prepare('INSERT OR IGNORE INTO workspaces(company,data,revision) VALUES(?,?,0)').bind(company,JSON.stringify(data)).run();
   r=await db().prepare('SELECT * FROM workspaces WHERE company = ?').bind(company).first();
  }
  const data=await workspaceData(r,readStage);
  if(r)r.data=null;
  if(user.role==='user'){
   data.months=(data.months||[]).filter((m:any)=>m.show);
   data.poMonthNotices=visiblePoMonthNotices(data.poMonthNotices,data.months);
  }
  data.workspaceCompany=company;
  const payload=JSON.stringify({data,revision:r.revision,user});
  return new Response(payload,{headers:{'Content-Type':'application/json','X-Worker-Ms':String(Date.now()-t0),'X-Workspace-Bytes':String(payload.length)}});
 }catch(e){return fail(e);}
}

export async function PUT(req:Request){
 const t0=Date.now();
 try{
  const user=await identity();
  if(user.role==='user')throw Error('Access denied');
  const {company,data,revision,action}=await req.json() as any;
  if(!['WSV','CTC'].includes(company))throw Error('Invalid workspace');
  validateWorkspaceCompany(data,company);
  if(!Number.isSafeInteger(revision)||revision<0)throw Error('Invalid revision');
  const old:any=await db().prepare('SELECT data FROM workspaces WHERE company = ? AND revision = ?').bind(company,revision).first();
  if(!old)return Response.json({error:'Workspace changed in another session. Reload before saving.'},{status:409});
  let before:any=await workspaceData(old);
  old.data=null;
  const monthsOrProfilesChanged=!sameValue(before.months,data.months)||!sameValue(before.profiles,data.profiles);
  if(monthsOrProfilesChanged)reconcileSummaryRows(data);
  validateWorkspaceShape(data);
  const itemsChanged=!sameValue(before.items,data.items);
  if(itemsChanged)data.items=validateItemsPayload(before.items,data.items);
  data.workspaceCompany=company;
  for(const p of data.profiles)validateSizeProfile(p);
  if(monthsOrProfilesChanged){
   data.months=data.months.map((m:any)=>{
    for(const p of m.profiles||data.profiles)validateSizeProfile(p);
    if(m.status==='Reroute'&&m.versions.length<2)throw Error('Reroute requires two Excel versions');
    return prepareMonthSettings(m,data);
   });
  }
  const auditBefore:any={},auditAfter:any={};
  for(const k of Object.keys({...before,...data})){
   if(k==='workspaceCompany'||k==='items')continue;
   if(!sameValue(before[k],data[k])){auditBefore[k]=before[k];auditAfter[k]=data[k];}
  }
  const detail=auditChanges(auditBefore,auditAfter);
  if(itemsChanged){
   const itemDetail=diffChangedItems(before.items,data.items);
   if(itemDetail?.changes?.length)detail.changes=[...(detail.changes||[]),...itemDetail.changes];
  }
  before=null;
  const storageKey=company+'/workspace/'+crypto.randomUUID();
  const serializedData=JSON.stringify(data);
  markHeavy(serializedData.length);
  await bucket().put(storageKey,serializedData,{httpMetadata:{contentType:'application/json'}});
  const committed=await commitWorkspace(db(),company,revision,storageKey,user.email,action||'Updated workspace',detail);
  if(!committed)return Response.json({error:'Concurrent edit: reload and retry.'},{status:409});
  return new Response(`{"revision":${revision+1},"data":${serializedData}}`,{headers:{'Content-Type':'application/json','X-Worker-Ms':String(Date.now()-t0),'X-Workspace-Bytes':String(serializedData.length)}});
 }catch(e){return fail(e);}
}

// Narrow writes avoid uploading/downloading the complete workspace for targeted updates.
export async function PATCH(req:Request){
 const t0=Date.now();
 try{
 const user=await identity();if(user.role==='user')throw Error('Access denied');
 const input:any=await req.json(),{company,revision,monthId,operation}=input;
 const workspaceOps=['quantity-basis','po-month-notices','items','reuse'];
 const monthOps=['visibility','import','month-update'];
 if(!['WSV','CTC'].includes(company)||!Number.isSafeInteger(revision)||revision<0||(!workspaceOps.includes(operation)&&typeof monthId!=='string')||![...workspaceOps,...monthOps].includes(operation))throw Error('Invalid workspace update');
 const database=db(),storage=bucket(),record:any=await database.prepare('SELECT data FROM workspaces WHERE company = ? AND revision = ?').bind(company,revision).first();
 if(!record)return Response.json({error:'Workspace changed in another session. Reload before saving.'},{status:409});
 const data=await workspaceData(record);
 record.data=null;
 if(operation==='po-month-notices'){
  const result=applyPoMonthNotices(data,input.changes);if(!result.changes.length)return timedJson({revision,notes:result.notes},t0);
  data.poMonthNotices=result.notes;const serialized=JSON.stringify(data);markHeavy(serialized.length);const key=company+'/workspace/'+crypto.randomUUID();await storage.put(key,serialized,{httpMetadata:{contentType:'application/json'}});
  if(!await commitWorkspace(database,company,revision,key,user.email,'Updated PO month notices',{changes:result.changes}))return Response.json({error:'Concurrent edit: reload and retry.'},{status:409});
  return timedJson({revision:revision+1,notes:result.notes},t0,serialized.length);
 }
 if(operation==='quantity-basis'){
  if(!Array.isArray(input.changes)||!input.changes.length||input.changes.length>data.items.length)throw Error('Invalid material settings changes');
  const ids=new Set<string>(),items=new Map<string,any>(data.items.map((m:any)=>[m.id,m])),changes:any[]=[],updatedIds=new Set<string>();
  for(const change of input.changes){
   if(typeof change.id!=='string'||ids.has(change.id))throw Error('Invalid or duplicate material setting');
   if(change.quantityBasis!==undefined&&!['pair','carton'].includes(change.quantityBasis))throw Error('Invalid calculation basis');
   if(change.imageMode!==undefined&&!['single','sku'].includes(change.imageMode))throw Error('Invalid image mode');
   if(change.perSkuImage!==undefined&&typeof change.perSkuImage!=='boolean')throw Error('Invalid SKU image setting');
   ids.add(change.id);const item=items.get(change.id);if(!item)throw Error('Save new No. or version with Save all before changing settings.');
   if(change.quantityBasis!==undefined&&item.quantityBasis!==change.quantityBasis){
    changes.push({path:'items / '+item.destination+' No.'+item.list_no+'.quantityBasis',before:item.quantityBasis,after:change.quantityBasis});
    item.quantityBasis=change.quantityBasis;
    updatedIds.add(item.id);
   }
   const hasSkuUpdate=change.perSkuImage!==undefined||change.imageMode!==undefined;
   if(hasSkuUpdate){
    const nextPerSku=typeof change.perSkuImage==='boolean'?change.perSkuImage:change.imageMode==='sku';
    const prevPerSku=!!item.perSkuImage||item.imageMode==='sku';
    const nextMode=nextPerSku?'sku':'single';
    if(prevPerSku!==nextPerSku||item.imageMode!==nextMode){
     changes.push({path:'items / '+item.destination+' No.'+item.list_no+'.perSkuImage',before:prevPerSku,after:nextPerSku});
     item.perSkuImage=nextPerSku;
     item.imageMode=nextMode;
     updatedIds.add(item.id);
     if(item.destination==='STANDARD'){
      for(const other of data.items){
       if(other.destination!=='STANDARD'&&other.list_no===item.list_no&&(other.standardId===item.id||other.item_code===item.item_code)){
        other.perSkuImage=nextPerSku;
        other.imageMode=nextMode;
        updatedIds.add(other.id);
       }
      }
     }
    }
   }
  }
  const basisPayload=[...new Set([...ids,...updatedIds])].map(id=>{const m=items.get(id);const perSku=!!m?.perSkuImage||m?.imageMode==='sku';return {id,quantityBasis:m?.quantityBasis,perSkuImage:perSku,imageMode:perSku?'sku':'single'};});
  if(!changes.length)return timedJson({revision,basis:basisPayload},t0);
  const serialized=JSON.stringify(data);markHeavy(serialized.length);const key=company+'/workspace/'+crypto.randomUUID();await storage.put(key,serialized,{httpMetadata:{contentType:'application/json'}});
  if(!await commitWorkspace(database,company,revision,key,user.email,'Updated calculation basis & SKU image settings',{changes}))return Response.json({error:'Concurrent edit: reload and retry.'},{status:409});
  return timedJson({revision:revision+1,basis:basisPayload},t0,serialized.length);
 }
 if(operation==='items'){
  if(!Array.isArray(input.items))throw Error('Invalid items');
  const beforeItems=data.items;
  const nextItems=validateItemsPayload(beforeItems,input.items);
  input.items=null;
  data.items=nextItems;
  const detail=diffChangedItems(beforeItems,nextItems);
  const itemsJson=JSON.stringify(nextItems);
  const serialized=JSON.stringify(data);
  data.items=null;
  data.months=null;
  markHeavy(serialized.length);
  const key=company+'/workspace/'+crypto.randomUUID();
  await storage.put(key,serialized,{httpMetadata:{contentType:'application/json'}});
  if(!await commitWorkspace(database,company,revision,key,user.email,input.action||'Country saved',detail))return Response.json({error:'Concurrent edit: reload and retry.'},{status:409});
  return new Response(`{"revision":${revision+1},"items":${itemsJson}}`,{headers:{'Content-Type':'application/json','X-Worker-Ms':String(Date.now()-t0),'X-Workspace-Bytes':String(serialized.length)}});
 }
 if(operation==='reuse'){
  if(!Array.isArray(input.changes)||!input.changes.length)throw Error('Invalid reuse update');
  const itemMap=new Map<string,any>(data.items.map((m:any)=>[m.id,m]));
  const changes:any[]=[];
  for(const change of input.changes){
   const item=itemMap.get(change.itemId);
   const version=item?.versions?.find((v:any)=>v.id===change.versionId);
   const image=version?.images?.find((im:any)=>im.id===change.imageId);
   if(!image)throw Error('Image no longer exists');
   const nextConditions=Array.isArray(change.conditions)?change.conditions:[];
   const prevConditions=Array.isArray(image.conditions)?image.conditions:[];
   if(image.reuse!==change.reuse||JSON.stringify(prevConditions)!==JSON.stringify(nextConditions)){
    changes.push({
     path:`items / ${item.destination} No.${item.list_no} / ${version.item_code} / ${image.name}`,
     before:{reuse:image.reuse,conditions:prevConditions},
     after:{reuse:change.reuse,conditions:nextConditions}
    });
   }
   image.conditions=nextConditions;
   image.reuse=change.reuse;
   if(item.destination==='STANDARD'){
    for(const other of data.items){
     if(other.destination==='STANDARD')continue;
     for(const ov of other.versions||[]){
      for(const oim of ov.images||[]){
       if(oim.id===image.id){
        oim.conditions=[...nextConditions];
        oim.reuse=change.reuse;
       }
      }
     }
    }
   }
  }
  if(!changes.length)return timedJson({revision,items:data.items},t0);
  const itemsJson=JSON.stringify(data.items);
  const serialized=JSON.stringify(data);
  data.items=null;
  data.months=null;
  markHeavy(serialized.length);
  const key=company+'/workspace/'+crypto.randomUUID();
  await storage.put(key,serialized,{httpMetadata:{contentType:'application/json'}});
  if(!await commitWorkspace(database,company,revision,key,user.email,'Image reuse updated',{changes}))return Response.json({error:'Concurrent edit: reload and retry.'},{status:409});
  return new Response(`{"revision":${revision+1},"items":${itemsJson}}`,{headers:{'Content-Type':'application/json','X-Worker-Ms':String(Date.now()-t0),'X-Workspace-Bytes':String(serialized.length)}});
 }
 const index=data.months.findIndex((m:any)=>m.id===monthId);if(index<0)throw Error('Month unavailable');
 const previous=data.months[index];let detail:any,action:string,resultJson='';
 if(operation==='visibility'){
  if(typeof input.show!=='boolean')throw Error('Invalid visibility');
  if(previous.show===input.show)return timedJson({revision,show:input.show},t0);
  data.months[index]={...previous,show:input.show};action='Month visibility changed';detail={changes:[{path:'months / '+previous.name+'.show',before:previous.show,after:input.show}]};resultJson=`"show":${JSON.stringify(input.show)}`;
 }else if(operation==='month-update'){
  if(!input.changes||typeof input.changes!=='object')throw Error('Invalid month update');
  let updated={...previous,...input.changes};
  reconcileSummaryRows({months:[updated]});
  for(const p of updated.profiles||data.profiles)validateSizeProfile(p);
  if(updated.status==='Reroute'&&(updated.versions||[]).length<2)throw Error('Reroute requires two Excel versions');
  if(input.prepareSettings)updated=prepareMonthSettings(updated,data);
  data.months[index]=updated;
  action=input.action||'Updated month';
  detail=auditChanges({months:[previous]},{months:[updated]});
  resultJson=`"month":${JSON.stringify(updated)}`;
 }else{
  if(!Array.isArray(input.orders)||!input.orders.length||typeof input.file?.name!=='string'||typeof input.file?.id!=='string'||!input.file.id.startsWith(company+'/'))throw Error('Invalid PO import');
  if(!await storage.head(input.file.id))throw Error('Original import file unavailable');
  if(input.template){const t=input.template;if(t.company!==company||typeof t.id!=='string'||typeof t.signature!=='string'||!t.mapping)throw Error('Invalid import layout');data.importTemplates=[...(data.importTemplates||[]).filter((t:any)=>t.signature!==input.template.signature),input.template];}
  let month={...previous,orders:input.orders,controlCleared:false,importRevision:(previous.importRevision||0)+1};
  reconcileSummaryRows({months:[month]});data.months[index]=month;
  for(const p of month.profiles||data.profiles)validateSizeProfile(p);
  month=prepareMonthSettings(month,data);
  const importRecord={created:new Date().toISOString(),name:input.file.name,fileId:input.file.id,...(input.template?{importTemplateId:input.template.id}:{})};
  month.imports=[...(previous.imports||[]),{...importRecord,orders:month.orders}];data.months[index]=month;
  action=`Imported ${month.orders.length} POs from ${input.file.name}`;
  detail=auditChanges({orders:previous.orders},{orders:month.orders});detail.changes.push({path:'months / '+previous.name+'.imports',before:{count:(previous.imports||[]).length},after:{...importRecord,count:month.imports.length,POs:month.orders.map((o:any)=>o.factoryPo||o.onPo),pairs:month.orders.reduce((n:number,o:any)=>n+o.total,0)}});
  resultJson=`"orders":${JSON.stringify(month.orders)},"settings":${JSON.stringify(month.settings)},"importRevision":${month.importRevision},"importRecord":${JSON.stringify(importRecord)}`;
 }
 const serialized=JSON.stringify(data);
 data.items=null;
 data.months=null;
 markHeavy(serialized.length);
 const storageKey=company+'/workspace/'+crypto.randomUUID();
 await storage.put(storageKey,serialized,{httpMetadata:{contentType:'application/json'}});
 if(!await commitWorkspace(database,company,revision,storageKey,user.email,action,detail))return Response.json({error:'Concurrent edit: reload and retry.'},{status:409});
 return new Response(`{"revision":${revision+1},${resultJson}}`,{headers:{'Content-Type':'application/json','X-Worker-Ms':String(Date.now()-t0),'X-Workspace-Bytes':String(serialized.length)}});
}catch(e){return fail(e);}}