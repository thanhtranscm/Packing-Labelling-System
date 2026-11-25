import {resolveVersionImagesForPo} from './image-application';

export const outputs=(m:any):string[]=>m.outputs||String(m.output_type||'disabled').split('_').filter((x:string)=>['label','special','card'].includes(x));
export const reuseState=(image:any,rules:any[]):string=>{
  if(image.conditions){const selected=rules.filter(r=>image.conditions.includes(r.id||r.text));return selected.some(r=>r.blocks)?'Not reusable':selected.length?'Conditional reuse':'Reusable';}
  return image.reuse||'Not reusable';
};
const versionText=(v:any)=>String(v||'').trim().toUpperCase().replace(/×/g,'*').replace(/\s+/g,' ');
const sameMaterialVersion=(a:any,b:any)=>versionText(a.item_code)===versionText(b.item_code)&&versionText(a.description)===versionText(b.description);

function buildStandardVersionIndex(items:any[]){
  const index=new Map<string,any[]>();
  for(const m of items){
    if(m.destination!=='STANDARD')continue;
    for(const v of m.versions||[]){
      const code=String(v.item_code||'').trim().toUpperCase();
      if(!code)continue;
      const list=index.get(code)||[];
      list.push(v);
      index.set(code,list);
    }
  }
  return index;
}

export function standardImageVersion(items:any[],version:any,stdIndex?:Map<string,any[]>,ownerItem?:any){
  const code=String(version.item_code||'').trim().toUpperCase();
  if(!code)return undefined;
  const sources=stdIndex?stdIndex.get(code)||[]:items.filter(m=>m.destination==='STANDARD').flatMap(m=>m.versions||[]).filter(v=>String(v.item_code||'').trim().toUpperCase()===code);
  if(!sources.length)return undefined;
  const owner=ownerItem||(version.id&&items.find(m=>(m.versions||[]).some((v:any)=>v.id===version.id)));
  const duplicateCode=owner&&(owner.versions||[]).filter((v:any)=>versionText(v.item_code)===versionText(version.item_code)).length>1;
  return sources.find(v=>v.id===version.standardVersionId)||sources.find(v=>v.id===version.id)||sources.find(v=>sameMaterialVersion(v,version))||(sources.length===1&&!duplicateCode?sources[0]:undefined);
}

function applyStandardImagesInPlace(next:any[]){
  const stdIndex=buildStandardVersionIndex(next);
  if(!stdIndex.size)return next;
  for(const m of next){
    if(m.destination==='STANDARD')continue;
    for(const v of m.versions||[]){
      const source=standardImageVersion(next,v,stdIndex,m);
      if(!source)continue;
      v.images=(source.images||[]).map((im:any)=>{
        const months=m.versions.length>1?(im.months||[]).filter((id:string)=>(v.months||[]).includes(id)):[...(im.months||[])];
        return {...im,months,poIds:months.length?[...(im.poIds||[])]:[],conditions:Array.isArray(im.conditions)?[...im.conditions]:[]};
      });
    }
  }
  return next;
}

export function syncStandardImages(items:any[]){
  const next=items.map(m=>m.destination==='STANDARD'?m:{...m,versions:(m.versions||[]).map((v:any)=>({...v}))});
  return applyStandardImagesInPlace(next);
}

