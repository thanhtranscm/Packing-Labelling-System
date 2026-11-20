// Each request writes one bounded ZIP part; no request processes the whole backup.
const partBytes=8*1024*1024;
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
const encode=new TextEncoder();
function record(signature:number,length:number){const bytes=new Uint8Array(length),view=new DataView(bytes.buffer);view.setUint32(0,signature,true);return {bytes,view};}
function header(name:Uint8Array){const {bytes,view}=record(0x04034b50,30+name.length);view.setUint16(4,20,true);view.setUint16(6,0x808,true);view.setUint16(12,33,true);view.setUint16(26,name.length,true);bytes.set(name,30);return bytes;}
function descriptor(crc:number,size:number){const {bytes,view}=record(0x08074b50,16);view.setUint32(4,crc,true);view.setUint32(8,size,true);view.setUint32(12,size,true);return bytes;}
function central(entry:any){const name=encode.encode(entry.name),{bytes,view}=record(0x02014b50,46+name.length);view.setUint16(4,20,true);view.setUint16(6,20,true);view.setUint16(8,0x808,true);view.setUint16(14,33,true);view.setUint32(16,entry.crc,true);view.setUint32(20,entry.size,true);view.setUint32(24,entry.size,true);view.setUint16(28,name.length,true);view.setUint32(42,entry.start,true);bytes.set(name,46);return bytes;}
export function newZipState(entries:any[]){if(entries.length>65535||entries.reduce((n,e)=>n+e.size+encode.encode(e.name).length*2+100,22)>0xffffffff)throw Error('Backup exceeds the 4 GB ZIP limit. Contact support before creating this backup.');return {entries,index:0,phase:'header',offset:0,crc:0xffffffff,position:0,part:1,parts:[],directory:[],directoryIndex:0,directoryStart:0,directorySize:0,done:false};}
export async function nextZipPart(storage:any,state:any){
 const output=new Uint8Array(partBytes);let used=0;
 const append=(bytes:Uint8Array)=>{output.set(bytes,used);used+=bytes.length;state.position+=bytes.length;};
 while(used<partBytes&&!state.done){
  const entry=state.entries[state.index];
  if(state.phase==='header'){if(!entry){state.phase='directory';state.directoryStart=state.position;continue;}const bytes=header(encode.encode(entry.name));if(bytes.length>partBytes-used)break;entry.start=state.position;append(bytes);state.phase='body';state.offset=0;state.crc=0xffffffff;}
  else if(state.phase==='body'){
   if(state.offset===entry.size){state.phase='descriptor';continue;}
   const length=Math.min(4*1024*1024,partBytes-used,entry.size-state.offset);
   const object=await storage.get(entry.key,{range:{offset:state.offset,length}});
   if(!object||object.etag!==entry.etag)throw Error('Backup file unavailable or changed: '+entry.key);
   // R2 range requests bound even a single very large source file.
   const bytes=new Uint8Array(await object.arrayBuffer());if(bytes.length!==length)throw Error('Backup range incomplete: '+entry.key);
   let crc=state.crc;for(let i=0;i<bytes.length;i++)crc=crcTable[(crc^bytes[i])&255]^(crc>>>8);state.crc=crc>>>0;append(bytes);state.offset+=length;
  }else if(state.phase==='descriptor'){if(partBytes-used<16)break;const crc=(state.crc^0xffffffff)>>>0;append(descriptor(crc,entry.size));state.directory.push({name:entry.name,size:entry.size,start:entry.start,crc});state.index++;state.phase='header';}
  else if(state.phase==='directory'){const item=state.directory[state.directoryIndex];if(!item){state.directorySize=state.position-state.directoryStart;state.phase='end';continue;}const bytes=central(item);if(bytes.length>partBytes-used)break;append(bytes);state.directoryIndex++;}
  else{if(partBytes-used<22)break;const {bytes,view}=record(0x06054b50,22);view.setUint16(8,state.directory.length,true);view.setUint16(10,state.directory.length,true);view.setUint32(12,state.directorySize,true);view.setUint32(16,state.directoryStart,true);append(bytes);state.done=true;}
 }
 return output.subarray(0,used);
}
