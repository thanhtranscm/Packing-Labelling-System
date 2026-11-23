'use client';
import {useMemo,useState} from 'react';
import {Checkbox} from '@/components/ui/checkbox';
import {CountryLabel} from './country-tone';
import {isCartonLabel,isSkuImageItem,outputs,standardImageVersion} from '@/lib/material-state';

export default function QuantityBasisSettings({items,admin,vi,onSave}:any){
 const [initialCartons]=useState<Set<string>>(()=>new Set(items.filter((m:any)=>isCartonLabel(m)).map((m:any)=>m.id)));
 const [initialSkuImages]=useState<Set<string>>(()=>new Set(items.filter((m:any)=>isSkuImageItem(m)).map((m:any)=>m.id)));
 const [cartons,setCartons]=useState<Set<string>>(()=>new Set(initialCartons));
 const [skuImages,setSkuImages]=useState<Set<string>>(()=>new Set(initialSkuImages));

 const dirty=cartons.size!==initialCartons.size||[...cartons].some(id=>!initialCartons.has(id))||skuImages.size!==initialSkuImages.size||[...skuImages].some(id=>!initialSkuImages.has(id));
 const [tab,setTab]=useState<'all'|'carton'|'sku'>('all');
 const [countryFilter,setCountryFilter]=useState('ALL');
 const [query,setQuery]=useState('');
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');

 const available=useMemo(()=>items.filter((m:any)=>outputs(m).length&&(m.item_code||(m.versions||[]).some((v:any)=>v.item_code))).sort((a:any,b:any)=>a.destination===b.destination?a.list_no-b.list_no:a.destination==='STANDARD'?-1:b.destination==='STANDARD'?1:a.destination.localeCompare(b.destination)),[items]);
 const countryList=useMemo(()=>[...new Set<string>(available.map((m:any)=>m.destination))].sort((a,b)=>a==='STANDARD'?-1:b==='STANDARD'?1:a.localeCompare(b)),[available]);
 const cartonCount=available.filter((m:any)=>cartons.has(m.id)).length;
 const skuCount=available.filter((m:any)=>skuImages.has(m.id)).length;

 const visible=available.filter((m:any)=>{
  if(countryFilter!=='ALL'&&m.destination!==countryFilter)return false;
  if(tab==='carton'&&!cartons.has(m.id))return false;
  if(tab==='sku'&&!skuImages.has(m.id))return false;
  if(!query.trim())return true;
  return [m.destination,'NO. '+m.list_no,...(m.versions?.length?m.versions:[m]).map((v:any)=>v.item_code)].join(' ').toUpperCase().includes(query.trim().toUpperCase());
 });

 function toggleCarton(id:string){
  if(!admin||saving)return;
  setCartons(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next;});
 }

 function toggleSkuImage(m:any){
  if(!admin||saving)return;
  const shared=m.destination!=='STANDARD'?standardImageVersion(items,m.versions?.[0]||m):undefined;
  const stdParent=shared?items.find((a:any)=>a.destination==='STANDARD'&&(a.versions||[]).some((v:any)=>v.id===shared.id)):(m.destination==='STANDARD'?m:undefined);
  setSkuImages(current=>{
   const next=new Set(current);
   const targetId=stdParent?stdParent.id:m.id;
   const nextVal=!next.has(targetId);
   if(nextVal)next.add(targetId);else next.delete(targetId);
   if(stdParent){
    for(const row of items){
     if(row.destination!=='STANDARD'){
      const rowShared=standardImageVersion(items,row.versions?.[0]||row);
      if(rowShared&&stdParent.versions?.some((v:any)=>v.id===rowShared.id)){
       if(nextVal)next.add(row.id);else next.delete(row.id);
      }
     }
    }
   }
   return next;
  });
 }

 async function save(){
  if(saving||!dirty)return;
  setSaving(true);setError('');
  try{
   const next=items.map((m:any)=>({...m,quantityBasis:cartons.has(m.id)?'carton':'pair',imageMode:skuImages.has(m.id)?'sku':'single'}));
   if(!await onSave(next))setError(vi?'Chưa lưu được. Kiểm tra thông báo lỗi và thử lại.':'Could not save. Check the error and retry.');
  }catch(e:any){setError(e.message);}finally{setSaving(false);}
 }

 return <>
  <div className="row wrap basis-tabs">
   <button type="button" className={tab==='all'?'primary':''} aria-pressed={tab==='all'} onClick={()=>setTab('all')}>{vi?'Tất cả':'All'} ({available.length})</button>
   <button type="button" className={tab==='carton'?'primary':''} aria-pressed={tab==='carton'} onClick={()=>setTab('carton')}>{vi?'Tính theo thùng':'Per carton'} ({cartonCount})</button>
   <button type="button" className={tab==='sku'?'primary':''} aria-pressed={tab==='sku'} onClick={()=>setTab('sku')}>{vi?'Hình theo từng SKU':'Per SKU images'} ({skuCount})</button>
  </div>
  <p className="basis-help">{vi?'Thiết lập cơ sở tính (đôi / thùng) và chế độ áp dụng nhiều hình riêng cho từng SKU trong tháng (áp dụng được cho cả STANDARD lẫn từng nước đặc biệt).':'Configure calculation basis (pair / carton) and per-SKU image mode for each month (supports both STANDARD and specific countries).'}</p>
  <div className="row wrap" style={{gap:'8px'}}>
   <select aria-label={vi?'Lọc quốc gia':'Filter country'} value={countryFilter} onChange={e=>setCountryFilter(e.target.value)} style={{minWidth:'170px'}}>
    <option value="ALL">{vi?'Tất cả quốc gia':'All countries'} ({available.length})</option>
    {countryList.map(c=><option key={c} value={c}>{c}</option>)}
   </select>
   <input className="grow" type="search" aria-label={vi?'Tìm item':'Search items'} placeholder={vi?'Tìm Country, NO. hoặc Item Code':'Search Country, NO. or Item Code'} value={query} onChange={e=>setQuery(e.target.value)}/>
  </div>
  <div className="basis-item-list">
   {visible.map((m:any)=>{
    const isCarton=cartons.has(m.id);
    const isSku=skuImages.has(m.id);
    const inheritedFromStd=m.destination!=='STANDARD'&&!!standardImageVersion(items,m.versions?.[0]||m);
    return <div className="basis-item-row" key={m.id} style={{display:'grid',gridTemplateColumns:'minmax(110px,135px) 62px minmax(140px,1fr) auto',gap:'10px',alignItems:'center'}}>
     <CountryLabel value={m.destination}/>
     <span style={{fontWeight:600}}>NO. {m.list_no}</span>
     <span style={{overflow:'hidden',textOverflow:'ellipsis'}}>{(m.versions?.length?m.versions:[m]).map((v:any)=>v.item_code).filter(Boolean).join(' / ')}</span>
     <div className="row wrap" style={{gap:'12px',justifyContent:'flex-end'}}>
      <label className="row" style={{gap:'6px',cursor:admin&&!saving?'pointer':'default',fontSize:'12px',padding:'3px 8px',borderRadius:'6px',background:isCarton?'#eff6ff':'#f8fafc',border:'1px solid '+(isCarton?'#93c5fd':'#e2e8f0')}}>
       <Checkbox disabled={!admin||saving} checked={isCarton} aria-label={m.destination+' NO. '+m.list_no+' carton'} onCheckedChange={()=>toggleCarton(m.id)}/>
       <span>{isCarton?(vi?`${m.qty_per_finish} ${m.unit}/thùng`:`${m.qty_per_finish} ${m.unit}/carton`):(vi?`${m.qty_per_finish} ${m.unit}/đôi`:`${m.qty_per_finish} ${m.unit}/pair`)}</span>
      </label>
      <label className="row" title={inheritedFromStd?(vi?'Dùng chung mã STANDARD (chỉnh sẽ áp dụng cho STANDARD)':'Shared STANDARD code (toggling updates STANDARD)'):''} style={{gap:'6px',cursor:admin&&!saving?'pointer':'default',fontSize:'12px',padding:'3px 8px',borderRadius:'6px',background:isSku?'#f0fdf4':'#f8fafc',border:'1px solid '+(isSku?'#86efac':'#e2e8f0'),color:isSku?'#15803d':'inherit',fontWeight:isSku?600:400}}>
       <Checkbox disabled={!admin||saving} checked={isSku} aria-label={m.destination+' NO. '+m.list_no+' per SKU'} onCheckedChange={()=>toggleSkuImage(m)}/>
       <span>{vi?'Hình theo SKU':'Per SKU images'}</span>
      </label>
     </div>
    </div>;
   })}
   {!visible.length&&<p className="empty">{vi?'Không có item phù hợp.':'No matching items.'}</p>}
  </div>
  {error&&<p className="error" role="alert">{error}</p>}
  {admin&&<div className="row right"><button className="primary" disabled={saving||!dirty} onClick={()=>void save()}>{saving?(vi?'Đang lưu…':'Saving…'):(vi?'Lưu':'Save')}</button></div>}
 </>;
}