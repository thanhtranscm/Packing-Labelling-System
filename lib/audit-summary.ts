const fieldNames:Record<string,string>={item_code:'Item code',description:'Description',qty_per_finish:'Quantity per basis',quantityBasis:'Calculation basis',unit:'Unit',outputs:'Output sheets',output_type:'Output sheets',displayVersion:'Displayed version',name:'Name',status:'Status',show:'Visible',prefix:'Prefix',email:'Email',role:'Role',active:'Active',title:'Title',from:'From size',to:'To size',outer:'Outer carton code',inner:'Inner box code',empty:'Empty box code',outerDimension:'Outer carton dimension',innerDimension:'Inner box dimension',emptyDimension:'Empty box dimension',buffer:'Buffer',materialBuffer:'Country / NO. purchase buffer',months:'Applied months',imageNote:'Common image instructions',note:'Image placement / instructions',conditions:'Reuse criteria',blocks:'Not reusable',all:'All months',qty:'Quantity',total:'Total pairs',settings:'Monthly settings',groups:'Carton / box groups',wrapping:'Wrapping',stuffing:'Stuffing',uk:'UK',eu:'EU',us:'US',jp:'JP',br:'BR',cn:'CN',orders:'POs',country:'Country',factoryPo:'Factory PO',onPo:'ON PO',sku:'SKU',exgo:'EXGO',mos:'MOS'};
const internal=/(^|\.)(?:id|fileId|standardId|standardVersionId|displayVersion|masterReference|revision|importRevision|generatedImportRevision|profileId|controlCleared|storageKey|actor|created|source|latestVersion)(?:$|\.)/;
function display(v:any):string{
  if(v===undefined||v===null||v==='')return '—';
  if(typeof v==='boolean')return v?'Yes':'No';
  if(typeof v==='number')return v.toLocaleString();
  if(typeof v==='string')return /^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(v)?'—':v;
  if(Array.isArray(v))return v.every(x=>['string','number'].includes(typeof x))?v.slice(0,8).map(display).join(', ')+(v.length>8?` (+${v.length-8})`:''):`${v.length} entries`;
  return v.name||v.title||v.item_code||v.email||v.country||'Updated details';
}
export function auditSummary(value:any,action='',detailed=false):{label:string,before:string,after:string}[]{
  let d:any;try{d=typeof value==='string'?JSON.parse(value):value;}catch{return [{label:'Details',before:'',after:'Change recorded'}]}
  if(!d)return [];
  if(Array.isArray(d.summary))return d.summary;
  if(!detailed&&/^Imported \d+ POs from /i.test(action)){const match=/^Imported (\d+) POs from (.*)$/i.exec(action)!;return [{label:'PO quantity',before:'',after:match[1]},{label:'Source file',before:'',after:match[2]}];}
  if(/authorized user/.test(action))return [{label:'User',before:'',after:d.email},...['name','role','active'].map(key=>({label:fieldNames[key]||key,before:display(d.before?.[key]),after:display(d.after?.[key])}))];
  if(!d.changes&&!d.before)return Object.entries(d).filter(([key])=>!internal.test(key)).map(([key,v])=>({label:key==='filename'?'File':fieldNames[key]||key,before:'',after:display(v)}));
  const changes:any[]=d.changes||[];
  if(!d.changes){const walk=(a:any,b:any,path:string)=>{if(JSON.stringify(a)===JSON.stringify(b))return;if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){for(const k of new Set([...Object.keys(a),...Object.keys(b)]))walk(a[k],b[k],path?path+'.'+k:k)}else changes.push({path,before:a,after:b})};walk(d.before,d.after,'')}
  const files=changes.filter(c=>/\.versions \/ /.test(c.path)&&((c.after||c.before)?.POs));
  if(files.length)return files.flatMap(c=>{const v=c.after||c.before,month=c.path.match(/months \/ ([^.]+)/)?.[1]||'';return [{label:'Month',before:'',after:month},{label:c.after?'Generated file':'Removed file',before:'',after:v.name},{label:'PO quantity',before:'',after:String(v.POs.length)},...(detailed?[{label:'POs',before:'',after:v.POs.slice(0,200).join(', ')+(v.POs.length>200?` … (+${v.POs.length-200} POs)`:'')},...(v.pairs!==undefined?[{label:'Total pairs',before:'',after:display(v.pairs)}]:[])]:[])]});
  const expanded:any[]=[];
  const flatten=(c:any)=>{if(internal.test(c.path)||expanded.length>=(detailed?120:6))return;if(detailed&&((c.before&&typeof c.before==='object')||(c.after&&typeof c.after==='object'))){const a=c.before||{},b=c.after||{};for(const key of new Set([...Object.keys(a),...Object.keys(b)])){if(JSON.stringify(a[key])!==JSON.stringify(b[key]))flatten({path:c.path+'.'+key,before:a[key],after:b[key]});}}else expanded.push(c)};
  for(const change of changes){if(internal.test(change.path)||/^months .*\.(latest|runs|changes|cancelled|updatedCounts|imports)(?: |\.|$)/.test(change.path))continue;flatten(change);}
  const summary=expanded.filter(c=>!(c.path.endsWith('.createDate')&&String(c.before).slice(0,10)===String(c.after).slice(0,10))).filter(c=>!internal.test(c.path)&&!/^months .*\.(latest|runs|changes|cancelled|updatedCounts|imports)(?: |\.|$)/.test(c.path)).slice(0,detailed?120:6).map(c=>{
    const raw=c.path.replace(/[a-f0-9]{8}-[a-f0-9-]{27,}/gi,'').replace(/^(items|months|information|reuse|users) \/ /,'');
    const segments=raw.split('.'),field=segments.pop()||raw;const label=[segments.join('.').replace(/\.versions \/ /,' · Version ').replace(/\.images \/ /,' · Image '),fieldNames[field]||field.replace(/([a-z])([A-Z])/g,'$1 $2')].filter(Boolean).join(' · ');
    return {label,before:display(c.before),after:display(c.after)};
  });
  if(detailed&&/^Imported \d+ POs from /i.test(action)){const match=/^Imported (\d+) POs from (.*)$/i.exec(action)!;return [{label:'PO quantity',before:'',after:match[1]},{label:'Source file',before:'',after:match[2]},...summary];}
  return summary;
}
