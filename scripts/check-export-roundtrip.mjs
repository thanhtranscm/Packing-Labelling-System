import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import ExcelJS from 'exceljs';
const dir=await fs.mkdtemp(path.resolve('.sites-runtime/export-roundtrip-'));
for(const name of ['model','order-rows','size-settings','material-state','comparison','po-state','read-export','template-export','po-details']){
 const source=await fs.readFile('lib/'+name+'.ts','utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from '(\.\/[^']+)'/g,"from '$1.js'");await fs.writeFile(path.join(dir,name+'.js'),code);
}
const {defaultSizes,defaultSettings,calculate}=await import(pathToFileURL(path.join(dir,'model.js')));
const {exportTemplate}=await import(pathToFileURL(path.join(dir,'template-export.js')));
const {readExportVersion}=await import(pathToFileURL(path.join(dir,'read-export.js')));
const {compareSnapshots}=await import(pathToFileURL(path.join(dir,'comparison.js')));
const {detailResult,sectionTable}=await import(pathToFileURL(path.join(dir,'po-details.js')));
const template=await fs.readFile('public/templates/purchase.xlsx');
let count=0;
for(const company of ['WSV','CTC'])for(const production of [false,true])for(const trim of [false,true]){
 const profile={id:'adult',sizes:structuredClone(trim?defaultSizes.slice(1):defaultSizes)},settings=structuredClone(defaultSettings);
 const ws={profiles:[{id:'adult',sizes:defaultSizes}],reuse:[],items:[{id:'label',destination:'STANDARD',list_no:1,item_code:'SIZE',description:'Size label',qty_per_finish:1,unit:'PRS',outputs:['label'],versions:[{id:'one',item_code:'SIZE',description:'Size label',months:[],all:true,images:[]}]}]};
 for(const [id,output] of [['SPECIAL','special'],['CARD','card']])ws.items.push({id,destination:'STANDARD',list_no:ws.items.length+1,item_code:id,description:id,qty_per_finish:1,unit:'PCS',outputs:[output],versions:[{id:'one-'+id,item_code:id,description:id,months:[],all:true,images:[]}]});
 const orders=[7,13].map((quantity,i)=>({id:company==='WSV'?'FACTORY-'+i:'ON-'+i+'|Ocean',factoryPo:'FACTORY-'+i,onPo:company==='WSV'?'ON-SPLIT':'ON-'+i,sku:'SKU',mos:'Ocean',country:'BELGIUM',type:'ON',profile:'adult',sizes:profile.sizes,qty:profile.sizes.map(s=>+s.uk===3.5?quantity:0),total:quantity,exgo:'END NOV'}));
 const month={id:'2026-11',name:'November',profileId:'adult',profiles:[profile],settings,orders};
 const result=calculate(ws,month,orders,!production),bytes=await exportTemplate(result,company,production,template.buffer.slice(template.byteOffset,template.byteOffset+template.byteLength));
 const restored=await readExportVersion(new File([bytes],'version.xlsx'),company,ws,month);
 assert.equal(restored.orders.length,2);assert.deepEqual(restored.orders.map(o=>o.total),[7,13]);assert.equal(restored.result.sizes.length,profile.sizes.length);
 assert.deepEqual(restored.result.label.filter(r=>r.item.item_code==='SIZE').map(r=>r.po.factoryPo),['FACTORY-0','FACTORY-1']);
 assert.equal([...restored.result.label,...restored.result.special,...restored.result.card].length,6);
 const compared=compareSnapshots({id:'native',orders,result},restored);assert.ok(compared.materials.filter(m=>m.type==='packaging').every(m=>m.afterRequired===null));
 assert.ok(restored.result.pack.every(r=>r.groups.every(g=>g.emptyCode&&g.innerCode)));
 assert.ok(restored.result.paper.every(r=>r.aggregate&&r.po.id==='__aggregate__'));
 assert.equal(detailResult(restored.result,[restored.orders[0]],month,ws).paper.length,0);
 assert.ok(detailResult(restored.result,restored.orders,month,ws).paper.length>0);
 await assert.rejects(()=>readExportVersion(new File([bytes],'wrong-workspace.xlsx'),company==='WSV'?'CTC':'WSV',ws,month),/correct workspace/);
 const b=new ExcelJS.Workbook();await b.xlsx.load(bytes);
 if(!production){
  for(const [kind,name] of [['label','Label'],['special','Special Label'],['card','Card']]){const view=sectionTable(result,kind,company),sh=b.getWorksheet(name);assert.equal(view.rows.length,result[kind].length);for(let row=0;row<view.rows.length;row++){const cells=view.rows[row];for(let col=0;col<20;col++)assert.equal(cells[col]??'',sh.getCell(row+8,col+1).value??'');if(kind!=='special'){assert.deepEqual(cells.slice(21),Array.from({length:result.sizes.length+1},(_,i)=>sh.getCell(row+8,23+i).value));assert.ok(!view.head.includes('Required'));}}}
  const packView=sectionTable(result,'pack',company);for(let i=0;i<packView.rows.length;i++)assert.deepEqual(packView.rows[i].slice(18),Array.from({length:packView.rows[i].length-18},(_,c)=>b.getWorksheet('Outer - Empty - Inner').getCell(i+5,c+20).value??undefined));
  for(const kind of ['wrapping','stuffing']){const view=sectionTable(result,kind,company),sh=b.getWorksheet(kind==='wrapping'?'Wrapping Paper':'Stuffing Paper');for(let i=0;i<view.rows.length;i++){assert.equal(view.rows[i][7],sh.getCell(i+5,8).value);assert.equal(view.rows[i][6],sh.getCell(i+5,7).value);}assert.equal(view.sizeTable.rows.length,result.sizes.length);assert.deepEqual(sectionTable(restored.result,kind,company).sizeTable.rows.map(r=>r.slice(3)),view.sizeTable.rows.map(r=>r.slice(3)));}
  const cmp=compareSnapshots({id:'native',orders,result},restored);assert.ok(cmp.materials.every(r=>r.delta===0));
 }
b.getWorksheet('Outer - Empty - Inner').getCell(5,20).value=-1;
 await assert.rejects(async()=>readExportVersion(new File([await b.xlsx.writeBuffer()],'bad.xlsx'),company,ws,month),/quantity/);
 const badPaper=new ExcelJS.Workbook();await badPaper.xlsx.load(bytes);badPaper.getWorksheet('Wrapping Paper').getCell('E5').value=-1;await assert.rejects(async()=>readExportVersion(new File([await badPaper.xlsx.writeBuffer()],'bad-paper.xlsx'),company,ws,month),/quantity/);
 count++;console.log('PASS',company,production?'production':'purchase',trim?'month-specific trimmed sizes':'standard sizes','round trip, split PO matching, aggregate paper and invalid quantity');
}

for(const company of ['WSV','CTC'])for(const production of [false,true]){
 const profile={id:'adult',sizes:structuredClone(defaultSizes)},settings=structuredClone(defaultSettings);settings.buffer.outer=100;settings.materialBuffer={THAILAND:{4:25}};
 const ws={profiles:[profile],reuse:[],items:[{id:'thai',destination:'THAILAND',list_no:4,item_code:'ON-GX101',qty_per_finish:2,unit:'PCS',outputs:['label','special'],versions:[{id:'one',item_code:'ON-GX101',description:'Thai outer carton label',months:[],all:true,images:[]}]}]};
 const orders=['ON','Distributor'].map((type,i)=>({id:company==='WSV'?'FACTORY-'+i:'ON-'+i+'|Ocean',factoryPo:'FACTORY-'+i,onPo:'ON-'+i,sku:'SKU',mos:'Ocean',country:'THAILAND',type,profile:'adult',sizes:profile.sizes,qty:profile.sizes.map((_,j)=>j===0?7:j===1?1:0),total:8,exgo:'NOV'}));
 const month={id:'2026-11',name:'November',profileId:'adult',profiles:[profile],settings,orders};
 const result=calculate(ws,month,orders,!production),bytes=await exportTemplate(result,company,production,template);
 assert.deepEqual(result.label.map(r=>r.requiredTotal),[6,4]);assert.deepEqual(result.label.map(r=>r.total),production?[6,4]:[8,5]);
 const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);const sheet=book.getWorksheet(production?'Label - Special - Card':'Label');
 assert.match(sheet.getCell('Q8').value,/QTY BASIS: CARTON/);assert.equal(sheet.getCell(8,23+result.sizes.length).value,production?6:8);assert.equal(sheet.getCell(9,23+result.sizes.length).value,production?4:5);
 const restored=await readExportVersion(new File([bytes],'thai.xlsx'),company,ws,month),comparison=compareSnapshots({id:'native',orders,result},restored);
 assert.ok(comparison.materials.filter(r=>r.type==='material').every(r=>r.delta===0));
 assert.deepEqual(restored.result.label.map(r=>r.total),production?[6,4]:[8,5]);assert.ok(restored.result.label.every(r=>r.quantityBasis==='carton'));
 if(!production)assert.ok(comparison.materials.filter(r=>r.type==='material').every(r=>r.afterRequired===null));else assert.deepEqual(restored.result.label.map(r=>r.requiredTotal),[6,4]);
 const view=sectionTable(result,'label',company);assert.deepEqual(view.rows.map(r=>r.at(-1)),production?[6,4]:[8,5]);
 count++;console.log('PASS',company,production?'production':'purchase','Thai carton label totals, detail and comparison survive export/import');
}

for(const company of ['WSV','CTC'])for(const production of [false,true]){
 const profile={id:'adult',sizes:structuredClone(defaultSizes)},settings=structuredClone(defaultSettings);
 const ws={profiles:[profile],reuse:[],items:[{id:'custom',destination:'BELGIUM',list_no:4,item_code:'CUSTOM-CARTON-ITEM',quantityBasis:'carton',qty_per_finish:2,unit:'PCS',outputs:['label'],versions:[{id:'one',item_code:'CUSTOM-CARTON-ITEM',description:'User-selected carton item',months:[],all:true,images:[]}]}]};
 const orders=[{id:company==='WSV'?'F1':'ON1|Ocean',factoryPo:'F1',onPo:'ON1',sku:'SKU',mos:'Ocean',country:'BELGIUM',type:'ON',profile:'adult',sizes:profile.sizes,qty:profile.sizes.map((_,i)=>i===0?7:i===1?1:0),total:8,exgo:'NOV'}];
 const month={id:'2026-11',name:'November',profileId:'adult',profiles:[profile],settings,orders},result=calculate(ws,month,orders,!production);
 assert.equal(result.label[0].total,production?6:8);
 const bytes=await exportTemplate(result,company,production,template),restored=await readExportVersion(new File([bytes],'custom.xlsx'),company,ws,month);
 assert.equal(restored.result.label[0].total,production?6:8);assert.equal(restored.result.label[0].quantityBasis,'carton');assert.equal(compareSnapshots({id:'native',orders,result},restored).materials.find(m=>m.code==='CUSTOM-CARTON-ITEM').delta,0);
 count++;console.log('PASS',company,production?'production':'purchase','arbitrary user-selected carton item survives workbook round trip');
}
console.log(count+' export round-trip cases passed');
