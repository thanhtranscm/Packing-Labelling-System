import ExcelJS from 'exceljs';
import {norm} from './model';
const text=(v:any):string=>v==null?'':v instanceof Date?v.toISOString().slice(0,10):typeof v==='object'?v.text||v.result||v.richText?.map((a:any)=>a.text).join('')||'':String(v);
export {importOrders} from './order-import';
const thin={style:'thin',color:{argb:'FF000000'}} as any;
const border={top:thin,bottom:thin,left:thin,right:thin};
function styleSheet(sh:any,last:number,from:number=1){for(let r=from;r<=sh.rowCount;r++){const row=sh.getRow(r);if(r>=8||from===1)for(let c=1;c<=last;c++){const cell=row.getCell(c);cell.border=border;cell.font={name:'Times New Roman',size:12,bold:r<8};cell.alignment={vertical:'middle',wrapText:true};}row.height=r<8?24:32;}for(let c=1;c<=last;c++){const col=sh.getColumn(c);let width=Math.max(col.width||9,9);col.eachCell((cell:any)=>{if(cell.value!=null)width=Math.max(width,Math.min(45,text(cell.value).length+2));});col.width=width;}sh.views=[{state:'frozen',xSplit:0,ySplit:7}];sh.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0};}
export {exportTemplate as exportWorkbook} from './template-export';
export {download} from './download';
import {download} from './download';
import {comparisonReport,type ReportTable} from './comparison-report';
function comparisonCellText(value:any){return value==null?'—':String(value);}
// Fit wrapped text using column widths; never apply a fixed short height to long rows.
function reportRowHeight(values:any[],widths:number[]){
 return Math.max(30,...values.map((value,i)=>{
  const width=Math.max(6,((widths[i]||20)-3)*0.75);return comparisonCellText(value).split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/width)),0)*16+12;
 }));
}
function writeReportTable(sh:any,table:ReportTable,start:number){
 const cols=table.head.length;const heading=sh.getRow(start);heading.values=table.head;
 heading.height=reportRowHeight(table.head,table.widths);heading.eachCell((cell:any)=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF173A68'}};cell.font={name:'Calibri',size:11,bold:true,color:{argb:'FFFFFFFF'}};cell.alignment={vertical:'middle',horizontal:'left',wrapText:true};});
 if(!table.rows.length){const row=sh.getRow(start+1);row.getCell(1).value='No data in this sheet';row.height=30;return start+3;}
 let written=0;
 table.rows.forEach((values)=>{
  const parts=values.map((v,i)=>{if(typeof v!=='string')return [v];const limit=Math.max(48,Math.floor(((table.widths[i]||20)-3)*0.75)*8);const chunks:string[]=[];let remaining=v;while(remaining.length>limit||remaining.split('\n').length>8){const breaks=[...remaining.matchAll(/\n/g)];let cut=Math.min(limit,breaks[7]?.index??limit);const boundary=remaining.lastIndexOf('\n',cut);if(boundary>=cut/2)cut=boundary;if(cut<=0)cut=limit;chunks.push(remaining.slice(0,cut));remaining=remaining.slice(cut);}chunks.push(remaining);return chunks;});
  const count=Math.max(...parts.map(a=>a.length));
  for(let part=0;part<count;part++){const values=parts.map(a=>a[part]??'');const i=written++;
  const row=sh.getRow(start+i+1);row.values=values.map(v=>v===''?'—':v??'—');row.height=Math.min(409,reportRowHeight(values,table.widths));
  for(let j=1;j<=cols;j++){const cell=row.getCell(j);cell.font={name:'Calibri',size:11,color:{argb:'FF24364B'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:i%2?'FFF0F4F8':'FFFFFFFF'}};cell.alignment={vertical:'middle',horizontal:typeof cell.value==='number'?'right':'left',wrapText:true,indent:1};cell.border={bottom:{style:'hair',color:{argb:'FFE1E7EE'}},right:{style:'hair',color:{argb:'FFE1E7EE'}}};if(typeof cell.value==='number')cell.numFmt=Number.isInteger(cell.value)?'#,##0;[Red](#,##0);0':'#,##0.##;[Red](#,##0.##);0';
   if(table.deltaColumn===j-1&&typeof cell.value==='number'&&cell.value!==0){cell.font={...cell.font,bold:true,color:{argb:cell.value>0?'FF087A5A':'FFB53939'}};cell.numFmt='+#,##0;[Red]-#,##0;0';}
  }
  }
 });return start+written+3;
}
function reportSheet(book:ExcelJS.Workbook,title:string,table:ReportTable,c:any){
 const sh=book.addWorksheet(title,{properties:{defaultRowHeight:30,tabColor:{argb:'FF173A68'}},views:[{state:'frozen',ySplit:5,showGridLines:false}]});
 table.widths.forEach((width,i)=>sh.getColumn(i+1).width=width);const last=table.head.length;
 sh.mergeCells(1,1,1,last);sh.getCell('A1').value=title.toUpperCase();sh.getCell('A1').font={name:'Calibri',size:17,bold:true,color:{argb:'FF173A68'}};sh.getRow(1).height=34;
 for(const [row,label,value] of [[2,'BEFORE',c.beforeName||'Before'],[3,'AFTER',c.afterName||'After']] as const){sh.mergeCells(row,1,row,last);sh.getCell(row,1).value=label+': '+value;sh.getCell(row,1).font={name:'Calibri',size:11,color:{argb:'FF526984'}};sh.getCell(row,1).alignment={wrapText:true,vertical:'middle'};sh.getRow(row).height=Math.max(26,Math.ceil((label.length+String(value).length+2)/table.widths.reduce((a,b)=>a+b,0))*16+10);}
 const end=writeReportTable(sh,table,5);(sh as any).reportEnd=end;sh.autoFilter={from:{row:5,column:1},to:{row:Math.max(5,end-3),column:last}};sh.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:5',margins:{left:0.3,right:0.3,top:0.4,bottom:0.4,header:0.15,footer:0.15}};sh.headerFooter.oddFooter='&L'+title+'&RPage &P of &N';return sh;
}
export async function comparisonWorkbook(c:any){
 const report=comparisonReport(c),book=new ExcelJS.Workbook();book.creator='Packing & Labelling Portal';
 const summary=reportSheet(book,'Summary',report.summary,c);summary.autoFilter=undefined;
 for(const section of report.sections){
  const sh=reportSheet(book,section.title,section.table,c);let row=(sh as any).reportEnd+1;
  for(const extra of [section.imageTable])if(extra.rows.length){extra.widths.forEach((width,i)=>{if(i>=section.table.head.length)sh.getColumn(i+1).width=width;});sh.mergeCells(row,1,row,extra.head.length);sh.getCell(row,1).value=extra.title.toUpperCase();sh.getCell(row,1).font={name:'Calibri',size:12,bold:true,color:{argb:'FF173A68'}};sh.getRow(row).height=30;row=writeReportTable(sh,{...extra,widths:extra.widths.map((w,i)=>sh.getColumn(i+1).width||w)},row+1);}
 }
 reportSheet(book,'PO Changes',report.po,c);return book;
}
export async function exportComparison(c:any,name:string){const book=await comparisonWorkbook(c);download(await book.xlsx.writeBuffer(),name);}
export async function buildComparisonPdf(c:any,fontBase64:string,loadImage?:(im:any)=>Promise<any>){
 const {jsPDF}=await import('jspdf');const {default:autoTable}=await import('jspdf-autotable');const doc=new jsPDF({orientation:'landscape',format:'a3',compress:true});doc.addFileToVFS('DejaVuSans.ttf',fontBase64);doc.addFont('DejaVuSans.ttf','DejaVu','normal');doc.setFont('DejaVu');const report=comparisonReport(c);let first=true;
 const tablePage=(table:ReportTable,section:string)=>{
  if(!first)doc.addPage();first=false;doc.setFontSize(15);doc.setTextColor(23,58,104);doc.text(section,14,16);doc.setFontSize(9);const context=doc.splitTextToSize('BEFORE: '+(c.beforeName||'Before')+'   |   AFTER: '+(c.afterName||'After'),390);doc.text(context,14,24);const top=29+context.length*4;
  const startPage=doc.getCurrentPageInfo().pageNumber;const weights=table.widths.reduce((n,w)=>n+w,0);const columnStyles=Object.fromEntries(table.widths.map((w,i)=>[i,{cellWidth:390*w/weights}]));
  autoTable(doc,{head:[table.head],body:table.rows.length?table.rows.map(row=>row.map(v=>v??'—')):[['No data in this sheet']],startY:top,margin:{left:14,right:16,top:top,bottom:15},styles:{font:'DejaVu',fontSize:8,fontStyle:'normal',cellPadding:2.2,overflow:'linebreak',valign:'middle',textColor:[36,54,75]},headStyles:{fontStyle:'normal',fillColor:[23,58,104],textColor:[255,255,255]},alternateRowStyles:{fillColor:[240,244,248]},columnStyles,showHead:'everyPage',didDrawPage:()=>{if(doc.getCurrentPageInfo().pageNumber!==startPage){doc.setFontSize(9);doc.text(section,14,10);}},didParseCell:(data:any)=>{if(data.section==='body'&&data.column.index===table.deltaColumn&&typeof data.cell.raw==='number'&&data.cell.raw!==0)data.cell.styles.textColor=data.cell.raw>0?[8,122,90]:[181,57,57];}});
 };
 tablePage(report.summary,'Comparison - Summary');
 for(const section of report.sections){tablePage(section.table,section.title);if(section.imageTable.rows.length)tablePage(section.imageTable,section.title+' - Image decisions');
  if(loadImage)for(const im of section.images){doc.addPage();doc.setFontSize(13);const lines=doc.splitTextToSize(im.label+' | '+im.name,390);doc.text(lines,14,18);const imageTop=Math.max(40,20+lines.length*6);try{const image=await loadImage(im),scale=Math.min(380/image.width,(270-imageTop)/image.height);doc.addImage(image.url,'PNG',14,imageTop,image.width*scale,image.height*scale);}catch{doc.text('Historical image unavailable',14,45);}}
 }
 tablePage(report.po,'PO Changes - Reference');for(let page=1;page<=doc.getNumberOfPages();page++){doc.setPage(page);doc.setFontSize(8);doc.setTextColor(82,105,132);doc.text('Page '+page+' / '+doc.getNumberOfPages(),390,287,{align:'right'});}return doc;
}
export async function pdfComparison(c:any){const font=await fetch('/fonts/DejaVuSans.ttf');if(!font.ok)throw Error('PDF font unavailable');const base64=(await dataUrl(await font.blob())).split(',')[1];const doc=await buildComparisonPdf(c,base64,async(im:any)=>{const response=await fetch('/api/files?id='+encodeURIComponent(im.id));if(!response.ok)throw Error('Image unavailable');const url=await dataUrl(await response.blob());const image=new Image();image.src=url;await image.decode();return {url,width:image.width,height:image.height};});doc.save('Comparison.pdf');}
async function dataUrl(blob:Blob):Promise<string>{return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result as string);r.onerror=()=>reject(Error('Image unavailable'));r.readAsDataURL(blob);});}
export async function pdfTables(title:string,tables:{title:string,head:string[],rows:any[][]}[],images:any[]=[]){
 const {jsPDF}=await import('jspdf');const {default:autoTable}=await import('jspdf-autotable');const doc=new jsPDF({orientation:'landscape',format:'a3',compress:true});
 const font=await (await fetch('/fonts/DejaVuSans.ttf')).blob();const base64=(await dataUrl(font)).split(',')[1];doc.addFileToVFS('DejaVuSans.ttf',base64);doc.addFont('DejaVuSans.ttf','DejaVu','normal');doc.setFont('DejaVu');doc.setFontSize(15);doc.text(title,14,14);
 for(let i=0;i<tables.length;i++){if(i)doc.addPage();doc.setFontSize(13);doc.text(tables[i].title,14,23);autoTable(doc,{head:[tables[i].head],body:tables[i].rows,startY:28,styles:{font:'DejaVu',fontSize:7},headStyles:{fontStyle:'normal',fillColor:[23,58,104]}});}
 for(const im of images){doc.addPage();doc.setFontSize(13);doc.text(String(im.label||'')+' '+im.name,14,20);const res=await fetch('/api/files?id='+encodeURIComponent(im.id));if(!res.ok){doc.text('Historical image unavailable',14,40);continue;}const url=await dataUrl(await res.blob());const image=new Image();image.src=url;await image.decode();const width=380,height=220,scale=Math.min(width/image.width,height/image.height);doc.addImage(url,'PNG',14,35,image.width*scale,image.height*scale);doc.setFontSize(9);doc.text(doc.splitTextToSize([im.reuse,(im.rules||[]).map((r:any)=>r.text).join('; '),(im.monthNames||im.months||[]).join('; ')].filter(Boolean).join(' | '),380),14,275);}
 doc.save(title.replace(/[^a-z0-9]/gi,'_')+'.pdf');
}

