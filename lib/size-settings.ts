import {materialBufferCountry,monthBufferCountries,outputs} from './material-state';
const numeric=(value:any)=>value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value));
export function validateSizeProfile(profile:any){
  if(!profile?.sizes?.length||profile.sizes.length>50)throw Error('Size table must contain 1–50 sizes.');
  const seen=new Set<number>();let previous=-Infinity;
  for(const size of profile.sizes){
    if(!numeric(size.uk)||+size.uk<0)throw Error('Every size needs a valid UK value.');
    const uk=+size.uk;if(seen.has(uk))throw Error(`Duplicate UK size ${uk}.`);
    if(uk<=previous)throw Error('Size table must be ordered from smallest to largest UK size.');
    if(['eu','us','jp','br','cn'].some(key=>!String(size[key]??'').trim()))throw Error(`UK ${uk}: complete EU, US, JP, BR and CN conversions.`);
    seen.add(uk);previous=uk;
  }
}
export function activeProfile(month:any,workspace:any){
  const profiles=month.profiles||workspace.profiles;
  const profile=profiles?.find((p:any)=>p.id===(month.profileId||profiles[0]?.id));
  if(!profile)throw Error('Select a saved size table for this month.');
  validateSizeProfile(profile);return profile;
}
// Range membership always comes from the active table, never from a generated numeric sequence.
export function linkedSettings(settings:any,profile:any){
  validateSizeProfile(profile);const next=structuredClone(settings);
  for(const [kind,title] of [['groups','Carton / box'],['wrapping','Wrapping'],['stuffing','Stuffing']]){
    if(!Array.isArray(next[kind])||!next[kind].length)throw Error(`${title}: add at least one group.`);
    const kept:any[]=[];
    for(const group of next[kind]){
      if(!numeric(group.from)||!numeric(group.to)||+group.from>+group.to)throw Error(`${title}: invalid size range.`);
      if(kind==='groups'&&['outer','empty','inner'].some(key=>!String(group[key]||'').trim()))throw Error(`${title}: enter outer, empty and inner material codes.`);
      if(kind!=='groups'&&(!String(group.code||'').trim()||!numeric(group.qty)||+group.qty<=0))throw Error(`${title}: enter a material code and positive quantity per pair.`);
      const members=profile.sizes.filter((s:any)=>+s.uk>=+group.from&&+s.uk<=+group.to);
      if(members.length)kept.push({...group,from:+members[0].uk,to:+members.at(-1).uk});
    }
    for(const size of profile.sizes)if(kept.filter(g=>+size.uk>=+g.from&&+size.uk<=+g.to).length!==1)throw Error(`${title}: UK ${size.uk} must belong to exactly one group (no gaps or overlaps).`);
    next[kind]=kept;
  }
  for(const key of ['size','label','card','wrapping','stuffing','outer','empty','inner'])if(!numeric(next.buffer?.[key])||+next.buffer[key]<0)throw Error(`${key}: buffer must be zero or positive.`);
  const overrides=next.materialBuffer||{};
  if(typeof overrides!=='object'||Array.isArray(overrides))throw Error('Invalid country / No. buffer settings.');
  for(const [country,rows] of Object.entries(overrides)){
    if(!country.trim()||country!==country.trim().toUpperCase()||!rows||typeof rows!=='object'||Array.isArray(rows))throw Error('Invalid buffer country.');
    for(const [no,value] of Object.entries(rows))if(!/^[1-9]\d*$/.test(no)||!numeric(value)||+value<0||+value>100000)throw Error(`${country} No.${no}: buffer must be between 0 and 100000%.`);
  }
  return next;
}
export function alignOrders(orders:any[],profile:any){
  validateSizeProfile(profile);const allowed=new Set<number>(profile.sizes.map((s:any)=>+s.uk));
  return orders.map(order=>{
    if(order.profile!==profile.id)throw Error(`PO ${order.factoryPo||order.onPo}: imported table differs from the month's selected table. Clear pending PO data and reimport using the correct table.`);
    if(!Array.isArray(order.sizes)||order.sizes.length!==order.qty?.length)throw Error(`PO ${order.factoryPo||order.onPo}: size quantities are incomplete.`);
    const counts=new Map<number,number>();
    for(const [i,size] of order.sizes.entries()){
      const q=order.qty[i];if(!numeric(size.uk)||counts.has(+size.uk)||!Number.isSafeInteger(q)||q<0)throw Error(`PO ${order.factoryPo||order.onPo}: invalid size or quantity.`);
      if(!allowed.has(+size.uk)&&q>0)throw Error(`Cannot remove UK ${size.uk}: PO ${order.factoryPo||order.onPo} has ${q} pairs. Keep this size or import a corrected source file.`);
      counts.set(+size.uk,q);
    }
    const qty=profile.sizes.map((size:any)=>counts.get(+size.uk)||0);
    if(qty.reduce((a:number,b:number)=>a+b,0)!==order.total)throw Error(`PO ${order.factoryPo||order.onPo}: size quantities do not match TOTAL.`);
    return {...order,sizes:structuredClone(profile.sizes),qty};
  });
}
export function prepareMonthSettings(month:any,workspace:any){
  const profile=activeProfile(month,workspace);
  return {...month,settings:linkedSettings(month.settings,profile),orders:alignOrders(month.orders||[],profile)};
}

