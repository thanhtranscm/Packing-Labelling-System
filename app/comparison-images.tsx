'use client';
import MaterialImage from './material-image';
import {useMemo} from 'react';
import {comparisonImages} from '@/lib/comparison-images';
export default function ComparisonImages({c,month,ws,language,onImage}:any){
 const {groups,obsolete}=useMemo(()=>comparisonImages(c,month,ws),[c,month,ws]);const vi=language==='VI';
 function card(im:any,label:string){return <div className="image-card" key={im.id+'|'+label}><b>{label}</b><button type="button" className="comparison-image-preview" onClick={()=>onImage(im)}><MaterialImage language={language} src={'/api/files?id='+encodeURIComponent(im.id)} alt={im.name}/></button><small>{im.name}</small>{im.reuse&&<span className="badge">{im.reuse}</span>}<small>{(im.rules||[]).map((r:any)=>r.text).join('; ')||im.condition}</small></div>;}
 const active=new Map<string,any>();
 for(const g of groups)for(const im of g.after){const row=active.get(im.id)||{image:im,materials:[]};const label=g.code+' · '+g.country;if(!row.materials.includes(label))row.materials.push(label);active.set(im.id,row);}
 const section=(title:string,rows:any[],label:string,empty:string)=><section className="group-box"><h3>{title} ({rows.length})</h3>{rows.length?<div className="image-grid">{rows.map(r=><div key={r.image.id}>{card(r.image,label)}<small className="comparison-image-materials">{[...new Set(r.materials.map((value:string)=>value.includes(' · ')?value.slice(0,value.lastIndexOf(' · ')):value))].join(', ')}</small></div>)}</div>:<p className="empty">{empty}</p>}</section>;
 return <div className="comparison-images">{section(vi?'Hình dùng trong file mới':'Images used in the new file',[...active.values()],vi?'Dùng trong file mới':'Used in new file',vi?'Không có hình đã lưu hoặc hình tham chiếu phù hợp.':'No saved images or matching references.')}{section(vi?'Hình của file cũ không dùng tiếp':'Old file images no longer used',obsolete,vi?'Không dùng tiếp':'No longer used',vi?'Không có hình ngừng dùng.':'No images discontinued.')}</div>;
}
