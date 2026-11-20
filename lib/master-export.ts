import {materialDescription} from './material-state';
import ExcelJS from 'exceljs';
import {download} from './download';
export function masterExportRows(items:any[]){
 const countries=[...new Set(items.map(m=>m.destination))].sort((a,b)=>a==='STANDARD'?-1:b==='STANDARD'?1:a.localeCompare(b));
 return countries.flatMap((country,i)=>items.filter(m=>m.destination===country).sort((a,b)=>a.list_no-b.list_no).flatMap(m=>(m.versions?.length?m.versions:[{item_code:m.item_code,description:m.description}]).map((v:any,j:number)=>[i,m.list_no,country,materialDescription({...m,description:v.description??m.description,item_code:v.item_code??m.item_code}),v.item_code??m.item_code,m.qty_per_finish===''?null:Number(m.qty_per_finish??0),m.unit??'',null,null,m.supplier??'',j+1]))).filter(row=>[row[3],row[4]].some(value=>String(value??'').trim()&&!/^\.+$/.test(String(value).trim())));
}
export async function masterWorkbook(items:any[],templateBytes:ArrayBuffer){
 const template=new ExcelJS.Workbook();await template.xlsx.load(templateBytes);const source=template.worksheets[0];const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('Master Data');
 const headers=['List','Destination','Description','Item Code','QTY / Finish Good','Unit','Version'];sheet.addRow(headers);
 const rows=masterExportRows(items);
 const groupKey=(values:any[])=>JSON.stringify([values[2],values[1]]);
 const counts=new Map<string,number>();for(const values of rows){const key=groupKey(values);counts.set(key,(counts.get(key)??0)+1);}
 const seen=new Map<string,number>(),versionLabels=new Map<any[],string|number>();
 for(const values of rows){const key=groupKey(values),index=(seen.get(key)??0)+1,total=counts.get(key)??1;seen.set(key,index);versionLabels.set(values,total>1?`${index}/${total}`:values[10]);}
 const output=(values:any[])=>[...values.slice(1,7),versionLabels.get(values)].map((v:any)=>v===''?null:v);
 const textWidth=(value:any)=>Math.max(...String(value??'').split(/\r?\n/).map(line=>Array.from(line).reduce((n,char)=>n+(/[MW@%]/.test(char)?1.5:/[il.,' ]/.test(char)?0.55:char.charCodeAt(0)>255?1.8:1),0)));
 const widths=headers.map((header,c)=>Math.min(255,Math.ceil(Math.max(textWidth(header)*1.2,...rows.map(values=>textWidth(output(values)[c])))*1.18+5)));
 widths.forEach((w,i)=>sheet.getColumn(i+1).width=w);
 const thin={style:'thin',color:{argb:'FFCAD3DF'}} as any;
 const strong={style:'medium',color:{argb:'FF526984'}} as any;
 for(let c=1;c<=headers.length;c++){const cell=sheet.getCell(1,c);cell.font={name:'Calibri',size:12,bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF173A68'}};cell.alignment={vertical:'middle',horizontal:'center',wrapText:true};cell.border={top:thin,bottom:strong,left:thin,right:thin};}
 sheet.getRow(1).height=38;
 const normalize=(v:any)=>String(v||'').trim().toUpperCase();
 for(let i=0;i<rows.length;i++){const values=rows[i],row=sheet.addRow(output(values)),country=values[2];
   const standard=items.find(m=>m.destination==='STANDARD'&&m.list_no===values[1]&&String(m.item_code||'').trim()&&!/^\.+$/.test(m.item_code));
   const code=normalize(values[4]);const valid=code&&!/^\.+$/.test(code);
   const same=standard&&(standard.versions?.length?standard.versions:[standard]).some((v:any)=>normalize(v.item_code)===code);
   const tone=country==='STANDARD'||!valid||same?'standard':standard?'replace':'extra';
   const fill=tone==='replace'?'FFFCE4E6':tone==='extra'?'FFE5F4E7':'FFFFFFFF';
   const first=i===0||rows[i-1][2]!==country,last=i===rows.length-1||rows[i+1][2]!==country;
   for(let c=1;c<=headers.length;c++){const cell=row.getCell(c);cell.font={name:'Calibri',size:12,bold:(counts.get(groupKey(values))??1)>1,color:{argb:'FF18283F'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:fill}};cell.alignment={vertical:'middle',horizontal:[1,5,6,7].includes(c)?'center':'left',wrapText:true};cell.border={top:first?strong:thin,bottom:last?strong:thin,left:c===1?strong:thin,right:c===headers.length?strong:thin};}
   row.height=Math.max(30,...output(values).map((v:any,c:number)=>{const lines=String(v??'').split(/\r?\n/).reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/Math.max(1,(widths[c]-3)*0.8))),0);return lines*17+12;}));
 }
 sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter={from:'A1',to:'G'+Math.max(1,sheet.rowCount)};return book;
}
export async function exportMaster(items:any[],company:string){const response=await fetch('/templates/master-data.xlsx');if(!response.ok)throw Error('Master Data template unavailable');const book=await masterWorkbook(items,await response.arrayBuffer());download(await book.xlsx.writeBuffer(),`Master_Data_${company}.xlsx`);}
