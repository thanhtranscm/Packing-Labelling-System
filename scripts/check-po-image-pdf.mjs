import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';import ts from 'typescript';import assert from 'node:assert/strict';
await fs.mkdir('.sites-runtime/po-print-qa',{recursive:true});
for(const name of ['po-image-pdf','image-memory'])await fs.writeFile('.sites-runtime/'+name+'.mjs',ts.transpileModule((await fs.readFile('lib/'+name+'.ts','utf8')).replace("'./image-memory'","'./image-memory.mjs'"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const {buildPoImagesPdf,poPrintGroups,validatePoImageSelection}=await import('../.sites-runtime/po-image-pdf.mjs');
const po={id:'selected',factoryPo:'CTC12345',country:'COLOMBIA',sku:'SKU1'},other={id:'other',factoryPo:'WSV67890',country:'THAILAND'};
const image={id:'image1',groupNote:'Vị trí dán: mặt bên thùng carton.',note:'Kiểm tra mã và thông tin trước khi dán.'};
const row=(po,im)=>({po,item:{item_code:'ON-GX182',images:[im]}});
const detail={m:{name:'09/26'},orders:[po,other],result:{label:[row(po,image),row(other,{id:'DO_NOT_PRINT'})],card:[row(po,image),row(po,{...image,id:'image2'})]}};
assert.equal(poPrintGroups(detail,[po.id])[0].images.length,2);assert.equal(poPrintGroups(detail,[po.id]).length,1);
assert.equal(poPrintGroups({...detail,result:{pack:[{po}]}},[po.id],['pack'])[0].images.length,0);
const font=(await fs.readFile('public/fonts/DejaVuSans.ttf')).toString('base64'),url='data:image/png;base64,'+(await fs.readFile('scripts/fixtures/po-print-label.png')).toString('base64');
for(const format of ['a3','a4']){const loaded=[];const doc=await buildPoImagesPdf(detail,[po.id],format,font,async im=>{loaded.push(im.id);return {url,width:1000,height:460};});assert.deepEqual(loaded,['image1','image2']);assert.equal(doc.getNumberOfPages(),1);await fs.writeFile('.sites-runtime/po-print-qa/po-images-'+format+'.pdf',Buffer.from(doc.output('arraybuffer')));const printed=execFileSync('pdftotext',['.sites-runtime/po-print-qa/po-images-'+format+'.pdf','-'],{encoding:'utf8'});assert.equal((printed.match(/PO - CTC12345 - COLOMBIA/g)||[]).length,1);assert.ok(!printed.includes('09/26'));assert.ok(Math.abs(doc.internal.pageSize.getWidth()-(format==='a4'?297:420))<1);}
const multi=await buildPoImagesPdf({...detail,result:{label:[...Array.from({length:12},(_,i)=>row(po,{...image,id:'many'+i})),row(other,image)]}},[po.id,other.id],'a4',font,async()=>({url,width:1000,height:460}));assert.equal(multi.getNumberOfPages(),1);
const sharedDetail={...detail,result:{label:[row(po,image),row(other,image),row(po,{...image,id:'image2'}),row(other,{...image,id:'image2'})]}};
const sharedGroups=poPrintGroups(sharedDetail,[other.id,po.id]);assert.deepEqual(sharedGroups.map(g=>g.po.id),[po.id,other.id]);assert.deepEqual(sharedGroups.map(g=>g.images.map(im=>im.id)),[['image1','image2'],['image1','image2']]);assert.equal(poPrintGroups(sharedDetail,[po.id],['card'])[0].images.length,0);
let sharedLoads=0;const shared=await buildPoImagesPdf(sharedDetail,[po.id,other.id],'a4',font,async()=>{sharedLoads++;return {url,width:1000,height:460};});assert.equal(sharedLoads,2);assert.equal(shared.getNumberOfPages(),1);assert.equal((shared.internal.pages.flat().join(' ').match(/\/I\d+ Do/g)||[]).length,4);await fs.writeFile('.sites-runtime/po-print-qa/shared-po.pdf',Buffer.from(shared.output('arraybuffer')));
const sharedText=execFileSync('pdftotext',['.sites-runtime/po-print-qa/shared-po.pdf','-'],{encoding:'utf8'});assert.equal((sharedText.match(/PO - CTC12345 - COLOMBIA/g)||[]).length,1);assert.equal((sharedText.match(/PO - WSV67890 - THAILAND/g)||[]).length,1);
const sixRatios=[[500,900],[600,900],[1200,350],[1100,650],[1100,650],[600,900]];
const sixDetail={...detail,result:{label:sixRatios.map((_,i)=>row(po,{...image,id:'single-'+i,note:'Dán lên tem '+i,groupNote:''}))}};
const six=await buildPoImagesPdf(sixDetail,[po.id],'a4',font,async im=>{const i=Number(im.id.split('-')[1]);return {url,width:sixRatios[i][0],height:sixRatios[i][1]};});
const placements=[...six.internal.pages[1].join('\n').matchAll(/([\d.]+) 0 0 ([\d.]+) ([\d.-]+) ([\d.-]+) cm\n\/I\d+ Do/g)];assert.equal(placements.length,6);assert.equal(six.getNumberOfPages(),1);
const area=placements.reduce((sum,p)=>sum+Number(p[1])*Number(p[2]),0),oldWidth=((297-20-4-25)/6-2)*72/25.4,oldArea=sixRatios.reduce((sum,[w,h])=>sum+oldWidth*oldWidth*h/w,0);assert.ok(area>oldArea*1.5,'mixed single-PO labels should use substantially more print area than one forced row');
const fourOrders=Array.from({length:4},(_,i)=>({...po,id:'limit'+i,factoryPo:'WSV_LIMIT_'+i})),four={...detail,orders:fourOrders,result:{label:fourOrders.map(o=>row(o,image))}};
assert.equal(validatePoImageSelection(four,fourOrders.slice(0,3).map(o=>o.id)).length,3);
for(const format of ['a3','a4'])for(const count of [1,2,3,4,5,6,7]){
 const orders=Array.from({length:count},(_,i)=>({...po,id:'case'+i,factoryPo:'WSV_CASE_'+i}));const d={...detail,orders,result:{label:orders.map(o=>row(o,image))}};
 const paged=await buildPoImagesPdf(d,orders.map(o=>o.id),format,font,async()=>({url,width:1000,height:460}));assert.equal(paged.getNumberOfPages(),Math.ceil(count/3));
 const pdfPath='.sites-runtime/po-print-qa/paged-'+format+'-'+count+'.pdf';await fs.writeFile(pdfPath,Buffer.from(paged.output('arraybuffer')));
 const pages=execFileSync('pdftotext',['-layout',pdfPath,'-'],{encoding:'utf8'}).split('\f');for(let i=0;i<count;i++){const page=Math.floor(i/3);assert.ok(pages[page].includes('WSV_CASE_'+i));}
}
assert.equal(validatePoImageSelection(four,fourOrders.map(o=>o.id)).length,4);
assert.throws(()=>validatePoImageSelection({...four,result:{label:[...four.result.label,{po:fourOrders[3],item:{item_code:'MISSING-LATER',images:[]}}]}},fourOrders.map(o=>o.id)),/MISSING-LATER/);
const partiallyMissing={...detail,result:{label:[row(po,image),{po,item:{item_code:'MISSING-CODE',images:[]}}]}};assert.throws(()=>validatePoImageSelection(partiallyMissing,[po.id]),/CTC12345.*MISSING-CODE/);
assert.throws(()=>validatePoImageSelection({...detail,result:{label:[{po,item:{item_code:'ONLY-MISSING',images:[]}}]}},[po.id]),/ONLY-MISSING/);
await assert.rejects(()=>buildPoImagesPdf(detail,[], 'a4',font,async()=>{}),/select/);
await assert.rejects(()=>buildPoImagesPdf(detail,[po.id], 'a4',font,async()=>{throw Error('failed image');}),/failed image/);
const long={...detail,result:{label:[row(po,{...image,groupNote:Array(300).fill('Ghi chú dài có dấu tiếng Việt.').join('\n')})]}};const doc=await buildPoImagesPdf(long,[po.id],'a4',font,async()=>({url,width:1000,height:460}));assert.equal(doc.getNumberOfPages(),1);
console.log('PASS: selected PO isolation, all label types, duplicates removed within PO only, shared Standard repeated across POs, A3/A4 page size, missing selection, failed image, long-note single-page fitting.');
