import fs from 'node:fs/promises';
import ts from 'typescript';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
await fs.mkdir('.sites-runtime',{recursive:true});
for(const name of ['order-rows','template-export','material-state','po-state','comparison','size-settings','model','bootstrap']){
  let src=await fs.readFile(`lib/${name}.ts`,'utf8');
  src=src.replace("from './order-rows'","from './check-order-rows.mjs'");
  src=src.replace("from './size-settings'","from './check-size-settings.mjs'");
  src=src.replace("from './model'","from './check-model.mjs'").replace("from './po-state'","from './check-po-state.mjs'").replace("from './comparison'","from './check-comparison.mjs'");
  src=src.replace("from './material-state'","from './check-material-state.mjs'");
  if(name==='model'||name==='bootstrap')src=src.replace("import seed from './seed.json';",'const seed='+await fs.readFile('lib/seed.json','utf8')+';');
  await fs.writeFile(`.sites-runtime/check-${name}.mjs`,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const {exportTemplate}=await import('../.sites-runtime/check-template-export.mjs');
const {calculate}=await import('../.sites-runtime/check-model.mjs');
const {makeWorkspace}=await import('../.sites-runtime/check-bootstrap.mjs');
const bytes=await fs.readFile('public/templates/purchase.xlsx');
const template=new ExcelJS.Workbook();await template.xlsx.load(await fs.readFile('test-fixtures/Sub_material_2026_11_v1 (4).xlsx'));
const ws=makeWorkspace('WSV'),month=ws.months[0];
const sample=template.getWorksheet('Outer - Empty - Inner');
const ids=new Set();for(let r=5;r<sample.rowCount;r++)if(sample.getRow(r).getCell(7).value)ids.add(sample.getRow(r).getCell(7).value);
const orders=month.orders.filter(o=>ids.has(o.factoryPo));assert.equal(orders.length,19);
for(const company of ['WSV','CTC'])for(const production of [false,true]){
  const result=calculate(ws,month,orders,!production);
  const data=await exportTemplate(result,company,production,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const book=new ExcelJS.Workbook();await book.xlsx.load(data);
  assert.equal(book.worksheets.length,6);assert.equal(book.getWorksheet('Outer - Empty - Inner').columnCount,54);
  assert.equal(book.getWorksheet('Special Label').columnCount,20);
  const special=book.getWorksheet('Special Label');
  if(special.rowCount>7)for(let c=1;c<=20;c++)assert.equal(special.getRow(special.rowCount).getCell(c).border.bottom.style,'thin','Special last-row bottom border');
  const name=production?'Label - Special - Card':'Label';const label=book.getWorksheet(name);
  assert.equal(label.columnCount,46);assert.equal(label.getCell('G1').value,company==='WSV'?"WSV'S PO":'CTC PO');
  assert.equal(label.getCell('AS8').value,production?result.orders[0].exgo:null);assert.equal(label.getCell('AT8').value,null);
  assert.equal(label.getCell('V2').value,'Item Size (EU)');assert.equal(label.getCell('W2').value,36);
  const outer=book.getWorksheet('Outer - Empty - Inner');assert.equal(outer.conditionalFormattings.length,7);
  assert.equal(outer.getColumn(4).hidden,true);assert.equal(outer.getColumn(16).hidden,true);
  assert.equal(outer.getCell('AP'+outer.rowCount).value,'TOTAL');
  assert.equal(outer.getCell('AU1').value,month.settings.groups[0].empty);
  assert.equal(outer.getCell('AY1').value,month.settings.groups[0].inner);
  assert.equal(book.getWorksheet('Card').state,production?'hidden':'visible');
  await fs.writeFile(`.sites-runtime/${company}-${production?'usage':'purchase'}.xlsx`,new Uint8Array(data));
  if(company==='WSV'&&!production){
    for(let r=5;r<outer.rowCount;r++)for(let c=20;c<=54;c++)if(c!==42){
      const actual=outer.getRow(r).getCell(c).value||0,expected=sample.getRow(r).getCell(c).value||0;
      assert.equal(actual,expected,`Known output mismatch ${outer.getRow(r).getCell(c).address}`);
    }
  }
  console.log(`PASS ${company} ${production?'production':'purchase'}: reference columns, merges, hidden columns, totals and conditional formatting`);
}
// A smaller size profile and two packaging groups must shrink all relevant regions.
const small=structuredClone(month);small.settings.groups=[{...small.settings.groups[0],from:3,to:3.5},{...small.settings.groups[1],from:4,to:4.5}];
small.profiles=ws.profiles.map(p=>({...p,sizes:p.sizes.slice(0,4)}));small.profileId=small.profiles[0].id;
const selected=orders.slice(0,2).map(o=>({...o,sizes:o.sizes.slice(0,4),qty:o.qty.slice(0,4),total:o.qty.slice(0,4).reduce((a,b)=>a+b,0)}));
const output=await exportTemplate(calculate(ws,small,selected), 'WSV',false,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const book=new ExcelJS.Workbook();await book.xlsx.load(output);assert.equal(book.getWorksheet('Label').columnCount,29);assert.equal(book.getWorksheet('Outer - Empty - Inner').columnCount,34);
console.log('PASS dynamic size/group counts');

for(const company of ['WSV','CTC']){const full=calculate(ws,month,orders);const selected=await exportTemplate(full,company,false,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),['Label','Stuffing Paper']);const chosenBook=new ExcelJS.Workbook();await chosenBook.xlsx.load(selected);assert.deepEqual(chosenBook.worksheets.map(s=>s.name),['Label','Stuffing Paper']);const completeBook=new ExcelJS.Workbook();await completeBook.xlsx.load(await exportTemplate(full,company,false,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)));assert.deepEqual(chosenBook.getWorksheet('Label').getSheetValues(),completeBook.getWorksheet('Label').getSheetValues());assert.deepEqual(chosenBook.getWorksheet('Stuffing Paper').getSheetValues(),completeBook.getWorksheet('Stuffing Paper').getSheetValues());}await assert.rejects(()=>exportTemplate(calculate(ws,month,orders),'WSV',false,undefined,[]),/at least one/);console.log('PASS selected Excel sheets WSV/CTC: only requested sheets, identical values, empty selection rejected');
