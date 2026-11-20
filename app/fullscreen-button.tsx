'use client';
import {useEffect,useState} from 'react';
import {Maximize,Minimize} from 'lucide-react';
import {toast} from 'sonner';
export default function FullscreenButton({language}:{language:string}){
 const [fullscreen,setFullscreen]=useState(false),[pending,setPending]=useState(false);
 const vi=language==='VI',label=fullscreen?(vi?'Thu nhỏ':'Exit fullscreen'):(vi?'Toàn màn hình':'Fullscreen');
 useEffect(()=>{const sync=()=>setFullscreen(!!document.fullscreenElement);sync();document.addEventListener('fullscreenchange',sync);return()=>document.removeEventListener('fullscreenchange',sync)},[]);
 async function toggle(){if(pending)return;setPending(true);try{
  if(document.fullscreenElement)await document.exitFullscreen();
  else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen({navigationUI:'hide'});
  else throw Error('Fullscreen unavailable');
 }catch{toast.error(vi?'Trình duyệt chưa cho phép toàn màn hình. Bạn có thể nhấn F11.':'Fullscreen is unavailable in this browser view. You can press F11.')}finally{setPending(false)}}
 return <button type="button" className="fullscreen-toggle" onClick={toggle} disabled={pending} aria-label={label} aria-pressed={fullscreen} title={fullscreen?(vi?'Thu nhỏ · Esc':'Exit fullscreen · Esc'):label}>{fullscreen?<Minimize size={18}/>:<Maximize size={18}/>}<span>{label}</span></button>;
}
