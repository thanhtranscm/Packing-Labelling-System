import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import ExcelJS from 'exceljs';
const dir=await fs.mkdtemp(path.resolve('.sites-runtime/comparison-report-'));
for(const name of ['model','order-rows','size-settings','material-state','comparison','po-state','template-export','po-details','comparison-report','comparison-images','order-import','download','excel']){
 const source=await fs.readFile('lib/'+name+'.ts','utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/(from |import\()['"](\.\/[^'"]+)['"]/g,"$1'$2.js'");await fs.writeFile(path.join(dir,name+'.js'),code);
}
const {makeWorkspace}=await import('../.sites-runtime/check-bootstrap.mjs');
const {calculate}=await import(pathToFileURL(path.join(dir,'model.js')));
const {compareSnapshots}=await import(pathToFileURL(path.join(dir,'comparison.js')));
const {comparisonReport}=await import(pathToFileURL(path.join(dir,'comparison-report.js')));
const {comparisonWorkbook,buildComparisonPdf}=await import(pathToFileURL(path.join(dir,'excel.js')));
const {comparisonImages,comparisonWithImageReferences}=await import(pathToFileURL(path.join(dir,'comparison-images.js')));
const font=await fs.readFile('public/fonts/DejaVuSans.ttf');
for(const company of ['WSV','CTC']){
 const ws=makeWorkspace(company),month=ws.months[0];for(const item of ws.items)if(item.versions.length>1)item.versions.forEach((v,i)=>v.months=i===0?[month.id]:[]);
 const orders=month.orders.slice(0,5);const before={id:'before',name:'Sub_material_'+company+'_Before.xlsx',orders,result:calculate(ws,month,orders)};
 const next=structuredClone(orders.slice(1));next[0].qty[5]+=7;next[0].total+=7;next[0].mos='Air';const after={id:'after',name:'Sub_material_'+company+'_After.xlsx',orders:next,result:calculate(ws,month,next)};
 const c={...compareSnapshots(before,after),beforeVersion:before,afterVersion:after};const report=comparisonReport(c);assert.equal(report.sections.length,6);
 for(const section of report.sections){assert.ok(!section.table.head.some(h=>/USAGE/.test(h)));assert.ok(!('sizes' in section));const sum=section.table.rows.reduce((n,r)=>n+(typeof r[section.table.deltaColumn]==='number'?r[section.table.deltaColumn]:0),0);if(section.key==='label'||section.key==='card')assert.equal(sum,after.result[section.key].reduce((n,r)=>n+r.total,0)-before.result[section.key].reduce((n,r)=>n+r.total,0));}
 const pack=report.sections.find(s=>s.key==='pack').table;assert.equal(pack.head.length,4);assert.equal(new Set(pack.rows.map(r=>r[0])).size,pack.rows.length);assert.ok(c.materials.filter(r=>r.type==='packaging').every(r=>r.country==='All'));
 for(const [kind,field] of [['Outer','purchaseCartons'],['Empty','purchaseEmpty'],['Inner','purchaseInner']]){const rows=pack.rows.filter(r=>r[0].startsWith(kind+':'));assert.equal(rows.reduce((n,r)=>n+r[1],0),before.result.pack.reduce((n,r)=>n+r.groups.reduce((x,g)=>x+g[field],0),0));assert.equal(rows.reduce((n,r)=>n+r[2],0),after.result.pack.reduce((n,r)=>n+r.groups.reduce((x,g)=>x+g[field],0),0));}
 const book=await comparisonWorkbook(c);assert.deepEqual(book.worksheets.map(s=>s.name),['Summary','Label','Special Label','Card','Outer - Empty - Inner','Wrapping Paper','Stuffing Paper','PO Changes']);
 for(const sh of book.worksheets){assert.ok(sh.columns.every(col=>col.width>=18));assert.ok(sh.getRow(5).height>=30);assert.equal(sh.views[0].ySplit,5);assert.ok(sh.getCell('A1').font.size>=17);}
 for(const sh of book.worksheets)sh.eachRow(row=>assert.ok(!row.values.some(v=>typeof v==='string'&&/BEFORE USAGE|AFTER USAGE|USAGE BY SIZE/.test(v))));
 const bytes=await book.xlsx.writeBuffer();await fs.writeFile(path.join(dir,company+'.xlsx'),bytes);const reopened=new ExcelJS.Workbook();await reopened.xlsx.load(bytes);assert.equal(reopened.getWorksheet('Label').getCell('A6').value,report.sections[0].table.rows[0][0]);
 const doc=await buildComparisonPdf(c,font.toString('base64'));await fs.writeFile(path.join(dir,company+'.pdf'),new Uint8Array(doc.output('arraybuffer')));
 // Very long notes remain fully present in continuation rows with valid Excel heights.
 const stress=structuredClone(c);stress.po[0].fields=[{field:'long note',before:'',after:Array.from({length:100},(_,i)=>'Condition '+i+' must stay visible').join('\n')}];const longBook=await comparisonWorkbook(stress);const sh=longBook.getWorksheet('PO Changes');assert.ok(sh.rowCount>stress.po.length+5);assert.ok(sh.getColumn(6).values.join('').includes('Condition 99'));sh.eachRow(row=>assert.ok(row.height<=409));
 const imageStress=structuredClone(c);imageStress.beforeVersion.result.special[0].item.images=[{id:'historical-image',name:'Long reference image.png',reuse:'Conditional reuse',rules:Array.from({length:60},(_,i)=>({text:'Image condition '+i})),months:['09/26']}];const imageBook=await comparisonWorkbook(imageStress),imageSheet=imageBook.getWorksheet('Special Label');assert.ok(imageSheet.getColumn(7).width>=60);assert.ok(imageSheet.getColumn(7).values.join('').includes('Image condition 59'));imageSheet.eachRow(row=>assert.ok(row.height<=409));
 console.log('PASS',company,'six sheet groups, quantity reconciliation, fixed column widths, fitted rows, long notes, Excel serialization and PDF generation');
}
console.log('PREVIEW_DIRECTORY='+dir);

