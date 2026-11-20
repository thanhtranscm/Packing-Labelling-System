import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import ts from 'typescript';
await fs.mkdir('.sites-runtime',{recursive:true});await fs.writeFile('.sites-runtime/check-month-order.mjs',ts.transpileModule(await fs.readFile('lib/month-order.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);await fs.writeFile('.sites-runtime/check-balance-review.mjs',ts.transpileModule((await fs.readFile('lib/balance-review.ts','utf8')).replace("'./month-order'","'./check-month-order.mjs'"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const {reviewBalance,reclassifySavedBalance}=await import('../.sites-runtime/check-balance-review.mjs');
const make=(factoryPo,onPo,mos='SEA',qty=10)=>({id:factoryPo||onPo+'|'+mos,factoryPo,onPo,mos,sku:'ABC123',country:'VIETNAM',total:qty,sizes:[{uk:7}],qty:[qty]});
const a=make('WSV001','PO123456'),b=make('WSV002','PO123457'),c=make('WSV003','PO123458'),n=make('WSV004','PO123459');const months=[{id:'m1',orders:[a,b,c],latest:[a,b,c]}];const before=JSON.stringify(months);let fresh=[{...a},{...b,qty:[11],total:11},n];let out=reviewBalance(months,fresh,'WSV');assert.deepEqual(out.reports[0].rows.map(x=>x.status),['same','changed','missing']);assert.equal(out.unassigned[0].factoryPo,'WSV004');assert.equal(JSON.stringify(months),before);assert.deepEqual(out.reports[0].rows[1].changes.map(x=>x.label),['QTY','UK 7']);
const x=make('','PO123456','SEA'),air=make('','PO123456','AIR');out=reviewBalance([{id:'m',orders:[x]}],[air],'CTC');assert.equal(out.reports[0].rows[0].status,'changed');assert.equal(out.reports[0].rows[0].changes[0].label,'MOS');out=reviewBalance([{id:'m',orders:[{...x,mos:'ROAD'}]}],[x,air],'CTC');assert.equal(out.reports[0].rows[0].status,'ambiguous');assert.equal(out.unassigned.length,0);assert.equal(out.ambiguous.length,2);
out=reviewBalance([{id:'m',orders:[{...a,exgo:'JAN'}]}],[a],'WSV');assert.equal(out.reports[0].rows[0].status,'unverified');assert.equal(out.reports[0].rows[0].changes[0].unverified,true);
out=reviewBalance([{id:'m',orders:[a],latest:[b],controlCleared:true}],[b],'WSV');assert.equal(out.reports[0].rows.length,1);assert.equal(out.reports[0].rows[0].origin,'published');assert.equal(out.reports[0].rows[0].status,'same');

for(const company of ['WSV','CTC'])for(const [short,long] of [['U','Unisex'],['W','Women'],['M','Men']]){const original=company==='WSV'?a:x;for(const [left,right] of [[short,long],[long.toLowerCase(),short]]){const r=reviewBalance([{id:'g',orders:[{...original,gender:left}]}],[{...original,gender:right}],company);assert.equal(r.reports[0].rows[0].status,'same');}const changed=reviewBalance([{id:'g',orders:[{...original,gender:short}]}],[{...original,gender:short==='U'?'Women':'Unisex'}],company);assert.equal(changed.reports[0].rows[0].status,'changed');assert.equal(changed.reports[0].rows[0].changes[0].label,'Gender');}
for(const [before,after,status] of [['Youth','Kids','changed'],['Youth','Youth','same'],['U','','unverified']]){const r=reviewBalance([{id:'g',orders:[{...a,gender:before}]}],[{...a,gender:after}],'WSV');assert.equal(r.reports[0].rows[0].status,status);}
const cached={reports:[{rows:[{status:'changed',changes:[{label:'Gender',before:'U',after:'Unisex'}]},{status:'changed',changes:[{label:'Gender',before:'U',after:'Unisex'},{label:'QTY',before:'10',after:'12'}]},{status:'unverified',changes:[{label:'Gender',before:'W',after:'',unverified:true}]}]}]};const refreshed=reclassifySavedBalance(cached);assert.deepEqual(refreshed.reports[0].rows.map(r=>r.status),['same','changed','unverified']);assert.equal(refreshed.reports[0].rows[1].changes[0].label,'QTY');assert.equal(cached.reports[0].rows[0].changes.length,1);

for(const company of ['WSV','CTC']){const testMonths=[{id:'dec',name:'December 2026',year:2026,month:12,prefix:'',orders:[]},{id:'mid',name:'Mid January 2027',year:2027,month:1,prefix:'Mid',orders:[]},{id:'end',name:'End January 2027',year:2027,month:1,prefix:'End',orders:[]}];const sample=[{...n,exgo:'DECEMBER'},{...n,id:'new2',factoryPo:'WSV005',onPo:'PO123460',exgo:'MID JAN'},{...n,id:'new3',factoryPo:'WSV006',onPo:'PO123461',exgo:'JAN'},{...n,id:'new4',factoryPo:'WSV007',onPo:'PO123462',exgo:'FEB'}];const copy=JSON.stringify(testMonths);const r=reviewBalance(testMonths,sample,company,{year:2026,month:9});assert.deepEqual(r.reports.map(q=>q.rows.map(z=>z.status)),[['new'],['new'],[]]);assert.deepEqual(r.unassigned.map(q=>q.id),['new3','new4']);assert.equal(JSON.stringify(testMonths),copy);const resumed=reclassifySavedBalance({reports:testMonths.map(month=>({month,rows:[]})),unassigned:sample,ambiguous:[]},testMonths,{year:2026,month:9});assert.equal(resumed.reports[1].rows[0].status,'new');assert.equal(resumed.unassigned.length,2);}
const duplicateMonth=[{id:'one',year:2027,month:1,prefix:'Mid',orders:[]},{id:'two',year:2027,month:1,prefix:'Mid',orders:[]}];assert.equal(reviewBalance(duplicateMonth,[{...n,exgo:'MID JAN'}],'WSV',{year:2026,month:9}).unassigned.length,1);

for(const company of ['WSV','CTC']){const march={id:'march',year:2027,month:3,prefix:'',orders:[]},calendar={year:2026,month:9};const end={...n,exgo:'END MAR'};let r=reviewBalance([march],[end],company,calendar);assert.equal(r.reports[0].rows[0].status,'new');assert.equal(r.unassigned.length,0);const restored=reclassifySavedBalance({reports:[{month:march,rows:[]}],unassigned:[end],ambiguous:[]},[march],calendar);assert.equal(restored.reports[0].rows[0].status,'new');const mid={...n,id:'midorder',factoryPo:'WSV009',onPo:'PO123499',exgo:'MID MAR'};r=reviewBalance([march],[end,mid],company,calendar);assert.equal(r.reports[0].rows.length,0);assert.equal(r.unassigned.length,2);const split=[{...march,id:'mid',prefix:'Mid'},{...march,id:'end',prefix:'End'}];r=reviewBalance(split,[end,mid],company,calendar);assert.deepEqual(r.reports.map(x=>x.rows[0].old.exgo),['MID MAR','END MAR']);assert.equal(r.unassigned.length,0);}
for(const company of ['WSV','CTC']){const april={id:'april',year:2027,month:4,prefix:'',orders:[]},calendar={year:2026,month:9},orders=['1st WEEK APR','MID APR','END APR'].map((exgo,i)=>({...n,id:'apr'+i,factoryPo:'W'+i,onPo:'X'+i,exgo}));const before=JSON.stringify(april),r=reviewBalance([april],orders,company,calendar);assert.equal(r.reports[0].rows.length,0);assert.equal(r.unassigned.length,3);assert.equal(JSON.stringify(april),before);const split=[{...april,id:'mid',prefix:'MID'},{...april,id:'end',prefix:'END'}],s=reviewBalance(split,orders,company,calendar);assert.deepEqual(s.reports.map(x=>x.rows.map(row=>row.old.exgo)),[['MID APR'],['END APR']]);assert.deepEqual(s.unassigned.map(o=>o.exgo),['1st WEEK APR']);const week={...april,id:'week',prefix:'1st WEEK'},w=reviewBalance([...split,week],orders,company,calendar);assert.deepEqual(w.reports.map(x=>x.rows.map(row=>row.old.exgo)),[['MID APR'],['END APR'],['1st WEEK APR']]);assert.equal(w.unassigned.length,0);}
for(const company of ['WSV','CTC']){const base={year:2027,month:4,orders:[]},months=[{...base,id:'mid',prefix:'MID'},{...base,id:'end',prefix:'END'}],calendar={year:2026,month:9},order=(id,exgo,row)=>({...n,id,factoryPo:'F'+id,onPo:'P'+id,exgo,source:{fileName:'balance.xlsx',sheet:'Sheet1',row}}),rows=[order('first','1st WEEK APR',10),order('mid','MID APR',11),order('special','3rd WEEK APR',12),order('end','END APR',13)];let result=reviewBalance(months,rows,company,calendar);assert.deepEqual(result.reports.map(r=>r.rows.map(x=>x.old.id)),[['first','mid'],['special','end']]);assert.equal(result.unassigned.length,0);assert.equal(rows[0].exgo,'1st WEEK APR');const other={...rows[0],id:'other',factoryPo:'OTHER',onPo:'OTHER',source:{...rows[0].source,sheet:'Another'}};result=reviewBalance(months,[other,...rows.slice(1)],company,calendar);assert.equal(result.unassigned[0].id,'other');const bad=[rows[0],{...rows[1],source:{...rows[1].source,row:15}},rows[3]];result=reviewBalance(months,bad,company,calendar);assert.ok(result.unassigned.some(x=>x.id==='first'));const mids=[rows[1],{...rows[1],id:'mid2',factoryPo:'Fmid2',onPo:'Pmid2',source:{...rows[1].source,row:15}},{...rows[2],source:{...rows[2].source,row:13}}];result=reviewBalance(months,mids,company,calendar);assert.ok(result.unassigned.some(x=>x.id==='special'));}
// An unfamiliar EXGO after MID must not be guessed as END without an END anchor.
for(const company of ['WSV','CTC']){
 const months=[{id:'mid',year:2027,month:4,prefix:'MID',orders:[]},{id:'end',year:2027,month:4,prefix:'END',orders:[]}];
 const source=(id,exgo,row)=>({...n,id,factoryPo:'F'+id,onPo:'P'+id,exgo,source:{fileName:'any filename.xlsx',sheet:'Sheet1',row}});
 const result=reviewBalance(months,[source('mid','MID APR',10),source('special','3rd WEEK APR',11),source('blank','',12)],company,{year:2026,month:9});
 assert.equal(result.unassigned.find(o=>o.id==='special').reviewReason,'special_exgo');
 assert.equal(result.unassigned.find(o=>o.id==='blank').reviewReason,'missing_exgo');
}
// Yearless EXGO cannot be safely assigned when the same month exists in two years.
for(const company of ['WSV','CTC']){
 const months=[{id:'sep26',year:2026,month:9,prefix:'',orders:[]},{id:'sep27',year:2027,month:9,prefix:'',orders:[]}];
 const order={...n,exgo:'SEP',factoryPo:'NEW-W',onPo:'NEW-O'};
 const result=reviewBalance(months,[order],company,{year:2026,month:9});
 assert.equal(result.unassigned[0].reviewReason,'ambiguous_year');
 assert.equal(result.reports[0].rows.length,0);assert.equal(result.reports[1].rows.length,0);
 const explicit=reviewBalance(months,[{...order,exgo:'SEP 2027'}],company,{year:2026,month:9});
 assert.equal(explicit.reports[1].rows[0].status,'new');
}
// Settings are scoped to a saved month; legacy months retain the existing calendar.
const {monthExgoCalendar,exgoLabel}=await import('../.sites-runtime/check-month-order.mjs');
const legacy={exgoCalendar:{year:2026,month:9,overrides:{}}};
const oldMonth={year:2026,month:9};const newMonth={year:2027,month:9,exgoCalendar:{year:2027,month:9,overrides:{}}};
assert.equal(exgoLabel('SEP',monthExgoCalendar(oldMonth,legacy)),'SEP 2026');
assert.equal(exgoLabel('SEP',monthExgoCalendar(newMonth,legacy)),'SEP 2027');
assert.equal(exgoLabel('SEP',monthExgoCalendar(oldMonth,legacy)),'SEP 2026');
// Website PO anchors and source row chronology identify multiple years and future months.
for(const company of ['WSV','CTC']){
 const months=[{id:'sep26',year:2026,month:9,prefix:'',orders:[]},{id:'sep27',year:2027,month:9,prefix:'',orders:[]},{id:'jan28',year:2028,month:1,prefix:'Mid',orders:[]}];
 const order=(id,exgo,row)=>({...n,id,factoryPo:'F'+id,onPo:'O'+id,exgo,source:{fileName:'renamed.xlsx',sheet:'Data',row}});
 const list=[order('anchor','SEP',10),order('new26','SEP',11),order('dec','DEC',12),order('jan','JAN',13),order('new27','SEP',14),order('end','DEC',15),order('jan28','MID JAN',16),order('may','MID MAY',17)];
 months[0].orders=[{...list[0]}]; const before=JSON.stringify({months,list});
 let result=reviewBalance(months,list,company,{year:2026,month:9});
 assert.equal(result.reports[0].rows.find(x=>x.old.id==='new26').status,'new');
 assert.equal(result.reports[1].rows.find(x=>x.old.id==='new27').status,'new');
 assert.equal(result.reports[2].rows.find(x=>x.old.id==='jan28').status,'new');
 assert.equal(result.unassigned.find(x=>x.id==='may').reviewExgoYear,2028);
 assert.equal(JSON.stringify({months,list}),before);
 const conflict=[order('anchor','SEP',10),order('bad','AUG',11),order('future','SEP',12)];
 result=reviewBalance(months,conflict,company,{year:2026,month:9});
 assert.equal(result.unassigned.find(x=>x.id==='future').reviewReason,'ambiguous_year');
}
console.log('PASS read-only balance comparison: WSV, CTC, changed/missing/new, UK quantities, ambiguous matches and published rows.');
