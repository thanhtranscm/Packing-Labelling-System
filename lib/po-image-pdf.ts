import {loadCachedImage} from './image-memory';
export const MAX_PO_IMAGE_PDF=3;

// Restrict every reference to the selected PO IDs; never consult a different month.
export function poPrintGroups(detail:any,selectedIds:string[],kinds:string[]=['label','special','card']){
 const ids=new Set(selectedIds);
 return detail.orders.filter((o:any)=>ids.has(o.id)).map((po:any)=>{
  const seen=new Set<string>();const images:any[]=[];const missing:string[]=[];
  for(const kind of kinds.filter(k=>['label','special','card'].includes(k)))for(const row of detail.result[kind]||[]){
   if(row.po.id!==po.id)continue;if(!row.item.images?.length)missing.push(row.item.item_code);
   for(const image of row.item.images||[]){const key=JSON.stringify([image.id,image.groupNote||'',image.note||'']);if(seen.has(key))continue;seen.add(key);images.push({...image,code:row.item.item_code});}
  }
  return {po,images,missing};
 });
}
export function validatePoImageSelection(detail:any,selectedIds:string[]){
 const ids=new Set(selectedIds);
 const groups=poPrintGroups(detail,selectedIds);
 if(!groups.length)throw Error('Please select a PO / Vui lòng chọn PO.');
 if(groups.length!==ids.size)throw Error('PO unavailable / PO không còn trong danh sách.');
 const missing=groups.filter((g:any)=>!g.images.length||g.missing.length);
 if(missing.length)throw Error('Missing applied images / Thiếu hình áp dụng: '+missing.map((g:any)=>(g.po.factoryPo||g.po.onPo)+(g.missing.length?' ('+[...new Set(g.missing)].join(', ')+')':'')).join('; '));
 return groups;
}
export async function buildPoImagesPdf(detail:any,selectedIds:string[],format:'a3'|'a4',fontBase64:string,loadImage:(image:any)=>Promise<any>){
 const groups=validatePoImageSelection(detail,selectedIds);
 const {jsPDF}=await import('jspdf');const doc=new jsPDF({format,orientation:'landscape',compress:true});
 doc.addFileToVFS('DejaVuSans.ttf',fontBase64);doc.addFont('DejaVuSans.ttf','DejaVu','normal');doc.setFont('DejaVu');
 const width=doc.internal.pageSize.getWidth(),height=doc.internal.pageSize.getHeight(),margin=10,gap=5;
 const loaded=new Map<string,any>();
 for(const group of groups)for(const image of group.images)if(!loaded.has(image.id))loaded.set(image.id,await loadImage(image));
 const fitText=(text:string,w:number,maxHeight:number,maxFont:number)=>{
  let low=.01,high=maxFont;
  for(let i=0;i<24;i++){const size=(low+high)/2;doc.setFontSize(size);const lines=text?doc.splitTextToSize(text,w):[];if(lines.length*size*.352778*1.2<=maxHeight)low=size;else high=size;}
  doc.setFontSize(low);const lines=text?doc.splitTextToSize(text,w):[];return {size:low,lines,height:lines.length*low*.352778*1.2};
 };
 for(let offset=0;offset<groups.length;offset+=MAX_PO_IMAGE_PDF){
 const pageGroups=groups.slice(offset,offset+MAX_PO_IMAGE_PDF);
 if(offset>0)doc.addPage(format,'landscape');
 // Each PO owns one complete rectangle. Its images may wrap only inside that rectangle.
 let best:any=null;
 for(const groupColumns of [1]){
  const groupRows=Math.ceil(pageGroups.length/groupColumns),groupW=(width-2*margin-gap*(groupColumns-1))/groupColumns,groupH=(height-2*margin-gap*(groupRows-1))/groupRows;if(groupW<8||groupH<12)continue;
  const layouts=pageGroups.map((group:any)=>{
   const heading=fitText('PO - '+(group.po.factoryPo||group.po.onPo)+' - '+group.po.country,groupW-4,groupH*.12,12),top=heading.height+5;
   let chosen:any=null;
   for(const columns of (pageGroups.length===1?Array.from({length:group.images.length},(_,i)=>i+1):[group.images.length])){
    const rows=Math.ceil(group.images.length/columns),cellW=(groupW-4-gap*(columns-1))/columns,cellH=(groupH-top-3-gap*(rows-1))/rows;if(cellW<=2||cellH<=4)continue;
    const cells=group.images.map((image:any)=>{
     const asset=loaded.get(image.id),note=fitText([image.groupNote,image.note].filter(Boolean).join('\n'),cellW-2,cellH*.42,12);
     const imageH=Math.max(.1,cellH-note.height-4),scale=Math.min((cellW-2)/asset.width,imageH/asset.height);
     return {image,asset,note,w:asset.width*scale,h:asset.height*scale};
    });
    const score=cells.reduce((n:number,c:any)=>n+Math.log(Math.max(.001,c.w*c.h))+Math.log(Math.max(.01,c.note.lines.length?c.note.size:12))*.3,0);
    if(!chosen||score>chosen.score)chosen={columns,cellW,cellH,cells,score,heading,top};
   }
   return chosen;
  });
  if(layouts.some((v:any)=>!v))continue;
  const score=layouts.reduce((sum:number,g:any)=>sum+g.score,0);
  if(!best||score>best.score)best={groupColumns,groupW,groupH,layouts,score};
 }
 if(!best)throw Error('Too many images to fit / Quá nhiều hình để bố trí.');
 best.layouts.forEach((layout:any,groupIndex:number)=>{
  const gx=margin+(groupIndex%best.groupColumns)*(best.groupW+gap),gy=margin+Math.floor(groupIndex/best.groupColumns)*(best.groupH+gap);
  if(pageGroups.length>1){doc.setDrawColor(70,95,125);doc.setLineWidth(.65);doc.roundedRect(gx,gy,best.groupW,best.groupH,2,2);}
  doc.setTextColor(23,58,104);doc.setFontSize(layout.heading.size);doc.text(layout.heading.lines,gx+best.groupW/2,gy+2+layout.heading.size*.352778,{align:'center',lineHeightFactor:1.2});
  layout.cells.forEach((cell:any,index:number)=>{
   const x=gx+2+(index%layout.columns)*(layout.cellW+gap),y=gy+layout.top+Math.floor(index/layout.columns)*(layout.cellH+gap),center=x+layout.cellW/2;
   const imageTop=y+2,availableH=layout.cellH-cell.note.height-4;
   const imageY=pageGroups.length===1?y+(layout.cellH-cell.h-cell.note.height-2)/2:imageTop+(availableH-cell.h)/2;
   doc.addImage(cell.asset.url,center-cell.w/2,imageY,cell.w,cell.h);
   if(cell.note.lines.length){doc.setTextColor(180,35,50);doc.setFontSize(cell.note.size);doc.text(cell.note.lines,center,(pageGroups.length===1?imageY+cell.h+2:y+layout.cellH-cell.note.height)+cell.note.size*.352778,{align:'center',lineHeightFactor:1.2});}
  });
 });
 }
 return doc;
}
export async function pdfPoImages(detail:any,selectedIds:string[],format:'a3'|'a4'){
 validatePoImageSelection(detail,selectedIds);
 const response=await fetch('/fonts/DejaVuSans.ttf');if(!response.ok)throw Error('PDF font unavailable');
 const toData=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});
 const font=(await toData(await response.blob())).split(',')[1];
 const doc=await buildPoImagesPdf(detail,selectedIds,format,font,async(image:any)=>{
  const url=await loadCachedImage('/api/files?id='+encodeURIComponent(image.id));const img=new Image();img.src=url;await img.decode();return {url:await toData(await (await fetch(url)).blob()),width:img.naturalWidth,height:img.naturalHeight};
 });
 const ids=new Set(selectedIds);const names=[...new Set<string>(detail.orders.filter((po:any)=>ids.has(po.id)).map((po:any)=>String(po.factoryPo||po.onPo)))];
 const filename=names.join('_').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');
 doc.save((filename.length>180?filename.slice(0,160)+'_POs_'+names.length:filename)+'.pdf');
}