const orders=[{id:'a',country:'A'},{id:'b',country:'B'}];
const img=(id)=>({id,name:id+'.png',months:['m']});
const item=(po,code,images)=>({po,item:{destination:po.country,item_code:code,images}});
const version=(id,rows)=>({id,orders,result:{orders,label:rows,special:[],card:[],pack:[],paper:[]}});
const before=version('a',[item(orders[0],'SHARED',[img('shared')]),item(orders[0],'OLD',[img('old')])]),after=version('b',[item(orders[1],'SHARED',[img('shared')])]);
const c={beforeVersion:before,afterVersion:after,materials:[{type:'material',country:'A',code:'SHARED',oldImages:[img('shared')],newImages:[]},{type:'material',country:'B',code:'SHARED',oldImages:[],newImages:[img('shared')]},{type:'material',country:'A',code:'OLD',oldImages:[img('old')],newImages:[]}]};
const images=comparisonImages(c,{id:'m'},{items:[]});assert.deepEqual(images.obsolete.map(r=>r.image.id),['old']);assert.equal(images.groups.length,3);
before.result.label[1].item.images=[];c.materials[2].oldImages=[];const current=comparisonImages(c,{id:'m'},{items:[{destination:'A',versions:[{item_code:'OLD',images:[img('current'),{...img('wrong-month'),months:['other']}]}]}]});assert.equal(current.obsolete[0].image.id,'current');assert.ok(current.obsolete[0].image.referenceSource);assert.equal(comparisonImages({materials:[]},{id:'m'},{items:[]}).groups.length,0);console.log('PASS obsolete images, shared references still active elsewhere, exact-month current fallback and empty image state');

const history=JSON.stringify(c);const referenced=comparisonWithImageReferences(c,{id:'m'},{items:[{destination:'A',versions:[{item_code:'OLD',images:[img('current')]}]}]});assert.equal(JSON.stringify(c),history);assert.equal(referenced.beforeVersion.result.label[1].item.images[0].referenceSource,'Current month reference');console.log('PASS comparison export adds clearly marked references without changing history or quantities');