export function syncStandard(previous:any[],draft:any[]){
  const std=draft.filter((m:any)=>m.destination==='STANDARD'&&m.item_code);
  const stdByNo=new Map<number,any>(std.map((m:any)=>[m.list_no,m]));
  const oldStd=previous.filter(m=>m.destination==='STANDARD');
  const oldStdKeySet=new Set(oldStd.filter(old=>old.item_code).map(old=>old.list_no));
  const names=[...new Set(draft.filter((m:any)=>m.destination!=='STANDARD').map((m:any)=>m.destination))];

  const clonedById=new Map<string,any>();
  const countryByNo=new Map<string,any>();
  for(const m of draft){
    if(m.destination==='STANDARD')continue;
    const copy={...m,versions:(m.versions||[]).map((v:any)=>({...v,months:[...(v.months||[])],images:(v.images||[]).map((im:any)=>({...im,months:[...(im.months||[])],poIds:[...(im.poIds||[])],conditions:[...(im.conditions||[])]}))}))};
    clonedById.set(m.id,copy);
    countryByNo.set(m.destination+'|'+m.list_no,copy);
  }
  const deletedIds=new Set<string>();
  const addedItems:any[]=[];

  for(const country of names){
    for(const before of oldStd){
      const after=stdByNo.get(before.list_no);
      const key=country+'|'+before.list_no;
      const m=countryByNo.get(key);
      if(!m)continue;
      const inherited=m.standardId===before.id||m.item_code===before.item_code;
      if(inherited){
        if(!after){deletedIds.add(m.id);countryByNo.delete(key);continue;}
        const privateVersions=m.versions.filter((v:any)=>!v.standardVersionId&&!before.versions.some((s:any)=>sameMaterialVersion(s,v)));
        const linked=after.versions.map((v:any)=>({...structuredClone(v),id:(m.versions.find((old:any)=>old.standardVersionId===v.id)||m.versions.find((old:any)=>!old.standardVersionId&&sameMaterialVersion(old,v)))?.id||crypto.randomUUID(),standardVersionId:v.id}));
        const perSku=!!after.perSkuImage||after.imageMode==='sku';
        Object.assign(m,{standardId:after.id,description:after.description,item_code:after.item_code,qty_per_finish:after.qty_per_finish,unit:after.unit,output_type:after.output_type,outputs:outputs(after),perSkuImage:perSku,imageMode:perSku?'sku':'single',versions:[...linked,...privateVersions]});
      }else{
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
    for(const s of std){
      if(oldStdKeySet.has(s.list_no))continue;
      const key=country+'|'+s.list_no;
      if(countryByNo.has(key))continue;
      const perSku=!!s.perSkuImage||s.imageMode==='sku';
      const created={...structuredClone(s),id:crypto.randomUUID(),destination:country,standardId:s.id,perSkuImage:perSku,imageMode:perSku?'sku':'single',versions:s.versions.map((v:any)=>({...structuredClone(v),id:crypto.randomUUID(),standardVersionId:v.id}))};
      addedItems.push(created);
      countryByNo.set(key,created);
    }
  }
  const next=[...draft.filter(m=>!deletedIds.has(m.id)).map(m=>clonedById.get(m.id)||m),...addedItems];
  return applyStandardImagesInPlace(next);
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

export function isPerSkuImage(items:any[],country:string,no:number,code?:string):boolean{
  const normalize=(s:any)=>String(s||'').trim().toUpperCase();
  if(code){
    const shared=standardImageVersion(items,{item_code:code});
    if(shared){
      const stdParent=items.find(m=>m.destination==='STANDARD'&&(m.versions||[]).some((v:any)=>v.id===shared.id));
      if(stdParent?.perSkuImage||stdParent?.imageMode==='sku')return true;
    }
  }
  const item=items.find(m=>normalize(m.destination)===normalize(country)&&m.list_no===no);
  if(!item)return false;
  if(item.perSkuImage||item.imageMode==='sku')return true;
  if(item.destination!=='STANDARD'&&(item.standardId||item.versions?.some((v:any)=>v.standardVersionId))){
    const std=items.find(s=>s.destination==='STANDARD'&&s.list_no===no);
    if(std?.perSkuImage||std?.imageMode==='sku')return true;
  }
  return false;
}

export function hasMaterialImage(items:any[],country:string,no:number,code:string,monthId:string,poId?:string,skuPoIds?:string[]){
  const normalize=(s:any)=>String(s||'').trim().toUpperCase();
  const perSku=isPerSkuImage(items,country,no,code);
  const shared=standardImageVersion(items,{item_code:code});
  if(shared)return resolveVersionImagesForPo(shared.images||[],monthId,poId,perSku,skuPoIds).length>0;
  return items.some(m=>normalize(m.destination)===normalize(country)&&m.list_no===no&&(m.versions||[]).some((v:any)=>normalize(v.item_code)===normalize(code)&&resolveVersionImagesForPo(v.images||[],monthId,poId,perSku,skuPoIds).length>0));
}

export function missingMaterialImages(versions:any[],items:any[],monthId:string,latestVersion:string,fallbackOrders:any[]=[]){
  const rows=new Map<string,any>(),imageChecks=new Map<string,boolean>();
  const poSkuMap=new Map<string,string>();
  const skuPoIdsMap=new Map<string,Set<string>>();
  const registerOrder=(o:any)=>{
    if(!o||typeof o.id!=='string'||o.previousOnly)return;
    const sku=String(o.sku||'').trim().toUpperCase();
    if(!sku)return;
    poSkuMap.set(o.id,sku);
    const set=skuPoIdsMap.get(sku)||new Set<string>();
    set.add(o.id);
    skuPoIdsMap.set(sku,set);
  };
  for(const o of fallbackOrders||[])registerOrder(o);
  for(const v of versions||[])for(const o of v.orders||[])registerOrder(o);

  for(const version of [...versions].sort((a,b)=>Number(a.id===latestVersion)-Number(b.id===latestVersion))){
    const result=version.result||{};
    const versionOrders=(version.orders&&version.orders.length?version.orders:fallbackOrders).filter((o:any)=>o&&!o.previousOnly&&!/cancel/i.test(o.status||''));
    const referenced=['label','special','card'].flatMap(section=>(result[section]||[]).map((row:any)=>({
      country:row.po?.country||row.country||row.item?.destination,
      no:row.item?.list_no??row.no,
      code:row.item?.item_code||row.code,
      poId:row.po?.id||row.poId,
      sku:row.po?.sku||row.sku
    })));
    const missingRefs=(result.missing||[]).map((row:any)=>({
      country:row.po?.country||row.country||row.item?.destination,
      no:row.no??row.item?.list_no,
      code:row.code||row.item?.item_code,
      poId:row.poId||row.po?.id,
      sku:row.sku||row.po?.sku
    }));

    const expanded:any[]=[];
    for(const material of [...missingRefs,...referenced]){
      if(!material.code||!material.country||material.no==null)continue;
      const c=String(material.country).trim().toUpperCase();
      const rawSku=String(material.sku||(material.poId?poSkuMap.get(material.poId):'')||'').trim().toUpperCase();
      if(rawSku||material.poId){
        expanded.push({...material,country:c,sku:rawSku});
      }else{
        const matchingOrders=c==='STANDARD'
          ?versionOrders
          :versionOrders.filter((o:any)=>String(o.country||'').trim().toUpperCase()===c);
        if(matchingOrders.length){
          for(const o of matchingOrders){
            expanded.push({country:c,no:material.no,code:material.code,poId:o.id,sku:String(o.sku||'').trim().toUpperCase()});
          }
        }else{
          expanded.push({...material,country:c,sku:''});
        }
      }
    }

    for(const material of expanded){
      const key=material.country+'|'+material.no+'|'+String(material.code).trim().toUpperCase();
      const sku=material.sku||'';
      const skuPoIds=sku?[...(skuPoIdsMap.get(sku)||[])]:[];
      const checkKey=key+'|'+(material.poId||'')+'|'+sku;
      if(!imageChecks.has(checkKey))imageChecks.set(checkKey,hasMaterialImage(items,material.country,material.no,material.code,monthId,material.poId,skuPoIds));
      if(imageChecks.get(checkKey))continue;
      const perSku=isPerSkuImage(items,material.country,material.no,material.code);
      const displaySku=sku||material.poId||'DEFAULT';
      const existing=rows.get(key);
      const skus=existing?new Set<string>(existing.missingSkus):new Set<string>();
      skus.add(displaySku);
      rows.set(key,{country:material.country,no:material.no,code:material.code,newest:version.id===latestVersion||(existing?.newest||false),perSku,missingSkus:[...skus],missingCount:skus.size});
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