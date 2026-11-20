import {compareExgoMonths,exgoLabel} from './month-order';
export function productionExportOrders(orders:any[],calendar:any){
 return orders.map(order=>({...order,exgo:exgoLabel(String(order.exgo||'').trim(),calendar)}));
}
export function productionFilename(orders:any[],company:string,calendar:any){
 const periods=[...new Set<string>(orders.map(order=>exgoLabel(String(order.exgo||'').trim(),calendar)).filter(Boolean))].sort((a,b)=>compareExgoMonths(a,b,calendar));
 const safe=(value:string)=>value.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').replace(/\s+/g,'_').replace(/[. ]+$/g,'');
 return `Label Data_${safe(company)}_${periods.length?periods.map(safe).join('__'):'No_EXGO'}.xlsx`;
}
