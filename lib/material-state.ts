import {resolveVersionImagesForPo} from './image-application';

export const outputs=(m:any):string[]=>m.outputs||String(m.output_type||'disabled').split('_').filter((x:string)=>['label','special','card'].includes(x));
export const reuseState=(image:any,rules:any[]):string=>{
  if(image.conditions){const selected=rules.filter(r=>image.conditions.includes(r.id||r.text));return selected.some(r=>r.blocks)?'Not reusable':selected.length?'Conditional reuse':'Reusable';}
  return image.reuse||'Not reusable';
};
const versionText=(v:any)=>String(v||'').trim().toUpperCase().replace(/×/g,'*').replace(/\s+/g,' ');
const sameMaterialVersion=(a:any,b:any)=>versionText(a.item_code)===versionText(b.item_code)&&versionText(a.description)===versionText(b.description);
export function standardImageVersion(items:any[],version:any){
  const code=String(version.item_code||'').trim().toUpperCase();
  if(!code)return undefined;
  const sources=items.filter(m=>m.destination==='STANDARD').flatMap(m=>m.versions||[]).filter(v=>String(v.item_code||'').trim().toUpperCase()===code);
  // Prefer the explicitly linked Standard version if a code appears in multiple rows.
  const owner=version.id&&items.find(m=>(m.versions||[]).some((v:any)=>v.id===version.id));
  const duplicateCode=owner&&(owner.versions||[]).filter((v:any)=>versionText(v.item_code)===versionText(version.item_code)).length>1;
  return sources.find(v=>v.id===version.standardVersionId)||sources.find(v=>v.id===version.id)||sources.find(v=>sameMaterialVersion(v,version))||(sources.length===1&&!duplicateCode?sources[0]:undefined);
}
export function syncStandardImages(items:any[]){
  const next=structuredClone(items);
  for(const m of next)if(m.destination!=='STANDARD')for(const v of m.versions||[]){
    const source=standardImageVersion(next,v);if(!source)continue;
    v.images=structuredClone(source.images||[]).map((im:any)=>{
      const months=m.versions.length>1?(im.months||[]).filter((id:string)=>(v.months||[]).includes(id)):im.months||[];
      return {...im,months,poIds:months.length?(im.poIds||[]):[]};
    });
  }
  return next;
}
export function syncStandard(previous:any[],draft:any[]){
  const next=structuredClone(draft),std=next.filter((m:any)=>m.destination==='STANDARD'&&m.item_code),oldStd=previous.filter(m=>m.destination==='STANDARD');
  const names=[...new Set(next.filter((m:any)=>m.destination!=='STANDARD').map((m:any)=>m.destination))];
  for(const country of names){
    for(const before of oldStd){
      const after=std.find((m:any)=>m.list_no===before.list_no);
      const m=next.find((m:any)=>m.destination===country&&m.list_no===before.list_no);if(!m)continue;
      const inherited=m.standardId===before.id||m.item_code===before.item_code;
      if(inherited){
        if(!after){next.splice(next.indexOf(m),1);continue;}
        const privateVersions=m.versions.filter((v:any)=>!v.standardVersionId&&!before.versions.some((s:any)=>sameMaterialVersion(s,v)));
        const linked=after.versions.map((v:any)=>({...structuredClone(v),id:(m.versions.find((old:any)=>old.standardVersionId===v.id)||m.versions.find((old:any)=>!old.standardVersionId&&sameMaterialVersion(old,v)))?.id||crypto.randomUUID(),standardVersionId:v.id}));
        Object.assign(m,{standardId:after.id,description:after.description,item_code:after.item_code,qty_per_finish:after.qty_per_finish,unit:after.unit,output_type:after.output_type,outputs:outputs(after),...(after.imageMode?{imageMode:after.imageMode}:{}),versions:[...linked,...privateVersions]});
      }else{
        // A country can keep its own replacement and still subscribe to Standard versions.
        const follows=m.versions.some((v:any)=>v.standardVersionId||before.versions.some((s:any)=>sameMaterialVersion(s,v)));
        if(follows&&after){
          const privateVersions=m.versions.filter((v:any)=>!v.standardVersionId&&!before.versions.some((s:any)=>sameMaterialVersion(s,v)));
          const privateMonths=new Set(privateVersions.flatMap((v:any)=>v.months||[]));
          const linked=after.versions.map((source:any)=>{
            const old=m.versions.find((v:any)=>v.standardVersionId===source.id)||m.versions.find((v:any)=>!v.standardVersionId&&sameMaterialVersion(v,source));
            const months=(source.months||[]).filter((id:string)=>!privateMonths.has(id));
            return {...structuredClone(source),id:old?.id||crypto.randomUUID(),standardVersionId:source.id,months,all:privateVersions.some((v:any)=>v.all)?false:source.all,images:(source.images||[]).map((im:any)=>{const kept=(im.months||[]).filter((id:string)=>months.includes(id));return {...structuredClone(im),months:kept,poIds:kept.length?(im.poIds||[]):[]};})};
          });
          m.versions=[...privateVersions,...linked];
        }else if(follows&&!after)m.versions=m.versions.filter((v:any)=>!v.standardVersionId&&!before.versions.some((s:any)=>sameMaterialVersion(s,v)));
      }
    }
    for(const s of std.filter((m:any)=>!oldStd.some(old=>old.list_no===m.list_no&&old.item_code))){
      const existing=next.find((m:any)=>m.destination===country&&m.list_no===s.list_no);if(existing)continue;
      next.push({...structuredClone(s),id:crypto.randomUUID(),destination:country,standardId:s.id,versions:s.versions.map((v:any)=>({...structuredClone(v),id:crypto.randomUUID(),standardVersionId:v.id}))});
    }
  }
  return syncStandardImages(next);
}

