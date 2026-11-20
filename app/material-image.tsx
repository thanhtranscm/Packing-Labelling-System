'use client';
import {useEffect,useRef,useState} from 'react';
import {cachedImage,loadCachedImage} from '@/lib/image-memory';
function ImageAttempt({src,alt,language='EN',loading='lazy',className='',onCachedFailure,...rest}:any){
 const [attempt,setAttempt]=useState(0),[state,setState]=useState<'loading'|'ready'|'error'>('loading');const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 const retry=()=>{if(timer.current)clearTimeout(timer.current);setState('loading');setAttempt(n=>n+1);};
 const failure=()=>{if(attempt<2){timer.current=setTimeout(retry,400*(attempt+1));}else if(onCachedFailure)onCachedFailure();else setState('error');};
 const text=language==='VI'?{loading:'Đang tải hình…',error:'Không tải được hình. Bấm thử lại.'}:{loading:'Loading image…',error:'Unable to load image. Click to retry.'};
 return <span className={'material-image-frame '+(className==='full-image'?'material-image-large':'')} aria-busy={state==='loading'}>
  <img {...rest} className={className} src={attempt&&!src.startsWith('blob:')?src+(src.includes('?')?'&':'?')+'retry='+attempt:src} alt={alt} loading={loading} decoding="async" style={{visibility:state==='ready'?'visible':'hidden'}} onLoad={()=>{if(timer.current)clearTimeout(timer.current);setState('ready');}} onError={failure}/>
  {state!=='ready'&&<span className={'material-image-status '+(state==='error'?'material-image-error':'')} role={state==='error'?'button':'status'} tabIndex={state==='error'?0:undefined} onClick={e=>{e.stopPropagation();if(state==='error')retry();}} onKeyDown={e=>{if(state==='error'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();retry();}}}>{text[state==='error'?'error':'loading']}</span>}
 </span>;
}
function InstantImage({src,instant,...props}:any){
 const [url,setUrl]=useState(()=>cachedImage(src)||''),[fallback,setFallback]=useState(false),[visible,setVisible]=useState(props.loading==='eager'||!!cachedImage(src));const frame=useRef<HTMLSpanElement>(null);
 useEffect(()=>{if(visible)return;if(typeof IntersectionObserver==='undefined'){setVisible(true);return;}const el=frame.current;if(!el)return;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'240px'});observer.observe(el);return()=>observer.disconnect();},[visible]);
 useEffect(()=>{if(!visible)return;let active=true;loadCachedImage(src).then(value=>{if(active)setUrl(value)}).catch(()=>{if(active)setFallback(true)});return()=>{active=false;};},[src,visible]);
 if(!url&&!fallback)return <span ref={frame} className={'material-image-frame '+(props.className==='full-image'?'material-image-large':'')} aria-busy="true"><span className="material-image-status" role="status">{props.language==='VI'?'Đang tải hình…':'Loading image…'}</span></span>;
 return <ImageAttempt key={url||src} {...props} src={url||src} loading="eager" onCachedFailure={url?()=>{setUrl('');setFallback(true);}:undefined}/>;
}
export default function MaterialImage(props:any){return <InstantImage key={props.src} {...props}/>;}
