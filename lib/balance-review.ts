// Read-only comparison. Source rows must have passed the normal PO importer.
import {exgoPeriod} from './month-order';
const key=(v:any)=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
const genderKey=(v:any)=>{const value=key(v);return ({UNISEX:'U',U:'U',WOMEN:'W',W:'W',MEN:'M',M:'M'} as Record<string,string>)[value]||value;};
const fields=[['factoryPo','Factory PO'],['onPo','ON PO'],['sku','SKU'],['country','Country'],['mos','MOS'],['exgo','EXGO'],['total','QTY'],['brand','Brand'],['season','Season'],['createDate','Create date'],['price','Price'],['type','Order type'],['category','PO category'],['color','Color'],['warehouse','Warehouse'],['model','Model'],['gender','Gender'],['originalPo','Original PO']] as const;
function sizes(o:any){const map=new Map<string,number>();const list=o.source?.sizes,qty=o.source?.qty;if(Array.isArray(list)&&Array.isArray(qty)&&list.length===qty.length){list.forEach((s:any,i:number)=>map.set(String(+s.uk),+qty[i]));}else (o.sizes||[]).forEach((s:any,i:number)=>map.set(String(+s.uk),+(o.qty?.[i]||0)));return map;}
export function reviewBalance(months:any[],orders:any[],company:string,calendar:any={}){
 const byFactory=new Map<string,number[]>(),byOn=new Map<string,number[]>();
 const add=(map:Map<string,number[]>,k:string,i:number)=>{if(k)map.set(k,[...(map.get(k)||[]),i]);};
 orders.forEach((o,i)=>{add(byFactory,key(o.factoryPo),i);add(byOn,key(o.onPo),i);});
 const used=new Set<number>(),uncertain=new Set<number>();
 const reports=months.map(month=>{
  const current=month.controlCleared?[]:month.orders||[], seen=new Set(current.map((o:any)=>key(o.id)));
  const rows=[...current.map((o:any)=>({o,origin:'control'})),...(month.latest||[]).filter((o:any)=>!seen.has(key(o.id))).map((o:any)=>({o,origin:'published'}))].map(({o,origin}:any)=>{
   const candidates=company==='WSV'?byFactory.get(key(o.factoryPo))||[]:byOn.get(key(o.onPo))||[];
   let matches=candidates;
   if(company==='CTC'&&candidates.length>1)matches=candidates.filter(i=>key(orders[i].mos)===key(o.mos));
   if(matches.length!==1){if(candidates.length)for(const i of candidates)uncertain.add(i);return {old:o,origin,status:candidates.length?'ambiguous':'missing',changes:[]};}
   const idx=matches[0],fresh=orders[idx];used.add(idx);const changes:any[]=[];
   for(const [field,label] of fields){const compare=field==='gender'?genderKey:key;if(compare(o[field])!==compare(fresh[field]))changes.push({label,before:String(o[field]??''),after:String(fresh[field]??''),unverified:!['factoryPo','onPo','sku','country','mos','total'].includes(field)&&!key(fresh[field])});}
   const oldSizes=sizes(o),newSizes=sizes(fresh);for(const size of new Set([...oldSizes.keys(),...newSizes.keys()])){const a=oldSizes.get(size)||0,b=newSizes.get(size)||0;if(a!==b)changes.push({label:'UK '+size,before:String(a),after:String(b)});}
   return {old:o,fresh,origin,status:changes.some(c=>!c.unverified)?'changed':changes.length?'unverified':'same',changes};
  });return {month,rows};
 });
 return assignNewOrders({reports,unassigned:orders.filter((_,i)=>!used.has(i)&&!uncertain.has(i)),ambiguous:orders.filter((_,i)=>!used.has(i)&&uncertain.has(i))},months,calendar);
}