// Empty Standard placeholders are not replacement materials.
export function countryMaterialTone(items:any[],country:string){
  if(country==='STANDARD')return '';
  const active=(m:any)=>outputs(m).length>0&&String(m.item_code||'').trim()&&!/^\.+$/.test(String(m.item_code).trim());
  const standard=items.filter(m=>m.destination==='STANDARD'&&active(m));
  const rows=items.filter(m=>m.destination===country&&active(m));
  const code=(m:any)=>String(m.item_code).trim().toUpperCase();
  const replace=rows.some(m=>standard.some(s=>s.list_no===m.list_no&&code(s)!==code(m)));
  const extra=rows.some(m=>!standard.some(s=>s.list_no===m.list_no));
  return replace&&extra?'both':replace?'replace':extra?'extra':'';
}
export function itemMaterialTone(items:any[],item:any){
  if(item.destination==='STANDARD'||!outputs(item).length||!String(item.item_code||'').trim())return '';
  const standard=items.find(s=>s.destination==='STANDARD'&&s.list_no===item.list_no&&outputs(s).length&&String(s.item_code||'').trim()&&!/^\.+$/.test(String(s.item_code).trim()));
  return !standard?'extra':String(standard.item_code).trim().toUpperCase()!==String(item.item_code).trim().toUpperCase()?'replace':'';
}

// Reconcile the complete current master; saved exports and snapshots are untouched.
export function reconcileStandardWorkspace(data:any){
  const before=JSON.stringify(data.items);
  const migrate=data.standardInheritanceRevision!==1;
  if(migrate){
    for(const item of data.items.filter((m:any)=>m.destination==='STANDARD'))for(const version of item.versions||[]){
      const candidates=new Map<string,any[]>();
      for(const image of version.images||[]){
        if(image.months?.length)continue;
        const match=/^(?:RR_)?(\d{4}|\d{2})_([A-Za-z]{3})_/i.exec(image.name||'');if(!match)continue;
        const year=+match[1]+(match[1].length===2?2000:0),month=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(match[2].toLowerCase())+1;
        const eligible=data.months.filter((m:any)=>m.year===year&&m.month===month&&(item.versions.length===1||(version.months||[]).includes(m.id)));
        if(eligible.length!==1)continue;
        const id=eligible[0].id; candidates.set(id,[...(candidates.get(id)||[]),image]);
      }
      for(const [id,images] of candidates)if(images.length===1&&!version.images.some((im:any)=>im.months?.includes(id)))images[0].months=[id];
    }
    data.standardInheritanceRevision=1;
  }
  data.items=syncStandard(data.items,data.items);
  return migrate||before!==JSON.stringify(data.items);
}

export function isSkuImageItem(item:any){
  return item?.imageMode==='sku';
}

export function isSkuImageMaterial(items:any[],country:string,no:number,code:string){
  const normalize=(s:any)=>String(s||'').trim().toUpperCase();
  const c=normalize(country),k=normalize(code);
  const direct=items.find(m=>normalize(m.destination)===c&&m.list_no===no);
  if(direct){
    if(direct.imageMode==='sku')return true;
    if(direct.imageMode==='single')return false;
  }
  const shared=standardImageVersion(items,{item_code:code});
  if(shared){
    const stdParent=items.find(m=>m.destination==='STANDARD'&&(m.versions||[]).some((v:any)=>v.id===shared.id));
    if(stdParent)return stdParent.imageMode==='sku';
  }
  const stdSameNo=items.find(m=>m.destination==='STANDARD'&&m.list_no===no&&normalize(m.item_code)===k);
  return stdSameNo?.imageMode==='sku';
}

export function hasMaterialImage(items:any[],country:string,no:number,code:string,monthId:string,poId?:string){
  const normalize=(s:any)=>String(s||'').trim().toUpperCase();
  const shared=standardImageVersion(items,{item_code:code});
  if(shared)return resolveVersionImagesForPo(shared.images||[],monthId,poId).length>0;
  return items.some(m=>normalize(m.destination)===normalize(country)&&m.list_no===no&&(m.versions||[]).some((v:any)=>normalize(v.item_code)===normalize(code)&&resolveVersionImagesForPo(v.images||[],monthId,poId).length>0));
}

