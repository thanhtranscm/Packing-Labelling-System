import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
await fs.mkdir('.sites-runtime',{recursive:true});
await fs.writeFile('.sites-runtime/check-master-save.mjs',ts.transpileModule(await fs.readFile('lib/master-save.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const {automaticMasterChanges,rebaseMasterDraft}=await import('../.sites-runtime/check-master-save.mjs');
const base=[{id:'a',description:'Original',qty:1,versions:[{id:'v',item_code:'CODE',months:[],all:false,images:[{id:'im',months:[],conditions:[]}]}]}];
const draft=structuredClone(base);draft[0].description='Edited';draft[0].qty=2;draft[0].versions[0].images[0].conditions=['manual'];
const after=structuredClone(draft);after[0].versions[0].months=['sep'];after[0].versions[0].images[0].months=['sep'];after[0].versions[0].images.push({id:'new',months:['oct'],conditions:[]});
const saved=automaticMasterChanges(base,draft,after);
assert.equal(saved[0].description,'Original');assert.equal(saved[0].qty,1);assert.deepEqual(saved[0].versions[0].images[0].conditions,[]);
assert.deepEqual(saved[0].versions[0].months,['sep']);assert.deepEqual(saved[0].versions[0].images[0].months,['sep']);assert.equal(saved[0].versions[0].images.length,2);
const rebased=rebaseMasterDraft(base,after,saved);assert.equal(rebased[0].description,'Edited');assert.equal(rebased[0].qty,2);assert.deepEqual(rebased[0].versions[0].images[0].conditions,['manual']);
const cleanAfter=structuredClone(base);cleanAfter[0].versions[0].images[0].months=['sep'];const cleanSaved=automaticMasterChanges(base,base,cleanAfter);assert.deepEqual(rebaseMasterDraft(base,cleanAfter,cleanSaved),cleanSaved);
const removed=structuredClone(draft);removed[0].versions[0].images=[];assert.deepEqual(automaticMasterChanges(base,draft,removed)[0].versions[0].images,[]);
const newDraft=structuredClone(draft);newDraft[0].versions.push({id:'unsaved',months:[],all:false,images:[]});const newAfter=structuredClone(newDraft);newAfter[0].versions[1].months=['sep'];assert.throws(()=>automaticMasterChanges(base,newDraft,newAfter),/Save all/);
const deletedDraft=[];assert.deepEqual(rebaseMasterDraft(base,deletedDraft,base),[]);
console.log('Master save separation: passed (draft fields, image upload/removal, month apply, clean state, new-version guard, staged deletion).');

const reuseAfter=structuredClone(draft);reuseAfter[0].versions[0].images[0].conditions=['automatic'];const reuseSaved=automaticMasterChanges(base,draft,reuseAfter);assert.deepEqual(reuseSaved[0].versions[0].images[0].conditions,['automatic']);assert.equal(reuseSaved[0].description,'Original');assert.equal(reuseSaved[0].qty,1);const reuseDraft=rebaseMasterDraft(base,reuseAfter,reuseSaved);assert.equal(reuseDraft[0].description,'Edited');assert.equal(reuseDraft[0].qty,2);console.log('Reuse auto-save preserves pending text/QTY edits: passed.');

const {restoreSavedReuse}=await import('../.sites-runtime/check-master-save.mjs');
const failed=structuredClone(after);failed[0].versions[0].images[0].reuse='Not reusable';
const rolled=restoreSavedReuse(base,failed);
assert.equal(rolled[0].description,'Edited');assert.equal(rolled[0].qty,2);
assert.deepEqual(rolled[0].versions[0].months,['sep']);assert.deepEqual(rolled[0].versions[0].images[0].months,['sep']);
assert.deepEqual(rolled[0].versions[0].images[0].conditions,[]);assert.equal('reuse' in rolled[0].versions[0].images[0],false);
assert.deepEqual(rolled[0].versions[0].images[1],failed[0].versions[0].images[1]);
assert.equal(failed[0].versions[0].images[0].reuse,'Not reusable');
const acknowledged=structuredClone(base);acknowledged[0].versions[0].images[0].conditions=['last successful choice'];
assert.deepEqual(restoreSavedReuse(acknowledged,failed)[0].versions[0].images[0].conditions,['last successful choice']);
console.log('Failed reuse save restores acknowledged choices, preserves drafts/new images and does not mutate input: passed.');

const noteAfter=structuredClone(draft);noteAfter[0].versions[0].images[0].note='Right shoe\nAbove logo';
const noteSaved=automaticMasterChanges(base,draft,noteAfter);
assert.equal(noteSaved[0].versions[0].images[0].note,'Right shoe\nAbove logo');assert.equal(noteSaved[0].description,'Original');assert.equal(noteSaved[0].qty,1);
const noteDraft=rebaseMasterDraft(base,noteAfter,noteSaved);assert.equal(noteDraft[0].description,'Edited');assert.equal(noteDraft[0].qty,2);
const clearNote=structuredClone(noteDraft);clearNote[0].versions[0].images[0].note='';assert.equal(automaticMasterChanges(noteSaved,noteDraft,clearNote)[0].versions[0].images[0].note,'');
console.log('Image notes save/clear separately without saving text/QTY/reuse drafts: passed.');

const groupStored=structuredClone(base);groupStored[0].imageNote='Apply to right shoe';
const groupDraft=rebaseMasterDraft(base,draft,groupStored);assert.equal(groupDraft[0].imageNote,'Apply to right shoe');assert.equal(groupDraft[0].description,'Edited');assert.equal(groupDraft[0].qty,2);assert.deepEqual(groupDraft[0].versions[0].images[0].conditions,['manual']);
console.log('Common image note save preserves pending Master Data/reuse drafts: passed.');
