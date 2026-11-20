import fs from 'node:fs/promises';
import ts from 'typescript';
import ExcelJS from 'exceljs';
import assert from 'node:assert/strict';
for(const name of ['material-state','master-update']){const source=await fs.readFile(`lib/${name}.ts`,'utf8');await fs.writeFile(`.sites-runtime/master-${name}.mjs`,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText)}
const {countryMaterialTone}=await import('../.sites-runtime/master-material-state.mjs');
const {reconcileMaster}=await import('../.sites-runtime/master-master-update.mjs');
const seed=JSON.parse(await fs.readFile('lib/seed.json','utf8')).WSV.master.masterItems;
const book=new ExcelJS.Workbook();await book.xlsx.readFile('test-fixtures/Master Data.xlsx');
const source=[];book.worksheets[0].eachRow((r,n)=>{if(n>1&&r.getCell(3).value&&r.getCell(2).value)source.push({country:String(r.getCell(3).value).trim(),no:r.getCell(2).value,code:String(r.getCell(5).value||'').trim().replace(/^\.+$/,'')})});
for(const row of source){if(!row.code)continue;const m=seed.find(m=>m.destination===row.country&&m.list_no===row.no);assert.ok(m,`${row.country} No.${row.no} missing`);assert.equal(m.item_code.trim(),row.code,`${row.country} No.${row.no}`)}
const active=source.filter(r=>r.code),standard=active.filter(r=>r.country==='STANDARD');
for(const country of new Set(source.map(r=>r.country))){const rows=active.filter(r=>r.country===country),replaced=rows.some(r=>standard.some(s=>s.no===r.no&&s.code!==r.code)),extra=rows.some(r=>!standard.some(s=>s.no===r.no));const expected=country==='STANDARD'?'':replaced&&extra?'both':replaced?'replace':extra?'extra':'';assert.equal(countryMaterialTone(seed,country),expected);console.log('PASS',country,expected||'standard')}
assert.equal(countryMaterialTone(seed,'BRAZIL'),'extra');assert.equal(countryMaterialTone(seed,'URUGUAY'),'both');assert.equal(countryMaterialTone(seed,'COLOMBIA'),'replace');
const d={items:[{destination:'KOREA',list_no:5,item_code:'FKK-02',versions:[{id:'old',item_code:'FKK-02',months:['old'],images:[{id:'image'}]},{id:'current',item_code:'FKK-03',description:'Card',months:['new'],images:[]}]}],months:[{versions:[{name:'historical',result:{code:'FKK-02'}}]}]};
const before=structuredClone(d);assert.equal(reconcileMaster(d,'WSV'),true);assert.equal(d.items[0].item_code,'FKK-03');assert.equal(d.items[0].displayVersion,'current');assert.deepEqual(d.items[0].versions,before.items[0].versions);assert.deepEqual(d.months,before.months);assert.equal(reconcileMaster(d,'WSV'),false);
console.log('PASS master reconciliation retains historical versions, images and coverage');
const {itemMaterialTone}=await import('../.sites-runtime/master-material-state.mjs');
const additions=structuredClone(seed.filter(m=>m.destination==='BRAZIL'));additions.forEach(m=>m.destination='NEW COUNTRY');const original=[...seed,...additions];
assert.equal(countryMaterialTone(original,'NEW COUNTRY'),'extra');assert.equal(itemMaterialTone(original,additions.find(m=>m.list_no===1)),'');
additions.find(m=>m.list_no===2).item_code='NEW REPLACEMENT';assert.equal(countryMaterialTone(original,'NEW COUNTRY'),'both');assert.equal(itemMaterialTone(original,additions.find(m=>m.list_no===2)),'replace');assert.equal(itemMaterialTone(original,additions.find(m=>m.list_no===4)),'extra');
const replaceOnly=original.filter(m=>m.destination!=='NEW COUNTRY'||m.list_no<=3);assert.equal(countryMaterialTone(replaceOnly,'NEW COUNTRY'),'replace');
additions.find(m=>m.list_no===2).item_code='ON-GX019';assert.equal(countryMaterialTone(original,'NEW COUNTRY'),'extra');
console.log('PASS new country transitions Extra → Both → Replace / Extra and per-item Standard remains uncolored');
const auditSource=await fs.readFile('lib/audit-summary.ts','utf8');await fs.writeFile('.sites-runtime/check-audit-summary.mjs',ts.transpileModule(auditSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const {auditSummary}=await import('../.sites-runtime/check-audit-summary.mjs');
assert.deepEqual(auditSummary({changes:[{path:'months / November 2026.versions / sample.xlsx',after:{name:'sample.xlsx',POs:['A','B']}},{path:'months / November 2026.latest / A',after:{factoryPo:'A'}}]}).map(r=>r.after),['November 2026','sample.xlsx','2']);
assert.equal(auditSummary({changes:[{path:'items / KOREA No.5.displayVersion',after:'39869a9a-7fa8-4f79-ac2a-b95c389f64c7'},{path:'masterReference',after:'2026-10-05'}]}).length,0);
console.log('PASS history summarizes generated files and suppresses internal identifiers');
