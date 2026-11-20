'use client';
import {useState} from 'react';
import {outputs,monthBufferCountries,countryMaterialTone} from '@/lib/material-state';
import {purchaseBuffer} from '@/lib/size-settings';
export default function MaterialBufferSettings({settings,items,month,admin,vi,onChange,renderCountryPicker}:any){
 const [selected,setSelected]=useState('');
 const norm=(v:any)=>String(v||'').trim().toUpperCase();
 const countries=monthBufferCountries(items,month);
 const country=countries.includes(selected)?selected:countries[0]||'';
 const own=items.filter((m:any)=>norm(m.destination)===country);
 const rows=country?(own.length?own:items.filter((m:any)=>norm(m.destination)==='STANDARD')).filter((m:any)=>outputs(m).some(s=>s==='label'||s==='card')).sort((a:any,b:any)=>a.list_no-b.list_no):[];
 const changes=countries.flatMap(c=>{
   const own=items.filter((m:any)=>norm(m.destination)===c);
   const materials=own.length?own:items.filter((m:any)=>norm(m.destination)==='STANDARD');
   return materials.flatMap((m:any)=>{
     const value=settings.materialBuffer?.[c]?.[m.list_no],sheets=outputs(m).filter(s=>s==='label'||s==='card');
     if(value===undefined||value===''||!Number.isFinite(Number(value))||Number(value)<0||!sheets.some(sheet=>Number(value)!==purchaseBuffer({...settings,materialBuffer:{}},c,m.list_no,sheet)))return [];
     return [{country:c,no:m.list_no,value:Number(value)}];
   }).sort((a:any,b:any)=>a.no-b.no);
 });
 function change(no:number,value:string){const all={...settings.materialBuffer},values={...all[country]};if(value==='')delete values[no];else values[no]=value;if(Object.keys(values).length)all[country]=values;else delete all[country];onChange({...settings,materialBuffer:all});}
 return <div className="material-buffer-settings"><div className="row spread wrap material-buffer-heading"><b>{vi?'Buffer riêng theo Country / NO.':'Buffer by Country / NO.'}</b><div className="material-buffer-changes" aria-live="polite">{changes.length?changes.map((r:any)=><button type="button" key={r.country+'|'+r.no} className={'buffer-change-chip market-tone-'+(countryMaterialTone(items,r.country)||'standard')} onClick={()=>setSelected(r.country)}>{r.country} · NO. {r.no}: <strong>{r.value}%</strong></button>):<span>{vi?'Đang dùng buffer mặc định':'Using default buffers'}</span>}</div>{renderCountryPicker({value:country,onChange:setSelected,options:countries.map(c=>({value:c,label:c,tone:countryMaterialTone(items,c)||'standard'}))})}</div><p>{vi?'Để trống: dùng mặc định. 0%: không buffer. Lưu bằng Save all cho tháng đang chọn.':'Blank: use default. 0%: no buffer. Save all applies to the selected month.'}</p><div className="material-buffer-scroll"><table><colgroup><col className="buffer-no-col"/><col/><col className="buffer-default-col"/><col className="buffer-custom-col"/></colgroup><thead><tr><th>NO.</th><th>{vi?'Vật tư / Version':'Material / Version'}</th><th>{vi?'Mặc định':'Default'}</th><th>{vi?'Buffer riêng (%)':'Custom buffer (%)'}</th></tr></thead><tbody>{rows.map((m:any)=>{const sheets=outputs(m).filter(s=>s==='label'||s==='card');return <tr key={m.id}><td>{m.list_no}</td><td>{(m.versions?.length?m.versions:[m]).map((v:any)=>v.item_code).filter(Boolean).join(' / ')}</td><td>{sheets.map(sheet=><span key={sheet}>{sheet==='card'?'Card':'Label'}: {purchaseBuffer({...settings,materialBuffer:{}},country,m.list_no,sheet)}% </span>)}</td><td><input type="number" min="0" max="100000" step="any" disabled={!admin} aria-label={country+' NO. '+m.list_no+' buffer'} placeholder={vi?'Mặc định':'Default'} value={settings.materialBuffer?.[country]?.[m.list_no]??''} onChange={e=>change(m.list_no,e.target.value)}/></td></tr>})}</tbody></table></div></div>;
}
