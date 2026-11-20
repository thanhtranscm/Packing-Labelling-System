import fs from 'node:fs/promises';
import ts from 'typescript';
import assert from 'node:assert/strict';
await fs.mkdir('.sites-runtime',{recursive:true});
await fs.writeFile('.sites-runtime/group-note-material-state.mjs',ts.transpileModule(await fs.readFile('lib/material-state.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const {materialImageNote}=await import('../.sites-runtime/group-note-material-state.mjs');
for(const company of ['WSV','CTC']){
 const standard={destination:'STANDARD',imageNote:'Common Standard note',versions:[{id:'s',item_code:'CODE'}]},country={destination:'JAPAN',versions:[{id:'v',item_code:'CODE',standardVersionId:'s'},{id:'private',item_code:'PRIVATE'}]},items=[standard,country];
 assert.equal(materialImageNote(items,standard,standard.versions[0]),standard.imageNote);assert.equal(materialImageNote(items,country,country.versions[0]),standard.imageNote);
 assert.equal(materialImageNote(items,country,country.versions[1]),'');country.imageNote='Own country note';for(const v of country.versions)assert.equal(materialImageNote(items,country,v),'Own country note');country.imageNote='';assert.equal(materialImageNote(items,country,country.versions[0]),'');
 console.log('PASS '+company+' common notes: all own versions, Standard sharing, private code isolation, explicit override and clearing.');
}
