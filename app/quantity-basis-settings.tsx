'use client';
import {useMemo,useState} from 'react';
import {Checkbox} from '@/components/ui/checkbox';
import {isCartonLabel,outputs} from '@/lib/material-state';
import {CountryLabel} from './country-tone';

export default function QuantityBasisSettings({items,admin,vi,onSave}:any){
 const [initialCartons]=useState<Set<string>>(()=>new Set(items.filter((m:any)=>isCartonLabel(m)).map((m:any)=>m.id)));
 const [initialSkuImages]=useState<Set<string>>(()=>new Set(items.filter((m:any)=>!!m.perSkuImage).map((m:any)=>m.id)));
 const [cartons,setCartons]=useState<Set<string>>(()=>new Set(initialCartons));
 const [skuImages,setSkuImages]=useState<Set<string>>(()=>new Set(initialSkuImages));
 const dirty=cartons.size!==initialCartons.size||[...cartons].some(id=>!initialCartons.has(id))||skuImages.size!==initialSkuImages.size||[...skuImages].some(id=>!initialSkuImages.has(id));
 const [tab,setTab]=useState<'all'|'carton'|'sku'>('all'),[countryFilter,setCountryFilter]=useState('ALL'),[query,setQuery]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState('');

 const available=useMemo(()=>items.filter((m:any)=>outputs(m).length&&(m.item_code||(m.versions||[]).some((v:any)=>v.item_code))).sort((a:any,b:any)=>a.destination===b.destination?a.list_no-b.list_no:a.destination==='STANDARD'?-1:b.destination==='STANDARD'?1:a.destination.localeCompare(b.destination)),[items]);
 const countryList=useMemo(()=>[...new Set<string>(available.map((m:any)=>m.destination))],[available]);
 const cartonCount=available.filter((m:any)=>cartons.has(m.id)).length;
 const skuCount=available.filter((m:any)=>skuImages.has(m.id)).length;

 const visible=available.filter((m:any)=>{
  if(countryFilter!=='ALL'&&m.destination!==countryFilter)return false;
  if(tab==='carton'&&!cartons.has(m.id))return false;
  if(tab==='sku'&&!skuImages.has(m.id))return false;
  const q=query.trim().toUpperCase();
  if(!q)return true;
  return [m.destination,'NO. '+m.list_no,m.description,...(m.versions?.length?m.versions:[m]).flatMap((v:any)=>[v.item_code,v.description])].join(' ').toUpperCase().includes(q);
 });

 function toggleCarton(id:string){
  if(!admin||saving)return;
  setCartons(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next;});
 }

 function toggleSkuImage(item:any){
  if(!admin||saving)return;
  setSkuImages(current=>{
   const next=new Set(current);
   const enable=!next.has(item.id);
   if(enable)next.add(item.id);else next.delete(item.id);
   if(item.destination==='STANDARD'){
    for(const other of items){
     if(other.destination!=='STANDARD'&&other.list_no===item.list_no&&(other.standardId===item.id||other.item_code===item.item_code)){
      if(enable)next.add(other.id);else next.delete(other.id);
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
   const next=items.map((m:any)=>({...m,quantityBasis:cartons.has(m.id)?'carton':'pair',perSkuImage:skuImages.has(m.id)}));
   if(!await onSave(next))setError(vi?'Chưa lưu được. Kiểm tra thông báo lỗi và thử lại.':'Could not save. Check the error and retry.');
  }catch(e:any){setError(e.message);}finally{setSaving(false);}
 }

 return <>
  <div className="row wrap basis-tabs">
   <button type="button" className={tab==='all'?'primary':''} aria-pressed={tab==='all'} onClick={()=>setTab('all')}>{vi?'Tất cả vật tư':'All items'} ({available.length})</button>
   <button type="button" className={tab==='carton'?'primary':''} aria-pressed={tab==='carton'} onClick={()=>setTab('carton')}>{vi?'Tính theo thùng':'Per carton'} ({cartonCount})</button>
   <button type="button" className={tab==='sku'?'primary':''} aria-pressed={tab==='sku'} onClick={()=>setTab('sku')}>{vi?'Hình theo từng SKU':'Per-SKU image'} ({skuCount})</button>
  </div>
  <p className="basis-help">{vi?'Tích "Theo thùng" để tính SL theo số thùng carton (bỏ tích = tính theo đôi). Tích "Hình theo SKU" để yêu cầu mỗi SKU trong tháng có 1 hình riêng (bộ đếm Missing Image sẽ đếm số SKU còn thiếu).':'Check "Per carton" to calculate by carton count (unchecked = per pair). Check "Per-SKU image" to require one separate image per SKU in each month.'}</p>
  <div className="row wrap" style={{gap:'8px'}}>
   <select aria-label={vi?'Lọc quốc gia':'Filter country'} value={countryFilter} onChange={e=>setCountryFilter(e.target.value)} style={{minWidth:'160px'}}>
    <option value="ALL">{vi?'Tất cả quốc gia':'All countries'} ({countryList.length})</option>
    {countryList.map(c=><option key={c} value={c}>{c}</option>)}
   </select>
   <input className="grow" type="search" aria-label={vi?'Tìm item':'Search items'} placeholder={vi?'Tìm Country, NO. hoặc Item Code...':'Search Country, NO. or Item Code...'} value={query} onChange={e=>setQuery(e.target.value)}/>
  </div>
  <div className="basis-item-list">
   {visible.map((m:any)=>{
    const isCarton=cartons.has(m.id);
    const isPerSku=skuImages.has(m.id);
    return <div className="basis-item-row" key={m.id} style={{display:'grid',gridTemplateColumns:'minmax(110px,130px) 64px minmax(160px,1fr) auto auto',alignItems:'center',gap:'10px'}}>
     <span><CountryLabel value={m.destination}/></span>
     <b>NO. {m.list_no}</b>
     <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={(m.versions?.length?m.versions:[m]).map((v:any)=>`${v.item_code} - ${v.description}`).filter(Boolean).join(' | ')}>
      <b>{(m.versions?.length?m.versions:[m]).map((v:any)=>v.item_code).filter(Boolean).join(' / ')}</b>
      <small style={{display:'block',color:'#64748b'}}>{m.qty_per_finish} {m.unit} / {isCarton?(vi?'thùng':'carton'):(vi?'đôi':'pair')}</small>
     </span>
     <label className="row" style={{gap:'6px',padding:'4px 8px',borderRadius:'6px',background:isCarton?'#eff6ff':'#f8fafc',border:'1px solid '+(isCarton?'#93c5fd':'#e2e8f0'),cursor:admin&&!saving?'pointer':'default',whiteSpace:'nowrap',fontSize:'12px',fontWeight:600}}>
      <Checkbox disabled={!admin||saving} checked={isCarton} aria-label={m.destination+' NO. '+m.list_no+' carton'} onCheckedChange={()=>toggleCarton(m.id)}/>
      <span>{vi?'Theo thùng':'Per carton'}</span>
     </label>
     <label className="row" style={{gap:'6px',padding:'4px 8px',borderRadius:'6px',background:isPerSku?'#f0fdf4':'#f8fafc',border:'1px solid '+(isPerSku?'#86efac':'#e2e8f0'),cursor:admin&&!saving?'pointer':'default',whiteSpace:'nowrap',fontSize:'12px',fontWeight:600,color:isPerSku?'#15803d':'inherit'}}>
      <Checkbox disabled={!admin||saving} checked={isPerSku} aria-label={m.destination+' NO. '+m.list_no+' per SKU'} onCheckedChange={()=>toggleSkuImage(m)}/>
      <span>{vi?'Hình theo SKU':'Per-SKU image'}</span>
     </label>
    </div>;
   })}
   {!visible.length&&<p className="empty">{vi?'Không có item phù hợp.':'No matching items.'}</p>}
  </div>
  {error&&<p className="error" role="alert">{error}</p>}
  {admin&&<div className="row right"><button className="primary" disabled={saving||!dirty} onClick={()=>void save()}>{saving?(vi?'Đang lưu…':'Saving…'):(vi?'Lưu':'Save')}</button></div>}
 </>;
}