'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';

type Props={
 src:string;
 alt:string;
 language?:string;
};

export default function GeneralImageViewer({src,alt,language='EN'}:Props){
 const vi=language==='VI';
 const viewportRef=useRef<HTMLDivElement>(null);
 const pendingScroll=useRef<{left:number;top:number}|null>(null);
 const dragState=useRef<{x:number;y:number;left:number;top:number}|null>(null);
 const [natural,setNatural]=useState<{w:number;h:number}|null>(null);
 const [scale,setScale]=useState(1);
 const [dragging,setDragging]=useState(false);

 const applyZoom=(rawNext:number,focalX?:number,focalY?:number)=>{
  const next=Math.min(5,Math.max(0.1,Number(rawNext.toFixed(4))));
  const vp=viewportRef.current;
  if(vp&&natural&&scale>0){
   const fx=focalX??vp.clientWidth/2;
   const fy=focalY??vp.clientHeight/2;
   const ratio=next/scale;
   pendingScroll.current={
    left:(vp.scrollLeft+fx)*ratio-fx,
    top:(vp.scrollTop+fy)*ratio-fy,
   };
  }
  setScale(next);
 };

 const fitToWindow=()=>{
  const vp=viewportRef.current;
  if(!vp||!natural)return;
  const availW=Math.max(120,vp.clientWidth-24);
  const availH=Math.max(120,vp.clientHeight-24);
  const fit=Math.min(1,availW/natural.w,availH/natural.h);
  pendingScroll.current={left:0,top:0};
  setScale(Math.max(0.1,Number(fit.toFixed(4))));
 };

 useLayoutEffect(()=>{
  const vp=viewportRef.current;
  if(!vp||!pendingScroll.current)return;
  vp.scrollLeft=Math.max(0,pendingScroll.current.left);
  vp.scrollTop=Math.max(0,pendingScroll.current.top);
  pendingScroll.current=null;
 },[scale]);

 useEffect(()=>{
  const vp=viewportRef.current;
  if(!vp)return;
  const onWheel=(e:WheelEvent)=>{
   if(!natural)return;
   e.preventDefault();
   const rect=vp.getBoundingClientRect();
   const factor=e.deltaY<0?1.15:1/1.15;
   setScale(prev=>{
    const next=Math.min(5,Math.max(0.1,Number((prev*factor).toFixed(4))));
    const fx=e.clientX-rect.left;
    const fy=e.clientY-rect.top;
    const ratio=next/prev;
    pendingScroll.current={
     left:(vp.scrollLeft+fx)*ratio-fx,
     top:(vp.scrollTop+fy)*ratio-fy,
    };
    return next;
   });
  };
  vp.addEventListener('wheel',onWheel,{passive:false});
  return()=>vp.removeEventListener('wheel',onWheel);
 },[natural]);

 const displayW=natural?Math.max(1,Math.round(natural.w*scale)):undefined;
 const displayH=natural?Math.max(1,Math.round(natural.h*scale)):undefined;

 return (
  <div style={{display:'flex',flexDirection:'column',gap:'10px',width:'100%',userSelect:'none'}}>
   <div className="row wrap" style={{gap:'8px',alignItems:'center'}}>
    <button type="button" disabled={!natural||scale<=0.1} onClick={()=>applyZoom(scale/1.2)} aria-label={vi?'Thu nhỏ':'Zoom out'}>−</button>
    <span style={{minWidth:'54px',textAlign:'center',fontWeight:600,fontVariantNumeric:'tabular-nums'}}>{Math.round(scale*100)}%</span>
    <button type="button" disabled={!natural||scale>=5} onClick={()=>applyZoom(scale*1.2)} aria-label={vi?'Phóng to':'Zoom in'}>+</button>
    <button type="button" disabled={!natural} onClick={fitToWindow}>{vi?'Vừa khung hình':'Fit to window'}</button>
    <button type="button" disabled={!natural} onClick={()=>applyZoom(1)}>{vi?'Kích thước gốc':'Original size'}</button>
    <small style={{color:'#64748b',marginLeft:'auto'}}>{vi?'Lăn chuột để phóng to/thu nhỏ · Kéo chuột để di chuyển':'Scroll to zoom · Drag to pan'}</small>
   </div>
   <div
    ref={viewportRef}
    onMouseDown={e=>{
     if(e.button!==0||!viewportRef.current)return;
     dragState.current={x:e.clientX,y:e.clientY,left:viewportRef.current.scrollLeft,top:viewportRef.current.scrollTop};
     setDragging(true);
    }}
    onMouseMove={e=>{
     if(!dragState.current||!viewportRef.current)return;
     viewportRef.current.scrollLeft=dragState.current.left-(e.clientX-dragState.current.x);
     viewportRef.current.scrollTop=dragState.current.top-(e.clientY-dragState.current.y);
    }}
    onMouseUp={()=>{dragState.current=null;setDragging(false);}}
    onMouseLeave={()=>{dragState.current=null;setDragging(false);}}
    style={{
     width:'100%',
     height:'74vh',
     overflow:'auto',
     scrollbarGutter:'stable',
     scrollBehavior:'auto',
     background:'#f8fafc',
     border:'1px solid #e2e8f0',
     borderRadius:'8px',
     cursor:dragging?'grabbing':'grab',
    }}
   >
    <div style={{display:'flex',minWidth:'100%',minHeight:'100%',padding:'12px',boxSizing:'border-box'}}>
     <img
      src={src}
      alt={alt}
      draggable={false}
      onLoad={e=>{
       if(natural)return;
       const img=e.currentTarget;
       const w=img.naturalWidth||1;
       const h=img.naturalHeight||1;
       setNatural({w,h});
       const vp=viewportRef.current;
       if(vp){
        const availW=Math.max(120,vp.clientWidth-24);
        const availH=Math.max(120,vp.clientHeight-24);
        const fit=Math.min(1,availW/w,availH/h);
        setScale(Math.max(0.1,Number(fit.toFixed(4))));
       }
      }}
      style={{
       margin:'auto',
       display:'block',
       width:displayW?`${displayW}px`:'auto',
       height:displayH?`${displayH}px`:'auto',
       maxWidth:'none',
       maxHeight:'none',
       transition:'none',
       boxShadow:'0 1px 4px rgba(15,23,42,0.12)',
       background:'#ffffff',
      }}
     />
    </div>
   </div>
  </div>
 );
}