function assignNewOrders(result:any,months:any[],calendar:any){
 const reports=(result.reports||[]).map((r:any)=>({...r,rows:[...(r.rows||[])]})),unassigned:any[]=[];
 const valid=/^(?:([A-Z0-9][A-Z0-9 .\/'-]{0,39}?)\s+)?(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:T(?:EMBER)?)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)(?:\s+20\d{2})?$/i;
 const isoDate=/^(20\d{2})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?$/;
 // Match explicit prefixes first. A plain site month represents END only
 // when no MID exists in that month and no other site month competes.
 const source=[...(result.unassigned||[]),...(result.ambiguous||[]),...reports.flatMap((r:any)=>r.rows.map((row:any)=>row.fresh).filter(Boolean))];
 // Derive years from matched website POs and the chronological order in each
 // spreadsheet sheet. A conflicting or out-of-order sequence is not guessed.
 const anchors=new Map<any,Set<number>>();
 for(const report of reports)for(const row of report.rows||[]){
  if(!row.fresh||!Number.isInteger(report.month?.year))continue;
  const text=String(row.fresh.exgo||'').trim();if(!valid.test(text)&&!isoDate.test(text))continue;
  const period=exgoPeriod(text,calendar);
  if(period.month!==Number(report.month.month))continue;
  const ys=anchors.get(row.fresh)||new Set<number>();ys.add(report.month.year);anchors.set(row.fresh,ys);
 }
 const orderedGroups=new Map<string,any[]>();
 for(const o of new Set<any>(source)){const src=o.source;if(typeof src?.sheet!=='string'||!Number.isSafeInteger(src.row)||src.row<1||!valid.test(String(o.exgo||'').trim()))continue;const g=orderedGroups.get(src.sheet)||[];g.push(o);orderedGroups.set(src.sheet,g);}
 const inferred=new Map<any,number>(),uncertainYears=new Set<any>();
 for(const group of orderedGroups.values()){
  group.sort((a,b)=>a.source.row-b.source.row);let previous=0,offset=0,invalid=false;const offsets=new Map<any,number>(),bases=new Set<number>();
  for(const o of group){const text=String(o.exgo||'').trim(),p=exgoPeriod(text,calendar);if(previous&&p.month<previous){if(previous>=9&&p.month<=3)offset++;else invalid=true;}previous=p.month;offsets.set(o,offset);const explicit=/\b(20\d{2})\b/.exec(text);if(explicit)bases.add(Number(explicit[1])-offset);for(const y of anchors.get(o)||[])bases.add(y-offset);}
  if((invalid&&bases.size)||bases.size>1){for(const o of group)if(!/\b20\d{2}\b/.test(String(o.exgo||'')))uncertainYears.add(o);continue;}
  if(bases.size===1){const base=[...bases][0];for(const o of group){const y=base+(offsets.get(o)||0);if(y>=2020&&y<=2100)inferred.set(o,y);}}
 }
 const periodFor=(o:any)=>{const p=exgoPeriod(String(o.exgo||''),calendar),year=inferred.get(o)||o.reviewExgoYear;return year?{...p,year}:p;};
 const midPeriods=new Set<string>();for(const order of source){const text=String(order.exgo||'').trim(),match=valid.exec(text);if(!match)continue;const period=periodFor(order);if(String(match[1]||'').trim().toUpperCase()==='MID')midPeriods.add(period.year+'|'+period.month);}
 // Use the original spreadsheet row, not the order of rendered/reviewed rows.
 const sourceGroups=new Map<string,{mid:number[],end:number[]}>();
 const groupKey=(o:any,p:any)=>{const src=o.source;if(!src||typeof src.fileName!=='string'||typeof src.sheet!=='string'||!Number.isSafeInteger(src.row)||src.row<1)return '';return JSON.stringify([src.fileName,src.sheet,p.year,p.month]);};
 for(const o of source){const m=valid.exec(String(o.exgo||'').trim());if(!m)continue;const p=periodFor(o),k=groupKey(o,p),prefix=String(m[1]||'').trim().toUpperCase();if(!k||!['MID','END','LATE'].includes(prefix))continue;const g=sourceGroups.get(k)||{mid:[],end:[]};(prefix==='MID'?g.mid:g.end).push(o.source.row);sourceGroups.set(k,g);}
 for(const order of result.unassigned||[]){
  if(key(order.deliveryForm)==='UPPER'){unassigned.push({...order,exgo:'_',reviewReason:'unrecognized_exgo'});continue;}
  const text=String(order.exgo||'').trim();
  const isoMatch=isoDate.exec(text);
  if(isoMatch){
   const year=+isoMatch[1],month=+isoMatch[2],day=isoMatch[3]?+isoMatch[3]:0;
   const sameMonth=months.filter(m=>+m.year===year&&+m.month===month);
   let matches=sameMonth;
   if(sameMonth.length>1&&day>0){
    const target=day<=15?'MID':'END';
    matches=sameMonth.filter(m=>{const prefix=String(m.prefix||'').trim().toUpperCase();return target==='MID'?prefix==='MID':['END','LATE'].includes(prefix);});
   }
   const report=matches.length===1?reports.find((r:any)=>r.month.id===matches[0].id):undefined;
   if(!report){unassigned.push({...order,reviewReason:!sameMonth.length?'no_month':matches.length>1?'multiple_months':'period_mismatch'});continue;}
   report.rows.push({old:order,fresh:order,origin:'balance',status:'new',changes:[]});
   continue;
  }
  const match=valid.exec(text);if(!match){unassigned.push({...order,reviewReason:text?'unrecognized_exgo':'missing_exgo'});continue;}
  const p=periodFor(order),sameMonth=months.filter(m=>+m.year===p.year&&+m.month===p.month),sourcePrefix=String(match[1]||'').trim().toUpperCase();
  const possibleYears=new Set<number>(months.filter(m=>+m.month===p.month&&Number.isInteger(m.year)).map(m=>m.year));
  if(!/\b20\d{2}\b/.test(text)&&(uncertainYears.has(order)||(!inferred.has(order)&&!order.reviewExgoYear&&possibleYears.size>1))){unassigned.push({...order,reviewReason:'ambiguous_year'});continue;}
  let matches=sameMonth.filter(m=>{const prefix=String(m.prefix||'').trim().toUpperCase();return prefix===sourcePrefix||(['END','LATE'].includes(prefix)&&['END','LATE'].includes(sourcePrefix));});
  if(!matches.length&&sourcePrefix&&!['MID','END','LATE'].includes(sourcePrefix)){
   const group=sourceGroups.get(groupKey(order,p)),row=order.source?.row;
   if(group?.mid.length&&group.end.length){
    const firstMid=group.mid.reduce((a,b)=>Math.min(a,b),Infinity),lastMid=group.mid.reduce((a,b)=>Math.max(a,b),-Infinity),firstEnd=group.end.reduce((a,b)=>Math.min(a,b),Infinity);
    const target=lastMid<firstEnd?(row<firstMid?'MID':row>lastMid?'END':''):'';
    if(target)matches=sameMonth.filter(m=>{const prefix=String(m.prefix||'').trim().toUpperCase();return target==='MID'?prefix==='MID':['END','LATE'].includes(prefix);});
   }
  }
  if(!matches.length&&['END','LATE'].includes(sourcePrefix)&&!midPeriods.has(p.year+'|'+p.month)&&sameMonth.length===1&&!String(sameMonth[0].prefix||'').trim())matches=sameMonth;
  const report=matches.length===1?reports.find((r:any)=>r.month.id===matches[0].id):undefined;
  if(!report){unassigned.push({...order,...(inferred.has(order)?{reviewExgoYear:inferred.get(order)}:{}),reviewReason:!sameMonth.length?'no_month':matches.length>1?'multiple_months':sourcePrefix&&!['MID','END','LATE'].includes(sourcePrefix)?'special_exgo':'period_mismatch'});continue;}
  report.rows.push({old:order,fresh:order,origin:'balance',status:'new',changes:[]});
 }
 return {...result,reports,unassigned};
}

// Refresh only the display result saved in this browser session; never modify POs.
export function reclassifySavedBalance(result:any,months:any[]=[],calendar:any={}){const normalized={...result,reports:(result.reports||[]).map((report:any)=>({...report,rows:(report.rows||[]).map((row:any)=>{
 if(!['same','changed','unverified'].includes(row.status))return row;
 const changes=(row.changes||[]).filter((c:any)=>c.label!=='Gender'||genderKey(c.before)!==genderKey(c.after));
 return {...row,changes,status:changes.some((c:any)=>!c.unverified)?'changed':changes.length?'unverified':'same'};
})}))};return months.length?assignNewOrders(normalized,months,calendar):normalized;}