// A zero override is intentional. Missing values inherit the existing sheet default.
export function purchaseBuffer(settings:any,country:string,no:number,sheet:string,items?:any[]){
  const key=items?materialBufferCountry(items,country):String(country).trim().toUpperCase();
  const value=settings.materialBuffer?.[key]?.[String(no)];
  return value!==undefined?Number(value):Number(sheet==='card'?settings.buffer.card:no===1?settings.buffer.size:settings.buffer.label);
}

export function purchaseBufferSummary(settings:any,items:any[],month:any){
 const groups=[['size','Size Label'],['label','Other Label'],['card','Card'],['wrapping','Wrapping Paper'],['stuffing','Stuffing Paper'],['outer','Outer Carton'],['empty','Empty Box'],['inner','Inner Box']].map(([key,label])=>({key,label,value:Number(settings?.buffer?.[key]??0),custom:[] as {country:string,no:number,value:number}[]}));
 for(const country of monthBufferCountries(items,month)){
  const own=items.filter((m:any)=>String(m.destination).trim().toUpperCase()===country),rows=own.length?own:items.filter((m:any)=>m.destination==='STANDARD');
  for(const m of [...rows].sort((a:any,b:any)=>a.list_no-b.list_no)){
   const raw=settings?.materialBuffer?.[country]?.[m.list_no];if(raw===undefined||raw===''||!Number.isFinite(Number(raw))||Number(raw)<0)continue;
   for(const sheet of outputs(m).filter(s=>s==='label'||s==='card')){
    const group=groups.find(g=>g.key===(sheet==='card'?'card':m.list_no===1?'size':'label'))!;
    if(Number(raw)!==group.value)group.custom.push({country,no:m.list_no,value:Number(raw)});
   }
  }
 }
 return groups.filter(g=>(Number.isFinite(g.value)&&g.value!==0)||g.custom.length);
}

// Same carton rules as Outer - Empty - Inner: six pairs, split by group; OWN also splits by size.
export function cartonCounts(order:any,groups:any[]):number[]{
 const result=order.qty.map(()=>0),mixed=/^DIST(?:RIBUTOR)?$/i.test(String(order.type).trim());
 for(const group of groups){let pairs=0;
  order.sizes.forEach((size:any,i:number)=>{
   if(+size.uk<+group.from||+size.uk>+group.to)return;
   const q=order.qty[i];result[i]=mixed?Math.ceil((pairs+q)/6)-Math.ceil(pairs/6):Math.ceil(q/6);pairs+=q;
  });
 }
 return result;
}
