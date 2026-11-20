'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import MaterialImage from './material-image';
import {zoomLayout,anchoredZoomScroll} from '@/lib/image-zoom';
export default function GeneralImageViewer({src,alt,language}:any){
 const viewport=useRef<HTMLDivElement>(null),drag=useRef<any>(null),pendingScroll=useRef<{x:number,y:number}|null>(null);
 const [box,setBox]=useState({w:1,h:1}),[natural,setNatural]=useState({w:0,h:0}),[zoom,setZoom]=useState(1);
 const layout=zoomLayout(natural,box,zoom);const {fit,w,h,stageW,stageH,left,top}=layout;
 const vi=language==='VI',minZoom=Math.min(.25,1/fit),maxZoom=Math.max(16,1/fit);
 useEffect(()=>{const el=viewport.current;if(!el)return;const measure=()=>setBox({w:Math.max(1,el.clientWidth),h:Math.max(1,el.clientHeight)});measure();const observer=new ResizeObserver(measure);observer.observe(el);return()=>observer.disconnect();},[]);
 function changeZoom(next:number,x=box.w/2,y=box.h/2){
  const el=viewport.current;if(!el)return;next=Math.max(minZoom,Math.min(maxZoom,next));
  pendingScroll.current=anchoredZoomScroll(layout,zoomLayout(natural,box,next),{x:el.scrollLeft,y:el.scrollTop},{x,y});
  setZoom(next);
 }
 const current=useRef(changeZoom);current.current=changeZoom;
 const currentZoom=useRef(zoom);currentZoom.current=zoom;
 useEffect(()=>{const el=viewport.current;if(!el)return;const wheel=(e:WheelEvent)=>{e.preventDefault();const rect=el.getBoundingClientRect();current.current(currentZoom.current*Math.exp(-Math.max(-100,Math.min(100,e.deltaY))*.003),e.clientX-rect.left,e.clientY-rect.top);};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);},[]);
 useLayoutEffect(()=>{const el=viewport.current,scroll=pendingScroll.current;if(el&&scroll){el.scrollLeft=scroll.x;el.scrollTop=scroll.y;pendingScroll.current=null;}},[zoom,w,h]);
 function endDrag(e:any){drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}
 return <div className="general-image-viewer"><div className="general-zoom-toolbar"><button aria-label={vi?'Thu nhỏ':'Zoom out'} disabled={!natural.w||zoom<=minZoom} onClick={()=>changeZoom(zoom/1.25)}>−</button><output aria-live="polite">{Math.round(zoom*100)}%</output><button aria-label={vi?'Phóng to':'Zoom in'} disabled={!natural.w||zoom>=maxZoom} onClick={()=>changeZoom(zoom*1.25)}>+</button><button disabled={!natural.w} onClick={()=>changeZoom(1)}>{vi?'Vừa khung':'Fit to window'}</button><button disabled={!natural.w} onClick={()=>changeZoom(1/fit)}>{vi?'Kích thước gốc':'Original size'}</button></div><div ref={viewport} className="general-zoom-viewport" tabIndex={0} aria-label={vi?'Lăn chuột để phóng to, kéo để di chuyển hình':'Scroll to zoom; drag to move image'} onKeyDown={e=>{if(e.key==='+'||e.key==='='){e.preventDefault();changeZoom(zoom*1.25);}else if(e.key==='-'){e.preventDefault();changeZoom(zoom/1.25);}else if(e.key==='0'){e.preventDefault();changeZoom(1);}}} onPointerDown={e=>{if(e.button!==0||!natural.w)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,left:e.currentTarget.scrollLeft,top:e.currentTarget.scrollTop};}} onPointerMove={e=>{const start=drag.current;if(!start)return;e.currentTarget.scrollLeft=start.left+start.x-e.clientX;e.currentTarget.scrollTop=start.top+start.y-e.clientY;}} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={()=>{drag.current=null;}} onDoubleClick={()=>changeZoom(zoom>1?1:2)} onLoadCapture={e=>{const img=e.target;if(img instanceof HTMLImageElement&&img.naturalWidth)setNatural({w:img.naturalWidth,h:img.naturalHeight});}}><div className="general-zoom-stage" style={{width:stageW,height:stageH}}><div className="general-zoom-image" style={{left,top,width:w,height:h}}><MaterialImage instant loading="eager" src={src} alt={alt} language={language} draggable={false}/></div></div></div></div>;
}
