import {compareSnapshots} from './comparison';
import {poSections} from './po-details';
export type ReportTable={title:string;head:string[];rows:any[][];widths:number[];deltaColumn?:number};
export function comparisonReport(c:any){
 const summary:ReportTable={title:'Summary',head:['CHANGE','COUNT / FILE'],widths:[30,78],rows:[['Before file',c.beforeName||'Before'],['After file',c.afterName||'After'],['POs added',c.po.filter((r:any)=>r.status==='New').length],['POs removed',c.po.filter((r:any)=>r.status==='Cancelled').length],['POs changed',c.po.filter((r:any)=>r.status==='Updated').length],['Items: buy more',c.materials.filter((r:any)=>r.delta>0).length],['Items: buy less',c.materials.filter((r:any)=>r.delta<0).length]]};
 if(c.warning)summary.rows.push(['Historical limitation',c.warning]);
 const activeImageIds=new Set(['label','special','card'].flatMap(key=>(c.afterVersion?.result?.[key]||[]).flatMap((r:any)=>(r.item.images||[]).map((im:any)=>im.id))));
 const sections=poSections.map(([key,title])=>{
  const filter=(v:any)=>({...v,result:{...v.result,label:key==='label'?v.result.label:[],special:key==='special'?v.result.special:[],card:key==='card'?v.result.card:[],pack:key==='pack'?v.result.pack:[],paper:['wrapping','stuffing'].includes(key)?v.result.paper.filter((p:any)=>p.kind===key):[]}});
  const materials=c.beforeVersion&&c.afterVersion?compareSnapshots(filter(c.beforeVersion),filter(c.afterVersion)).materials:[];
  for(const r of materials)if([...r.oldImages,...r.newImages].some((im:any)=>im.referenceSource))r.decision='Check current reference';
  const special=key==='special';
  const table:ReportTable={title,head:special?['ITEM CODE','COUNTRY','IMAGE / REUSE DECISION']:['ITEM CODE','COUNTRY','BEFORE PURCHASE','AFTER PURCHASE','CHANGE','IMAGE / REUSE DECISION'],widths:special?[48,24,32]:[48,24,24,24,20,32],deltaColumn:special?undefined:4,rows:materials.map((r:any)=>special?[r.code,r.country,r.decision]:[r.code,r.country,r.beforePurchase,r.afterPurchase,r.delta,r.decision])};
  if(key==='pack'){materials.sort((a:any,b:any)=>['Outer','Empty','Inner'].indexOf(a.packagingKind)-['Outer','Empty','Inner'].indexOf(b.packagingKind)||a.code.localeCompare(b.code));table.head=['ITEM CODE / DIMENSION','BEFORE PURCHASE','AFTER PURCHASE','CHANGE'];table.widths=[65,24,24,24];table.deltaColumn=3;table.rows=materials.map((r:any)=>[r.code,r.beforePurchase,r.afterPurchase,r.delta]);}
  const imageTable:ReportTable={title:'Image decisions',head:['ITEM CODE','COUNTRY','BEFORE / AFTER','STATUS','FILE NAME','REUSE','CONDITIONS','APPLIED MONTHS'],widths:[40,24,18,18,55,30,60,32],rows:[]};
  const images:any[]=[];
  for(const r of materials)for(const [side,refs] of [['Before',r.oldImages],['After',r.newImages]] as const)for(const im of refs){
   const status=side==='Before'?(!activeImageIds.has(im.id)?'No longer used':r.retainedImages.some((a:any)=>a.id===im.id)?'Retained':'Still used elsewhere'):(r.addedImages.some((a:any)=>a.id===im.id)?'Added':'Retained');
   const conditions=(im.rules||[]).map((a:any)=>a.text).join('\n')||im.condition||'';
   imageTable.rows.push([r.code,r.country,side,status+(im.referenceSource?' · Current reference':''),im.name,im.reuse,conditions,(im.monthNames||im.months||[]).join(', ')]);
   if(!images.some(i=>i.id===im.id&&i.side===side))images.push({...im,side,label:title+' | '+r.code+' | '+side+' | '+status+(im.referenceSource?' | Current reference':'')});
  }
  return {key,title,table,imageTable,images};
 });
 const po:ReportTable={title:'PO Changes',head:['FACTORY PO','ON PO','SKU','COUNTRY','STATUS','FIELD CHANGES'],widths:[22,22,22,26,18,65],rows:c.po.map((r:any)=>[r.po.factoryPo,r.po.onPo,r.po.sku,r.po.country,r.status,r.fields.filter((f:any)=>f.field!=='total').map((f:any)=>f.field+': '+String(f.before??'—')+' → '+String(f.after??'—')).join('\n')])};
 return {summary,sections,po};
}
