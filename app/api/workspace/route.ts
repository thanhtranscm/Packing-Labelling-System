import {visiblePoMonthNotices,applyPoMonthNotices} from '@/lib/po-month-notices';
import {readStage} from '@/lib/read-stage';
import {validateImageMonthChanges} from '@/lib/image-application';
import {syncStandard} from '@/lib/material-state';
import {reconcileSummaryRows} from '@/lib/order-rows';
import {workspaceData,auditChanges,commitWorkspace} from '@/lib/workspace-store';
import {db,bucket,identity,fail} from '@/lib/server';
import {prepareMonthSettings,validateSizeProfile} from '@/lib/size-settings';
import {validateWorkspaceShape,validateWorkspaceCompany} from '@/lib/workspace-validation';
import {makeWorkspace} from '@/lib/bootstrap';
import {validateStandardAdditions} from '@/lib/master-validation';

export async function GET(req:Request){
 try{
  const user=await readStage('account/database',()=>identity());
  const company=new URL(req.url).searchParams.get('company');
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
  const monthsOrProfilesChanged=JSON.stringify(before.months)!==JSON.stringify(data.months)||JSON.stringify(before.profiles)!==JSON.stringify(data.profiles);
  if(monthsOrProfilesChanged)reconcileSummaryRows(data);
  validateWorkspaceShape(data);
  validateStandardAdditions(before.items,data.items);
  validateImageMonthChanges(before.items,data.items);
  data.workspaceCompany=company;
  data.items=syncStandard(before.items,data.items);
  for(const p of data.profiles)validateSizeProfile(p);
  if(monthsOrProfilesChanged){
   data.months=data.months.map((m:any)=>{
    for(const p of m.profiles||data.profiles)validateSizeProfile(p);
    if(m.status==='Reroute'&&m.versions.length<2)throw Error('Reroute requires two Excel versions');
    return prepareMonthSettings(m,data);
   });
  }
  for(const m of data.items){
   const vs=m.versions||[];
   if(new Set(vs.map((v:any)=>JSON.stringify([String(v.item_code||'').trim().toUpperCase().replace(/×/g,'*').replace(/\s+/g,' '),String(v.description||'').trim().toUpperCase().replace(/×/g,'*').replace(/\s+/g,' ') ]))).size!==vs.length)throw Error('Duplicate item code and description version');
   if(vs.filter((v:any)=>v.all).length>1)throw Error('Only one default version per No.');
   const months=vs.flatMap((v:any)=>v.months);
   if(new Set(months).size!==months.length)throw Error('Conflicting version month assignments');
   for(const v of vs){
    const ims=(v.images||[]).flatMap((im:any)=>im.months);
    if(new Set(ims).size!==ims.length)throw Error('Conflicting image assignments');
    if(vs.length>1&&(v.images||[]).some((im:any)=>im.months.some((id:string)=>!v.months.includes(id))))throw Error('Image month is outside version coverage');
   }
  }
  const storageKey=company+'/workspace/'+crypto.randomUUID();
  await bucket().put(storageKey,JSON.stringify(data),{httpMetadata:{contentType:'application/json'}});
  const committed=await commitWorkspace(db(),company,revision,storageKey,user.email,action||'Updated workspace',auditChanges(before,data));
  if(!committed)return Response.json({error:'Concurrent edit: reload and retry.'},{status:409});
  return Response.json({revision:revision+1,data});
 }catch(e){return fail(e);}
}

// Narrow writes avoid uploading/downloading the complete workspace for a flag or import.
export async function PATCH(req:Request){try{
 const user=await identity();if(user.role==='user')throw Error('Access denied');
 const input:any=await req.json(),{company,revision,monthId,operation}=input;
 if(!['WSV','CTC'].includes(company)||!Number.isSafeInteger(revision)||revision<0||(!['quantity-basis','po-month-notices'].includes(operation)&&typeof monthId!=='string')||!['visibility','import','quantity-basis','po-month-notices'].includes(operation))throw Error('Invalid month update');
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
  if(!Array.isArray(input.changes)||!input.changes.length||input.changes.length>data.items.length)throw Error('Invalid calculation basis changes');
  const ids=new Set<string>(),items=new Map<string,any>(data.items.map((m:any)=>[m.id,m])),changes:any[]=[];
  for(const change of input.changes){
   if(typeof change.id!=='string'||ids.has(change.id)||!['pair','carton'].includes(change.quantityBasis))throw Error('Invalid or duplicate calculation basis');
   ids.add(change.id);const item=items.get(change.id);if(!item)throw Error('Save new No. or version with Save all before changing its calculation basis.');
   if(item.quantityBasis!==change.quantityBasis)changes.push({path:'items / '+item.destination+' No.'+item.list_no+'.quantityBasis',before:item.quantityBasis,after:change.quantityBasis});
  }
  if(!changes.length)return Response.json({revision,basis:input.changes});
  for(const change of input.changes)items.get(change.id).quantityBasis=change.quantityBasis;
  const key=company+'/workspace/'+crypto.randomUUID();await storage.put(key,JSON.stringify(data),{httpMetadata:{contentType:'application/json'}});
  if(!await commitWorkspace(database,company,revision,key,user.email,'Updated material calculation basis',{changes}))return Response.json({error:'Concurrent edit: reload and retry.'},{status:409});
  return Response.json({revision:revision+1,basis:input.changes.map((c:any)=>({id:c.id,quantityBasis:c.quantityBasis}))});
 }
 const index=data.months.findIndex((m:any)=>m.id===monthId);if(index<0)throw Error('Month unavailable');
 const previous=data.months[index];let detail:any,action:string,result:any;
 if(operation==='visibility'){
  if(typeof input.show!=='boolean')throw Error('Invalid visibility');
  if(previous.show===input.show)return Response.json({revision,show:input.show});
  data.months[index]={...previous,show:input.show};action='Month visibility changed';detail={changes:[{path:'months / '+previous.name+'.show',before:previous.show,after:input.show}]};result={show:input.show};
 }else{
  if(!Array.isArray(input.orders)||!input.orders.length||typeof input.file?.name!=='string'||typeof input.file?.id!=='string'||!input.file.id.startsWith(company+'/'))throw Error('Invalid PO import');
  if(!await storage.head(input.file.id))throw Error('Original import file unavailable');
  if(input.template){const t=input.template;if(t.company!==company||typeof t.id!=='string'||typeof t.signature!=='string'||!t.mapping)throw Error('Invalid import layout');data.importTemplates=[...(data.importTemplates||[]).filter((t:any)=>t.signature!==input.template.signature),input.template];}
  let month={...previous,orders:input.orders,controlCleared:false,importRevision:(previous.importRevision||0)+1};
  reconcileSummaryRows({months:[month]});data.months[index]=month;validateWorkspaceShape({...data,items:structuredClone(data.items)});
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