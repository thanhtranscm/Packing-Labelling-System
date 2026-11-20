'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
export function useAuthorizedUsers(user:any,page:string){
 const key=user&&user.role!=='user'?user.email:'';
 const [data,setData]=useState<{key:string,users:any[],ready:boolean,error:string,loading:boolean}>({key:'',users:[],ready:false,error:'',loading:false});
 const scope=useRef(''),generation=useRef(0),request=useRef<Promise<void>|null>(null),loaded=useRef(0);
 const refresh=useCallback(async(force=false)=>{
  if(!key)return;if(request.current){await request.current;if(!force)return;}
  if(!force&&Date.now()-loaded.current<30_000)return;
  const version=++generation.current;setData(current=>({...current,key,loading:true,error:''}));
  const task=(async()=>{try{const r=await fetch('/api/users',{cache:'no-store'});const j:any=await r.json();if(!r.ok)throw Error(j.error||'Unable to load users');if(scope.current===key&&version===generation.current){loaded.current=Date.now();setData({key,users:j.users,ready:true,error:'',loading:false});}}catch(e:any){if(scope.current===key&&version===generation.current)setData(current=>({...current,key,error:e.message,loading:false}));}})();
  request.current=task;await task;if(request.current===task)request.current=null;
 },[key]);
 useEffect(()=>{scope.current=key;++generation.current;request.current=null;loaded.current=0;setData({key,users:[],ready:false,error:'',loading:false});if(key)void refresh();return()=>{scope.current='';++generation.current;};},[key,refresh]);
 useEffect(()=>{if(page==='User access'&&key)void refresh();},[page,key,refresh]);
 return {users:data.key===key?data.users:[],usersReady:data.key===key&&data.ready,usersLoading:data.key===key&&data.loading,usersError:data.key===key?data.error:'',refreshUsers:()=>refresh(true)};
}
