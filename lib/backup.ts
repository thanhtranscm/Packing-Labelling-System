import {Zip,ZipPassThrough,strToU8} from 'fflate';
export const backupPrefix='_owner-backups/';
export function requireOwner(user:any){if(user?.role!=='owner')throw Error('Access denied');}
export function validBackupId(id:string){if(!/^\d{13}-[a-f0-9-]{36}$/.test(id))throw Error('Invalid backup');return id;}
export function backupInfo(manifest:any,sourceHash:string,revisions:any[]=[],marker?:string){return {id:manifest.id,createdAt:manifest.createdAt,owner:manifest.owner,objectCount:manifest.objects.length,fileBytes:manifest.objects.reduce((n:number,o:any)=>n+o.size,0),sourceFiles:manifest.source.fileCount,sourceBytes:manifest.source.bytes,revisions:manifest.revisions,stale:!manifest.archiveKey||(marker!==undefined&&manifest.dataMarker!==marker)||manifest.source.sha256!==sourceHash||revisions.some(r=>manifest.revisions[r.company]!==r.revision)};}
export function dataMarker(auditId:number,users:any[]){return JSON.stringify({auditId,users:[...users].sort((a,b)=>a.email.localeCompare(b.email))});}
export async function databaseSnapshot(database:any){
 const schema=await database.prepare("SELECT name,type,sql FROM sqlite_schema WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name").all();
 const names=schema.results.filter((r:any)=>r.type==='table').map((r:any)=>r.name);
 const results=await database.batch([database.prepare('SELECT * FROM workspaces'),database.prepare('SELECT * FROM users ORDER BY email'),database.prepare('SELECT MAX(id) AS id FROM audit')]);
 return {schema:schema.results,tables:{workspaces:results[0].results,users:results[1].results},auditId:results[2].results[0]?.id||0,names};
}
export async function storedObjects(storage:any){
 const objects:any[]=[];let cursor:string|undefined;
 do{const page=await storage.list({limit:1000,cursor,include:['httpMetadata','customMetadata']});for(const o of page.objects)if(!o.key.startsWith(backupPrefix))objects.push({key:o.key,size:o.size,etag:o.etag,httpMetadata:o.httpMetadata||{},customMetadata:o.customMetadata||{}});cursor=page.truncated?page.cursor:undefined;}while(cursor);
 return objects.sort((a,b)=>a.key.localeCompare(b.key)).map((o,i)=>({...o,archivePath:'objects/'+String(i+1).padStart(7,'0')+'.bin'}));
}
function* jsonTokens(value:any):Generator<string>{
 if(value===null||typeof value!=='object'){yield JSON.stringify(value)??'null';return;}
 if(Array.isArray(value)){yield '[';for(let i=0;i<value.length;i++){if(i)yield ',';yield* jsonTokens(value[i]);}yield ']';return;}
 yield '{';let first=true;for(const key of Object.keys(value)){if(value[key]===undefined)continue;if(!first)yield ',';first=false;yield JSON.stringify(key)+':';yield* jsonTokens(value[key]);}yield '}';
}
function jsonBody(value:any){const tokens=jsonTokens(value);let pending='';return new ReadableStream<Uint8Array>({pull(controller){while(pending.length<32768){const next=tokens.next();if(next.done){if(pending)controller.enqueue(strToU8(pending));controller.close();return;}pending+=next.value;}controller.enqueue(strToU8(pending));pending='';},cancel(){tokens.return(undefined);}});}
export function databaseBody(database:any,snapshot:any){
 async function* tokens(){yield '{"schema":'+JSON.stringify(snapshot.schema)+',"tables":{';let first=true;
  for(const name of snapshot.names){if(!first)yield ',';first=false;yield JSON.stringify(name)+':[';
   if(name==='workspaces'||name==='users')yield JSON.stringify(snapshot.tables[name]).slice(1,-1);
   else {let cursor=0,firstRow=true;while(true){const rows=(await database.prepare('SELECT rowid AS "__backup_rowid", * FROM "'+name.replaceAll('"','""')+'" WHERE rowid > ?'+(name==='audit'?' AND id <= ?':'')+' ORDER BY rowid LIMIT 4').bind(...(name==='audit'?[cursor,snapshot.auditId]:[cursor])).all()).results;if(!rows.length)break;for(const row of rows){cursor=row.__backup_rowid;delete row.__backup_rowid;if(!firstRow)yield ',';firstRow=false;yield JSON.stringify(row);}}}
   yield ']';
  }yield '}}';
 }
 const iterator=tokens();return new ReadableStream<Uint8Array>({async pull(c){const next=await iterator.next();if(next.done)c.close();else c.enqueue(strToU8(next.value));},async cancel(){await iterator.return(undefined);}});
}
// Pull-driven streaming avoids holding all stored Excel/image bytes in memory.
export function backupStream(manifest:any,snapshot:any,source:any,storage:any){
 let cancelled=false;
 async function* entries(){
  yield {name:'manifest.json',data:strToU8(JSON.stringify(manifest,null,2))};
  yield {name:'database.json',body:jsonBody(snapshot.database)};
  yield {name:'README.md',data:strToU8(source.readme)};
  yield {name:'restore.mjs',data:strToU8(source.restoreScript)};
  yield {name:'source.zip',data:Uint8Array.from(atob(source.base64),c=>c.charCodeAt(0))};
  for(const [company,data] of Object.entries(snapshot.workspaces))yield {name:'workspaces/'+company+'.json',body:jsonBody(data)};
  for(const object of manifest.objects){if(cancelled)return;const value=await storage.get(object.key);if(!value||value.etag!==object.etag)throw Error('Backup file unavailable or changed: '+object.key);yield {name:object.archivePath,body:value.body};}
 }
 const iterator=entries();let queue:Uint8Array[]=[],current:any=null,reader:any=null,finished=false;
 const zip=new Zip((error,data,final)=>{if(error)throw error;if(data.length)queue.push(data);if(final)finished=true;});
 return new ReadableStream<Uint8Array>({
  async pull(controller){try{
   while(!queue.length&&!finished){
    if(reader){const chunk=await reader.read();if(chunk.done){current.push(new Uint8Array(),true);reader.releaseLock();reader=null;current=null;}else current.push(chunk.value,false);}
    else{const entry=await iterator.next();if(entry.done){zip.end();}else{current=new ZipPassThrough(entry.value.name);zip.add(current);if(entry.value.body)reader=entry.value.body.getReader();else{current.push(entry.value.data!,true);current=null;}}}
   }
   if(queue.length)controller.enqueue(queue.shift()!);else if(finished)controller.close();
  }catch(error){cancelled=true;await reader?.cancel().catch(()=>{});controller.error(error);}},
  async cancel(){cancelled=true;await reader?.cancel().catch(()=>{});await iterator.return(undefined);},
 });
}
