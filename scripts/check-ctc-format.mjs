// Run check-template.mjs first to prepare the standalone module graph.
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {unzipSync} from 'fflate';
import {exportTemplate} from '../.sites-runtime/check-template-export.mjs';
import {calculate} from '../.sites-runtime/check-model.mjs';
import {makeWorkspace} from '../.sites-runtime/check-bootstrap.mjs';
const old=execFileSync('git',['show','b6879e36c25fdc6e39ba529d24a482eb35b5b6a2:lib/template-export.ts'],{encoding:'utf8'});
await fs.writeFile('.sites-runtime/before-ctc-format.mjs',ts.transpileModule(old,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const before=await import('../.sites-runtime/before-ctc-format.mjs');
const template=await fs.readFile('public/templates/purchase.xlsx');
for(const company of ['WSV','CTC'])for(const production of [false,true]){
 const ws=makeWorkspace(company),month=ws.months[0],orders=structuredClone(month.orders.slice(0,8));
 assert.ok(orders.length);orders[0].gender='WOMEN';orders[0].model='Cloudmonster Hyper 3 LightSpray';orders[0].warehouse='LONG WAREHOUSE NAME FOR WIDTH CHECK';
 for(const item of ws.items){item.description+='\nSecond description line';for(const v of item.versions)v.description+='\nSecond description line';}
 const result=calculate(ws,month,orders,!production),snapshot=JSON.stringify(result);
 const previous=await before.exportTemplate(result,company,production,template),next=await exportTemplate(result,company,production,template);
 assert.equal(JSON.stringify(result),snapshot,'format must not mutate calculation');
 const a=new ExcelJS.Workbook(),b=new ExcelJS.Workbook();await a.xlsx.load(previous);await b.xlsx.load(next);
 if(company==='WSV'){
  const x=unzipSync(new Uint8Array(previous)),y=unzipSync(new Uint8Array(next));assert.deepEqual(Object.keys(x),Object.keys(y));for(const key of Object.keys(x))assert.deepEqual(x[key],y[key],`WSV unchanged ${key}`);
 }else for(const s of a.worksheets){
  const t=b.getWorksheet(s.name);assert.deepEqual(t.getSheetValues(),s.getSheetValues(),`${s.name} all values/formulas unchanged`);
  assert.deepEqual(t.model.merges,s.model.merges);assert.deepEqual(t.conditionalFormattings,s.conditionalFormattings);assert.equal(t.state,s.state);
  s.columns.forEach((c,i)=>{assert.ok(t.getColumn(i+1).width>=c.width);assert.equal(t.getColumn(i+1).hidden,c.hidden);});
  s.eachRow({includeEmpty:true},(row,r)=>row.eachCell({includeEmpty:true},(cell,c)=>{
   const actual=t.getCell(r,c);assert.equal(actual.alignment.vertical,'middle',`${s.name} ${actual.address}`);
   const expected=structuredClone(cell.style);if(!expected.font)expected.font=structuredClone(a.model.styles?.fonts?.[0]||actual.font);if(!expected.fill)expected.fill={type:'pattern',pattern:'none'};if(!expected.border)expected.border={};expected.alignment={...expected.alignment,vertical:'middle'};assert.deepEqual(actual.style,expected,`${s.name} ${actual.address} preserve all other styling`);
  }));
 }
 console.log(`PASS ${company} ${production?'production':'purchase'}: ${company==='WSV'?'all workbook parts unchanged':'values, formulas, merges, colors, borders, hidden columns preserved; widths fit and cells vertically centered'}`);
}
