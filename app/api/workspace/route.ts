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

export async function GET(req:Request){
 try{
  const url=new URL(req.url);
  if(url.searchParams.get('ping')==='1')return Response.json({ok:true,ts:Date.now()});
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
  if(user.role==='user'){
   data.months=(data.months||[]).filter((m:any)=>m.show);
   data.poMonthNotices=visiblePoMonthNotices(data.poMonthNotices,data.months);
  }
  data.workspaceCompany=company;
  return Response.json({data,revision:r.revision,user});
 }catch(e){return fail(e);}
}

export async function PUT(req:Request){
 try{
  const user=await identity();
  if(user.role==='user')throw Error('Access denied');
  const {company,data,revision,action}=await req.json() as any;
  if(!['WSV','CTC'].includes(company))throw Error('Invalid workspace');
  validateWorkspaceCompany(data,company);
  if(!Number.isSafeInteger(revision)||revision<0)throw Error('Invalid revision');
  const old:any=await db().prepare('SELECT data FROM workspaces WHERE company = ? AND revision = ?').bind(company,revision).first();
  if(!old)return Response.json({error:'Workspace changed in another session. Reload before saving.'},{status:409});
  const before=await workspaceData(old);
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
  const storageKey=company+'/workspace/'+crypto.randomUUID();
  const serializedData=JSON.stringify(data);
  await bucket().put(storageKey,serializedData,{httpMetadata:{contentType:'application/json'}});
  const committed=await commitWorkspace(db(),company,revision,storageKey,user.email,action||'Updated workspace',auditChanges(before,data));
  if(!committed)return Response.json({error:'Concurrent edit: reload and retry.'},{status:409});
  return new Response(`{"revision":${revision+1},"data":${serializedData}}`,{headers:{'Content-Type':'application/json'}});
 }catch(e){return fail(e);}
}

