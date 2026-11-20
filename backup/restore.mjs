import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1];
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const data=JSON.parse(await fs.readFile(path.join(root,'database.json'),'utf8'));
const ident=name=>'"'+name.replaceAll('"','""')+'"';
const literal=v=>v===null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const platformTable=name=>name.startsWith('sqlite_')||name.startsWith('_cf_')||['__drizzle_migrations','d1_migrations'].includes(name);
const schema=data.schema.filter(s=>s.sql&&!platformTable(s.name));
const statements=[...schema.filter(s=>s.type==='table').map(s=>s.sql.replace(/^CREATE TABLE /i,'CREATE TABLE IF NOT EXISTS ')+';')];
for(const [name,rows] of Object.entries(data.tables).filter(([name])=>!platformTable(name)))for(const row of rows){const columns=Object.keys(row);statements.push(`INSERT INTO ${ident(name)} (${columns.map(ident).join(',')}) VALUES (${columns.map(c=>literal(row[c])).join(',')});`);}
statements.push(...schema.filter(s=>s.type==='index').map(s=>s.sql.replace(/^CREATE (UNIQUE )?INDEX /i,(_,unique)=>'CREATE '+(unique||'')+'INDEX IF NOT EXISTS ')+';'));
await fs.writeFile(path.join(root,'restore.sql'),statements.join('\n'));
console.log(`Prepared ${Object.keys(data.tables).length} tables and ${manifest.objects.length} stored files. Snapshot: ${manifest.createdAt}`);
if(!args.includes('--apply')){console.log('Review restore.sql, then pass --database NAME --bucket NAME --config PATH --apply to restore into new empty resources.');process.exit(0);}
for(const flag of ['--database','--bucket','--config'])if(!args.includes(flag)||!arg(flag)||arg(flag).startsWith('--'))throw Error('Missing '+flag);
function wrangler(cmd){const r=spawnSync(process.execPath,[path.resolve('node_modules/wrangler/bin/wrangler.js'),...cmd,'--config',arg('--config')],{stdio:'inherit',shell:false});if(r.error)throw r.error;if(r.status!==0)throw Error('Restore stopped; inspect the provider error before retrying.');}
// Upload immutable objects before installing pointers to them in the database.
for(const object of manifest.objects){const local=path.resolve(root,object.archivePath);if(!local.startsWith(root+path.sep))throw Error('Invalid object path');const options=['r2','object','put',arg('--bucket')+'/'+object.key,'--file',local,'--remote'];if(object.httpMetadata?.contentType)options.push('--content-type',object.httpMetadata.contentType);wrangler(options);}
await fs.writeFile(path.join(root,'restored-file-metadata.json'),JSON.stringify(Object.fromEntries(manifest.objects.map(o=>[o.key,{httpMetadata:o.httpMetadata,customMetadata:o.customMetadata}]))));
wrangler(['r2','object','put',arg('--bucket')+'/_restored-file-metadata.json','--file',path.join(root,'restored-file-metadata.json'),'--content-type','application/json','--remote']);
wrangler(['d1','execute',arg('--database'),'--remote','--file',path.join(root,'restore.sql')]);
console.log('Restore complete. Recreate sign-in and deployment settings, then validate the new website.');
