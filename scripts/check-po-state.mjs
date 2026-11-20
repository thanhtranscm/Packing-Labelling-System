import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
async function module(path,replace=x=>x){const code=ts.transpileModule(replace(await fs.readFile(path,'utf8')),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));}
const summarySource=(await fs.readFile('lib/order-rows.ts','utf8')).replace(/export /g,'');
const {generateState,orderStatus,controlOrders,clearControl,pendingCount,reconcilePoFilters,generatedQuantity,purchaseRunOrders}=await module('lib/po-state.ts',s=>s.replace("import {isSummaryOrder} from './order-rows';",summarySource));
const {validateStandardAdditions}=await module('lib/master-validation.ts',s=>s.replace("import {norm} from './model';","const norm=(s:any)=>String(s||'').trim().toUpperCase();").replace("import {outputs} from './material-state';", "const outputs=(m:any)=>m.outputs||String(m.output_type).split('_').filter((x:string)=>x!=='disabled');"));
const a={id:'A',onPo:'ON-A',qty:[6],total:6},b={id:'B',onPo:'ON-B',qty:[12],total:12};
let month={orders:[a,b],versions:[],latest:[],changes:[],importRevision:1};
let count=0;const check=(name,fn)=>{fn();console.log('PASS '+name);count++;};
const run=(orders)=>{const v={id:'run'+(month.versions.length+1),created:new Date(2026,0,1,0,month.versions.length).toISOString(),orders};month={...month,...generateState(month,v),versions:[...month.versions,v],latest:orders,latestVersion:v.id};return v;};
check('initial import is Not Run and no generated changes',()=>{assert.equal(orderStatus(month,a),'Not Run');assert.equal(month.changes.length,0);});
const first=run([a]);
check('first Generate is Processed, never New',()=>{assert.equal(orderStatus(month,a),'Processed');assert.equal(month.changes[0].status,'Processed');});
month={...month,orders:[a],importRevision:2};
check('reimport unchanged data is Unchanged without changing run summary',()=>{assert.equal(orderStatus(month,a),'Unchanged');assert.equal(month.changes[0].status,'Processed');});
const changed={...a,qty:[18],total:18};month={...month,orders:[changed,b]};
check('changed/new imported rows need Generate',()=>{assert.equal(orderStatus(month,changed),'Not Run');assert.equal(orderStatus(month,b),'Not Run');assert.equal(pendingCount(month),2);});
const second=run([changed,b]);
check('second Generate classifies Updated/New',()=>{assert.equal(orderStatus(month,changed),'Updated');assert.equal(orderStatus(month,b),'New');assert.equal(pendingCount(month),0);});
month={...month,latest:first.orders,latestVersion:first.id};run([changed,b]);
check('manual Latest does not change chronological Generate comparison',()=>{assert.ok(month.changes.every(c=>c.status==='Unchanged'));});
run([b]);
check('missing generated PO becomes Cancelled and is not selectable',()=>{assert.equal(month.cancelled[0].po.id,'A');month.orders=[b];assert.equal(controlOrders(month).find(o=>o.id==='A').previousOnly,true);});
month.orders=[a,b];run([a,b]);
check('returning PO regains current status and retains cancellation history',()=>{assert.equal(orderStatus(month,a),'New');assert.equal(month.cancelled.length,1);assert.equal(controlOrders(month).filter(o=>o.id==='A').length,1);});
month={...month,...clearControl(month)};
check('Clear with files keeps published data/history and empties control',()=>{assert.equal(controlOrders(month).length,0);assert.equal(month.latest.length,2);assert.ok(month.runs.length);assert.equal(pendingCount(month),0);});
month={...month,versions:[],...clearControl({...month,versions:[]})};
check('Clear + no files resets regardless of operation order',()=>{assert.equal(month.runs.length,0);assert.equal(month.cancelled.length,0);month.orders=[a];assert.equal(orderStatus(month,a),'Not Run');});
month={orders:[a,b],versions:[],latest:[]};run([a]);run([a]);
check('never-generated deleted PO cannot become Cancelled',()=>assert.equal(month.cancelled.length,0));
const std={id:'std',destination:'STANDARD',list_no:1,item_code:'STD',output_type:'label'},extra={id:'extra',destination:'BRAZIL',list_no:4,item_code:'BR',output_type:'label'};
check('new Standard/Extra collision blocked with country and No',()=>assert.throws(()=>validateStandardAdditions([std,extra],[std,extra,{...std,id:'std4',list_no:4}]),/BRAZIL · No.4/));
check('existing Replace and ordinary Standard edits remain allowed',()=>assert.doesNotThrow(()=>validateStandardAdditions([std,{...extra,list_no:1}],[{...std,item_code:'NEW'}, {...extra,list_no:1}])));
check('control rows follow original source order with archived rows at bottom',()=>{
 const row=(id,n)=>({id,onPo:id,total:1,source:{row:n}});
 const m={orders:[row('C',8),row('A',2)],cancelled:[{po:row('Y',6)},{po:row('X',3)}],runs:[{orders:[row('P',4)]}]};
 const result=controlOrders(m);
 assert.deepEqual(result.map(o=>o.id),['A','C','X','P','Y']);
 assert.equal(result.filter(o=>!o.previousOnly).length,2);
 assert.equal(result.find(o=>o.id==='P').status,'Previous run only');
});
check('legacy rows use recorded import order when source row is unavailable',()=>{
 assert.deepEqual(controlOrders({orders:[b,a],imports:[{orders:[a,b]}]}).map(o=>o.id),['A','B']);
});
check('all PO filters drop stale values after deletes and clear',()=>{
 const filter={exgo:['SEP','OCT'],status:['Updated'],country:['CHINA']};
 assert.deepEqual(reconcilePoFilters(filter,{exgo:['OCT'],status:['Unchanged'],country:['CHINA']}),{exgo:['OCT'],country:['CHINA']});
 assert.deepEqual(reconcilePoFilters(filter,{}),{});
 assert.equal(reconcilePoFilters(filter,{exgo:['SEP','OCT'],status:['Updated'],country:['CHINA']}),filter);
});