// Narrow writes avoid uploading/downloading the complete workspace for targeted updates.
export async function PATCH(req:Request){try{
 const user=await identity();if(user.role==='user')throw Error('Access denied');
 const input:any=await req.json(),{company,revision,monthId,operation}=input;
 const workspaceOps=['quantity-basis','po-month-notices','items','reuse'];
 const monthOps=['visibility','import','month-update'];
 if(!['WSV','CTC'].includes(company)||!Number.isSafeInteger(revision)||revision<0||(!workspaceOps.includes(operation)&&typeof monthId!=='string')||![...workspaceOps,...monthOps].includes(operation))throw Error('Invalid workspace update');
 const database=db(),storage=bucket(),record:any=await database.prepare('SELECT data FROM workspaces WHERE company = ? AND revision = ?').bind(company,revision).first();
 if(!record)return Response.json({error:'Workspace changed in another session. Reload before saving.'},{status:409});
 const data=await workspaceData(record);
 if(operation==='po-month-notices'){
  const result=applyPoMonthNotices(data,input.changes);if(!result.changes.length)return Response.json({revision,notes:result.notes});
  data.poMonthNotices=result.notes;const key=company+'/workspace/'+crypto.randomUUID();await storage.put(key,JSON.stringify(data),{httpMetadata:{contentType:'application/json'}});
  if(!await commitWorkspace(database,company,revision,key,user.email,'Updated PO month notices',{changes:result.changes}))return Response.json({error:'Concurrent edit: reload and retry.'},{status:409});
  return Response.json({revision:revision+1,notes:result.notes});
 }
 if(operation==='quantity-basis'){
  if(!Array.isArray(input.changes)||!input.changes.length||input.changes.length>data.items.length)throw Error('Invalid material settings changes');
  const ids=new Set<string>(),items=new Map<string,any>(data.items.map((m:any)=>[m.id,m])),changes:any[]=[];
  for(const change of input.changes){
   if(typeof change.id!=='string'||ids.has(change.id))throw Error('Invalid or duplicate material setting');
   if(change.quantityBasis!==undefined&&!['pair','carton'].includes(change.quantityBasis))throw Error('Invalid calculation basis');
   if(change.imageMode!==undefined&&!['single','sku'].includes(change.imageMode))throw Error('Invalid image mode');
   ids.add(change.id);const item=items.get(change.id);if(!item)throw Error('Save new No. or version with Save all before changing settings.');
   if(change.quantityBasis!==undefined&&item.quantityBasis!==change.quantityBasis){
    changes.push({path:'items / '+item.destination+' No.'+item.list_no+'.quantityBasis',before:item.quantityBasis,after:change.quantityBasis});
    item.quantityBasis=change.quantityBasis;
   }
   if(change.imageMode!==undefined&&item.imageMode!==change.imageMode){
    changes.push({path:'items / '+item.destination+' No.'+item.list_no+'.imageMode',before:item.imageMode||'single',after:change.imageMode});
    item.imageMode=change.imageMode;
   }
  }
  if(!changes.length)return Response.json({revision,basis:input.changes});
  const key=company+'/workspace/'+crypto.randomUUID();await storage.put(key,JSON.stringify(data),{httpMetadata:{contentType:'application/json'}});
  if(!await commitWorkspace(database,company,revision,key,user.email,'Updated calculation basis & SKU image settings',{changes}))return Response.json({error:'Concurrent edit: reload and retry.'},{status:409});
  return Response.json({revision:revision+1,basis:input.changes.map((c:any)=>({id:c.id,quantityBasis:items.get(c.id)?.quantityBasis,imageMode:items.get(c.id)?.imageMode}))});
 }
 if(operation==='items'){
  if(!Array.isArray(input.items))throw Error('Invalid items');
  const beforeItems=data.items;
  const nextItems=validateItemsPayload(beforeItems,input.items);
  data.items=nextItems;
  const detail=auditChanges({items:beforeItems},{items:nextItems});
  const key=company+'/workspace/'+crypto.randomUUID();await storage.put(key,JSON.stringify(data),{httpMetadata:{contentType:'application/json'}});
  if(!await commitWorkspace(database,company,revision,key,user.email,input.action||'Country saved',detail))return Response.json({error:'Concurrent edit: reload and retry.'},{status:409});
  return Response.json({revision:revision+1,items:data.items});
 }
 if(operation==='reuse'){
  if(!Array.isArray(input.changes)||!input.changes.length)throw Error('Invalid reuse update');
  const beforeItems=structuredClone(data.items);
  for(const change of input.changes){
   const image=data.items.find((a:any)=>a.id===change.itemId)?.versions?.find((v:any)=>v.id===change.versionId)?.images?.find((im:any)=>im.id===change.imageId);
   if(!image)throw Error('Image no longer exists');
   image.conditions=Array.isArray(change.conditions)?change.conditions:[];
   image.reuse=change.reuse;
  }
  data.items=syncStandard(beforeItems,data.items);
  const detail=auditChanges({items:beforeItems},{items:data.items});
  const key=company+'/workspace/'+crypto.randomUUID();await storage.put(key,JSON.stringify(data),{httpMetadata:{contentType:'application/json'}});
  if(!await commitWorkspace(database,company,revision,key,user.email,'Image reuse updated',detail))return Response.json({error:'Concurrent edit: reload and retry.'},{status:409});
  return Response.json({revision:revision+1,items:data.items});
 }
 const index=data.months.findIndex((m:any)=>m.id===monthId);if(index<0)throw Error('Month unavailable');
 const previous=data.months[index];let detail:any,action:string,result:any;
 if(operation==='visibility'){
  if(typeof input.show!=='boolean')throw Error('Invalid visibility');
  if(previous.show===input.show)return Response.json({revision,show:input.show});
  data.months[index]={...previous,show:input.show};action='Month visibility changed';detail={changes:[{path:'months / '+previous.name+'.show',before:previous.show,after:input.show}]};result={show:input.show};
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
  result={month:updated};
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
  result={orders:month.orders,settings:month.settings,importRevision:month.importRevision,importRecord};
 }
 const storageKey=company+'/workspace/'+crypto.randomUUID();await storage.put(storageKey,JSON.stringify(data),{httpMetadata:{contentType:'application/json'}});
 if(!await commitWorkspace(database,company,revision,storageKey,user.email,action,detail))return Response.json({error:'Concurrent edit: reload and retry.'},{status:409});
 return Response.json({revision:revision+1,...result});
}catch(e){return fail(e);}}