// Upload a completed archive in bounded 8 MB parts. Publish it only after the
// ZIP footer has been written and multipart completion has succeeded.
export async function storeBackupArchive(storage:any,key:string,body:ReadableStream<Uint8Array>){
 const upload=await storage.createMultipartUpload(key,{httpMetadata:{contentType:'application/zip'}}),reader=body.getReader(),parts:any[]=[];
 const limit=8*1024*1024;let buffer=new Uint8Array(limit),used=0,part=1;
 async function flush(){parts.push(await upload.uploadPart(part++,buffer.subarray(0,used)));used=0;}
 try{while(true){const next=await reader.read();if(next.done)break;let offset=0;while(offset<next.value.length){const count=Math.min(limit-used,next.value.length-offset);buffer.set(next.value.subarray(offset,offset+count),used);used+=count;offset+=count;if(used===limit)await flush();}}if(used)await flush();await upload.complete(parts);}catch(error){await reader.cancel().catch(()=>{});await upload.abort().catch(()=>{});throw error;}finally{reader.releaseLock();}
}
