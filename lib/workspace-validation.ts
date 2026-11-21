import {outputs} from './material-state';
export function validateWorkspaceShape(data:any){
 if(!data||typeof data.name!=='string'||!data.name.trim()||!Array.isArray(data.items)||!Array.isArray(data.months)||!data.profiles?.length)throw Error('Invalid workspace');
 if(data.balanceReviewRule!=null){const rules=Array.isArray(data.balanceReviewRule)?data.balanceReviewRule:[data.balanceReviewRule];if(rules.length>100||rules.some((r:any)=>!r||typeof r!=='object'||typeof r.column!=='string'||!r.column.trim()||r.column.length>200||typeof r.value!=='string'||!r.value.trim()||r.value.length>500))throw Error('Invalid balance review rule');}
 if(data.balanceReviewColumns!=null){const c=data.balanceReviewColumns;if(typeof c!=='object'||!Array.isArray(c.hidden)||!Array.isArray(c.custom)||[...c.hidden,...c.custom].length>500||[...c.hidden,...c.custom].some((v:any)=>typeof v!=='string'||!v.trim()||v.length>200))throw Error('Invalid balance review column settings');}
 if(data.exgoCalendar){const c=data.exgoCalendar;if(!Number.isInteger(c.year)||c.year<2020||c.year>2100||!Number.isInteger(c.month)||c.month<1||c.month>12||!c.overrides||Array.isArray(c.overrides)||typeof c.overrides!=='object'||Object.values(c.overrides).some((y:any)=>!Number.isInteger(y)||y<2020||y>2100))throw Error('Invalid EXGO calendar');}
 const unique=(rows:any[],key:(r:any)=>string,title:string)=>{const keys=rows.map(key);if(keys.some(k=>!k)||new Set(keys).size!==keys.length)throw Error('Duplicate or missing '+title);};
 unique(data.months,m=>m.id,'month');unique(data.months,m=>m.year+'|'+m.month+'|'+String(m.prefix||'').trim().toUpperCase(),'month period / prefix');unique(data.profiles,p=>p.id,'size table');unique(data.items,m=>m.id,'material identifier');unique(data.items,m=>String(m.destination).trim().toUpperCase()+'|'+m.list_no,'country / No.');
 const months=new Set(data.months.map((m:any)=>m.id));
 for(const month of data.months){if(month.exgoCalendar){const c=month.exgoCalendar;if(!Number.isInteger(c.year)||c.year<2020||c.year>2100||!Number.isInteger(c.month)||c.month<1||c.month>12||!c.overrides||Array.isArray(c.overrides)||typeof c.overrides!=='object'||Object.values(c.overrides).some((y:any)=>!Number.isInteger(y)||y<2020||y>2100))throw Error('Invalid month EXGO calendar');}if(!['Active','Reroute','Cancelled'].includes(month.status)||!Number.isInteger(month.year)||!Number.isInteger(month.month)||month.month<1||month.month>12||!Array.isArray(month.versions)||!Array.isArray(month.orders))throw Error('Invalid month');unique(month.versions,v=>v.id,'Excel version');unique(month.orders,o=>o.id,'PO identifier');}
 for(const item of data.items){
  if(item.imageNote!==undefined&&(typeof item.imageNote!=='string'||item.imageNote.length>2000))throw Error('Common image note must contain at most 2000 characters.');
  if(item.quantityBasis!==undefined&&!['pair','carton'].includes(item.quantityBasis))throw Error(`${item.destination} No.${item.list_no}: invalid calculation basis.`);
  if(!Number.isSafeInteger(item.list_no)||item.list_no<1||typeof item.destination!=='string'||!item.destination.trim()||!Array.isArray(item.versions))throw Error('Invalid country / No.');
  if(String(item.qty_per_finish??'').trim()===''||!Number.isFinite(Number(item.qty_per_finish))||Number(item.qty_per_finish)<0)throw Error(`${item.destination} No.${item.list_no}: quantity per pair must be zero or positive.`);
  if((outputs(item).length&&String(item.item_code||'').trim()&&!String(item.unit||'').trim())||outputs(item).some((s:string)=>!['label','special','card'].includes(s)))throw Error(`${item.destination} No.${item.list_no}: invalid unit or output sheet.`);
  unique(item.versions,v=>v.id,'material version');
  for(const version of item.versions){
   if(typeof version.item_code!=='string'||!Array.isArray(version.months)||!Array.isArray(version.images))throw Error('Invalid material version');
   version.months=version.months.filter((id:string)=>months.has(id));
   for(const image of version.images){
    if(typeof image.id!=='string'||!Array.isArray(image.months))throw Error('Invalid image');
    if(image.note!==undefined&&(typeof image.note!=='string'||image.note.length>2000))throw Error('Image note must contain at most 2000 characters.');
    if(image.poIds!==undefined&&(!Array.isArray(image.poIds)||image.poIds.some((id:any)=>typeof id!=='string')))throw Error('Invalid image PO selection');
    image.months=image.months.filter((id:string)=>months.has(id));
    if(!image.months.length&&Array.isArray(image.poIds))image.poIds=[];
   }
  }
 }
}

// Display names are editable; this marker and file namespaces identify the workspace.
export function validateWorkspaceCompany(data:any,company:string){
 if(data?.workspaceCompany!==undefined&&data.workspaceCompany!==company)throw Error('Workspace mismatch: reload '+company+' before saving.');
 function visit(value:any){
  if(!value||typeof value!=='object')return;
  if(Array.isArray(value)){for(const child of value)visit(child);return;}
  for(const [key,child] of Object.entries(value)){
   if(['id','fileId','storageKey'].includes(key)&&typeof child==='string'&&/^(WSV|CTC)\//.test(child)&&!child.startsWith(company+'/'))throw Error('A file belongs to another workspace. Upload it in '+company+' before saving.');
   if(child&&typeof child==='object')visit(child);
  }
 }
 visit(data);
}