import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {zipSync} from 'fflate';
const root=process.cwd();
const ignored=new Set(['node_modules','.git','.next','.wrangler','.sites-runtime','dist','upload','attachments','examples','.codex']);
const files={};
async function walk(dir=''){
 for(const entry of await fs.readdir(path.join(root,dir),{withFileTypes:true})){
  const relative=path.posix.join(dir,entry.name);
  if(ignored.has(entry.name)||entry.name.startsWith('.env')||/\.(?:log|tsbuildinfo|tar\.gz)$/.test(entry.name)||relative==='lib/backup-source.json')continue;
  if(entry.isSymbolicLink())continue;
  if(entry.isDirectory())await walk(relative);
  else if(entry.isFile())files[relative]=new Uint8Array(await fs.readFile(path.join(root,relative)));
 }
}
await walk();
const hosting=JSON.parse(new TextDecoder().decode(files['.openai/hosting.json']));delete hosting.project_id;files['.openai/hosting.json']=new TextEncoder().encode(JSON.stringify(hosting,null,2));
files['RESTORE_CONFIG.md']=new TextEncoder().encode(await fs.readFile('backup/README.md','utf8'));
const archive=zipSync(files,{level:6});
const payload={format:'PLS_SOURCE_V1',createdAt:new Date().toISOString(),sha256:createHash('sha256').update(archive).digest('hex'),fileCount:Object.keys(files).length,bytes:archive.length,base64:Buffer.from(archive).toString('base64'),readme:await fs.readFile('backup/FULL_BACKUP.md','utf8'),restoreScript:await fs.readFile('backup/restore.mjs','utf8')};
await fs.writeFile('lib/backup-source.json',JSON.stringify(payload));
console.log(`Prepared private source package: ${payload.fileCount} files, ${payload.bytes} bytes.`);
