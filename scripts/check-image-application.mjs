import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
await fs.mkdir('.sites-runtime',{recursive:true});
await fs.writeFile('.sites-runtime/check-image-application.mjs',ts.transpileModule(await fs.readFile('lib/image-application.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const {uploadImageMonths,imageNameIssue,validateImageMonths,validateImageMonthChanges,shortMonth,appliedMonthLabels,versionMonthOwner,validateVersionMonths}=await import('../.sites-runtime/check-image-application.mjs');
const months=[{id:'sep',year:2026,month:9},{id:'oct',year:2026,month:10}];
assert.deepEqual(uploadImageMonths({versions:[{}]},{images:[]},'sep'),['sep']);
assert.deepEqual(uploadImageMonths({versions:[{}]},{images:[{months:['sep']}]},'sep'),[]);
assert.throws(()=>uploadImageMonths({versions:[{},{}]},{months:['oct'],images:[]},'sep'),/version/);
assert.deepEqual(uploadImageMonths({versions:[{},{}]},{months:['sep'],images:[]},'sep'),['sep']);
assert.equal(imageNameIssue({name:'26_Sep_STD_Label.png',months:['sep']},months),'');
assert.equal(imageNameIssue({name:'RR_2026_Sep_STD_Label.png',months:['sep']},months),'');
assert.equal(imageNameIssue({name:'26_Sep_STD_Label.png',months:['oct']},months),'month');
assert.equal(imageNameIssue({name:'label.png',months:[]},months),'format');
assert.equal(imageNameIssue({name:'26_Xyz_Label.png',months:[]},months),'format');
assert.throws(()=>validateImageMonths(['sep','oct']),/one month/);
assert.doesNotThrow(()=>validateImageMonths(['sep']));
assert.doesNotThrow(()=>validateImageMonths([]));
const rows=(months)=>[{id:'item',versions:[{id:'version',images:[{id:'image',months}]}]}];
assert.throws(()=>validateImageMonthChanges(rows(['sep']),rows(['sep','oct'])),/one month/);
assert.doesNotThrow(()=>validateImageMonthChanges(rows(['sep','oct']),rows(['sep','oct'])));
assert.doesNotThrow(()=>validateImageMonthChanges(rows(['sep','oct']),rows(['oct'])));
console.log('15 image application/name checks passed');

assert.equal(shortMonth({year:2027,month:1,prefix:"Mid"}),"Mid 01/27");assert.equal(shortMonth({year:2027,month:1,prefix:"End"}),"End 01/27");assert.equal(shortMonth({year:2027,month:1,prefix:""}),"01/27");const phases=[{id:"mid",year:2027,month:1,prefix:"Mid"},{id:"end",year:2027,month:1,prefix:"End"}];assert.equal(appliedMonthLabels(["mid"],phases),"Mid 01/27");assert.equal(appliedMonthLabels(["mid","end"],phases),"Mid 01/27, End 01/27");console.log("Prefixed application months: 5 checks passed.");

const versionItem={versions:[{id:"v1",item_code:"CODE1",months:["sep"]},{id:"v2",item_code:"CODE2",months:[]}]};assert.equal(versionMonthOwner(versionItem,"v2","sep").id,"v1");assert.equal(versionMonthOwner(versionItem,"v1","sep"),undefined);assert.throws(()=>validateVersionMonths(versionItem,"v2",["sep"],months),/already applied/);assert.doesNotThrow(()=>validateVersionMonths(versionItem,"v2",["oct"],months));assert.deepEqual(versionItem.versions[0].months,["sep"]);console.log("Version month ownership: 5 checks passed.");
