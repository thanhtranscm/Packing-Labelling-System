export type BalanceRule={column:string;value:string};
const normalized=(v:any)=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleUpperCase();
export function splitBalanceOrders(orders:any[],columns:{name:string;column:number}[],setting:BalanceRule|BalanceRule[]|null|undefined){
 const rules=Array.isArray(setting)?setting:setting?[setting]:[];
 if(!rules.length)return {ordinary:orders,separate:[]};
 const checks=rules.map(rule=>{
  if(!rule?.column?.trim()||!rule?.value?.trim())throw Error('Choose a column and enter a value for each separate PO rule.');
  const matches=columns.filter(c=>normalized(c.name)===normalized(rule.column));
  if(matches.length!==1)throw Error(matches.length?'A selected column is duplicated. Choose a unique column.':'A selected column is missing. Update the separate PO settings.');
  return {column:String(matches[0].column),target:normalized(rule.value)};
 });
 const ordinary:any[]=[],separate:any[]=[];
 for(const order of orders){let matched=false;for(const {column,target} of checks){if(order.reviewCellErrors?.includes(column))throw Error('A selected column has an Excel error or an uncached formula. Check the source file.');if(!order.reviewCells||!(column in order.reviewCells))throw Error('A selected column cannot be read. Choose the balance file again.');if(normalized(order.reviewCells[column])===target)matched=true;}(matched?separate:ordinary).push(order);}
 return {ordinary,separate};
}
