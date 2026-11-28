import ExcelJS from 'exceljs';
import {isSummaryOrder} from './order-rows';
import {norm} from './model';
import {validateSizeProfile} from './size-settings';
function value(cell:any):any{
  if(cell==null)return '';
  if(typeof cell==='object'&&!(cell instanceof Date)){
    if(cell.error)throw Error('Source file contains an Excel error.');
    if(cell.formula||cell.sharedFormula){if(cell.result===undefined)throw Error('Source file has formulas without cached results. Recalculate and save in Excel before importing.');return value(cell.result);}
    return cell.text??cell.richText?.map((r:any)=>r.text).join('')??'';
  }
  return cell;
}
const text=(cell:any)=>{const v=value(cell);return v instanceof Date?v.toISOString().slice(0,10):String(v??'').trim();};
function quantity(cell:any,row:number,column:number){const v=value(cell),q=v===''?0:Number(v);if(!Number.isSafeInteger(q)||q<0)throw Error(`Row ${row}, column ${column}: quantity must be a non-negative whole number.`);return q;}
// Normalize presentation changes without guessing between different business fields.
const headerKey=(name:string)=>String(name).normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g,'');
const headerAliases:Record<string,string[]>={
  WSVPO:["WSV'S PO",'WSV PO','WSV PO NO','WSV PO NUMBER',"WSV'S PO NO","WSV'S PO NUMBER",'FACTORY PO','FACTORY PO NO','FACTORY PO NUMBER'],
  CTCPO:["CTC'S PO",'CTC PO','CTC PO NO','CTC PO NUMBER',"CTC'S PO NO","CTC'S PO NUMBER"],
  ONPO:["ON'S PO#",'ON PO','ON PO NO','ON PO NUMBER','CUSTOMER PO','CUSTOMER PO NO','CUSTOMER PO NUMBER','CUSTOMER PURCHASE ORDER','BUYER PO','BUYER PO NO'],
  SKU:['BUYER ITEM','BUYER ITEM NO','BUYER ITEM NUMBER','BUYER ITEM CODE','SKU','SKU CODE'],
  TOTAL:['TOTAL','TOTAL QTY','TOTAL QUANTITY','TOTAL PAIRS','ORDER','ORDER QTY','ORDER QUANTITY'],
  COUNTRY:['COUNTRY','DESTINATION COUNTRY','COUNTRY OF DESTINATION'],
  MOS:['MOS','SHIPMENT METHOD','SHIPPING METHOD','MODE OF SHIPMENT','MODE OF SHIPPING'],
  COLORWAY:['COLOR WAY','COLOUR WAY','COLORWAY','COLOURWAY','COLOR','COLOUR'],
  EXGOMONTH:['EXGO MONTH','EX GO MONTH','EXGO','EXGO DATE','EX GO','EX GO DATE'],
  CREATEDATE:['CREATE DATE','CREATED DATE','RECEIVED','RECEIVED DATE'],
  POCATEGORY:['PO CATEGORY','CATEGORY'],
  DELIVERYFORM:['DELIVERY FORM','DELIVERYFORM'],
};
const aliases=new Map(Object.entries(headerAliases).flatMap(([key,names])=>names.map(name=>[headerKey(name),key] as [string,string])));
const canonicalHeader=(name:string)=>aliases.get(headerKey(name))||headerKey(name);
export type OrderImportMapping={sheet:string;header:number;dataStart:number;fields:Record<string,number>;sizes:{column:number;uk:number;us:string;w:string}[]};
export type OrderImportTemplate={id:string;company:string;name:string;signature:string;mapping:OrderImportMapping;created:string};
export const importFields=[['factoryPo','Factory PO'],['onPo','ON / Customer PO'],['sku','Buyer Item / SKU'],['country','Country'],['mos','MOS'],['total','Total'],['exgo','EXGO month'],['warehouse','Warehouse'],['brand','Brand'],['season','Season'],['createDate','Create date'],['price','Price'],['type','Order type'],['category','PO category'],['color','Color way'],['model','Model'],['gender','Gender'],['originalPo','Original PO'],['deliveryForm','Delivery form']] as const;
const fieldHeaders:Record<string,string>={onPo:'ON PO',sku:'Buyer Item',country:'COUNTRY',mos:'MOS',total:'TOTAL',exgo:'EXGO MONTH',warehouse:'WAREHOUSE',brand:'BRAND',season:'SEASON',createDate:'CREATE DATE',price:'PRICE',type:'ORDER TYPE',category:'PO Category',color:'COLOR WAY',model:'MODEL',gender:'Gender',originalPo:'Original PO',deliveryForm:'Delivery form'};
const books=new WeakMap<File,Promise<ExcelJS.Workbook>>();
async function loadBook(file:File){let pending=books.get(file);if(!pending){pending=(async()=>{const book=new ExcelJS.Workbook();await book.xlsx.load(await file.arrayBuffer());return book;})();books.set(file,pending);pending.catch(()=>books.delete(file));}return pending;}
const headerText=(v:any)=>v&&typeof v==='object'&&('formula' in v||'sharedFormula' in v)?'':text(v);
function signatureFor(sheet:any,header:number){const columns:string[]=[];for(let c=1;c<=sheet.columnCount;c++)columns.push(headerKey(headerText(sheet.getRow(header).getCell(c).value)));return JSON.stringify(columns);}
function hasUkSubRow(sheet:any,header:number,onCol:number,skuCol:number,factoryCol:number){
  if(header+2>sheet.rowCount)return false;
  const r1=sheet.getRow(header+1);
  if((onCol&&text(r1.getCell(onCol).value))||(skuCol&&text(r1.getCell(skuCol).value))||(factoryCol&&text(r1.getCell(factoryCol).value)))return false;
  const r2=sheet.getRow(header+2),seenUk=new Set<number>();let count=0;
  sheet.getRow(header).eachCell((cell:any,col:number)=>{
    if(!/^M\d+(?:\.\d+)?$/.test(norm(headerText(cell.value))))return;
    count++;
    const raw=text(r2.getCell(col).value),uk=Number(raw);
    if(raw!==''&&Number.isFinite(uk)&&uk>0)seenUk.add(uk);
  });
  return count>0&&seenUk.size===count;
}
export async function inspectOrderFile(file:File,company:string){
 const book=await loadBook(file);
 return book.worksheets.map(sheet=>{let header=1,score=-1;for(let r=1;r<=Math.min(100,sheet.rowCount);r++){let current=0;sheet.getRow(r).eachCell(cell=>{const raw=headerText(cell.value),key=canonicalHeader(raw);if(['ONPO','SKU','COUNTRY','MOS','TOTAL',company+'PO'].includes(key))current+=3;if(/^M\d+(?:\.\d+)?$/.test(norm(raw)))current++;});if(current>score){score=current;header=r;}}return {name:sheet.name,rowCount:sheet.rowCount,columnCount:sheet.columnCount,header,score};});
}
export async function importLayout(file:File,company:string,sheetName:string,header:number,profile:any){
 const book=await loadBook(file),sheet=book.getWorksheet(sheetName);if(!sheet||!Number.isSafeInteger(header)||header<1||header>sheet.rowCount)throw Error('Select a valid sheet and header row.');
 const columns=Array.from({length:sheet.columnCount},(_,index)=>{const column=index+1;return {column,label:headerText(sheet.getRow(header).getCell(column).value),examples:Array.from({length:Math.min(6,sheet.rowCount-header)},(_,i)=>{try{return text(sheet.getRow(header+1+i).getCell(column).value);}catch{return '[Excel formula error]';}})};});
 const fields:Record<string,number>={};for(const [key] of importFields){const expected=canonicalHeader(key==='factoryPo'?company+' PO':fieldHeaders[key]);let found=columns.filter(c=>canonicalHeader(c.label)===expected);if(key==='gender'&&!found.length)found=columns.filter(c=>['US','G'].includes(canonicalHeader(c.label)));fields[key]=found.length===1?found[0].column:0;}
 const hasSizes=columns.some(c=>/^M\d+(?:\.\d+)?$/.test(norm(c.label)));
 const multiRowSizes=hasSizes&&hasUkSubRow(sheet,header,fields.onPo,fields.sku,fields.factoryPo);
 const sizes=profile.sizes.map((s:any)=>{const us=norm(s.us).split('/').map((v:string)=>v.trim());const mUs=us.find((v:string)=>v.startsWith('M'))||'';const matches=columns.filter(c=>norm(c.label)===mUs&&(!multiRowSizes||c.examples[1]===String(s.uk)));return {column:matches.length===1?matches[0].column:0,uk:+s.uk,us:mUs,w:us.find((v:string)=>v.startsWith('W'))||''};});
 const mapping:OrderImportMapping={sheet:sheetName,header,dataStart:header+(multiRowSizes?4:1),fields,sizes};
 return {columns,mapping,signature:signatureFor(sheet,header)};
}
export async function savedImportMapping(file:File,company:string,templates:OrderImportTemplate[]=[]){
 if(!templates.some(t=>t.company===company))return undefined;
 const book=await loadBook(file),matches:{mapping:OrderImportMapping;template:OrderImportTemplate}[]=[];
 const signatures=new Map<string,{sheet:any;row:number}[]>();for(const sheet of book.worksheets){const seen=new Set<string>(),rows=new Set([...Array.from({length:Math.min(100,sheet.rowCount)},(_,i)=>i+1),...templates.map(t=>t.mapping.header).filter(row=>row>100&&row<=sheet.rowCount)]);for(const row of rows){const signature=signatureFor(sheet,row);if(seen.has(signature))continue;seen.add(signature);signatures.set(signature,[...(signatures.get(signature)||[]),{sheet,row}]);}}
 for(const template of templates.filter(t=>t.company===company))for(const {sheet,row} of signatures.get(template.signature)||[])matches.push({template,mapping:{...template.mapping,sheet:sheet.name,header:row,dataStart:row+(template.mapping.dataStart-template.mapping.header)}});
 if(matches.length>1)throw Error('More than one saved import layout matches this file. Select the intended sheet and columns.');
 return matches[0];
}
function validateMapping(mapping:OrderImportMapping,sheet:any,company:string){
 if(!Number.isSafeInteger(mapping.header)||mapping.header<1||mapping.header>sheet.rowCount||!Number.isSafeInteger(mapping.dataStart)||mapping.dataStart<=mapping.header||mapping.dataStart>sheet.rowCount)throw Error('Invalid header or first PO row.');
 for(const key of ['factoryPo','onPo','sku','country','mos','total'])if(!mapping.fields[key])throw Error('Select the column for '+key+'.');
 const fields=Object.values(mapping.fields).filter(Boolean),sizeColumns=mapping.sizes.map(s=>s.column);
 if(!mapping.sizes.length||[...fields,...sizeColumns].some(c=>!Number.isSafeInteger(c)||c<1||c>sheet.columnCount))throw Error('Select a valid column for every field and size.');
 if(new Set([...fields,...sizeColumns]).size!==fields.length+sizeColumns.length)throw Error('One source column cannot be assigned to multiple fields or sizes.');
 if(new Set(mapping.sizes.map(s=>s.uk)).size!==mapping.sizes.length)throw Error('Duplicate UK size mapping.');
 for(let r=mapping.header;r<mapping.dataStart;r++){const row=sheet.getRow(r),factory=norm(text(row.getCell(mapping.fields.factoryPo).value)),on=norm(text(row.getCell(mapping.fields.onPo).value)),sku=norm(text(row.getCell(mapping.fields.sku).value));if((/^WSV[A-Z0-9]+$/.test(factory.replace(/\s+/g,''))||/^(PO[A-Z0-9]{5,}|\d{6,20})$/.test(on))&&/[0-9]/.test(sku))throw Error(`Row ${r} already contains PO data. Choose an earlier header / first PO row to avoid losing orders.`);}
 // Recognized headers are stronger evidence of a swapped mapping than assumptions
 // about the values in any one row. Unknown/custom headers remain manually mappable.
 const knownFields=new Map<string,string>();
 for(const [key] of importFields){const label=key==='factoryPo'?company+' PO':fieldHeaders[key];if(label)knownFields.set(canonicalHeader(label),key);}
 for(const [key,column] of Object.entries(mapping.fields)){if(!column)continue;const header=canonicalHeader(headerText(sheet.getRow(mapping.header).getCell(column).value));const actual=knownFields.get(header);if(actual&&actual!==key)throw Error(`Column ${column}: header belongs to ${actual}, not ${key}. Check the selected column.`);}
 const multiRowSizes=mapping.dataStart>=mapping.header+3;
 for(const size of mapping.sizes){const label=norm(headerText(sheet.getRow(mapping.header).getCell(size.column).value));if(/^M\d+(?:\.\d+)?$/.test(label)){if(multiRowSizes){const uk=text(sheet.getRow(mapping.header+2).getCell(size.column).value),w=norm(headerText(sheet.getRow(mapping.header+1).getCell(size.column).value));if(label!==size.us||!uk||+uk!==size.uk||w!==size.w)throw Error(`Column ${size.column}: source US / UK size disagrees with selected UK ${size.uk}.`);}else if(label!==size.us)throw Error(`Column ${size.column}: source US size disagrees with selected ${size.us}.`);}else if(/^UK\s*\d+(?:\.\d+)?$/.test(label)&&+label.replace(/^UK\s*/,'')!==size.uk)throw Error(`Column ${size.column}: source UK size disagrees with selected UK ${size.uk}.`);}
 sheet.getRow(mapping.header).eachCell((cell:any)=>{if(canonicalHeader(headerText(cell.value))===(company==='WSV'?'CTCPO':'WSVPO'))throw Error('This file belongs to the other workspace. Select the correct workspace.');});
}
export async function importOrders(file:File,company:string,profiles:any[],mapping?:OrderImportMapping,reviewCapture=false){
  if(!['WSV','CTC'].includes(company))throw Error('Invalid workspace.');
  profiles.forEach(validateSizeProfile);
  const book=await loadBook(file);
  const headerRow=(candidate:any)=>{
    for(let row=1;row<=Math.min(100,candidate.rowCount);row++){
      const names=new Set<string>();let hasSizes=false;
      candidate.getRow(row).eachCell((c:any)=>{if(!(typeof c.value==='object'&&c.value&&('formula' in c.value||'sharedFormula' in c.value))){const name=text(c.value);names.add(canonicalHeader(name));if(/^M\d+(?:\.\d+)?$/.test(norm(name)))hasSizes=true;}});
      if(['ONPO','TOTAL','SKU'].every(n=>names.has(n))&&(names.has('WSVPO')||names.has('CTCPO'))&&hasSizes)return row;
    }
    return 0;
  };
  const valid=book.worksheets.filter(s=>headerRow(s));
  const named=valid.find(s=>headerKey(s.name)==='TOTALBALANCE');
  const mapped=mapping?book.getWorksheet(mapping.sheet):undefined;
  if(mapping&&!mapped)throw Error('Selected sheet no longer exists.');
  const candidates=mapped?[mapped]:named?[named]:valid;
  if(!candidates.length)throw Error('No PO data sheet found. Required columns: WSV / CTC PO, ON / Customer PO, Buyer Item / SKU, TOTAL, and US size columns. Checked sheets: '+book.worksheets.map(s=>s.name).join(', ')+'.');
  if(candidates.length>1)throw Error('Multiple PO data sheets found: '+candidates.map(s=>s.name).join(', ')+'. Use one PO data sheet or name the intended sheet TOTAL BALANCE.');
  const sheet=candidates[0],header=mapping?.header||headerRow(sheet);
  if(mapping)validateMapping(mapping,sheet,company);
  const columns=new Map<string,number>();sheet.getRow(header).eachCell((c,i)=>{const name=canonicalHeader(headerText(c.value));if(name&&columns.has(name)&&!mapping)throw Error(`Duplicate source column in ${sheet.name}, row ${header}: ${text(c.value)}.`);if(name)columns.set(name,i);});
  const find=(names:string[],required=false)=>{for(const name of names)if(columns.has(canonicalHeader(name)))return columns.get(canonicalHeader(name))!;if(required)throw Error('Missing column '+names[0]+' in '+sheet.name+', row '+header+'.');return 0;};
  const foreign=find(company==='WSV'?['CTC PO']:['WSV PO']);
  if(foreign)throw Error(`This is a ${company==='WSV'?'CTC':'WSV'} file. Select the correct workspace.`);
  const factory=mapping?.fields.factoryPo||find([company+' PO'],true),on=mapping?.fields.onPo||find(['ON PO'],true),sku=mapping?.fields.sku||find(['Buyer Item'],true),mos=mapping?.fields.mos||find(['MOS'],true),country=mapping?.fields.country||find(['COUNTRY'],true),total=mapping?.fields.total||find(['TOTAL'],true);
  const multiRowSizes=!mapping&&hasUkSubRow(sheet,header,on,sku,factory);
  let sourceSizes:any[]=mapping?structuredClone(mapping.sizes):[];let profile:any;
  if(!mapping&&multiRowSizes){
    const seen=new Set<number>();
    sheet.getRow(header).eachCell((cell,column)=>{
      const us=norm(text(cell.value));if(!/^M\d+(?:\.\d+)?$/.test(us))return;
      const raw=text(sheet.getRow(header+2).getCell(column).value),uk=Number(raw),w=norm(text(sheet.getRow(header+1).getCell(column).value));
      if(!raw||!Number.isFinite(uk)||uk<0||seen.has(uk))throw Error(`Missing, invalid or duplicate UK size at column ${column}.`);
      if(w&&!/^W\d+(?:\.\d+)?$/.test(w))throw Error(`Invalid women's US size at column ${column}.`);
      seen.add(uk);sourceSizes.push({column,uk,us,w});
    });
    if(!sourceSizes.length)throw Error('No source size columns found.');
    sheet.getRow(header+2).eachCell((cell,column)=>{
      const uk=text(cell.value);
      if(column<total&&uk!==''&&Number.isFinite(Number(uk))&&!sourceSizes.some(s=>s.column===column))throw Error(`Column ${column}: UK size has no valid men's US size header.`);
    });
    const matches=profiles.filter(p=>p.sizes.every((s:any)=>{
      const source=sourceSizes.find(z=>z.uk===+s.uk),us=norm(s.us).split('/').map((x:string)=>x.trim());
      return source&&us.includes(source.us)&&(!source.w||us.includes(source.w))&&us.length===(source.w?2:1);
    }));
    if(matches.length!==1)throw Error(matches.length?'File matches multiple size tables.':'Source UK / US size columns do not match the month’s saved size table.');
    profile=matches[0];
  }else if(!mapping){
    const usColumns:{column:number;us:string}[]=[],seenUs=new Set<string>();
    sheet.getRow(header).eachCell((cell,column)=>{
      const us=norm(text(cell.value));if(!/^M\d+(?:\.\d+)?$/.test(us))return;
      if(seenUs.has(us))throw Error(`Duplicate US size header ${us} at column ${column}.`);
      seenUs.add(us);usColumns.push({column,us});
    });
    if(!usColumns.length)throw Error('No source size columns found.');
    const matches=profiles.filter(p=>{
      const profileUs=p.sizes.map((s:any)=>norm(s.us).split('/').map((x:string)=>x.trim()).find((x:string)=>/^M\d+(?:\.\d+)?$/.test(x))||'');
      return profileUs.every(Boolean)&&new Set(profileUs).size===p.sizes.length&&p.sizes.every((s:any)=>usColumns.some(c=>norm(s.us).split('/').map((x:string)=>x.trim()).includes(c.us)))&&usColumns.every(c=>profileUs.includes(c.us));
    });
    if(matches.length!==1)throw Error(matches.length?'File matches multiple size tables.':'Source US size columns do not match the month’s saved size table.');
    profile=matches[0];
    sourceSizes=usColumns.map(c=>{
      const s=profile.sizes.find((z:any)=>norm(z.us).split('/').map((x:string)=>x.trim()).includes(c.us))!;
      const w=norm(s.us).split('/').map((x:string)=>x.trim()).find((x:string)=>/^W\d+(?:\.\d+)?$/.test(x))||'';
      return {column:c.column,uk:+s.uk,us:c.us,w};
    });
  }else{
    const matches=profiles.filter(p=>p.sizes.every((s:any)=>{
      const source=sourceSizes.find(z=>z.uk===+s.uk),us=norm(s.us).split('/').map((x:string)=>x.trim());
      return source&&us.includes(source.us)&&(!source.w||us.includes(source.w))&&us.length===(source.w?2:1);
    }));
    if(matches.length!==1)throw Error(matches.length?'File matches multiple size tables.':'Source UK / US size columns do not match the month’s saved size table.');
    profile=matches[0];
  }
  const active=new Set<number>(profile.sizes.map((s:any)=>+s.uk)),orders:any[]=[],keys=new Set<string>();
  const field=(row:any,names:string[])=>{const key=Object.entries(fieldHeaders).find(([,label])=>canonicalHeader(label)===canonicalHeader(names[0]))?.[0];const column=mapping?mapping.fields[key||'']||0:find(names);return column?text(row.getCell(column).value):'';};
  const firstDataRow=mapping?.dataStart||(multiRowSizes?header+3:header+1);
  for(let rowNumber=firstDataRow;rowNumber<=sheet.rowCount;rowNumber++){
    const row=sheet.getRow(rowNumber),onPo=text(row.getCell(on).value),code=text(row.getCell(sku).value);
    if(canonicalHeader(onPo)==='ONPO'&&(canonicalHeader(code)==='SKU'||(!code&&canonicalHeader(text(row.getCell(factory).value))===company+'PO'&&canonicalHeader(text(row.getCell(total).value))==='TOTAL')))continue;
    if(isSummaryOrder({factoryPo:text(row.getCell(factory).value),onPo,sku:code}))continue;
    if(!onPo&&!code)continue;if(!onPo||!code)throw Error(`Row ${rowNumber}: missing ON PO or SKU.`);
    const factoryPo=text(row.getCell(factory).value);if(company==='WSV'&&!factoryPo)throw Error(`Missing WSV PO on row ${rowNumber}.`);
    const sourceQty=sourceSizes.map(s=>quantity(row.getCell(s.column).value,rowNumber,s.column));
    // Spare columns between the size block and TOTAL cannot silently hide pairs.
    const known=new Set(sourceSizes.map(s=>s.column));
    if(!mapping)for(let c=sourceSizes[0].column;c<total;c++)if(!known.has(c)&&quantity(row.getCell(c).value,rowNumber,c)!==0)throw Error(`Row ${rowNumber}, column ${c}: quantity has no recognized size header.`);
    const rawTotal=text(row.getCell(total).value);if(!rawTotal)throw Error(`Row ${rowNumber}: missing TOTAL.`);
    const sourceTotal=quantity(row.getCell(total).value,rowNumber,total),sum=sourceQty.reduce((a,b)=>a+b,0);
    if(sum!==sourceTotal)throw Error(`Row ${rowNumber}: source size quantity ${sum} does not match TOTAL ${sourceTotal}.`);
    sourceSizes.forEach((s,i)=>{if(!active.has(s.uk)&&sourceQty[i]>0)throw Error(`Row ${rowNumber}, PO ${factoryPo||onPo}: UK ${s.uk} has ${sourceQty[i]} pairs but is not in the month's size table. Keep the size or correct the source file.`);});
    const qty=profile.sizes.map((s:any)=>sourceQty[sourceSizes.findIndex(z=>z.uk===+s.uk)]);
    const deliveryForm=field(row,['Delivery form']);
    const isUpper=norm(deliveryForm)==='UPPER';
    const destination=text(row.getCell(country).value),method=text(row.getCell(mos).value);
    if(!isUpper&&(!destination||!method))throw Error(`Row ${rowNumber}: missing country or MOS.`);
    const rawExgo=field(row,['EXGO MONTH']);
    const order={factoryPo,onPo,sku:code,country:destination,mos:method,qty,total:sum,profile:profile.id,sizes:structuredClone(profile.sizes),brand:field(row,['BRAND']),season:field(row,['SEASON']),createDate:field(row,['CREATE DATE']),price:field(row,['PRICE']),type:field(row,['ORDER TYPE']),category:field(row,['PO Category']),color:field(row,['COLOR WAY']),warehouse:field(row,['Warehouse']),model:field(row,['MODEL']),gender:field(row,['Gender','US','G']),originalPo:field(row,['Original PO']),deliveryForm,exgo:isUpper?'_':rawExgo,status:'Not Run',id:company==='WSV'?factoryPo:onPo+'|'+method,source:{fileName:file.name,company,sheet:sheet.name,row:rowNumber,...(reviewCapture?{headerRow:header}:{}),sizes:structuredClone(sourceSizes),qty:sourceQty,total:sourceTotal}};
    if(mapping)(order.source as any).mapping={header:mapping.header,dataStart:mapping.dataStart,fields:structuredClone(mapping.fields)};
    if(keys.has(order.id))throw Error(`Duplicate PO key on row ${rowNumber}: ${order.id}.`);keys.add(order.id);orders.push(order);
  }
  if(!orders.length)throw Error('No PO rows found.');return orders;
}

// Read arbitrary review-only columns from the validated sheet and source rows.
export async function balanceReviewColumns(file:File,orders:any[]){
 const book=await loadBook(file);const first=orders[0]?.source;const sheet=book.getWorksheet(first?.sheet);const header=Number(first?.headerRow||first?.mapping?.header);
 if(!sheet||!Number.isSafeInteger(header)||header<1)throw Error('Unable to identify the source header for balance review.');
 const columns:Array<{name:string;column:number}>=[];const seen=new Set<string>();
 sheet.getRow(header).eachCell((cell:any,column:number)=>{const name=headerText(cell.value).trim();const normalized=headerKey(name);if(!normalized)return;if(seen.has(normalized)){columns.push({name,column});return;}seen.add(normalized);columns.push({name,column});});
 const rows=orders.map(o=>{const row=sheet.getRow(o.source.row);const cells:Record<string,string>={},errors:string[]=[];for(const c of columns){try{cells[String(c.column)]=text(row.getCell(c.column).value);}catch{cells[String(c.column)]='';errors.push(String(c.column));}}return {...o,reviewCells:cells,reviewCellErrors:errors};});
 return {columns,rows};
}