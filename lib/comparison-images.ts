import {norm} from './model';
import {detailResult} from './po-details';
// Keep saved references authoritative; fallback images are explicitly current references.
export function comparisonImages(c:any,month:any,ws:any){
 const key=(country:string,code:string)=>norm(country)+'|'+norm(code);
 function collect(version:any){
  const map=new Map<string,any[]>();if(!version)return map;
  const result=detailResult(version.result,version.orders,month,ws);
  for(const r of [...result.label,...result.special,...result.card]){const k=key(r.po.country,r.item.item_code),images=map.get(k)||[];for(const im of r.item.images||[])if(!images.some(a=>a.id===im.id))images.push(im);map.set(k,images);}
  return map;
 }
 const before=collect(c.beforeVersion),after=collect(c.afterVersion);
 const groups=c.materials.filter((r:any)=>r.type==='material').map((r:any)=>({code:r.code,country:r.country,decision:r.decision,before:before.get(key(r.country,r.code))||r.oldImages||[],after:after.get(key(r.country,r.code))||r.newImages||[]}));
 const activeIds=new Set(groups.flatMap((g:any)=>g.after.map((im:any)=>im.id)));
 const obsolete=new Map<string,any>();
 for(const g of groups)for(const im of g.before)if(!activeIds.has(im.id)){const row=obsolete.get(im.id)||{image:im,materials:[]};const label=g.code+' · '+g.country;if(!row.materials.includes(label))row.materials.push(label);obsolete.set(im.id,row);}
 return {groups:groups.filter((g:any)=>g.before.length||g.after.length),obsolete:[...obsolete.values()]};
}
export function comparisonWithImageReferences(c:any,month:any,ws:any){
 const attach=(v:any)=>v?{...v,result:detailResult(v.result,v.orders,month,ws)}:v;
 return {...c,beforeVersion:attach(c.beforeVersion),afterVersion:attach(c.afterVersion)};
}