check('QTY total excludes unrun/changed/new/archived POs and follows the filtered rows',()=>{
 const base={orders:[a,b],versions:[],latest:[],changes:[],importRevision:1};assert.deepEqual(generatedQuantity(base,[a,b]),{count:0,total:0});
 const state={...base,runs:[{id:'run',orders:[a,b]}]};assert.deepEqual(generatedQuantity(state,[a,b]),{count:2,total:18});assert.deepEqual(generatedQuantity(state,[b]),{count:1,total:12});
 assert.deepEqual(generatedQuantity(state,[{...a,total:8,qty:[8]},{...b,id:'NEW'},{...b,previousOnly:true}]),{count:0,total:0});
 assert.deepEqual(generatedQuantity(state,[a,a]),{count:1,total:6});assert.deepEqual(generatedQuantity({...state,importRevision:2},[a,b]),{count:2,total:18});
 assert.deepEqual(generatedQuantity({...base,versions:[{kind:'upload',orders:[a]}]},[a]),{count:0,total:0});
});

check('purchase Generate rejects unsaved settings, stale selection, deleted PO and cleared control',()=>{
 const current={orders:[a,b],latest:[a,b]};
 assert.throws(()=>purchaseRunOrders(current,['A'],true),/Save pending/);
 assert.throws(()=>purchaseRunOrders(current,['A'],false,true),/Save pending/);
 assert.deepEqual(purchaseRunOrders(current,['B']),[b]);
 assert.deepEqual(purchaseRunOrders({...current,orders:[{...a,total:20,qty:[20]}]},['A'])[0].qty,[20]);
 assert.throws(()=>purchaseRunOrders({...current,orders:[a]},['B']),/PO Control changed/);
 assert.throws(()=>purchaseRunOrders({...current,controlCleared:true},['A']),/current PO/);
 assert.throws(()=>purchaseRunOrders(current,[]),/current PO/);
 assert.throws(()=>purchaseRunOrders({...current,orders:[{...a,previousOnly:true}]},['A']),/PO Control changed/);
});
console.log(`${count} business checks passed`);
