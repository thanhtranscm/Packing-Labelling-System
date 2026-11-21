export function uploadImageMonths(item:any,version:any,monthId:string){
  if(!monthId)throw Error('Select a month before uploading an image.');
  if(item.versions.length>1&&!(version.months||[]).includes(monthId))throw Error('Select this month for the version before uploading an image.');
  if((version.images||[]).some((im:any)=>(im.months||[]).includes(monthId)))return [];
  return [monthId];
}

export function imageNameIssue(image:any,months:any[]){
  const match=/^(?:RR_)?(\d{4}|\d{2})_([A-Za-z]{3})_/i.exec(image.name||'');
  if(!match)return 'format';
  const year=+match[1]+(match[1].length===2?2000:0);
  const month=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(match[2].toLowerCase())+1;
  if(!month)return 'format';
  return (image.months||[]).some((id:string)=>{const m=months.find(m=>m.id===id);return !m||m.year!==year||m.month!==month;})?'month':'';
}

export function monthOrdersList(month:any):any[]{
  if(!month)return [];
  const seen=new Set<string>(),list:any[]=[];
  const sources=[...(month.orders||[]),...(month.latest||[]),...(month.versions||[]).flatMap((v:any)=>v.orders||[])];
  for(const o of sources){
    if(!o||typeof o.id!=='string'||o.previousOnly||seen.has(o.id))continue;
    if(/^(TOTAL|GRAND TOTAL|SUBTOTAL)\b/i.test(String(o.factoryPo||o.onPo||'').trim()))continue;
    seen.add(o.id);
    list.push(o);
  }
  return list;
}

export function resolveVersionImagesForPo(images:any[],monthId:string,poId?:string):any[]{
  const monthImages=(images||[]).filter((im:any)=>(im.months||[]).includes(monthId));
  if(!poId)return monthImages;
  const specific=monthImages.filter((im:any)=>Array.isArray(im.poIds)&&im.poIds.includes(poId));
  if(specific.length)return specific;
  return monthImages.filter((im:any)=>!im.poIds||im.poIds.length===0);
}

export function validateVersionImages(images:any[],language='EN'){
  const generalMonths=new Set<string>();
  const poAssignments=new Set<string>();
  for(const im of images||[]){
    const months=im.months||[];
    if(new Set(months).size>1)throw Error(language==='VI'?'Mỗi hình chỉ được áp dụng cho một tháng.':'Each image can only be applied to one month.');
    const poIds=Array.isArray(im.poIds)?im.poIds:[];
    if(new Set(poIds).size!==poIds.length)throw Error('Duplicate PO selection on image.');
    for(const monthId of months){
      if(!poIds.length){
        if(generalMonths.has(monthId))throw Error(language==='VI'?'Đã có hình mặc định cho tháng này. Hãy chọn PO cụ thể cho hình này.':'Conflicting image assignments');
        generalMonths.add(monthId);
      }else{
        for(const poId of poIds){
          const key=monthId+'|'+poId;
          if(poAssignments.has(key))throw Error(language==='VI'?'Một PO chỉ được gắn tối đa 1 hình riêng cho mỗi mã vật tư trong tháng.':'Conflicting image assignments');
          poAssignments.add(key);
        }
      }
    }
  }
}

export function validateImageMonths(months:string[],language='EN'){
  if(new Set(months).size>1)throw Error(language==='VI'?'Mỗi hình chỉ được áp dụng cho một tháng.':'Each image can only be applied to one month.');
}

export function validateImageMonthChanges(before:any[],after:any[]){
  for(const item of after)for(const version of item.versions||[]){
    let changed=false;
    for(const image of version.images||[]){
      const old=before.find((m:any)=>m.id===item.id)?.versions?.find((v:any)=>v.id===version.id)?.images?.find((im:any)=>im.id===image.id);
      const unchanged=old&&JSON.stringify([...new Set(old.months)].sort())===JSON.stringify([...new Set(image.months)].sort())&&JSON.stringify([...new Set(old.poIds||[])].sort())===JSON.stringify([...new Set(image.poIds||[])].sort());
      if(!unchanged){validateImageMonths(image.months);changed=true;}
    }
    if(changed)validateVersionImages(version.images);
  }
}

export function shortMonth(month:any){if(!month)return '';const prefix=String(month.prefix||'').trim();return (prefix?prefix+' ':'')+String(month.month).padStart(2,'0')+'/'+String(month.year).slice(-2);}
export function appliedMonthLabels(ids:string[],months:any[]){return months.filter((m:any)=>ids.includes(m.id)).sort((a:any,b:any)=>a.year-b.year||a.month-b.month).map(shortMonth).join(', ');}

export function appliedImageLabels(image:any,months:any[]):string{
  const base=appliedMonthLabels(image?.months||[],months);
  if(!base)return '';
  const poIds=Array.isArray(image?.poIds)?image.poIds:[];
  if(!poIds.length)return base;
  const month=months.find((m:any)=>m.id===image.months[0]);
  const orders=monthOrdersList(month);
  const names=poIds.map((id:string)=>{const o=orders.find((a:any)=>a.id===id);return o?(o.factoryPo||o.onPo):'';}).filter(Boolean);
  if(names.length>0&&names.length<=2)return `${base} · ${names.join(', ')}`;
  return `${base} · ${poIds.length} PO`;
}

export function versionMonthOwner(item:any,versionId:string,monthId:string){return item?.versions?.find((v:any)=>v.id!==versionId&&(v.months||[]).includes(monthId));}
export function validateVersionMonths(item:any,versionId:string,ids:string[],months:any[],language='EN'){for(const id of ids){const owner=versionMonthOwner(item,versionId,id);if(owner)throw Error(language==='VI'?`${shortMonth(months.find(m=>m.id===id))} đã áp dụng cho version ${owner.item_code}. Bỏ tháng ở version đó trước.`:`${shortMonth(months.find(m=>m.id===id))} is already applied to version ${owner.item_code}. Remove it from that version first.`);}}