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

export function validateImageMonths(months:string[],language='EN'){
  if(new Set(months).size>1)throw Error(language==='VI'?'Mỗi hình chỉ được áp dụng cho một tháng.':'Each image can only be applied to one month.');
}
export function validateImageMonthChanges(before:any[],after:any[]){
  for(const item of after)for(const version of item.versions||[])for(const image of version.images||[]){
    const old=before.find((m:any)=>m.id===item.id)?.versions?.find((v:any)=>v.id===version.id)?.images?.find((im:any)=>im.id===image.id);
    const unchanged=old&&JSON.stringify([...new Set(old.months)].sort())===JSON.stringify([...new Set(image.months)].sort());
    if(!unchanged)validateImageMonths(image.months);
  }
}

export function shortMonth(month:any){if(!month)return '';const prefix=String(month.prefix||'').trim();return (prefix?prefix+' ':'')+String(month.month).padStart(2,'0')+'/'+String(month.year).slice(-2);}
export function appliedMonthLabels(ids:string[],months:any[]){return months.filter((m:any)=>ids.includes(m.id)).sort((a:any,b:any)=>a.year-b.year||a.month-b.month).map(shortMonth).join(', ');}

export function versionMonthOwner(item:any,versionId:string,monthId:string){return item?.versions?.find((v:any)=>v.id!==versionId&&(v.months||[]).includes(monthId));}
export function validateVersionMonths(item:any,versionId:string,ids:string[],months:any[],language='EN'){for(const id of ids){const owner=versionMonthOwner(item,versionId,id);if(owner)throw Error(language==='VI'?`${shortMonth(months.find(m=>m.id===id))} đã áp dụng cho version ${owner.item_code}. Bỏ tháng ở version đó trước.`:`${shortMonth(months.find(m=>m.id===id))} is already applied to version ${owner.item_code}. Remove it from that version first.`);}}
