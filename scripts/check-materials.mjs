import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import ExcelJS from 'exceljs';
// Run check-template first to prepare the actual production modules for Node.
const {makeWorkspace}=await import('../.sites-runtime/check-bootstrap.mjs');
const {calculate,materialItems,unresolvedMaterialVersions}=await import('../.sites-runtime/check-model.mjs');
const {syncStandard,reuseState,syncStandardImages,reconcileStandardWorkspace,hasMaterialImage,missingMaterialImages}=await import('../.sites-runtime/check-material-state.mjs');
const {compareSnapshots}=await import('../.sites-runtime/check-comparison.mjs');
const ws=makeWorkspace('WSV'),month=ws.months[0];let checks=0;
const check=(label,fn)=>{fn();checks++;console.log('PASS '+label);};
check('multi-version Korea requires explicit month selection',()=>assert.throws(()=>materialItems(ws,month,'KOREA'),/choose one version/));
check('preflight lists all unresolved items only in selected markets and detects overlaps',()=>{
 const v=(id,months)=>({id,item_code:id,months,images:[]});
 const fixture={items:[{destination:'STANDARD',list_no:1,item_code:'S',outputs:['label'],versions:[v('S1',[]),v('S2',[])]},{destination:'KOREA',list_no:5,item_code:'K',outputs:['label'],versions:[v('K1',[]),v('K2',[])]},{destination:'KOREA',list_no:6,item_code:'T',outputs:['card'],versions:[v('T1',[month.id]),v('T2',[month.id])]},{destination:'JAPAN',list_no:9,item_code:'J',outputs:['label'],versions:[v('J1',[]),v('J2',[])]}]};
 const result=unresolvedMaterialVersions(fixture,month,[{country:'KOREA'},{country:'KOREA'},{country:'BELGIUM'}]);
 assert.deepEqual(result.map(r=>[r.country,r.no,r.conflict]),[['KOREA',5,false],['KOREA',6,true],['STANDARD',1,false]]);
 assert.deepEqual(result[0].codes,['K1','K2']);assert.deepEqual(result[2].markets,['BELGIUM']);
});
const belgium=month.orders.find(o=>o.country==='BELGIUM');
check('unselected Korea does not block Belgium',()=>assert.doesNotThrow(()=>calculate(ws,month,[belgium])));
const korea=ws.items.find(m=>m.destination==='KOREA'&&m.list_no===5);korea.versions.find(v=>v.item_code==='FKK-03').months=[month.id];
check('FKK-03 month selection exports the correct code',()=>assert.equal(materialItems(ws,month,'KOREA').find(m=>m.list_no===5).item_code,'FKK-03'));
check('same code versions retain separate descriptions and images by month',()=>{
 const images=(id,month)=>[{id,name:id+'.png',months:[month]}];
 const rows=[{id:'s',destination:'STANDARD',list_no:1,item_code:'SAME',outputs:['label'],versions:[{id:'s1',item_code:'SAME',description:'old',months:['old'],images:images('old-image','old')},{id:'s2',item_code:'SAME',description:'new',months:['new'],images:images('new-image','new')}]},{id:'c',destination:'KOREA',list_no:1,item_code:'SAME',outputs:['label'],standardId:'s',versions:[{id:'c1',item_code:'SAME',description:'old',standardVersionId:'s1',months:['old'],images:[]},{id:'c2',item_code:'SAME',description:'new',standardVersionId:'s2',months:['new'],images:[]}]}];
 const synced=syncStandard(rows,rows), versions=synced[1].versions;
 assert.notEqual(versions[0].id,versions[1].id);
 assert.equal(versions[0].images[0].id,'old-image');assert.equal(versions[1].images[0].id,'new-image');
 const state={items:synced,reuse:[],months:[{id:'old',name:'old'},{id:'new',name:'new'}]};
 assert.equal(materialItems(state,state.months[0],'KOREA')[0].description,'old');
 assert.equal(materialItems(state,state.months[1],'KOREA')[0].images[0].id,'new-image');
});
const std=ws.items.find(m=>m.destination==='STANDARD'&&m.list_no===1);
std.outputs=['label','special','card'];
const single=structuredClone(ws);single.items=single.items.filter(m=>m.destination==='STANDARD');
check('sheet choices independent and Special-only supported',()=>{const result=calculate(single,month,[belgium],false);assert.ok(result.special.length);assert.ok(result.card.length);std.outputs=['special'];});
check('empty single-version images do not block output',()=>assert.doesNotThrow(()=>calculate(ws,month,[belgium])));
check('reuse flags are informational: green/yellow/red',()=>{const rules=[{id:'month',blocks:true},{id:'sku',blocks:false}];assert.equal(reuseState({conditions:[]},rules),'Reusable');assert.equal(reuseState({conditions:['sku']},rules),'Conditional reuse');assert.equal(reuseState({conditions:['month','sku']},rules),'Not reusable');});
const draft=structuredClone(ws.items),standard=draft.find(m=>m.destination==='STANDARD'&&m.list_no===2);standard.item_code='STD-EDIT';standard.versions[0].item_code='STD-EDIT';
const synced=syncStandard(ws.items,draft);
check('Standard updates inherited Brazil while preserving Mexico Replace',()=>{assert.equal(synced.find(m=>m.destination==='BRAZIL'&&m.list_no===2).item_code,'STD-EDIT');assert.equal(synced.find(m=>m.destination==='MEXICO'&&m.list_no===2).item_code,ws.items.find(m=>m.destination==='MEXICO'&&m.list_no===2).item_code);});
check('shared Standard images propagate by normalized version code across countries and row numbers',()=>{
 const image={id:'shared',name:'shared.png',months:[month.id,'another'],conditions:['sku']};
 const rows=[{id:'s',destination:'STANDARD',list_no:1,item_code:'CODE',versions:[{id:'sv',item_code:'CODE',months:[month.id],images:[image]}]},
 {id:'c',destination:'KOREA',list_no:7,item_code:'LOCAL',versions:[{id:'cv',item_code:' code ',months:[month.id],images:[]},{id:'private',item_code:'LOCAL',months:['another'],images:[{id:'local',months:['another']}]}]}];
 const result=syncStandardImages(rows);assert.equal(result[1].versions[0].images[0].id,'shared');assert.deepEqual(result[1].versions[0].images[0].months,[month.id]);assert.equal(result[1].versions[1].images[0].id,'local');assert.equal(rows[1].versions[0].images.length,0);
 rows[0].versions[0].images=[];assert.equal(syncStandardImages(rows)[1].versions[0].images.length,0);
});
check('new Standard versions and months reach subscribed Replace countries while private months win',()=>{
 const prev=[{id:'s',destination:'STANDARD',list_no:1,item_code:'STD',versions:[{id:'sv',item_code:'STD',months:[],images:[]}]},{id:'c',destination:'KOREA',list_no:1,item_code:'LOCAL',versions:[{id:'local',item_code:'LOCAL',months:['private'],images:[]},{id:'copy',item_code:'STD',standardVersionId:'sv',months:[],images:[]}]}];
 const draft=structuredClone(prev);draft[0].versions.push({id:'new',item_code:'NEW',months:['new-month','private'],images:[{id:'new-image',months:['new-month','private']}]});
 const out=syncStandard(prev,draft)[1];assert.equal(out.item_code,'LOCAL');assert.deepEqual(out.versions.find(v=>v.item_code==='NEW').months,['new-month']);assert.deepEqual(out.versions.find(v=>v.item_code==='NEW').images[0].months,['new-month']);assert.deepEqual(out.versions.find(v=>v.item_code==='LOCAL').months,['private']);
});
check('all existing Standard rows migrate image coverage once and clear shared-country warnings',()=>{
 const data={months:[{id:'sep',year:2026,month:9}],items:[1,2,3].flatMap(no=>[{id:'s'+no,destination:'STANDARD',list_no:no,item_code:'CODE'+no,versions:[{id:'v'+no,item_code:'CODE'+no,months:[],all:true,images:[{id:'im'+no,name:'26_Sep_STD_'+no+'.png',months:[]}]}]},{id:'c'+no,destination:'KOREA',list_no:no,item_code:'CODE'+no,versions:[{id:'cv'+no,item_code:'CODE'+no,months:[],all:true,images:[]}]}])};
 assert.equal(reconcileStandardWorkspace(data),true);
 for(let no=1;no<=3;no++){assert.equal(hasMaterialImage(data.items,'KOREA',no,'CODE'+no,'sep'),true);assert.equal(hasMaterialImage(data.items,'MEXICO',no,'CODE'+no,'sep'),true);}
 assert.equal(reconcileStandardWorkspace(data),false);
 data.items[0].versions[0].images[0].months=[];reconcileStandardWorkspace(data);assert.equal(hasMaterialImage(data.items,'KOREA',1,'CODE1','sep'),false);
});
check('ambiguous old Standard images are never assigned arbitrarily',()=>{
 const row={id:'s',destination:'STANDARD',list_no:1,item_code:'CODE',versions:[{id:'v',item_code:'CODE',images:[{id:'a',name:'26_Sep_A.png',months:[]},{id:'b',name:'26_Sep_B.png',months:[]}],months:[]}]};
 const data={months:[{id:'sep',year:2026,month:9}],items:[row]};reconcileStandardWorkspace(data);assert.ok(data.items[0].versions[0].images.every(im=>!im.months.length));
 const split={months:[{id:'mid',year:2026,month:9},{id:'end',year:2026,month:9}],items:[{...row,versions:[{...row.versions[0],images:[row.versions[0].images[0]]}]}]};reconcileStandardWorkspace(split);assert.equal(split.items[0].versions[0].images[0].months.length,0);
});
check('missing warning refresh follows added and deleted shared images across every output',()=>{
 const items=[{destination:'STANDARD',list_no:3,versions:[{item_code:'CODE',images:[]}]}];
 const versions=[{id:'v',result:{missing:[],label:[{item:{destination:'KOREA',list_no:3,item_code:'CODE'}}],special:[{item:{destination:'KOREA',list_no:3,item_code:'CODE'}}]}}];
 assert.equal(missingMaterialImages(versions,items,'sep','v').length,1);
 items[0].versions[0].images=[{months:['sep']}];assert.equal(missingMaterialImages(versions,items,'sep','v').length,0);
 items[0].versions[0].images=[];assert.equal(missingMaterialImages(versions,items,'sep','v').length,1);
});
const before={id:'v1',name:'Before',orders:[belgium],result:calculate(ws,month,[belgium],false)};
const after=structuredClone(before);after.id='v2';after.name='After';after.result.label=after.result.label.slice(1);
check('comparison includes completely removed materials',()=>assert.ok(compareSnapshots(before,after).materials.some(r=>r.beforeRequired>0&&r.afterRequired===0)));
const snapshot=JSON.stringify(compareSnapshots(before,after));ws.items.forEach(m=>m.item_code='LATER-EDIT');
check('later Master Data edits cannot alter saved comparison',()=>assert.equal(JSON.stringify(compareSnapshots(before,after)),snapshot));
for(const name of ['order-import','download']){let code=await fs.readFile('lib/'+name+'.ts','utf8');code=code.replace("from './order-rows'","from './check-order-rows.mjs'");code=code.replace("from './size-settings'","from './check-size-settings.mjs'").replace("from './model'","from './check-model.mjs'");await fs.writeFile('.sites-runtime/check-'+name+'.mjs',ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);}
let reportSource=await fs.readFile('lib/comparison-report.ts','utf8');reportSource=reportSource.replace("from './comparison'","from './check-comparison.mjs'").replace("from './po-details'","from './check-po-details.mjs'");await fs.writeFile('.sites-runtime/check-comparison-report.mjs',ts.transpileModule(reportSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
let detailsSource=await fs.readFile('lib/po-details.ts','utf8');await fs.writeFile('.sites-runtime/check-po-details.mjs',ts.transpileModule(detailsSource.replace("from './model'","from './check-model.mjs'").replace("from './material-state'","from './check-material-state.mjs'"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
let source=await fs.readFile('lib/excel.ts','utf8');source=source.replace("from './comparison-report'","from './check-comparison-report.mjs'");source=source.replaceAll("from './download'","from './check-download.mjs'").replace("from './order-import'","from './check-order-import.mjs'");source=source.replace("from './model'","from './check-model.mjs'").replace("from './template-export'","from './check-template-export.mjs'");
await fs.writeFile('.sites-runtime/check-excel.mjs',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const {importOrders,comparisonWorkbook}=await import('../.sites-runtime/check-excel.mjs');
const comparisonBook=await comparisonWorkbook({...compareSnapshots(before,after),beforeVersion:before,afterVersion:after});assert.equal(comparisonBook.worksheets[0].name,'Summary');assert.ok(comparisonBook.getWorksheet('Label'));assert.ok(comparisonBook.getWorksheet('Wrapping Paper'));assert.equal(comparisonBook.getWorksheet('PO Changes').views[0].ySplit,5);const comparisonBytes=await comparisonBook.xlsx.writeBuffer();const reloadedComparison=new ExcelJS.Workbook();await reloadedComparison.xlsx.load(comparisonBytes);assert.ok(reloadedComparison.getWorksheet('Summary').getCell('A2').value.includes('Before'));console.log('PASS comparison grouped sheets, frozen headers and Excel serialization');checks++;
for(const [company,path,expected] of [['WSV','[WSV] TOTAL BALANCE (30th Sep, 2026).xlsx',132],['CTC','CTC_ New Order 9.29_TOTAL BALANCE.xlsx',25]]){
  const content=await fs.readFile('test-fixtures/'+path),file=new File([content],path);
  const orders=await importOrders(file,company,makeWorkspace(company).profiles);assert.equal(orders.length,expected);assert.equal(new Set(orders.map(o=>o.id)).size,orders.length);assert.ok(orders.every(o=>o.qty.reduce((a,b)=>a+b,0)===o.total));console.log(`PASS actual ${company} import: ${orders.length} rows, unique keys, exact size totals`);checks++;
  await assert.rejects(importOrders(file,company,makeWorkspace(company).profiles.map(p=>({...p,sizes:p.sizes.slice(0,-1)}))),/UK 13.5 has/);checks++;
}
// Exercise the production importer on the changed customer report and layout variants.
const raw=new ExcelJS.Workbook();await raw.xlsx.readFile('test-fixtures/WSV-20261006-total-balance.xlsx');
const report=raw.getWorksheet('CMH3-Tango');
const original=await importOrders(new File([await fs.readFile('test-fixtures/WSV-20261006-total-balance.xlsx')],'WSV-new.xlsx'),'WSV',makeWorkspace('WSV').profiles);
assert.equal(original.length,186);assert.equal(original.reduce((sum,o)=>sum+o.total,0),45625);checks++;
console.log('PASS new WSV Customer PO report: 186 POs / 45,625 pairs');
function variant(company,offset=0){
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Renamed order details');
 const unwrap=v=>v&&typeof v==='object'&&!(v instanceof Date)?v.result??v.text??v.richText?.map(r=>r.text).join('')??'':v;
 report.eachRow((row,r)=>row.eachCell((cell,c)=>{const target=c===10?12:c===12?10:c;sheet.getCell(r+offset,target).value=unwrap(cell.value);}));
 for(let r=4;r<=7;r++){sheet.getCell(r+offset,8).value=company+'’s PO No.';sheet.getCell(r+offset,9).value=' customer\n PO number ';sheet.getCell(r+offset,12).value=' buyer_item # ';sheet.getCell(r+offset,10).value='Destination country';sheet.getCell(r+offset,14).value='Mode of shipment';sheet.getCell(r+offset,52).value='Total Quantity';}
 if(company==='CTC')for(const order of original){const r=order.source.row;sheet.getCell(r,9).value='PO'+String(r).padStart(9,'0');sheet.getCell(r,8).value='CTC-'+r;}
 return {book,sheet};
}
const asFile=async book=>new File([await book.xlsx.writeBuffer()],'layout-variant.xlsx');
for(const company of ['WSV','CTC']){
 const {book}=variant(company,company==='WSV'?20:0),rows=await importOrders(await asFile(book),company,makeWorkspace(company).profiles);
 assert.equal(rows.length,186);assert.equal(rows.reduce((sum,o)=>sum+o.total,0),45625);
 assert.deepEqual(rows.map(o=>[o.sku,o.country,o.mos,o.qty]),original.map(o=>[o.sku,o.country,o.mos,o.qty]));checks++;
 console.log('PASS '+company+' aliases, punctuation, line breaks, reordered columns and renamed sheet preserve every size quantity');
 await assert.rejects(importOrders(await asFile(book),company==='WSV'?'CTC':'WSV',makeWorkspace(company).profiles),/correct workspace/);checks++;
}
let changed=variant('WSV');changed.sheet.getCell(4,60).value='TOTAL';
await assert.rejects(importOrders(await asFile(changed.book),'WSV',makeWorkspace('WSV').profiles),/Duplicate source column/);checks++;
changed=variant('WSV');for(let r=4;r<=7;r++)changed.sheet.getCell(r,14).value='Unknown method';
await assert.rejects(importOrders(await asFile(changed.book),'WSV',makeWorkspace('WSV').profiles),/Missing column MOS/);checks++;
changed=variant('WSV');changed.sheet.getCell(8,52).value=999;
await assert.rejects(importOrders(await asFile(changed.book),'WSV',makeWorkspace('WSV').profiles),/does not match TOTAL/);checks++;
changed=variant('WSV');const second=changed.book.addWorksheet('Another valid report');changed.sheet.eachRow((row,r)=>row.eachCell((cell,c)=>{second.getCell(r,c).value=cell.value;}));
await assert.rejects(importOrders(await asFile(changed.book),'WSV',makeWorkspace('WSV').profiles),/Multiple PO data sheets/);checks++;
console.log('PASS duplicate headers, missing MOS, wrong totals and ambiguous sheets remain blocked');
const {importLayout,savedImportMapping,inspectOrderFile}=await import('../.sites-runtime/check-order-import.mjs');
const file=await asFile(variant('WSV').book),profile=makeWorkspace('WSV').profiles[0];
const detected=await inspectOrderFile(file,'WSV');assert.equal(detected[0].header,4);
const layout=await importLayout(file,'WSV','Renamed order details',4,profile),mapping=layout.mapping;
const manual=await importOrders(file,'WSV',[profile],mapping);assert.equal(manual.length,186);
const display=o=>[o.factoryPo,o.onPo,o.sku,o.country,o.mos,o.exgo,o.warehouse,o.model,o.color,o.brand,o.season,o.createDate,o.price,o.type,o.category,o.originalPo,o.gender,o.total,o.qty];
assert.deepEqual(manual.map(display),original.map(display));checks++;
console.log('PASS manual mapping produces the same displayed PO information and every size quantity');
const rawText=v=>v==null?'':v instanceof Date?v.toISOString().slice(0,10):typeof v==='object'?rawText(v.result??v.text??v.richText?.map(r=>r.text).join('')??''):String(v).trim();
const sourceColumns={factoryPo:8,onPo:9,sku:10,country:12,mos:14,exgo:53,warehouse:13,model:15,color:11,brand:1,season:2,createDate:3,price:4,type:5,category:6,originalPo:17,gender:16};
let sourceCount=0;report.eachRow(row=>{if(/^WSV[0-9]/.test(rawText(row.getCell(8).value)))sourceCount++;});assert.equal(sourceCount,original.length);
for(const order of original){const row=report.getRow(order.source.row);for(const [field,column] of Object.entries(sourceColumns))assert.equal(order[field],rawText(row.getCell(column).value));assert.equal(order.total,Number(rawText(row.getCell(52).value)));assert.deepEqual(order.qty,Array.from({length:21},(_,i)=>Number(rawText(row.getCell(22+i).value)||0)));}checks++;
console.log('PASS every displayed field, every source PO and every size reconciles directly to the original workbook cells');

const swapped=structuredClone(mapping);[swapped.fields.onPo,swapped.fields.sku]=[swapped.fields.sku,swapped.fields.onPo];
await assert.rejects(importOrders(file,'WSV',[profile],swapped),/header belongs to sku/);checks++;
const wrongCountry=structuredClone(mapping);[wrongCountry.fields.country,wrongCountry.fields.warehouse]=[wrongCountry.fields.warehouse,wrongCountry.fields.country];
await assert.rejects(importOrders(file,'WSV',[profile],wrongCountry),/header belongs to warehouse/);checks++;
const wrongSize=structuredClone(mapping);[wrongSize.sizes[0].column,wrongSize.sizes[1].column]=[wrongSize.sizes[1].column,wrongSize.sizes[0].column];
await assert.rejects(importOrders(file,'WSV',[profile],wrongSize),/source US \/ UK size disagrees/);checks++;
await assert.rejects(importOrders(file,'WSV',[profile],{...mapping,dataStart:9}),/already contains PO data/);checks++;
const unknown=variant('WSV');for(let r=4;r<=7;r++)for(const col of Object.values(mapping.fields).filter(Boolean))unknown.sheet.getCell(r,col).value='Custom field '+col;
const unfamiliar=await asFile(unknown.book),unknownLayout=await importLayout(unfamiliar,'WSV',unknown.sheet.name,4,profile);
await assert.rejects(importOrders(unfamiliar,'WSV',[profile]),/No PO data sheet/);
const explicit={...mapping,sheet:unknown.sheet.name};assert.deepEqual((await importOrders(unfamiliar,'WSV',[profile],explicit)).map(display),original.map(display));checks++;
const template={id:'test',company:'WSV',name:'Custom',signature:unknownLayout.signature,mapping:explicit,created:'2026-10-07'};
const relocated=new ExcelJS.Workbook(),newSheet=relocated.addWorksheet('New sheet name');unknown.sheet.eachRow((row,r)=>row.eachCell((cell,c)=>{newSheet.getCell(r+20,c).value=cell.value;}));
const nextFile=await asFile(relocated),match=await savedImportMapping(nextFile,'WSV',[template]);assert.equal(match.mapping.header,24);assert.equal(match.mapping.dataStart,28);
assert.deepEqual((await importOrders(nextFile,'WSV',[profile],match.mapping)).map(display),original.map(display));assert.equal(await savedImportMapping(nextFile,'CTC',[template]),undefined);checks++;
console.log('PASS saved templates recognize renamed / shifted layouts and remain isolated by company');
const copy=relocated.addWorksheet('Ambiguous copy');newSheet.eachRow((row,r)=>row.eachCell((cell,c)=>{copy.getCell(r,c).value=cell.value;}));
await assert.rejects(savedImportMapping(await asFile(relocated),'WSV',[template]),/More than one saved/);checks++;
console.log('PASS swapped PO / SKU / country / size columns, skipped POs and ambiguous templates cannot import');
console.log(`${checks} material/import checks passed`);
