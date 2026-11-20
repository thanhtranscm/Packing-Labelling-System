'use client';
import {useEffect,useState} from 'react';
export default function ImageNote({image,admin,vi,onSave,group=false}:any){
 const saved=String(image.note||'');const [value,setValue]=useState(saved),[saving,setSaving]=useState(false),[error,setError]=useState('');
 useEffect(()=>{setValue(saved);setError('');},[image.id,saved]);
 if(!admin)return saved?<p className="image-note-text">{saved}</p>:null;
 const dirty=value!==saved;
 async function save(){if(!dirty||saving)return;setSaving(true);setError('');try{if(!await onSave(value))setError(vi?'Chưa lưu được ghi chú. Hãy thử lại.':'Note could not be saved. Please retry.');}catch(e:any){setError(e.message);}finally{setSaving(false);}}
 return <div className={"image-note-editor "+(group?"image-group-note-editor":"")} onClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}><label>{group?(vi?'Ghi chú chung cho tất cả hình':'Common note for all images'):(vi?'Ghi chú / Vị trí dán':'Note / Label placement')}<textarea rows={group?1:2} maxLength={2000} disabled={saving} value={value} onChange={e=>setValue(e.target.value)} placeholder={group?(vi?'Nhập ghi chú chung cho Country / NO. này…':'Enter a common note for this Country / NO.…'):(vi?'Nhập hướng dẫn riêng cho hình tem này…':'Enter instructions for this label image…')}/></label><div className="row right"><button type="button" className="primary" disabled={!dirty||saving} onClick={()=>void save()}>{saving?(vi?'Đang lưu…':'Saving…'):(vi?'Lưu ghi chú':'Save note')}</button></div>{error&&<small className="error" role="alert">{error}</small>}</div>;
}
