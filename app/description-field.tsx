'use client';
import {useLayoutEffect,useRef,useState} from 'react';
export default function DescriptionField({value,disabled,onChange}:{value:string,disabled:boolean,onChange:(value:string)=>void}){
  const field=useRef<HTMLDivElement>(null),mirror=useRef<HTMLDivElement>(null),text=useRef<HTMLSpanElement>(null),input=useRef<HTMLTextAreaElement>(null);
  const [padding,setPadding]=useState(10);
  useLayoutEffect(()=>{
    const box=field.current,copy=mirror.current,content=text.current,textarea=input.current;if(!box||!copy||!content||!textarea)return;
    const measure=()=>{
      // The mirror must wrap at exactly the same font and usable width as the editor.
      const css=getComputedStyle(textarea);
      copy.style.font=css.font;copy.style.lineHeight=css.lineHeight;copy.style.letterSpacing=css.letterSpacing;copy.style.textTransform=css.textTransform;
      copy.style.paddingLeft=css.paddingLeft;copy.style.paddingRight=css.paddingRight;
      copy.style.borderLeftWidth=css.borderLeftWidth;copy.style.borderRightWidth=css.borderRightWidth;
      const borders=(parseFloat(css.borderTopWidth)||0)+(parseFloat(css.borderBottomWidth)||0);
      const next=Math.max(10,(box.clientHeight-content.getBoundingClientRect().height-borders)/2);
      setPadding(current=>Math.abs(current-next)<.25?current:next);
    };
    measure();const observer=new ResizeObserver(measure);observer.observe(box);observer.observe(content);return()=>observer.disconnect();
  },[value]);
  return <div ref={field} className="description-field"><div ref={mirror} className="description-mirror" aria-hidden="true"><span ref={text}>{(value||'')+'\u200b'}</span></div><textarea ref={input} disabled={disabled} value={value} style={{paddingBlock:padding}} onChange={e=>onChange(e.target.value)}/></div>;
}
