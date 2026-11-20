import {bucket,identity,fail} from '@/lib/server';
import {backupPrefix,requireOwner,validBackupId} from '@/lib/backup';
import source from '@/lib/backup-source.json';
const privateHeaders={'Cache-Control':'private, no-store'};
function sourceInfo(m:any,hash:string){return {id:m.id,createdAt:m.createdAt,sourceFiles:m.source.fileCount,sourceBytes:m.source.bytes,stale:m.source.sha256!==hash,kind:'source'};}
export async function GET(req:Request){try{
 requireOwner(await identity());const storage=bucket(),id=new URL(req.url).searchParams.get('id');
 if(!id){const latest=await storage.get(backupPrefix+'source-latest.json');return Response.json({backup:latest?sourceInfo(JSON.parse(await latest.text()),source.sha256):null},{headers:privateHeaders});}
 const metadata=await storage.get(backupPrefix+validBackupId(id)+'/source.json');if(!metadata)throw Error('Source backup unavailable. Refresh to create a new code backup.');const manifest=JSON.parse(await metadata.text());
 if(manifest.source.sha256!==source.sha256)throw Error('Website code has changed. Refresh before downloading.');
 const archive=await storage.get(manifest.archiveKey);if(!archive)throw Error('Source ZIP unavailable. Refresh and try again.');return new Response(archive.body,{headers:{...privateHeaders,'Content-Type':'application/zip','Content-Length':String(archive.size),'Content-Disposition':`attachment; filename="PLS_website_code_${manifest.createdAt.replace(/[:.]/g,'-')}.zip"`}});
}catch(e){return fail(e);}}
export async function POST(){try{
 requireOwner(await identity());const storage=bucket(),id=Date.now()+'-'+crypto.randomUUID(),archiveKey=backupPrefix+id+'/source.zip';
 const bytes=Uint8Array.from(atob(source.base64),c=>c.charCodeAt(0));
 // The release source archive is built once at deployment; Refresh only saves it.
 await storage.put(archiveKey,bytes,{httpMetadata:{contentType:'application/zip'}});
 const manifest={format:'PLS_CODE_BACKUP_V1',id,createdAt:new Date().toISOString(),archiveKey,source:{sha256:source.sha256,fileCount:source.fileCount,bytes:source.bytes}};
 await storage.put(backupPrefix+id+'/source.json',JSON.stringify(manifest));await storage.put(backupPrefix+'source-latest.json',JSON.stringify(manifest));return Response.json({backup:sourceInfo(manifest,source.sha256)},{headers:privateHeaders});
}catch(e){return fail(e);}}
