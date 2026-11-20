import {norm} from './model';
import {materialImageNote} from './material-state';
export const poSections=[['label','Label'],['special','Special Label'],['card','Card'],['pack','Outer - Empty - Inner'],['wrapping','Wrapping Paper'],['stuffing','Stuffing Paper']] as const;
export const purchasePoFields=[['brand','BRAND'],['season','SEASON'],['createDate','CREATE DATE'],['price','PRICE'],['type','ORDER TYPE'],['category','PO CATEGORY'],['factoryPo','FACTORY PO'],['onPo','ON PO'],['sku','SKU'],['color','COLOR'],['country','COUNTRY'],['warehouse','WAREHOUSE'],['mos','MOS'],['model','MODEL'],['gender','GENDER']] as const;
const baseHead=purchasePoFields.map(([,label])=>label);
const base=(o:any)=>purchasePoFields.map(([field])=>o[field]??'');
// Attach current references only to the exact material code and month. Published quantities stay intact.
export function detailResult(result:any,orders:any[],month:any,ws:any){const ids=new Set(orders.map(o=>o.id));const next={...result,orders};for(const kind of ['label','special','card'])next[kind]=(result[kind]||[]).filter((r:any)=>ids.has(r.po.id)).map((r:any)=>{const current=ws.items.filter((m:any)=>norm(m.destination)===norm(r.item.destination||r.po.country));const liveImages=current.flatMap((m:any)=>(m.versions||[]).filter((v:any)=>norm(v.item_code)===norm(r.item.item_code)).flatMap((v:any)=>(v.images||[]).map((im:any)=>({...im,groupNote:materialImageNote(ws.items,m,v)}))));const matches=liveImages.filter((im:any)=>(im.months||[]).includes(month.id));const notes=new Map(liveImages.map((im:any)=>[im.id,im]));const historical=r.item.images||[];return {...r,item:{...r.item,images:historical.length?historical.map((im:any)=>notes.has(im.id)?{...im,note:(notes.get(im.id) as any).note||'',groupNote:(notes.get(im.id) as any).groupNote||''}:im):matches.map((im:any)=>({...im,referenceSource:'Current month reference'}))}};});next.pack=(result.pack||[]).filter((r:any)=>ids.has(r.po.id));next.paper=(result.paper||[]).filter((r:any)=>r.aggregate?orders.length===result.orders.length&&result.orders.every((o:any)=>ids.has(o.id)):ids.has(r.po.id));next.paperSizeTables=orders.length===result.orders.length&&result.orders.every((o:any)=>ids.has(o.id))?result.paperSizeTables:undefined;return next;}
// Purchase snapshots only: same metadata, quantities and aggregate rounding as the buffer workbook.
export function sectionTable(result:any,key:string,company:string){
 const sizes=result.sizes||[];let head:string[]=[];let rows:any[][]=[];let sumColumns:number[]=[];
 if(['label','special','card'].includes(key)){
  head=[...baseHead,'LIST','MATERIAL NAME','SUPPLIER/ITEM CODE','QTY PER FINISH GOOD','UNIT'];
  if(key!=='special'){head.push('BUFFER %',...sizes.map((s:any)=>'UK '+s.uk),'PURCHASE');sumColumns=Array.from({length:sizes.length+1},(_,i)=>21+i);}
  rows=(result[key]||[]).map((r:any)=>[...base(r.po),r.item.destination,r.item.description,r.item.item_code,r.item.qty_per_finish,r.item.unit,...(key==='special'?[]:[(r.buffer||0)+'%',...(r.qty||[]),r.total])]);
 }else if(key==='pack'){
  const groups=result.pack?.[0]?.groups||[];
  head=[...baseHead,'ORIGINAL PO','MARKET','DIMENSION',...sizes.map((s:any)=>'UK '+s.uk),'TOTAL PAIRS','EXGO'];
  sumColumns=Array.from({length:sizes.length+1},(_,i)=>18+i);
  for(const [kind,field] of [['OUTER','purchaseCartons'],['EMPTY','purchaseEmpty'],['INNER','purchaseInner']]){
   groups.forEach((g:any,i:number)=>head.push(kind+' '+(g[kind.toLowerCase()+'Code']??g[kind.toLowerCase()]??('GROUP '+(i+1)))+' '+(g[kind.toLowerCase()+'Dimension']||'')));
   head.push(kind+' TOTAL');
  }
  for(let i=20+sizes.length;i<head.length;i++)sumColumns.push(i);
  rows=(result.pack||[]).map((r:any)=>[...base(r.po),r.po.originalPo,r.market,r.dimension,...r.po.qty,r.po.total,r.po.exgo,...['purchaseCartons','purchaseEmpty','purchaseInner'].flatMap(field=>[...r.groups.map((g:any)=>g[field]),r.groups.reduce((n:number,g:any)=>n+(+g[field]||0),0)])]);
 }else{
  head=['MATERIAL CODE','SIZE RANGE','PAIRS','QTY / PAIR','QUANTITY','BUFFER %','BUFFER QTY','PURCHASE'];sumColumns=[2,4,6,7];
  const groups=new Map<string,any>();
  for(const p of (result.paper||[]).filter((r:any)=>r.kind===key)){
   const id=p.from+'|'+p.to;const old=groups.get(id)||{...p,required:0,total:0};old.required+=p.required;old.total+=p.total;groups.set(id,old);
  }
  rows=[...groups.values()].map(p=>{const buy=p.aggregate?p.total:Math.ceil(p.required*(1+(p.buffer||0)/100));return [p.code,p.from+' ~ '+p.to,p.required/p.qtyPerPair,p.qtyPerPair,p.required,(p.buffer||0)+'%',buy-p.required,buy];});
 }
 const total=head.map((_,i)=>i===0?'TOTAL':sumColumns.includes(i)?rows.reduce((n,row)=>n+(typeof row[i]==='number'?row[i]:0),0):'');
 let sizeTable:any=null;
 if(['wrapping','stuffing'].includes(key)){
  const papers=(result.paper||[]).filter((p:any)=>p.kind===key);
  if(result.paperSizeTables?.[key])sizeTable=result.paperSizeTables[key];
  else if(papers.length&&!papers.some((p:any)=>p.aggregate)){
   const h=['UK SIZE','PAIRS','MATERIAL CODE','QTY / PAIR','QUANTITY','BUFFER QTY','PURCHASE'];
   const rr=sizes.map((s:any,i:number)=>{const group=papers.find((p:any)=>+s.uk>=+p.from&&+s.uk<=+p.to),pairs=result.orders.reduce((n:number,o:any)=>n+(o.qty[i]||0),0),qty=papers.reduce((n:number,p:any)=>n+(p.bySize?.[i]||0),0),buy=Math.ceil(qty*(1+(group?.buffer||0)/100));return [s.uk,pairs,group?.code||'',group?.qtyPerPair||0,qty,buy-qty,buy];});
   sizeTable={head:h,rows:rr};
  }
 }
 return {title:poSections.find(s=>s[0]===key)?.[1]||key,head,rows,total,sizeTable};
}
export function sectionMaterials(result:any,key:string){return ['label','special','card'].includes(key)?result[key]||[]:[];}
