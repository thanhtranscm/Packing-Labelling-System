const names=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function period(value:any){
  const text=String(value??'').trim().toUpperCase();
  const year=/\b(20\d{2})\b/.exec(text);
  const match=/(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:T(?:EMBER)?)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)/.exec(text);
  const numeric=/\b(?:THÁNG|MONTH)\s*(\d{1,2})\b/.exec(text);
  const month=match?names.indexOf(match[1].slice(0,3))+1:numeric?+numeric[1]:0;
  const phase=/\b(?:END|LATE)\b/.test(text)?2:/\bMID\b/.test(text)?1:0;
  return {year:year?+year[1]:0,month:month>=1&&month<=12?month:99,phase,text};
}
export function exgoPeriod(value:string,setting:any={}){
 const parsed=period(value);if(parsed.year||parsed.month===99)return parsed;
 const baseYear=setting.year||2026,baseMonth=setting.month||9;
 const override=setting.overrides?.[parsed.text];
 return {...parsed,year:override||baseYear+(parsed.month<baseMonth?1:0)};
}
export function monthExgoCalendar(month:any,workspace:any={}){return month?.exgoCalendar||workspace?.exgoCalendar||{year:2026,month:9,overrides:{}};}
export function exgoLabel(value:string,setting:any={}){const p=exgoPeriod(value,setting);return p.month===99||period(value).year?value:String(value)+' '+p.year;}
export function compareExgoMonths(a:string,b:string,setting?:any){
  const x=setting?exgoPeriod(a,setting):period(a),y=setting?exgoPeriod(b,setting):period(b);
  return x.year-y.year||x.month-y.month||x.phase-y.phase||x.text.localeCompare(y.text);
}
export function sortMonths<T extends {year?:number;month?:number;name?:string;prefix?:string;id:string}>(months:T[]):T[]{
  return [...months].sort((a,b)=>{
    const x=period(a.name),y=period(b.name);
    return (a.year||x.year)-(b.year||y.year)||(a.month||x.month)-(b.month||y.month)||period(a.prefix||a.name).phase-period(b.prefix||b.name).phase||a.id.localeCompare(b.id);
  });
}

// Display ordering only: leave the saved upload order untouched.
export function sortImagesByAppliedMonth<T>(images:T[],months:any[],getMonths:(image:T)=>string[]=(image:any)=>image.months||[]):T[]{
  const order=new Map(sortMonths(months).map((month,index)=>[month.id,index]));
  return images.map((image,index)=>({image,index,rank:Math.min(Infinity,...getMonths(image).map(id=>order.get(id)??Infinity))}))
    .sort((a,b)=>a.rank-b.rank||a.index-b.index).map(entry=>entry.image);
}
