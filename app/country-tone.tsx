'use client';
import {createContext,useContext,useMemo} from 'react';
import {countryMaterialTone} from '@/lib/material-state';
const CountryTones=createContext<Map<string,string>>(new Map());
const key=(s:any)=>String(s||'').trim().toUpperCase();
export function CountryToneProvider({items,children}:{items:any[];children:any}){
 const tones=useMemo(()=>{const map=new Map<string,string>();for(const item of items||[]){const country=key(item.destination);if(country&&country!=='STANDARD'&&!map.has(country))map.set(country,countryMaterialTone(items,country));}return map;},[items]);
 return <CountryTones.Provider value={tones}>{children}</CountryTones.Provider>;
}
export function CountryLabel({value}:{value:any}){const tones=useContext(CountryTones),name=String(value??'').trim(),tone=tones.get(key(name))||'';return <span className={'country-tone-label'+(tone?' market-tone-'+tone:'')} title={tone?({'replace':'Replace','extra':'Extra','both':'Replace + Extra'} as Record<string,string>)[tone]:undefined}>{name||'—'}</span>;}