export function missingMaterialImages(versions:any[],items:any[],monthId:string,latestVersion:string,monthOrders:any[]=[]){
  const rows=new Map<string,any>(),imageChecks=new Map<string,boolean>();
  const poSkuMap=new Map<string,string>();
  const registerPo=(o:any)=>{
    if(o&&typeof o.id==='string'&&o.sku){
      const s=String(o.sku).trim().toUpperCase();
      if(s)poSkuMap.set(o.id,s);
    }
  };
  for(const o of monthOrders||[])registerPo(o);
  for(const version of versions||[]){
    for(const o of version.orders||[])registerPo(o);
    const result=version.result||{};
    for(const section of ['label','special','card']){
      for(const row of result[section]||[])registerPo(row.po);
    }
    for(const row of result.missing||[])registerPo(row.po);
  }
  for(const version of [...versions].sort((a,b)=>Number(a.id===latestVersion)-Number(b.id===latestVersion))){
    const result=version.result||{};
    const referenced=['label','special','card'].flatMap(section=>(result[section]||[]).map((row:any)=>({country:row.item?.destination||row.po?.country,no:row.item?.list_no,code:row.item?.item_code,poId:row.po?.id,sku:row.po?.sku})));
    const allMaterials=[...(result.missing||[]).map((m:any)=>({...m,poId:m.poId||m.po?.id,sku:m.sku||m.po?.sku})),...referenced];
    const groupedInVersion=new Map<string,{country:string;no:number;code:string;entries:any[]}>();
    for(const material of allMaterials){
      if(!material.code||!material.country||material.no==null)continue;
      const key=String(material.country).trim().toUpperCase()+'|'+material.no+'|'+String(material.code).trim().toUpperCase();
      let g=groupedInVersion.get(key);
      if(!g){g={country:material.country,no:material.no,code:material.code,entries:[]};groupedInVersion.set(key,g);}
      g.entries.push(material);
    }
    for(const [key,g] of groupedInVersion){
      const perSku=isSkuImageMaterial(items,g.country,g.no,g.code);
      const missingSkus=new Set<string>();
      let hasMissing=false;
      for(const entry of g.entries){
        const checkKey=key+'|'+(entry.poId||'');
        if(!imageChecks.has(checkKey))imageChecks.set(checkKey,hasMaterialImage(items,g.country,g.no,g.code,monthId,entry.poId));
        if(imageChecks.get(checkKey))continue;
        hasMissing=true;
        if(perSku){
          const skuVal=String(entry.sku||(entry.poId&&poSkuMap.get(entry.poId))||entry.poId||'UNKNOWN').trim().toUpperCase();
          missingSkus.add(skuVal);
        }
      }
      if(hasMissing){
        rows.set(key,{country:g.country,no:g.no,code:g.code,newest:version.id===latestVersion,perSku,missingSkus:[...missingSkus].sort()});
      }
    }
  }
  return [...rows.values()];
}

// Countries without replacement/extra materials share one monthly buffer group.
export function materialBufferCountry(items:any[],country:string){
 const key=String(country||'').trim().toUpperCase();
 return countryMaterialTone(items,key)?key:'STANDARD';
}
export function monthBufferCountries(items:any[],month:any){
 const orders=month.controlCleared?[]:month.orders||[];
 const countries=[...new Set<string>(orders.filter((o:any)=>!o.previousOnly&&!/cancel/i.test(o.status||'')).map((o:any)=>String(o.country||'').trim().toUpperCase()))];
 return [...new Set(countries.map(country=>materialBufferCountry(items,country)))].sort((a,b)=>a==='STANDARD'?-1:b==='STANDARD'?1:a.localeCompare(b));
}

export function isCartonLabel(item:any,country=item.destination){
 if(item.quantityBasis==='carton')return true;
 if(item.quantityBasis==='pair')return false;
 return String(country||'').trim().toUpperCase()==='THAILAND'&&[item.item_code,...(item.versions||[]).map((v:any)=>v.item_code)].some(code=>/^ON-GX101(?:$|[^0-9])/i.test(String(code||'').trim()));
}
export function materialDescription(item:any){
 const description=String(item.description||'').replace(/\s*\[QTY BASIS: CARTON\]/g,'');
 return isCartonLabel(item)&&!description.includes('[QTY BASIS: CARTON]')?description+' [QTY BASIS: CARTON]':description;
}

// A Country / NO. note applies across its versions; shared Standard versions
// inherit their source note unless the country has an explicit override.
export function materialImageNote(items:any[],item:any,version:any):string{
 if(typeof item.imageNote==='string')return item.imageNote;
 const shared=standardImageVersion(items,version);
 const source=shared&&items.find(m=>m.destination==='STANDARD'&&(m.versions||[]).some((v:any)=>v.id===shared.id));
 return typeof source?.imageNote==='string'?source.imageNote:'';
}