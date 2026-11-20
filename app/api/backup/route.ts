import {db,bucket,identity,fail} from '@/lib/server';
import {backupPrefix,requireOwner,validBackupId,backupInfo,databaseSnapshot,storedObjects,databaseBody,dataMarker} from '@/lib/backup';
import {storeBackupArchive} from '@/lib/backup-archive';
import {newZipState,nextZipPart} from '@/lib/backup-job';
import source from '@/lib/backup-source.json';
const privateHeaders={'Cache-Control':'private, no-store'};
export async function GET(req:Request){try{
 const user=await identity();requireOwner(user);const storage=bucket(),params=new URL(req.url).searchParams;
 const id=params.get('id');
 if(!id){const latest=await storage.get(backupPrefix+'latest.json');const state=await db().batch([db().prepare('SELECT company,revision FROM workspaces'),db().prepare('SELECT MAX(id) AS id FROM audit'),db().prepare('SELECT * FROM users ORDER BY email')]);return Response.json({backup:latest?backupInfo(JSON.parse(await latest.text()),source.sha256,state[0].results,dataMarker(state[1].results[0]?.id||0,state[2].results)):null},{headers:privateHeaders});}
 const object=await storage.get(backupPrefix+validBackupId(id)+'/snapshot.json');if(!object)return Response.json({error:'Backup unavailable. Refresh to create a new backup.'},{status:404,headers:privateHeaders});
 const snapshot=JSON.parse(await object.text()),manifest=snapshot.manifest;
 if(manifest.source.sha256!==source.sha256)throw Error('Website code has changed. Refresh the backup before downloading.');
 if(!manifest.archiveKey)throw Error('Refresh the backup to create a complete ZIP before downloading.');const archive=await storage.get(manifest.archiveKey);if(!archive)throw Error('Backup ZIP unavailable. Refresh and try again.');return new Response(archive.body,{headers:{...privateHeaders,'Content-Type':'application/zip','Content-Length':String(archive.size),'Content-Disposition':`attachment; filename="PLS_full_backup_${manifest.createdAt.replace(/[:.]/g,'-')}.zip"`}});
}catch(e){return fail(e);}}
export async function POST(){try{
 const user=await identity();requireOwner(user);const database=db(),storage=bucket(),createdAt=new Date().toISOString();
 const snapshot=await databaseSnapshot(database),objects=await storedObjects(storage),id=Date.now()+'-'+crypto.randomUUID(),prefix=backupPrefix+id+'/';
 const manifest:any={dataMarker:dataMarker(snapshot.auditId,snapshot.tables.users),format:'PLS_FULL_BACKUP_V1',id,createdAt,owner:user.email,revisions:Object.fromEntries(snapshot.tables.workspaces.map((r:any)=>[r.company,r.revision])),source:{sha256:source.sha256,fileCount:source.fileCount,bytes:source.bytes,createdAt:source.createdAt},objects};
 const entries:any[]=[];
 async function staged(name:string,value:any){const key=prefix+'staged/'+name;await storage.put(key,value);const object=await storage.head(key);entries.push({name,key,size:object.size,etag:object.etag});}
 await staged('manifest.json',JSON.stringify(manifest,null,2));
 const databaseKey=prefix+'staged/database.json';await storeBackupArchive(storage,databaseKey,databaseBody(database,snapshot));const databaseObject=await storage.head(databaseKey);entries.push({name:'database.json',key:databaseKey,size:databaseObject.size,etag:databaseObject.etag});
 await staged('README.md',source.readme);await staged('restore.mjs',source.restoreScript);await staged('source.zip',Uint8Array.from(atob(source.base64),c=>c.charCodeAt(0)));
 for(const row of snapshot.tables.workspaces){const data=JSON.parse(row.data),object=objects.find(o=>o.key===data.storageKey);if(data.storageKey){if(!object)throw Error('Workspace changed during backup. Refresh and try again.');entries.push({name:'workspaces/'+row.company+'.json',...object});}else await staged('workspaces/'+row.company+'.json',row.data);}
 for(const object of objects)entries.push({name:object.archivePath,...object});
 const state=newZipState(entries),archiveKey=prefix+'complete.zip',upload=await storage.createMultipartUpload(archiveKey,{httpMetadata:{contentType:'application/zip'}});
 const job={manifest,archiveKey,uploadId:upload.uploadId,state};await storage.put(prefix+'job.json',JSON.stringify(job));
 return Response.json({job:{id,part:state.part,progress:0}},{headers:privateHeaders});
}catch(e){return fail(e);}}
export async function PATCH(req:Request){try{
 const user=await identity();requireOwner(user);const input:any=await req.json(),id=validBackupId(input.id),storage=bucket(),key=backupPrefix+id+'/job.json',object=await storage.get(key);if(!object)throw Error('Backup job unavailable. Refresh and try again.');
 const job=JSON.parse(await object.text());if(job.manifest.source.sha256!==source.sha256)throw Error('Website changed during backup. Refresh and try again.');
 const state=job.state;
 if(state.done){if(!await storage.head(job.archiveKey))await storage.resumeMultipartUpload(job.archiveKey,job.uploadId).complete(state.parts);job.manifest.archiveKey=job.archiveKey;await storage.put(backupPrefix+id+'/snapshot.json',JSON.stringify({manifest:job.manifest}));await storage.put(backupPrefix+'latest.json',JSON.stringify(job.manifest));return Response.json({backup:backupInfo(job.manifest,source.sha256)},{headers:privateHeaders});}
 if(input.part!==state.part)return Response.json({job:{id,part:state.part,progress:Math.min(99,Math.round(100*state.position/state.entries.reduce((n:number,e:any)=>n+e.size+100,22)))}},{headers:privateHeaders});
 const bytes=await nextZipPart(storage,state),upload=storage.resumeMultipartUpload(job.archiveKey,job.uploadId);state.parts.push(await upload.uploadPart(state.part,bytes));state.part++;
 await storage.put(key,JSON.stringify(job));return Response.json({job:{id,part:state.part,progress:state.done?99:Math.min(99,Math.round(100*state.position/state.entries.reduce((n:number,e:any)=>n+e.size+100,22)))}},{headers:privateHeaders});
}catch(e){return fail(e);}}
