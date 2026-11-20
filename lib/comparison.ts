import {sameOrder} from './po-state';
const imageIds=(images:any[])=>images.map(i=>i.id).sort().join('|');
export function compareSnapshots(a:any,b:any){
  if(!a||!b||a.id===b.id)throw Error('Choose two different Excel versions.');
  const x=new Map<string,any>(a.orders.map((o:any)=>[o.id,o])),y=new Map<string,any>(b.orders.map((o:any)=>[o.id,o]));
  const po=[...new Set([...x.keys(),...y.keys()])].map(id=>{const old=x.get(id),cur=y.get(id),o=cur||old;
    const fields=old&&cur?[...new Set([...Object.keys(old),...Object.keys(cur)])].filter(k=>!['status','id','sizes','profile','qty','source'].includes(k)&&JSON.stringify(old[k])!==JSON.stringify(cur[k])).map(k=>({field:k,before:old[k],after:cur[k]})):[];
    const sizes=new Map<string,{size:number,before:number,after:number}>();
    for(const [order,key] of [[old,'before'],[cur,'after']] as const)if(order)order.sizes.forEach((s:any,i:number)=>{const k=String(+s.uk),r=sizes.get(k)||{size:+s.uk,before:0,after:0};r[key]=order.qty[i];sizes.set(k,r);});
    return {id,po:o,status:!old?'New':!cur?'Cancelled':sameOrder(old,cur)?'Unchanged':'Updated',before:old?.total||0,after:cur?.total||0,fields,sizes:[...sizes.values()].sort((a,b)=>a.size-b.size)};
  });
  function roll(v:any){
    const map=new Map<string,any>();
    const add=(key:string,data:any,required:number,purchase:number,quantities:any[]=[])=>{
      const old=map.get(key)||{...data,required:0,purchase:0,bySize:{}};old.required+=required;old.purchase+=purchase;old.requiredUnavailable ||= data.requiredUnavailable;
      quantities.forEach((q:any)=>old.bySize[q.size]=(old.bySize[q.size]||0)+q.qty);map.set(key,old);
    };
    const priced=[...v.result.label,...v.result.card];
    const definitionOnly=v.result.special.filter((r:any)=>!priced.some((p:any)=>p.po.id===r.po.id&&p.item.item_code===r.item.item_code)).map((r:any)=>({...r,total:0}));
    for(const r of [...priced,...definitionOnly]){
      const key=r.po.country+'|'+r.item.item_code;
      add(key,{code:r.item.item_code,country:r.po.country,no:r.item.list_no,description:r.item.description,images:r.item.images||[],type:'material',requiredUnavailable:!!r.requiredUnavailable},r.requiredTotal,r.total,r.required.map((q:number,i:number)=>({size:r.po.sizes[i].uk,qty:q})));
    }
    for(const r of v.result.pack)for(const [i,g] of r.groups.entries())for(const [kind,code,dimension,required,purchase] of [
      ['Outer',g.outer,g.outerDimension,g.cartons,g.purchaseCartons],['Empty',g.emptyCode,g.emptyDimension,g.empty,g.purchaseEmpty],['Inner',g.innerCode,g.innerDimension,g.pairs,g.purchaseInner]]){
      const k=`${kind}|${code||'Group '+(i+1)}|${dimension||''}`;
      add(k,{code:`${kind}: ${code||'Group '+(i+1)} ${dimension||''}`,country:'All',packagingKind:kind,no:0,images:[],type:'packaging'},+required||0,+purchase||0);
    }
    for(const p of v.result.paper){const key=p.kind+'|'+p.from+'|'+p.to;add(key,{code:p.kind+' '+p.code+' | UK '+p.from+' ~ '+p.to,country:'All',no:0,images:[],type:'paper'},p.required,p.total);if(v.kind!=='upload')map.get(key).purchase=Math.ceil(map.get(key).required*(1+(p.buffer||0)/100));}
    return map;
  }
  const u=roll(a),v=roll(b);
  const materials=[...new Set([...u.keys(),...v.keys()])].map(key=>{
    const old=u.get(key),cur=v.get(key),m=cur||old;
    const counterpart=!old&&m.type==='material'?[...u.values()].find(p=>p.country===m.country&&p.no===m.no&&p.code!==m.code):null;
    const beforeImages=old?.images||counterpart?.images||[],afterImages=cur?.images||[];
    const retained=beforeImages.filter((i:any)=>afterImages.some((j:any)=>j.id===i.id)),removed=beforeImages.filter((i:any)=>!afterImages.some((j:any)=>j.id===i.id)),added=afterImages.filter((i:any)=>!beforeImages.some((j:any)=>j.id===i.id));
    const reusable=removed.some((im:any)=>im.reuse==='Reusable');const conditional=removed.some((im:any)=>im.reuse==='Conditional reuse');
    const decision=counterpart?'Replace':!old?'Extra':!cur?reusable?'Continue using':conditional?'Check reuse conditions':'Stop using':imageIds(beforeImages)!==imageIds(afterImages)?'Replace':'Continue using';
    const sizes=[...new Set([...Object.keys(old?.bySize||{}),...Object.keys(cur?.bySize||{})])].map(size=>({size:+size,before:old?.bySize[size]||0,after:cur?.bySize[size]||0})).sort((a,b)=>a.size-b.size);
    return {...m,beforeRequired:(old?.requiredUnavailable||(m.type==='packaging'&&a.result.packagingRequiredUnavailable))?null:old?.required||0,afterRequired:(cur?.requiredUnavailable||(m.type==='packaging'&&b.result.packagingRequiredUnavailable))?null:cur?.required||0,beforePurchase:old?.purchase||0,afterPurchase:cur?.purchase||0,delta:(cur?.purchase||0)-(old?.purchase||0),decision,oldImages:beforeImages,newImages:afterImages,retainedImages:retained,removedImages:removed,addedImages:added,sizes};
  });
  return {po,materials,warning:[a.historicalWarning,b.historicalWarning].filter(Boolean).join(' '),beforeName:a.name,afterName:b.name};
}