// One sheet per export, with its image references and missing-image checks before the table.
export async function buildPoPdf(detail:any,company:string,key:string,fontBase64:string,loadImage:(im:any)=>Promise<any>){
 const {jsPDF}=await import('jspdf');const {default:autoTable}=await import('jspdf-autotable');const {sectionTable,sectionMaterials}=await import('./po-details');const table=sectionTable(detail.result,key,company),materials=sectionMaterials(detail.result,key);const doc=new jsPDF({orientation:'landscape',format:'a3',compress:true});doc.addFileToVFS('DejaVuSans.ttf',fontBase64);doc.addFont('DejaVuSans.ttf','DejaVu','normal');doc.setFont('DejaVu');let y=15;const line=(text:string,size=9)=>{doc.setFontSize(size);for(const part of doc.splitTextToSize(text,390)){if(y>275){doc.addPage();y=15;}doc.text(part,14,y);y+=5;}};line('PO Information · '+table.title,15);line(detail.m.name+' · '+(detail.version?.name||'Unpublished data'));for(const o of detail.orders)line(['PO '+(o.factoryPo||o.onPo),'ON PO '+o.onPo,'Brand '+o.brand,'Season '+o.season,'Date '+o.createDate,'Price '+o.price,'Country '+o.country,'SKU '+o.sku,'Model '+o.model,'Color '+o.color,'Type '+o.type,'Category '+o.category,'Warehouse '+o.warehouse,'Gender '+o.gender,'EXGO '+o.exgo,'MOS '+o.mos,'Original PO '+(o.originalPo||'—'),'Qty '+o.total].filter(v=>v!==undefined&&v!=='').join(' | '));if(detail.version?.historicalWarning)line(detail.version.historicalWarning);
 const refs=[...new Map(materials.map((a:any)=>[a.item.destination+'|'+a.item.item_code,a.item])).values()] as any[];
 for(const item of refs){line(item.item_code+' · '+item.destination);if(!item.images?.length){line('Missing item image · '+materials.filter((a:any)=>a.item.item_code===item.item_code).map((a:any)=>a.po.factoryPo||a.po.onPo).join(', '));continue;}for(const im of item.images){if(y+65>275){doc.addPage();y=15;}try{const image=await loadImage(im);const scale=Math.min(100/image.width,55/image.height);doc.addImage(image.url,14,y,image.width*scale,image.height*scale);y+=58;line(im.name+(im.referenceSource?' · '+im.referenceSource:''));}catch{line('Image unavailable: '+item.item_code+' · '+im.name);}if(im.groupNote)line(im.groupNote);if(im.note)line(im.note);}}
 if(y>235){doc.addPage();y=15;}autoTable(doc,{head:[table.head],body:[...table.rows,table.total],startY:y+4,margin:14,styles:{font:'DejaVu',fontSize:7,cellPadding:2,overflow:'linebreak',minCellWidth:18},headStyles:{fontStyle:'normal',fillColor:[23,58,104]},horizontalPageBreak:true,horizontalPageBreakRepeat:[0],showHead:'everyPage'});if(table.sizeTable){doc.addPage();autoTable(doc,{head:[table.sizeTable.head],body:table.sizeTable.rows,startY:15,styles:{font:'DejaVu',fontSize:8},headStyles:{fontStyle:'normal',fillColor:[23,58,104]}});}return doc;
}
export async function pdfPoDetails(detail:any,company:string,key:string){const font=await fetch('/fonts/DejaVuSans.ttf');if(!font.ok)throw Error('PDF font unavailable');const base64=(await dataUrl(await font.blob())).split(',')[1];const doc=await buildPoPdf(detail,company,key,base64,async(im:any)=>{const response=await fetch('/api/files?id='+encodeURIComponent(im.id));if(!response.ok)throw Error('Image unavailable');const url=await dataUrl(await response.blob());const img=new Image();img.src=url;await img.decode();return {url,width:img.width,height:img.height};});doc.save(('PO_'+detail.m.name+'_'+key+'_'+detail.orders.map((o:any)=>o.factoryPo||o.onPo).join('_')).replace(/[^a-z0-9_-]/gi,'_')+'.pdf');}
