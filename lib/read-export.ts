import ExcelJS from 'exceljs';
import {norm} from './model';
import {validateSizeProfile} from './size-settings';
import {isSummaryOrder} from './order-rows';
const val=(c:any):any=>{const v=c.value;if(v&&typeof v==='object'&&!(v instanceof Date)){if(v.error)throw Error(`Excel error at ${c.address}`);if((v.formula||v.sharedFormula)&&v.result===undefined)throw Error(`Formula without cached result at ${c.address}. Recalculate and save in Excel.`);return v.text??v.result??v.richText?.map((r:any)=>r.text).join('')??'';}return v??'';};
const amount=(v:any,label:string,integer=false)=>{const n=v===''?0:Number(v);if(!Number.isFinite(n)||n<0||(integer&&!Number.isSafeInteger(n)))throw Error(`Invalid quantity at ${label}`);return n;};
// External spreadsheets carry quantities, but not image/master history snapshots.
// Preserve their actual data and label that historical limitation explicitly.
export async function readExportVersion(file:File,company:string,ws:any,month:any):Promise<any>{
  const book=new ExcelJS.Workbook();await book.xlsx.load(await file.arrayBuffer());
  const sh=book.getWorksheet('Outer - Empty - Inner');if(!sh)throw Error('Missing sheet Outer - Empty - Inner');
  if(!['WSV','CTC'].includes(company)||!norm(val(sh.getCell('G1'))).startsWith(company))throw Error('Select the correct workspace for this Excel version.');
  const sizeCols:number[]=[];for(let c=20;c<=sh.columnCount;c++)if(Number.isFinite(+val(sh.getRow(3).getCell(c)))&&String(val(sh.getRow(3).getCell(c)))!=='')sizeCols.push(c);
  // Group headers are text dimensions, so only the source size band is included.
  const n=sizeCols.length;if(!n)throw Error('Size headers not found');
  const profiles=month.profiles||ws.profiles;profiles.forEach(validateSizeProfile);
  const matches=profiles.filter((p:any)=>p.sizes.length===n&&p.sizes.every((s:any,i:number)=>+s.uk===+val(sh.getRow(3).getCell(sizeCols[i]))));
  if(matches.length!==1)throw Error('Export size table is missing or ambiguous');
  const profile=matches[0],orders:any[]=[],pack:any[]=[];
  profile.sizes.forEach((s:any,i:number)=>{const expected=norm(s.us).split('/').map((x:string)=>x.trim()).filter(Boolean).sort();const actual=[norm(val(sh.getRow(1).getCell(sizeCols[i]))),norm(val(sh.getRow(2).getCell(sizeCols[i])))].filter(Boolean).sort();if(expected.join('|')!==actual.join('|'))throw Error(`Export UK ${s.uk}: US conversion does not match the month's saved table.`);});
  const g=(sh.columnCount-(21+n))/3-1;if(!Number.isInteger(g)||g<1)throw Error('Invalid carton/box columns');
  for(let r=5;r<=sh.rowCount;r++){
    const row=sh.getRow(r),v=(c:number)=>val(row.getCell(c));if(!v(8)&&!v(9))continue;if(!v(8)||!v(9))throw Error(`Export row ${r}: missing ON PO or SKU`);
    const o={brand:v(1),season:v(2),createDate:v(3),price:v(4),type:v(5),category:v(6),factoryPo:String(v(7)),onPo:String(v(8)),sku:String(v(9)),color:v(10),country:String(v(11)),warehouse:String(v(12)),mos:String(v(13)),model:v(14),gender:v(15),originalPo:v(16),qty:sizeCols.map(c=>amount(v(c),`row ${r}, size ${c}`,true)),total:amount(v(20+n),`row ${r}, TOTAL`,true),exgo:String(v(21+n)),profile:profile.id,sizes:structuredClone(profile.sizes),id:''};
    if(isSummaryOrder(o))continue;
    if(!o.country||!o.mos||(company==='WSV'&&!o.factoryPo))throw Error(`Export row ${r}: missing PO identity, country or MOS`);
    o.id=company==='WSV'?o.factoryPo:o.onPo+'|'+o.mos;
    if(o.qty.reduce((a,b)=>a+b,0)!==o.total)throw Error(`Export row ${r}: size total mismatch`);
    if(orders.some(a=>a.id===o.id))throw Error('Duplicate PO in export');orders.push(o);
    const groups=Array.from({length:g},(_,i)=>{const c=22+n+i,empty=c+g+1,inner=c+2*(g+1);return {outer:String(val(sh.getRow(1).getCell(c))),outerDimension:String(val(sh.getRow(3).getCell(c))),empty:String(val(sh.getRow(1).getCell(empty))),emptyDimension:String(val(sh.getRow(3).getCell(empty))),inner:String(val(sh.getRow(1).getCell(inner))),innerDimension:String(val(sh.getRow(3).getCell(inner))),purchaseCartons:amount(v(c),`row ${r}, cartons`,true),purchaseEmpty:amount(v(empty),`row ${r}, empty boxes`,true),purchaseInner:amount(v(inner),`row ${r}, inner boxes`,true),cartons:amount(v(c),`row ${r}, cartons`,true),emptyQty:amount(v(empty),`row ${r}, empty boxes`,true),pairs:amount(v(inner),`row ${r}, inner boxes`,true)};});
    pack.push({po:o,market:String(v(17)),groups:groups.map(a=>({...a,emptyCode:a.empty,innerCode:a.inner,empty:a.emptyQty,inner:a.pairs}))});
  }
  if(!orders.length)throw Error('No PO rows in export');
  const combined=!!book.getWorksheet('Label - Special - Card');
  const result:any={packagingRequiredUnavailable:true,orders,sizes:profile.sizes,pack,label:[],special:[],card:[],paper:[],missing:[]};
  for(const [sheet,kind] of [['Label','label'],['Special Label','special'],['Card','card']] as const){
    if(combined&&kind!=='label')continue;
    const s=book.getWorksheet(sheet)|| (kind==='label'?book.getWorksheet('Label - Special - Card'):undefined);if(!s)throw Error('Missing sheet '+sheet);
    for(let r=8;r<=s.rowCount;r++){
      const row=s.getRow(r),v=(c:number)=>val(row.getCell(c));if(!v(8)&&!v(18))continue;if(!v(8)||!v(18))throw Error(`Material row ${r}: missing PO or item code`);
      const po=orders.find(o=>(company!=='WSV'||o.factoryPo===String(v(7)))&&o.onPo===String(v(8))&&o.sku===String(v(9))&&norm(o.country)===norm(v(11))&&o.mos===String(v(13)));if(!po)throw Error(`Unmatched material PO at ${sheet} row ${r}`);
      const q=amount(v(19),`${sheet} row ${r}, quantity per pair`),item={id:kind+'|'+v(18),destination:String(v(16)||po.country),list_no:r,description:String(v(17)),item_code:String(v(18)),qty_per_finish:q,unit:String(v(20)),output_type:kind,images:[],versionId:'external'};
      const cartonBased=item.description.includes('[QTY BASIS: CARTON]'),bufferRate=kind==='special'?0:Math.max(0,((+v(21)||1)-1)*100);
      const pairRequired=po.qty.map((x:number)=>x*q),qty=kind==='special'?(cartonBased?[]:pairRequired):Array.from({length:n},(_,i)=>amount(v(23+i),`${sheet} row ${r}, size ${i}`)),total=kind==='special'?(cartonBased?0:pairRequired.reduce((a:number,b:number)=>a+b,0)):amount(v(23+n),`${sheet} row ${r}, TOTAL`);
      // An external buffered workbook does not contain the unbuffered carton counts.
      // Keep its purchase cells verbatim instead of inventing pair-based requirements.
      const requiredUnavailable=cartonBased&&(kind==='special'||bufferRate!==0),required=cartonBased?(requiredUnavailable?[]:qty):pairRequired;
      result[kind].push({po,item,required,qty,requiredTotal:requiredUnavailable?null:required.reduce((a:number,b:number)=>a+b,0),total,buffer:bufferRate,...(cartonBased?{quantityBasis:'carton',requiredUnavailable}:{})});
    }
  }
  for(const [sheet,kind] of [['Wrapping Paper','wrapping'],['Stuffing Paper','stuffing']] as const){
    const s=book.getWorksheet(sheet);if(!s)throw Error('Missing sheet '+sheet);
    const sizeRows:any[][]=[];let afterTotal=false;
    for(let row=5;row<=s.rowCount;row++){if(norm(val(s.getRow(row).getCell(1)))==='TOTAL'){afterTotal=true;continue;}const uk=val(s.getRow(row).getCell(1));if(afterTotal&&uk!==''&&uk!=null&&Number.isFinite(+uk)&&result.sizes.some((z:any)=>+z.uk===+uk)){const v=(c:number)=>val(s.getRow(row).getCell(c));sizeRows.push(kind==='wrapping'?[uk,v(2),v(3),v(4),v(5),v(6),v(7)]:[uk,v(2),'',v(3),v(4),v(5),v(6)]);}}
    if(sizeRows.length){result.paperSizeTables??={};result.paperSizeTables[kind]={head:['UK SIZE','PAIRS','MATERIAL CODE','QTY / PAIR','QUANTITY','BUFFER QTY','PURCHASE'],rows:sizeRows};}
    for(let r=5;r<=s.rowCount;r++){const v=(c:number)=>val(s.getRow(r).getCell(c));if(!v(1)||norm(v(1))==='TOTAL')break;const range=/([\d.]+)\s*~\s*([\d.]+)/.exec(String(v(2)));if(!range||+range[1]>+range[2])throw Error(`Invalid paper size range at ${sheet} row ${r}`);result.paper.push({po:{id:'__aggregate__',factoryPo:'ALL POs IN FILE'},aggregate:true,kind,code:String(v(1)),from:+range[1],to:+range[2],qtyPerPair:amount(v(4),`${sheet} row ${r}, quantity per pair`),required:amount(v(5),`${sheet} row ${r}, required`),total:amount(v(8),`${sheet} row ${r}, purchase`),bySize:[],buffer:amount(val(s.getCell('B3')),`${sheet} buffer`)*100});}
  }
  return {id:crypto.randomUUID(),kind:'upload',orders,result,settings:null,items:null,historicalWarning:'External Excel: historical images, reuse rules, original required packaging/carton-label quantities and version assignments are unavailable. Paper quantities are file totals and cannot be assigned to individual POs.'};
}
