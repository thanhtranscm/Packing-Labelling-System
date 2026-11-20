import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
// Retain the supplied workbook's style table and worksheet metadata verbatim.
// Only data cells and the size/group regions are regenerated.
const escape = (v:any) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const letter = (n:number):string => n > 26 ? letter(Math.floor((n-1)/26))+String.fromCharCode(65+(n-1)%26) : String.fromCharCode(64+n);
const index = (s:string) => [...s].reduce((a,c)=>a*26+c.charCodeAt(0)-64,0);
const attr = (s:string,k:string) => new RegExp(`\\b${k}="([^"]*)"`).exec(s)?.[1];
function cell(ref:string,style:string|undefined,value:any){
  const pre=`<c r="${ref}"${style?` s="${style}"`:''}`;
  if(value===null||value===undefined||value==='')return pre+'/>';
  if(typeof value==='number')return pre+`><v>${value}</v></c>`;
  return pre+` t="inlineStr"><is><t xml:space="preserve">${escape(value)}</t></is></c>`;
}
function parse(source:string){
  const rows = new Map<number,{open:string,cells:Map<number,string>}>();
  for(const m of source.matchAll(/(<row\b[^>]*>)([\s\S]*?)<\/row>/g)){
    const cells=new Map<number,string>();
    for(const c of m[2].matchAll(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g)) {
      const ref=attr(c[0],'r');if(ref)cells.set(index(ref.replace(/\d/g,'')),c[0]);
    }
    rows.set(+attr(m[1],'r')!,{open:m[1],cells});
  }
  return rows;
}
type Row = {source:number,values?:any[]};
function rewrite(source:string,map:number[],rows:Row[],overrides:Map<string,any>,header:number,hidden:number[]=[],strings:string[]=[]){
  const original=parse(source), reverse=new Map<number,number[]>();
  map.forEach((s,i)=>reverse.set(s,[...(reverse.get(s)||[]),i+1]));
  const position=(col:number,last=false) => {const a=reverse.get(col);return a?last?a.at(-1)!:a[0]:undefined;};
  const ref=(s:string,last=false) => s.replace(/([A-Z]+)(\d+)/g,(_,c,r)=>letter(position(index(c),last)||Math.min(index(c),map.length))+r);
  const output=rows.map((row,i)=>{
    const r=i+1,from=original.get(row.source)||original.get(header+1)!;
    const open=from.open.replace(/\br="\d+"/,`r="${r}"`).replace(/\s+spans="[^"]*"/,'');
    const cells=map.map((old,c)=>{
      const address=letter(c+1)+r, raw=from.cells.get(old)||'',style=attr(raw,'s');
      if(overrides.has(address))return cell(address,style,overrides.get(address));
      if(row.values)return cell(address,style,row.values[c]);
      if(!raw)return cell(address,style,null);
      return raw.replace(/\br="[A-Z]+\d+"/,`r="${address}"`);
    }).join('');
    return open+cells+'</row>';
  }).join('');
  let xml=source.replace(/<sheetData>[\s\S]*?<\/sheetData>/,`<sheetData>${output}</sheetData>`)
    .replace(/<dimension[^>]*\/>/,`<dimension ref="A1:${letter(map.length)}${rows.length}"/>`);
  const colNodes=[...source.matchAll(/<col\b[^>]*\/>/g)].map(m=>m[0]);
  const cols=map.map((old,i)=>{
    let node=colNodes.find(n=>old>=+attr(n,'min')!&&old<=+attr(n,'max')!)||'<col min="1" max="1" width="10" customWidth="1"/>';
    node=node.replace(/min="\d+"/,`min="${i+1}"`).replace(/max="\d+"/,`max="${i+1}"`);
    if(hidden.includes(i+1))node=node.replace(/\s+hidden="[^"]*"/,'').replace('/>',' hidden="1"/>');
    // Fit widths only; preserve all styles, row heights, merges and visibility.
    let required=8;
    const values=rows.map(row=>row.values?.[i]);
    for(let r=1;r<=header;r++){
      const address=letter(i+1)+r;
      const horizontal=[...source.matchAll(/<mergeCell\b[^>]*ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g)].some(m=>m[1]!==m[3]&&old>=index(m[1])&&old<=index(m[3])&&r>=+m[2]&&r<=+m[4]);
      if(horizontal)continue;
      const raw=original.get(r)?.cells.get(old)||'';
      const v=/<v>([\s\S]*?)<\/v>/.exec(raw)?.[1];
      const value=overrides.has(address)?overrides.get(address):attr(raw,'t')==='s'?strings[Number(v)]:attr(raw,'t')==='inlineStr'?[...raw.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m=>m[1]).join(''):v;
      if(value!=null)values.push(value);
    }
    for(const value of values){if(value==null)continue;
      const longest=String(value).split(/\r?\n/).reduce((max,line)=>Math.max(max,[...line].reduce((n,ch)=>n+(/[MW@%]/.test(ch)?1.5:/[il.,' ]/.test(ch)?0.55:/[^\u0000-\u00ff]/.test(ch)?1.8:1),0)),0);
      required=Math.max(required,Math.min(255,Math.ceil((longest*1.15+3)*100)/100));
    }
    node=/\bwidth="[^"]*"/.test(node)?node.replace(/\bwidth="[^"]*"/,`width="${required}"`):node.replace('/>',` width="${required}"/>`);
    return node;
  }).join('');
  xml=xml.replace(/<cols>[\s\S]*?<\/cols>/,`<cols>${cols}</cols>`);
  // Header merges expand with repeated template group columns.
  const merges:string[]=[];
  for(const m of source.matchAll(/<mergeCell\b[^>]*ref="([^"]+)"[^>]*\/>/g)){
    const [a,b]=m[1].split(':');const ca=index(a.replace(/\d/g,'')),cb=index((b||a).replace(/\d/g,''));
    const ra=+a.replace(/\D/g,''),rb=+(b||a).replace(/\D/g,'');
    if(rb>header)continue;
    if(ca===cb){for(const n of reverse.get(ca)||[])merges.push(`${letter(n)}${ra}:${letter(n)}${rb}`);}
    else if(position(ca)&&position(cb))merges.push(`${letter(position(ca)!)}${ra}:${letter(position(cb,true)!)}${rb}`);
  }
  xml=xml.replace(/<mergeCells\b[^>]*>[\s\S]*?<\/mergeCells>/,`<mergeCells count="${merges.length}">${merges.map(r=>`<mergeCell ref="${r}"/>`).join('')}</mergeCells>`);
  xml=xml.replace(/<autoFilter\b[^>]*\/>/,`<autoFilter ref="A${header}:${letter(map.length)}${Math.max(header,rows.length-1)}"/>`);
  xml=xml.replace(/<conditionalFormatting\b[^>]*sqref="([^"]+)"/g,(all,r)=>all.replace(r,r.split(' ').map((range:string)=>{
    const mapped=ref(range);return mapped.replace(/(:[A-Z]+)\d+$/,`$1${Math.max(header+1,rows.length-1)}`);
  }).join(' ')));
  xml=xml.replace(/(<formula>)([\s\S]*?)(<\/formula>)/g,(_,a,f,b)=>a+ref(f)+b);
  return xml.replace(/<tabColor\b[^>]*\/>/g,'');
}
const base=(o:any)=>[o.brand,o.season,o.createDate,o.price,o.type,o.category,o.factoryPo,o.onPo,o.sku,o.color,o.country,o.warehouse,o.mos,o.model,o.gender];
const sequence=(n:number,start=1)=>Array.from({length:n},(_,i)=>start+i);
const sum=(rows:any[][],c:number)=>rows.reduce((a,r)=>a+(typeof r[c]==='number'?r[c]:0),0);
// CTC keeps the WSV template's horizontal alignment, borders, fonts and number
// formats. Add explicit vertical centering and fit long/multiline CTC values.
function fitCtcPresentation(archive:Record<string,Uint8Array>){
  let styles=strFromU8(archive['xl/styles.xml']);
  const block=/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)!;
  const xfs=[...block[1].matchAll(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g)].map(m=>m[0]);
  const fonts=[...(/<fonts\b[^>]*>([\s\S]*?)<\/fonts>/.exec(styles)?.[1]||'').matchAll(/<font>[\s\S]*?<\/font>/g)].map(m=>m[0]);
  const centered=new Map<number,number>(), additions:string[]=[];
  const centeredStyle=(id:number)=>{
    if(centered.has(id))return centered.get(id)!;
    let xf=xfs[id]||xfs[0];
    if(!/<alignment\b/.test(xf))xf=xf.endsWith('/>')?xf.slice(0,-2)+'><alignment vertical="center"/></xf>':xf.replace('</xf>','<alignment vertical="center"/></xf>');
    else xf=xf.replace(/<alignment\b[^>]*\/>/,node=>node.replace(/\svertical="[^"]*"/,'').replace('/>',' vertical="center"/>'));
    xf=xf.replace(/\sapplyAlignment="[^"]*"/,'').replace('<xf ','<xf applyAlignment="1" ');
    const next=xfs.length+additions.length;additions.push(xf);centered.set(id,next);return next;
  };
  for(let i=1;i<=6;i++){
    const path=`xl/worksheets/sheet${i}.xml`;let xml=strFromU8(archive[path]);
    const widths=new Map<number,number>(),columnStyles=new Map<number,number>();
    for(const col of xml.matchAll(/<col\b[^>]*\/>/g)){const n=+attr(col[0],'min')!;widths.set(n,+attr(col[0],'width')!);columnStyles.set(n,+(attr(col[0],'style')||0));}
    xml=xml.replace(/<row\b[^>]*>[\s\S]*?<\/row>/g,row=>{
      let height=+(attr(row.split('>')[0],'ht')||0);
      row=row.replace(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g,raw=>{
        const column=index((attr(raw,'r')||'A1').replace(/\d/g,''));
        const id=+(attr(raw,'s')||attr(row.split('>')[0],'s')||columnStyles.get(column)||0),xf=xfs[id]||xfs[0],font=fonts[+(attr(xf,'fontId')||0)]||'';
        const size=+( /<sz\b[^>]*val="([^"]+)"/.exec(font)?.[1]||11);
        const text=[...raw.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m=>m[1]).join('').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"');
        const lines=text.split(/\r?\n/),col=index((attr(raw,'r')||'A1').replace(/\d/g,''));
        // Shared/merged headings already use the standard width calculation.
        if(text&&+(attr(raw,'r')||'A1').replace(/\D/g,'')>(i<=3?7:4)){
          const longest=Math.max(...lines.map(line=>[...line].reduce((n,ch)=>n+(/[MW@%]/.test(ch)?1.5:/[il.,' ]/.test(ch)?0.55:/[^\u0000-\u00ff]/.test(ch)?1.8:1),0)));
          widths.set(col,Math.max(widths.get(col)||8,Math.min(255,Math.ceil((longest*1.15*Math.max(1,size/11)*(/<b(?:\s|\/|>)/.test(font)?1.08:1)+3)*100)/100)));
          if(lines.length>1)height=Math.max(height,Math.min(409,lines.length*size*1.35+6));
        }
        const next=centeredStyle(id);
        return /\bs="/.test(raw)?raw.replace(/\bs="[^"]*"/,`s="${next}"`):raw.replace('<c ',`<c s="${next}" `);
      });
      if(height>+(attr(row.split('>')[0],'ht')||0))row=row.replace(/<row\b[^>]*>/,open=>open.replace(/\s(?:ht|customHeight)="[^"]*"/g,'').replace('>',` ht="${height}" customHeight="1">`));
      return row;
    });
    xml=xml.replace(/<col\b[^>]*\/>/g,node=>node.replace(/\bwidth="[^"]*"/,`width="${widths.get(+attr(node,'min')!)}"`));
    archive[path]=strToU8(xml);
  }
  styles=styles.replace(block[0],`<cellXfs count="${xfs.length+additions.length}">${block[1]}${additions.join('')}</cellXfs>`);
  archive['xl/styles.xml']=strToU8(styles);
}
export const exportSheetNames=['Label','Special Label','Card','Outer - Empty - Inner','Wrapping Paper','Stuffing Paper'];
let templateRequest:Promise<ArrayBuffer>|undefined;
function purchaseTemplate(){
  if(!templateRequest)templateRequest=fetch('/templates/purchase.xlsx').then(response=>{
    if(!response.ok)throw Error('Excel template unavailable');
    return response.arrayBuffer();
  }).catch(error=>{templateRequest=undefined;throw error;});
  return templateRequest;
}
export async function exportTemplate(result:any,company:string,production=false,bytes?:ArrayBuffer,selectedSheets?:string[]){
 if(selectedSheets&&(!selectedSheets.length||selectedSheets.some(name=>!exportSheetNames.includes(name))))throw Error('Select at least one valid Excel sheet.');
  const input=bytes||await purchaseTemplate();
  const archive=unzipSync(new Uint8Array(input));
  const write=(i:number,xml:string)=>archive[`xl/worksheets/sheet${i}.xml`]=strToU8(xml);
  const read=(i:number)=>strFromU8(archive[`xl/worksheets/sheet${i}.xml`]);
  const strings=archive['xl/sharedStrings.xml']?[...strFromU8(archive['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m=>[...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(t=>t[1]).join('').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')):[];
  const n=result.sizes.length;
  for(const [sheet,kind] of [[1,'label'],[2,'special'],[3,'card']] as const){
    const special=kind==='special',map=special?sequence(20):[...sequence(22),...sequence(n).map((_,i)=>23+Math.min(i,20)),44,45,46];
    let materials:any[]=result[kind];
    if(production&&kind==='label')materials=result.orders.flatMap((o:any)=>{
      const all=[...result.label,...result.special,...result.card].filter((r:any)=>r.po.id===o.id);
      return [...new Map(all.map(r=>[r.item.id,r])).values()].sort((a:any,b:any)=>a.item.list_no-b.item.list_no);
    });
    const values=materials.map(r=>special?[...base(r.po),r.item.destination,r.item.description,r.item.item_code,+r.item.qty_per_finish,r.item.unit]
      :[...base(r.po),r.item.destination,r.item.description,r.item.item_code,+r.item.qty_per_finish,r.item.unit,1+r.buffer/100,'',...r.qty,r.total,production?r.po.exgo:'','']);
    const rows:Row[]=sequence(7).map(source=>({source}));
    values.forEach((v,i)=>rows.push({source:special&&i===values.length-1?19:8,values:v}));
    if(!special){const totals=map.map((_,c)=>c>=22&&c<=22+n?sum(values,c):null);rows.push({source:kind==='card'?9:69,values:totals});}
    const overrides=new Map<string,any>();
    overrides.set('G1',company==='CTC'?'CTC PO':"WSV'S PO");
    if(!special)result.sizes.forEach((s:any,i:number)=>{
      ['eu','eu','us','uk','jp','br','cn'].forEach((key,r)=>overrides.set(`${letter(23+i)}${r+1}`,['eu','uk','cn'].includes(key)?+s[key]:s[key]));
    });
    write(sheet,rewrite(read(sheet),map,rows,overrides,7,[],strings));
  }
  const g=result.pack[0].groups.length, map=[...sequence(19),...sequence(n).map((_,i)=>20+Math.min(i,20)),41,42,
    ...sequence(3).flatMap((_,kind)=>[...sequence(g).map((_,i)=>43+kind*4+Math.min(i,2)),46+kind*4])];
  const packValues=result.pack.map((r:any)=>[...base(r.po),r.po.originalPo,r.market,r.dimension||'','',...r.po.qty,r.po.total,r.po.exgo,
    ...['purchaseCartons','purchaseEmpty','purchaseInner'].flatMap(key=>[...r.groups.map((a:any)=>a[key]),r.groups.reduce((a:number,b:any)=>a+b[key],0)])]);
  const rows:Row[]=sequence(4).map(source=>({source}));packValues.forEach((v:any)=>rows.push({source:5,values:v}));
  const totals:any[]=map.map((_,c)=>c>=19&&c!==20+n?sum(packValues,c):null);totals[20+n]='TOTAL';rows.push({source:24,values:totals});
  const overrides=new Map<string,any>([['G1',company==='CTC'?'CTC PO':"WSV'S PO"]]);
  result.sizes.forEach((s:any,i:number)=>{const us=String(s.us).split('/').map((x:string)=>x.trim());overrides.set(letter(20+i)+'1',us.find((x:string)=>x.startsWith('M'))||s.us);overrides.set(letter(20+i)+'2',us.find((x:string)=>x.startsWith('W'))||'');overrides.set(letter(20+i)+'3',+s.uk);});
  result.pack[0].groups.forEach((a:any,i:number)=>{['outer','empty','inner'].forEach((kind,k)=>{const c=22+n+k*(g+1)+i;overrides.set(letter(c)+'1',a[kind+'Code']??a[kind]);overrides.set(letter(c)+'3',a[kind+'Dimension']);});});
  write(4,rewrite(read(4),map,rows,overrides,4,[4,16,17,18],strings));
  for(const [sheet,kind] of [[5,'wrapping'],[6,'stuffing']] as const){
    const wrapping=kind==='wrapping',papers=result.paper.filter((p:any)=>p.kind===kind),groups=new Map<string,any>();
    for(const p of papers){const key=p.from+'|'+p.to,old=groups.get(key)||{...p,required:0,total:0};old.required+=p.required;old.total+=p.total;groups.set(key,old);}
    const rows:Row[]=sequence(4).map(source=>({source}));
    const values=[...groups.values()].map(p=>({...p,total:Math.ceil(p.required*(1+(production?0:p.buffer)/100))})).map(p=>[wrapping?p.code:`${p.from} ~ ${p.to} (${p.qtyPerPair} sheets per pair)`,`${p.from} ~ ${p.to}`,p.required/p.qtyPerPair,p.qtyPerPair,p.required,wrapping?`size ${p.from} ~ ${p.to}`:`${p.qtyPerPair} sheets per pair`,p.total-p.required,p.total]);
    values.forEach(v=>rows.push({source:5,values:v}));rows.push({source:7,values:['Total','',sum(values,2),'',sum(values,4),'',sum(values,6),sum(values,7)]},{source:8},{source:9},{source:10});
    const overrides=new Map<string,any>();const first=papers.find((p:any)=>p.required);overrides.set('B3',production?0:first?first.buffer/100||0:0);
    result.sizes.forEach((s:any,i:number)=>{
      const group=papers.find((p:any)=>+s.uk>=+p.from&&+s.uk<=+p.to),qty=result.orders.reduce((a:number,o:any)=>a+o.qty[i],0),needed=papers.reduce((a:number,p:any)=>a+p.bySize[i],0);
      const buffer=production?0:group?.buffer||0,buy=Math.ceil(needed*(1+buffer/100));
      rows.push({source:11,values:wrapping?[+s.uk,qty,group?.code||'',group?.qtyPerPair||0,needed,buy-needed,buy,`Size ${s.uk}`]
        :[+s.uk,qty,group?.qtyPerPair||0,needed,buy-needed,buy,group?`${group.from} ~ ${group.to}`:'',group?`${group.qtyPerPair} sheets per pair`:'']});
    });
    write(sheet,rewrite(read(sheet),sequence(wrapping?8:11),rows,overrides,4,[],strings));
  }
  if(company==='CTC')fitCtcPresentation(archive);
  let workbook=strFromU8(archive['xl/workbook.xml']);
  workbook=workbook.replace(/<sheet\b[^>]*\/>/g,(node)=>{
    node=node.replace(/\s+state="[^"]*"/,'');
    if(production&&/name="Label"/.test(node))node=node.replace('name="Label"','name="Label - Special - Card"');
    if(production&&/name="(?:Special Label|Card)"/.test(node))node=node.replace('/>',' state="hidden"/>');
    return node;
  });
  // No stale source print-area/name ranges or calculation cache.
  workbook=workbook.replace(/<definedNames>[\s\S]*?<\/definedNames>/,'');
  if(selectedSheets){
    const removedIds=new Set<string>(),removedParts=new Set<string>();
    workbook=workbook.replace(/<sheet\b[^>]*\/>/g,node=>{if(selectedSheets.includes(attr(node,'name')||''))return node;removedIds.add(attr(node,'r:id')!);return '';});
    let relationships=strFromU8(archive['xl/_rels/workbook.xml.rels']);
    relationships=relationships.replace(/<Relationship\b[^>]*\/>/g,node=>{if(!removedIds.has(attr(node,'Id')||''))return node;const target=attr(node,'Target')||'';const path=target.startsWith('/')?target.slice(1):'xl/'+target;removedParts.add('/'+path);delete archive[path];const slash=path.lastIndexOf('/');delete archive[path.slice(0,slash)+'/_rels/'+path.slice(slash+1)+'.rels'];return '';});
    archive['xl/_rels/workbook.xml.rels']=strToU8(relationships);
    archive['[Content_Types].xml']=strToU8(strFromU8(archive['[Content_Types].xml']).replace(/<Override\b[^>]*\/>/g,node=>removedParts.has(attr(node,'PartName')||'')?'':node));
    workbook=workbook.replace(/activeTab="\d+"/g,'activeTab="0"').replace(/firstSheet="\d+"/g,'firstSheet="0"');
  }
  archive['xl/workbook.xml']=strToU8(workbook);
  return zipSync(archive,{level:6}).buffer as ArrayBuffer;
}
