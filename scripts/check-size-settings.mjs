import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import ExcelJS from 'exceljs';
const dir=await fs.mkdtemp(path.resolve('.sites-runtime/size-check-'));
try{
  for(const name of ['copy-month-settings','order-rows','size-settings','model','material-state','comparison','po-state','order-import','template-export']){
    const source=await fs.readFile('lib/'+name+'.ts','utf8');
    const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from '(\.\/[^']+)'/g,"from '$1.js'");
    await fs.writeFile(path.join(dir,name+'.js'),code);
  }
  const {validateSizeProfile,linkedSettings,alignOrders,prepareMonthSettings,purchaseBufferSummary}=await import(pathToFileURL(path.join(dir,'size-settings.js')));
  const {defaultSizes,defaultSettings,calculate}=await import(pathToFileURL(path.join(dir,'model.js')));
  const {importOrders,importLayout}=await import(pathToFileURL(path.join(dir,'order-import.js')));
  const {exportTemplate}=await import(pathToFileURL(path.join(dir,'template-export.js')));
  const {monthBufferCountries,materialBufferCountry,isCartonLabel,materialDescription,syncStandard}=await import(pathToFileURL(path.join(dir,'material-state.js')));
  const {sameOrder,purchaseRunOrders}=await import(pathToFileURL(path.join(dir,'po-state.js')));
  const {compareSnapshots}=await import(pathToFileURL(path.join(dir,'comparison.js')));
  let count=0;const check=async(name,fn)=>{await fn();count++;console.log('PASS '+name);};
  const profile={id:'adult',name:'Adult Unisex',sizes:structuredClone(defaultSizes)};
  const ws={profiles:[profile],reuse:[],items:[{id:'label',destination:'STANDARD',list_no:1,item_code:'SIZE',qty_per_finish:1,unit:'PRS',outputs:['label'],versions:[{id:'one',item_code:'SIZE',description:'Size Label',months:[],all:true,images:[]}]}]};
  const order={id:'PO',factoryPo:'WSV-PO',onPo:'ON-PO',country:'BELGIUM',type:'ON',profile:'adult',sizes:structuredClone(defaultSizes),qty:defaultSizes.map((_,i)=>i===1?7:0),total:7};
  const month={id:'2026-11',name:'November',profiles:[profile],profileId:'adult',settings:structuredClone(defaultSettings),orders:[order],versions:[]};
  const {copyMonthSettings}=await import(pathToFileURL(path.join(dir,'copy-month-settings.js')));
  await check('copy month settings preserves target orders and independent snapshots',()=>{const source=structuredClone({...month,id:'source',orders:[]});source.settings.buffer.label=17;source.settings.materialBuffer={STANDARD:{2:9}};const target=structuredClone({...month,id:'target',versions:[{id:'published',orders:[order]}]});const original=JSON.stringify(target),draft=copyMonthSettings(source,target,ws);assert.equal(draft.settings.buffer.label,17);assert.equal(draft.settings.materialBuffer.STANDARD[2],9);assert.equal(JSON.stringify(target),original);assert.equal(draft.profileId,'adult');draft.settings.buffer.label=33;assert.equal(source.settings.buffer.label,17);});
  await check('copy rejects source table missing size with target PO quantity',()=>{const source=structuredClone({...month,id:'source',orders:[]});source.profiles[0].sizes=source.profiles[0].sizes.filter(s=>+s.uk!==3.5);assert.throws(()=>copyMonthSettings(source,month,ws),/UK 3.5.*WSV-PO/);});
  await check('copy rejects self and incompatible pending order profile',()=>{assert.throws(()=>copyMonthSettings(month,month,ws),/different source/);const other=structuredClone({...month,id:'target'});other.orders[0].profile='other';assert.throws(()=>copyMonthSettings(month,other,ws),/differs/);});
  await check('duplicate UK numerically normalized',()=>assert.throws(()=>validateSizeProfile({...profile,sizes:[defaultSizes[0],{...defaultSizes[1],uk:'3.0'}]}),/Duplicate UK/));
  await check('blank and unordered size tables rejected',()=>{assert.throws(()=>validateSizeProfile({...profile,sizes:[{...defaultSizes[0],uk:''}]}),/valid UK/);assert.throws(()=>validateSizeProfile({...profile,sizes:[defaultSizes[1],defaultSizes[0]]}),/ordered/);});
  await check('zero-quantity endpoint removal trims all linked ranges',()=>{const p={...profile,sizes:profile.sizes.slice(1,-1)},m=prepareMonthSettings({...month,profiles:[p]},ws);assert.equal(m.settings.groups[0].from,3.5);assert.equal(m.settings.groups.at(-1).to,12.5);assert.equal(m.settings.wrapping[0].from,3.5);assert.equal(m.settings.stuffing.at(-1).to,12.5);assert.equal(m.orders[0].qty.reduce((a,b)=>a+b),7);});
  await check('nonzero removal blocked with PO and UK',()=>assert.throws(()=>alignOrders([order],{...profile,sizes:profile.sizes.filter(s=>+s.uk!==3.5)}),/UK 3.5.*WSV-PO.*7 pairs/));
  await check('removed interior sizes never receive cartons or paper',()=>{const p={...profile,sizes:profile.sizes.filter(s=>+s.uk!==4)},m=prepareMonthSettings({...month,profiles:[p]},ws),r=calculate(ws,m,m.orders);assert.equal(r.sizes.length,20);assert.equal(r.pack[0].groups.reduce((a,g)=>a+g.pairs,0),7);assert.equal(r.paper.filter(p=>p.kind==='stuffing').reduce((a,p)=>a+p.required,0),14);});
  await check('empty groups removed when only upper sizes remain',()=>{const p={...profile,sizes:profile.sizes.filter(s=>+s.uk>=10.5)},c=linkedSettings(defaultSettings,p);assert.equal(c.groups.length,1);assert.equal(c.wrapping.length,1);assert.equal(c.stuffing.length,1);});
  await check('new size outside group requires carton mapping',()=>assert.throws(()=>linkedSettings(defaultSettings,{...profile,sizes:[...profile.sizes,{...defaultSizes.at(-1),uk:'14'}]}),/Carton.*UK 14/));
  await check('paper gaps and overlaps rejected at Save',()=>{for(const kind of ['wrapping','stuffing']){const gap=structuredClone(defaultSettings);gap[kind][0].to=3;assert.throws(()=>linkedSettings(gap,profile),/UK 3.5/);const overlap=structuredClone(defaultSettings);overlap[kind][0].to=8;assert.throws(()=>linkedSettings(overlap,profile),/exactly one/);}});
  await check('invalid paper qty, buffer and blank range rejected',()=>{for(const change of [s=>s.wrapping[0].qty=0,s=>s.buffer.label=-1,s=>s.groups[0].from='']){const s=structuredClone(defaultSettings);change(s);assert.throws(()=>linkedSettings(s,profile));}});
  await check('new covered size gets zero pairs without shifting old quantities',()=>{const p={...profile,sizes:[...profile.sizes.slice(0,-1),{...defaultSizes.at(-1),uk:'13'},profile.sizes.at(-1)]};const a=alignOrders([order],p)[0];assert.equal(a.qty[1],7);assert.equal(a.qty.at(-2),0);assert.equal(a.total,7);});
  await check('different profile blocked; mixed order snapshots safely realigned',()=>{assert.throws(()=>alignOrders([{...order,profile:'other'}],profile),/differs/);const reversed={...order,sizes:[...order.sizes].reverse(),qty:[...order.qty].reverse()};assert.deepEqual(alignOrders([reversed],profile)[0].qty,order.qty);});
  await check('new upper size requires Wrapping and Stuffing as well as cartons',()=>{const p={...profile,sizes:[...profile.sizes,{...defaultSizes.at(-1),uk:'14'}]},s=structuredClone(defaultSettings);s.groups.at(-1).to=14;assert.throws(()=>linkedSettings(s,p),/Wrapping.*UK 14/);s.wrapping.at(-1).to=14;assert.throws(()=>linkedSettings(s,p),/Stuffing.*UK 14/);s.stuffing.at(-1).to=14;assert.doesNotThrow(()=>linkedSettings(s,p));});
  await check('history snapshots unchanged and source metadata does not change PO status',()=>{const frozen=structuredClone({...month,latest:[order],versions:[{id:'v1',orders:[order],settings:defaultSettings}]});const before=JSON.stringify(frozen.versions);const p={...profile,sizes:profile.sizes.slice(1)},after=prepareMonthSettings({...frozen,profiles:[p]},ws);assert.equal(JSON.stringify(after.versions),before);assert.deepEqual(after.latest,frozen.latest);assert.ok(sameOrder(order,{...order,source:{row:20}}));});

  await check('country No overrides preserve zero, default, months and production quantities',()=>{
    const custom=structuredClone(month);custom.settings.materialBuffer={STANDARD:{1:0},JAPAN:{1:80}};
    const testWs=structuredClone(ws);testWs.items.push({...structuredClone(ws.items[0]),id:'jp',destination:'JAPAN',item_code:'JP-SIZE'});
    assert.equal(calculate(testWs,custom,[order]).label[0].total,7);
    const japan={...order,id:'JP',country:'JAPAN'};
    assert.equal(calculate(testWs,custom,[japan]).label[0].total,13);
    assert.equal(calculate(testWs,custom,[{...order,country:'KOREA'}]).label[0].total,7);
    assert.equal(calculate(ws,month,[order]).label[0].total,14);
    assert.deepEqual(calculate(testWs,custom,[order],false),calculate(ws,month,[order],false));
    const a={id:'old',orders:[order],result:calculate(ws,month,[order])},b={id:'new',orders:[order],result:calculate(testWs,custom,[order])};
    assert.equal(compareSnapshots(a,b).materials.find(m=>m.type==='material').delta,-7);
    assert.equal(a.result.label[0].buffer,100);
    const other=structuredClone(ws);other.items[0].list_no=2;
    assert.equal(calculate(other,custom,[order]).label[0].buffer,25);
    custom.settings.materialBuffer.STANDARD[2]=12.5;
    assert.equal(calculate(other,custom,[order]).label[0].total,8);

  });
  await check('month country selector groups Standard, excludes absent countries and sorts Standard first',()=>{
    const items=structuredClone(ws.items);items.push({...structuredClone(items[0]),id:'kr',destination:'KOREA',item_code:'KR-SIZE'},{...structuredClone(items[0]),id:'be',destination:'BELGIUM'});
    assert.equal(materialBufferCountry(items,' belgium '),'STANDARD');assert.equal(materialBufferCountry(items,'KOREA'),'KOREA');
    assert.deepEqual(monthBufferCountries(items,{orders:[order,{...order,country:'KOREA'},{...order,country:'JAPAN'}]}),['STANDARD','KOREA']);
    assert.deepEqual(monthBufferCountries(items,{orders:[order]}),['STANDARD']);assert.deepEqual(monthBufferCountries(items,{orders:[]}),[]);
    assert.deepEqual(monthBufferCountries(items,{orders:[],latest:[{...order,country:'KOREA'}]}),[]);
    assert.deepEqual(monthBufferCountries(items,{orders:[order],controlCleared:true,latest:[order]}),[]);
    assert.deepEqual(monthBufferCountries(items,{orders:[{...order,country:'KOREA',status:'Cancelled'}]}),[]);
  });
  await check('PO Control delete / clear changes buffer countries and only selected current PO enters new purchase snapshot',()=>{
    const data=structuredClone(ws);data.items.push({...structuredClone(ws.items[0]),id:'kr',destination:'KOREA',item_code:'KR-SIZE'});
    const korea={...order,id:'KR',country:'KOREA',total:10,qty:order.qty.map((q)=>q?10:0)};
    const current={...month,orders:[order,korea],latest:[order,korea],settings:{...defaultSettings,materialBuffer:{STANDARD:{1:50},KOREA:{1:20}}}};
    const before=calculate(data,current,purchaseRunOrders(current,['PO','KR']));assert.equal(before.label.reduce((sum,r)=>sum+r.total,0),23);
    const afterDelete={...current,orders:[order]};assert.deepEqual(monthBufferCountries(data.items,afterDelete),['STANDARD']);
    assert.throws(()=>purchaseRunOrders(afterDelete,['PO','KR']),/PO Control changed/);
    const after=calculate(data,afterDelete,purchaseRunOrders(afterDelete,['PO']));assert.equal(after.label[0].buffer,50);assert.equal(after.label[0].total,11);assert.equal(after.orders.length,1);
    const comparison=compareSnapshots({id:'old',orders:before.orders,result:before},{id:'new',orders:after.orders,result:after});assert.equal(comparison.materials.find(r=>r.country==='KOREA').delta,-12);
    assert.equal(before.label.reduce((sum,r)=>sum+r.total,0),23);
    assert.throws(()=>purchaseRunOrders({...afterDelete,controlCleared:true,orders:[]},['PO']),/current PO/);
  });
  await check('buffer summary places custom rates next to matching defaults, including zero and only active countries',()=>{
    const items=structuredClone(ws.items);items.push({...structuredClone(items[0]),id:'other',list_no:2,item_code:'OTHER'}, {...structuredClone(items[0]),id:'card',list_no:3,item_code:'CARD',outputs:['card']});
    const settings={...defaultSettings,materialBuffer:{STANDARD:{1:80,2:0,3:10},KOREA:{1:30}}};
    const groups=purchaseBufferSummary(settings,items,month);
    assert.deepEqual(groups.find(g=>g.key==='size').custom,[{country:'STANDARD',no:1,value:80}]);
    assert.deepEqual(groups.find(g=>g.key==='label').custom,[{country:'STANDARD',no:2,value:0}]);
    assert.deepEqual(groups.find(g=>g.key==='card').custom,[{country:'STANDARD',no:3,value:10}]);
    assert.equal(purchaseBufferSummary({...settings,materialBuffer:{STANDARD:{1:100,2:25,3:0}}},items,month).flatMap(g=>g.custom).length,0);
    assert.equal(purchaseBufferSummary(settings,items,{...month,orders:[],latest:[order]}).flatMap(g=>g.custom).length,0);
  });
  await check('Thailand carton labels use actual OWN / Distributor cartons, custom buffer and only Thai POs',()=>{
    const data=structuredClone(ws),label={...structuredClone(ws.items[0]),id:'thai-label',destination:'THAILAND',list_no:4,item_code:'ON-GX101-35*25MM Thailand Extra carton label',qty_per_finish:2,unit:'PCS',outputs:['label','special'],versions:[{id:'thai-v',item_code:'ON-GX101-35*25MM Thailand Extra carton label',description:'Thailand outer carton label',months:[],all:true,images:[]}]};data.items.push(label);
    const qty=order.qty.map((_,i)=>i===0?7:i===1?1:0),thai={...order,id:'TH',country:'THAILAND',qty,total:8};
    const configured={...month,settings:{...structuredClone(defaultSettings),materialBuffer:{THAILAND:{4:25}}}};configured.settings.buffer.outer=100;
    const own=calculate(data,configured,[thai,order]);assert.equal(own.label.length,2);
    const r=own.label.find(r=>r.po.id==='TH');assert.equal(r.cartonCount,3);assert.equal(r.requiredTotal,6);assert.equal(r.total,8);assert.equal(r.qty.reduce((a,b)=>a+b),8);assert.match(r.item.description,/QTY BASIS: CARTON/);
    assert.equal(own.pack.find(r=>r.po.id==='TH').groups.reduce((n,g)=>n+g.cartons,0),3);assert.equal(own.pack.find(r=>r.po.id==='TH').groups.reduce((n,g)=>n+g.purchaseCartons,0),6);
    const mixed=calculate(data,configured,[{...thai,type:'Distributor'}]).label[0];assert.equal(mixed.cartonCount,2);assert.equal(mixed.requiredTotal,4);assert.equal(mixed.total,5);
    const grouped={...thai,type:'Distributor',qty:qty.map((_,i)=>i===0?3:i===7?3:0),total:6};assert.equal(calculate(data,configured,[grouped]).label[0].cartonCount,2);
    const production=calculate(data,configured,[thai],false).label[0];assert.equal(production.total,6);assert.equal(production.buffer,0);
    configured.settings.materialBuffer.THAILAND[4]=0;assert.equal(calculate(data,configured,[thai]).label[0].total,6);
    const old={id:'old',orders:[thai],result:own},after=calculate(data,configured,[thai]);assert.equal(compareSnapshots(old,{id:'new',orders:[thai],result:after}).materials.find(r=>r.code===label.item_code).delta,-2);
    assert.equal(calculate(data,configured,[order]).label.some(r=>r.item.item_code===label.item_code),false);
  });
  await check('editable calculation basis supports arbitrary country/code, all versions, and explicit Thai per-pair override',()=>{
    const data=structuredClone(ws);data.items[0].quantityBasis='carton';data.items[0].qty_per_finish=2;
    const qty=order.qty.map((_,i)=>i===0?7:i===1?1:0),po={...order,qty,total:8};
    const r=calculate(data,month,[po]).label[0];assert.equal(r.requiredTotal,6);assert.equal(r.total,12);assert.equal(r.cartonCount,3);
    const prod=calculate(data,month,[po],false).label[0];assert.equal(prod.total,6);
    data.items[0].versions.push({...data.items[0].versions[0],id:'v2',item_code:'NEW-CODE',months:[month.id]});assert.equal(calculate(data,month,[po]).label[0].quantityBasis,'carton');
    data.items[0].quantityBasis='pair';assert.equal(calculate(data,month,[po],false).label[0].total,16);
    const thai={destination:'THAILAND',item_code:'ON-GX101',quantityBasis:'pair'};assert.equal(isCartonLabel(thai),false);assert.equal(isCartonLabel({...thai,quantityBasis:'carton'}),true);assert.equal(isCartonLabel({...thai,quantityBasis:undefined}),true);
    assert.equal(materialDescription({...thai,description:'Labels [QTY BASIS: CARTON]'}),'Labels');
    const next=syncStandard(data.items,data.items);assert.equal(next[0].quantityBasis,'pair');
  });
  await check('country overrides validate malformed, negative and empty values',()=>{
    for(const materialBuffer of [[],{BELGIUM:{1:-1}},{BELGIUM:{1:''}},{BELGIUM:{1:'NaN'}},{BELGIUM:{0:10}},{belgium:{1:10}},{BELGIUM:{1:Infinity}}])assert.throws(()=>linkedSettings({...defaultSettings,materialBuffer},profile));
    assert.doesNotThrow(()=>linkedSettings({...defaultSettings,materialBuffer:{BELGIUM:{1:0,2:12.5}}},profile));
  });
  await check('same No versions and Card output use the country override',()=>{
    const data=structuredClone(ws);data.items[0].outputs=['label','card'];data.items[0].versions.push({...data.items[0].versions[0],id:'two',item_code:'SIZE-V2',months:['2026-11']});
    const r=calculate(data,{...month,settings:{...defaultSettings,materialBuffer:{STANDARD:{1:50}}}},[order]);
    assert.equal(r.label[0].item.item_code,'SIZE-V2');assert.equal(r.label[0].buffer,50);assert.equal(r.card[0].buffer,50);assert.equal(r.card[0].total,11);assert.equal(r.card[0].requiredTotal,7);
  });
  const template=await fs.readFile('public/templates/purchase.xlsx');

  await check('custom buffer Excel values change while sheet styles and layout stay identical',async()=>{
    const custom={...month,settings:{...defaultSettings,materialBuffer:{STANDARD:{1:50}}}};
    for(const company of ['WSV','CTC']){
      const oldBook=new ExcelJS.Workbook(),newBook=new ExcelJS.Workbook();
      await oldBook.xlsx.load(await exportTemplate(calculate(ws,month,[order]),company,false,template));
      await newBook.xlsx.load(await exportTemplate(calculate(ws,custom,[order]),company,false,template));
      assert.equal(newBook.worksheets[0].getCell('U8').value,1.5);
      assert.equal(newBook.worksheets[0].getCell('X8').value,11);
      for(let i=0;i<oldBook.worksheets.length;i++){
        const a=oldBook.worksheets[i],b=newBook.worksheets[i];assert.equal(a.name,b.name);assert.equal(a.rowCount,b.rowCount);assert.deepEqual(a.model.merges,b.model.merges);
        a.eachRow({includeEmpty:true},(row,n)=>{assert.equal(row.height,b.getRow(n).height);row.eachCell({includeEmpty:true},(cell,c)=>assert.deepEqual(cell.style,b.getRow(n).getCell(c).style));});
      }
    }
  });
  for(const company of ['WSV','CTC']){
    const fixture=company==='WSV'?'[WSV] TOTAL BALANCE (30th Sep, 2026).xlsx':'CTC_ New Order 9.29_TOTAL BALANCE.xlsx';
    const raw=await fs.readFile('test-fixtures/'+fixture);const file=new File([raw],fixture);
    let imported;
    await check(company+' original file reads all POs and validates all source totals',async()=>{imported=await importOrders(file,company,[profile]);assert.equal(imported.length,company==='WSV'?132:25);for(const o of imported){assert.equal(o.qty.reduce((a,b)=>a+b),o.total);assert.equal(o.source.total,o.total);assert.equal(o.source.sizes.length,21);}});
    await check(company+' file rejected in opposite workspace',async()=>assert.rejects(()=>importOrders(file,company==='WSV'?'CTC':'WSV',[profile]),/correct workspace/));
    await check(company+' all original POs retain pairs across carton/paper calculation and Excel',async()=>{
      const m={...month,orders:imported},r=calculate(ws,m,imported,false);for(const pack of r.pack)assert.equal(pack.groups.reduce((n,g)=>n+g.pairs,0),pack.po.total);
      const total=imported.reduce((n,o)=>n+o.total,0);assert.equal(r.paper.filter(p=>p.kind==='wrapping').reduce((n,p)=>n+p.required,0),total);const output=await exportTemplate(r,company,true,template.buffer.slice(template.byteOffset,template.byteOffset+template.byteLength));const book=new ExcelJS.Workbook();await book.xlsx.load(output);const label=book.getWorksheet('Label - Special - Card');assert.equal(label.getCell(imported.length+8,44).value,total);
    });
    const fixtureBook=()=>{const b=new ExcelJS.Workbook(),s=b.addWorksheet('TOTAL BALANCE');const headers={1:'BRAND',2:'SEASON',3:'CREATE DATE',4:'PRICE',5:'ORDER TYPE',6:'PO Category',8:company+"'S PO",9:"ON'S PO#",10:'Buyer Item',11:'COLOR WAY',12:'COUNTRY',14:'MOS',15:'MODEL',16:'US',52:'TOTAL'};for(const [c,v] of Object.entries(headers))s.getCell(4,+c).value=v;defaultSizes.forEach((z,i)=>{const us=z.us.split('/').map(x=>x.trim());s.getCell(4,22+i).value=us.find(x=>x.startsWith('M'));s.getCell(5,22+i).value=us.find(x=>x.startsWith('W'));s.getCell(6,22+i).value=+z.uk;});s.getCell('H8').value=company+'000001';s.getCell('I8').value='PO380000001';s.getCell('J8').value='3UG00000001';s.getCell('L8').value='BELGIUM';s.getCell('N8').value='Ocean';s.getCell('E8').value='ON';s.getCell(8,23).value=7;s.getCell(8,52).value=7;return b;};
    const fromBook=async b=>new File([await b.xlsx.writeBuffer()],'fixture.xlsx');
    await check(company+' preserves unfamiliar text values in correctly identified columns',async()=>{const b=fixtureBook(),s=b.getWorksheet(1);s.getCell('I8').value='CUSTOM-REF new';s.getCell('J8').value='NEW CODE α';s.getCell('L8').value='NEW DESTINATION';s.getCell('N8').value='Private Parcel Service';const f=await fromBook(b);const layout=await importLayout(f,company,s.name,4,profile);for(const map of [undefined,layout.mapping]){const [o]=await importOrders(f,company,[profile],map);assert.equal(o.onPo,'CUSTOM-REF new');assert.equal(o.sku,'NEW CODE α');assert.equal(o.country,'NEW DESTINATION');assert.equal(o.mos,'Private Parcel Service');assert.equal(o.total,7);}});
    await check(company+' recognizes a renamed model sheet and records its real name',async()=>{const b=fixtureBook();b.getWorksheet(1).name='Cloudmonster 3 Hyper LS';b.addWorksheet('Summary').getCell('A1').value='Summary';const rows=await importOrders(await fromBook(b),company,[profile]);assert.equal(rows.length,1);assert.equal(rows[0].source.sheet,'Cloudmonster 3 Hyper LS');});
    await check(company+' rejects ambiguous model sheets instead of silently choosing one',async()=>{const b=fixtureBook(),s=b.getWorksheet(1);s.name='Model A';const other=b.addWorksheet('Model B');s.eachRow((row,r)=>row.eachCell((cell,c)=>other.getCell(r,c).value=cell.value));await assert.rejects(()=>fromBook(b).then(f=>importOrders(f,company,[profile])),/Multiple PO data sheets/);});
    await check(company+' repeated merged header with blank SKU is skipped without losing first PO',async()=>{const b=fixtureBook(),sheet=b.getWorksheet(1);sheet.getCell('H7').value=company+"'S PO";sheet.getCell('I7').value='CUSTOMER PO NO.';sheet.getCell('AZ7').value='TOTAL';const rows=await importOrders(await fromBook(b),company,[profile]);assert.equal(rows.length,1);assert.equal(rows[0].source.row,8);sheet.getCell('J8').value=null;await assert.rejects(()=>fromBook(b).then(file=>importOrders(file,company,[profile])),/missing ON PO or SKU/);});
    await check(company+' explicit Gender wins over the separate US size-axis header in automatic and mapped import',async()=>{const b=fixtureBook(),sheet=b.getWorksheet(1);sheet.getCell('P4').value='Gender';sheet.getCell('P8').value='Women';sheet.getCell('R4').value='US';sheet.getCell('R8').value='';const file=await fromBook(b),layout=await importLayout(file,company,sheet.name,4,profile);assert.equal(layout.mapping.fields.gender,16);for(const mapping of [undefined,layout.mapping]){const rows=await importOrders(file,company,[profile],mapping);assert.equal(rows[0].gender,'Women');}});
    if(company==='WSV')await check('WSV internal ONST/Loss references retain full validation and original text',async()=>{for(const reference of ['ONST-26100303-01','Loss 20%']){const b=fixtureBook(),sheet=b.getWorksheet(1);sheet.getCell('I8').value=reference;const rows=await importOrders(await fromBook(b),company,[profile]);assert.equal(rows[0].onPo,reference);assert.equal(rows[0].total,7);sheet.getCell('AZ8').value=8;await assert.rejects(()=>fromBook(b).then(f=>importOrders(f,company,[profile])),/does not match TOTAL/);}const b=fixtureBook();b.getWorksheet(1).getCell('I8').value='Unrecognized text';assert.equal((await importOrders(await fromBook(b),company,[profile]))[0].onPo,'Unrecognized text');});
    await check(company+' merged subtotal and grand total never become POs; later real rows retained',async()=>{
      const b=fixtureBook(),s=b.getWorksheet(1);
      s.mergeCells('H9:U9');s.getCell('H9').value='TOTAL CLOUDMONSTER 3 HYPER LS';s.getCell(9,23).value=7;s.getCell(9,52).value=7;
      for(let c=1;c<=52;c++)s.getCell(10,c).value=s.getCell(8,c).value;
      s.getCell('H10').value=company+'000002';s.getCell('I10').value='PO380000002';
      s.mergeCells('H11:U11');s.getCell('H11').value='GRAND TOTAL';s.getCell(11,23).value=14;s.getCell(11,52).value=14;
      const rows=await importOrders(await fromBook(b),company,[profile]);assert.equal(rows.length,2);assert.equal(rows.reduce((n,o)=>n+o.total,0),14);assert.equal(rows[1].factoryPo,company+'000002');
    });
    const trimmed={...profile,sizes:profile.sizes.slice(1)};
    await check(company+' original zero column omitted safely; file source retained',async()=>{const rows=await importOrders(await fromBook(fixtureBook()),company,[trimmed]);assert.equal(rows[0].qty.length,20);assert.equal(rows[0].qty[0],7);assert.equal(rows[0].source.qty.length,21);});
    await check(company+' deleted size with pairs blocked before import',async()=>assert.rejects(()=>fromBook(fixtureBook()).then(f=>importOrders(f,company,[{...profile,sizes:profile.sizes.filter(s=>+s.uk!==3.5)}])),/UK 3.5 has 7 pairs/));
    await check(company+' wrong US/UK conversion blocked',async()=>{const b=fixtureBook();b.getWorksheet(1).getCell(4,23).value='M99';await assert.rejects(()=>fromBook(b).then(f=>importOrders(f,company,[profile])),/UK \/ US/);});
    await check(company+' source size column reorder maps by UK rather than position',async()=>{const b=fixtureBook(),s=b.getWorksheet(1);for(const row of [4,5,6,8]){const a=s.getCell(row,22).value;s.getCell(row,22).value=s.getCell(row,23).value;s.getCell(row,23).value=a;}const rows=await importOrders(await fromBook(b),company,[profile]);assert.equal(rows[0].qty[0],0);assert.equal(rows[0].qty[1],7);});
    await check(company+' duplicate size / source TOTAL / hidden spare quantities blocked',async()=>{for(const edit of [s=>s.getCell(6,23).value=3,s=>s.getCell(8,52).value=8,s=>s.getCell(8,43).value=2]){const b=fixtureBook();edit(b.getWorksheet(1));await assert.rejects(()=>fromBook(b).then(f=>importOrders(f,company,[profile])));}});
    await check(company+' missing formula cache rejected',async()=>{const b=fixtureBook();b.getWorksheet(1).getCell(8,23).value={formula:'1+6'};await assert.rejects(()=>fromBook(b).then(f=>importOrders(f,company,[profile])),/cached results/);});
    await check(company+' added size absent in source header blocked',async()=>{const added={...profile,sizes:[...profile.sizes,{...profile.sizes.at(-1),uk:'14',us:'W16 / M14.5'}]};await assert.rejects(()=>fromBook(fixtureBook()).then(f=>importOrders(f,company,[added])),/UK \/ US/);});
    for(const production of [false,true])await check(company+' '+(production?'production':'purchase')+' Excel uses trimmed size columns and linked paper groups',async()=>{
      const orders=await importOrders(await fromBook(fixtureBook()),company,[trimmed]);const m=prepareMonthSettings({...month,profiles:[trimmed],orders},ws);const result=calculate(ws,m,orders,!production);const output=await exportTemplate(result,company,production,template.buffer.slice(template.byteOffset,template.byteOffset+template.byteLength));
      const book=new ExcelJS.Workbook();await book.xlsx.load(output);const label=book.getWorksheet(production?'Label - Special - Card':'Label');assert.equal(label.getCell(4,23).value,3.5);assert.equal(label.getCell(4,42).value,13.5);assert.equal(label.getCell(8,23).value,production?7:14);assert.equal(label.getCell(8,43).value,production?7:14);
      const wrapping=book.getWorksheet('Wrapping Paper');assert.equal(wrapping.getCell('A11').value,3.5);assert.equal(wrapping.getCell('B11').value,7);const stuffing=book.getWorksheet('Stuffing Paper');assert.equal(stuffing.getCell('D11').value,14);assert.equal(result.pack[0].groups[0].cartons,2);assert.equal(result.pack[0].groups[0].empty,5);
    });
    await check(company+' Excel supports added size and changed carton group count',async()=>{
      const sizes=[...profile.sizes,{...profile.sizes.at(-1),uk:'14',us:'W16 / M14.5'}],p={...profile,sizes},s=structuredClone(defaultSettings);s.groups.push({...s.groups.at(-1),from:14,to:14});s.wrapping.at(-1).to=14;s.stuffing.at(-1).to=14;
      const o={...order,sizes,qty:[...order.qty,6],total:13},m=prepareMonthSettings({...month,profiles:[p],settings:s,orders:[o]},ws),r=calculate(ws,m,m.orders);const output=await exportTemplate(r,company,false,template.buffer.slice(template.byteOffset,template.byteOffset+template.byteLength));const b=new ExcelJS.Workbook();await b.xlsx.load(output);const label=b.getWorksheet('Label');assert.equal(label.getCell(4,44).value,14);assert.equal(label.getCell(8,44).value,12);assert.equal(label.getCell(8,45).value,26);assert.equal(r.pack[0].groups.length,4);assert.equal(r.pack[0].groups.at(-1).cartons,1);assert.equal(b.getWorksheet('Wrapping Paper').getCell('A32').value,14);
    });
  }
  await check('Comparison joins before/after by UK across size schema changes',()=>{const before=calculate(ws,month,[order]),p={...profile,sizes:profile.sizes.slice(1)},m=prepareMonthSettings({...month,profiles:[p]},ws),after=calculate(ws,m,m.orders);const c=compareSnapshots({id:'a',name:'a',orders:before.orders,result:before},{id:'b',name:'b',orders:after.orders,result:after});assert.equal(c.po[0].sizes.find(s=>s.size===3.5).before,7);assert.equal(c.po[0].sizes.find(s=>s.size===3.5).after,7);assert.equal(c.po[0].sizes.find(s=>s.size===3).after,0);});
  await check('one version applies to future months regardless of old explicit coverage',()=>{const data=structuredClone(ws);data.items[0].versions[0].all=false;data.items[0].versions[0].months=['2026-09'];assert.equal(calculate(data,month,[order]).label[0].item.item_code,'SIZE');});
  if(process.argv[2])await check('uploaded WSV model worksheet matches every original PO, field, size and total in automatic and mapped import',async()=>{
   const raw=await fs.readFile(process.argv[2]),file=new File([raw],path.basename(process.argv[2])),book=new ExcelJS.Workbook();await book.xlsx.load(raw);const sheet=book.worksheets.find(s=>s.getRow(4).getCell(8).text.includes('WSV'));
   const expected=[];for(let n=8;n<=sheet.rowCount;n++){const row=sheet.getRow(n);if(/^WSV[A-Z0-9]+$/.test(row.getCell(8).text))expected.push(row);}
   const layout=await importLayout(file,'WSV',sheet.name,4,profile);let rows;
   for(const mapping of [undefined,layout.mapping]){rows=await importOrders(file,'WSV',[profile],mapping);assert.equal(rows.length,expected.length);for(let i=0;i<rows.length;i++){const order=rows[i],row=expected[i];assert.equal(order.factoryPo,row.getCell(8).text);assert.equal(order.onPo,row.getCell(9).text);assert.equal(order.sku,row.getCell(10).text);assert.equal(order.country,row.getCell(12).text);assert.equal(order.mos,row.getCell(14).text);assert.equal(order.gender,row.getCell(16).text);assert.equal(order.exgo,row.getCell(53).text);const qty=order.source.sizes.map(s=>Number(row.getCell(s.column).text||0));assert.deepEqual(order.source.qty,qty);assert.equal(order.total,Number(row.getCell(52).text));}}
   console.log(JSON.stringify({rows:rows.length,pairs:rows.reduce((n,o)=>n+o.total,0),sheet:sheet.name,samples:rows.filter(o=>o.onPo.startsWith('ONST-')).length,loss:rows.filter(o=>o.onPo.startsWith('Loss')).length}));
  });
  console.log(`${count} size/import/Excel checks passed`);
}finally{await fs.rm(dir,{recursive:true,force:true});}
