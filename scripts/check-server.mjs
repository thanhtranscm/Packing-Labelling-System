import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {unzipSync,strFromU8} from 'fflate';
import ts from 'typescript';
const dir=await fs.mkdtemp(path.resolve('.sites-runtime/server-check-'));
const sql=new DatabaseSync(':memory:');sql.exec(await fs.readFile('drizzle/0000_silky_goblin_queen.sql','utf8'));sql.exec(await fs.readFile('drizzle/0001_messy_gauntlet.sql','utf8'));
const database={prepare(query){let values=[];const wrapper={bind(...v){values=v;return wrapper},async first(){return sql.prepare(query).get(...values)||null},async all(){return {results:sql.prepare(query).all(...values)}},async run(){const result=sql.prepare(query).run(...values);return {meta:{changes:Number(result.changes)}}},exec(){const stmt=sql.prepare(query);if(stmt.columns().length)return {results:stmt.all(...values)};const result=stmt.run(...values);return {meta:{changes:Number(result.changes)}}}};return wrapper},async batch(statements){sql.exec('BEGIN');try{const results=statements.map(stmt=>stmt.exec());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}};
const files=new Map();const storage={async put(key,value,options={}){const bytes=typeof value==='string'?new TextEncoder().encode(value):new Uint8Array(value);files.set(key,{bytes,etag:createHash('sha256').update(bytes).digest('hex'),httpMetadata:options.httpMetadata||{},customMetadata:options.customMetadata||{}})},async get(key,options={}){const original=files.get(key);const v=original&&{...original,bytes:options.range?original.bytes.slice(options.range.offset,options.range.offset+options.range.length):original.bytes};if(!v)return null;return {...v,size:v.bytes.length,httpEtag:'"'+v.etag+'"',async text(){return strFromU8(v.bytes)},async arrayBuffer(){return v.bytes.slice().buffer},body:new ReadableStream({start(c){for(let i=0;i<v.bytes.length;i+=65536)c.enqueue(v.bytes.slice(i,i+65536));c.close()}})}},async list({limit=1000,cursor}={}){const list=[...files.entries()].sort(([a],[b])=>a.localeCompare(b));const i=Number(cursor||0),entries=list.slice(i,i+limit);return {objects:entries.map(([key,v])=>({key,size:v.bytes.length,etag:v.etag,httpMetadata:v.httpMetadata,customMetadata:v.customMetadata})),truncated:i+limit<list.length,cursor:String(i+limit)}}};
storage.head=async key=>{const object=files.get(key);return object?{...object,size:object.bytes.length}:null};
const uploads=new Map();storage.createMultipartUpload=async(key,options)=>{const uploadId=String(uploads.size+1),chunks=new Map();const upload={uploadId,async uploadPart(partNumber,value){chunks.set(partNumber,new Uint8Array(value));return {partNumber,etag:String(partNumber)}},async complete(parts){const size=parts.reduce((n,p)=>n+chunks.get(p.partNumber).length,0),bytes=new Uint8Array(size);let at=0;for(const p of parts){const v=chunks.get(p.partNumber);bytes.set(v,at);at+=v.length;}await storage.put(key,bytes,options)},async abort(){chunks.clear()}};uploads.set(uploadId,upload);return upload};storage.resumeMultipartUpload=(key,id)=>uploads.get(id);

globalThis.__db=database;globalThis.__storage=storage;globalThis.__user={role:'owner',email:'owner@example.test'};
async function compile(name,source){let text=source??await fs.readFile('lib/'+name+'.ts','utf8');text=text.replace(/from ['"](?:@\/lib\/|\.\/)([^'"]+)['"]/g,(_,dep)=>"from './"+dep+".js'");text=text.replace("import seed from './seed.json.js';",'const seed='+await fs.readFile('lib/seed.json','utf8')+';');text=text.replace("import source from './backup-source.json.js';",'const source='+await fs.readFile('lib/backup-source.json','utf8')+';');await fs.writeFile(path.join(dir,name+'.js'),ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);}
const loaded=async name=>import(pathToFileURL(path.join(dir,name+'.js')));
await fs.writeFile(path.join(dir,'server.js'),`export const db=()=>globalThis.__db;export const bucket=()=>globalThis.__storage;export const identity=async()=>{if(!globalThis.__user)throw Error('Sign in required');return globalThis.__user};export const fail=e=>Response.json({error:e.message},{status:/denied|required/.test(e.message)?403:400});`);
for(const name of ['po-month-notices','image-application','order-rows','size-settings','material-state','comparison','po-state','model','master-update','master-validation','workspace-validation','audit-summary','workspace-store','read-stage','file-access','bootstrap','backup','backup-archive','backup-job'])await compile(name);
const {isSummaryOrder,reconcileSummaryRows}=await loaded('order-rows');
const {makeWorkspace}=await import(pathToFileURL(path.join(dir,'bootstrap.js')));
const {commitWorkspace}=await import(pathToFileURL(path.join(dir,'workspace-store.js')));
const {auditSummary}=await import(pathToFileURL(path.join(dir,'audit-summary.js')));
const {backupStream,storedObjects}=await import(pathToFileURL(path.join(dir,'backup.js')));
await compile('backup-route',await fs.readFile('app/api/backup/route.ts','utf8'));const backup=await loaded('backup-route');
async function createBackup(){let response=await backup.POST();if(!response.ok)return response;let result=await response.json();while(result.job){response=await backup.PATCH(new Request('https://test/api/backup',{method:'PATCH',body:JSON.stringify(result.job)}));if(!response.ok)return response;result=await response.json();}return Response.json(result);}
await compile('source-backup-route',await fs.readFile('app/api/backup/source/route.ts','utf8'));const sourceBackup=await loaded('source-backup-route');
await compile('workspace-route',await fs.readFile('app/api/workspace/route.ts','utf8'));const workspace=await loaded('workspace-route');
await compile('users-route',await fs.readFile('app/api/users/route.ts','utf8'));const users=await loaded('users-route');
await compile('history-route',await fs.readFile('app/api/history/route.ts','utf8'));const history=await loaded('history-route');
await compile('files-route',await fs.readFile('app/api/files/route.ts','utf8'));const fileRoute=await loaded('files-route');
let count=0;async function check(name,fn){await fn();console.log('PASS '+name);count++}
try{
 for(const company of ['WSV','CTC']){const data=makeWorkspace(company),key=company+'/workspace/initial';await storage.put(key,JSON.stringify(data));sql.prepare('INSERT INTO workspaces VALUES(?,?,?)').run(company,JSON.stringify({storageKey:key}),0)}
 await storage.put('WSV/image-original',new Uint8Array([1,2,3,4]),{httpMetadata:{contentType:'image/png'},customMetadata:{name:'hình.png'}});
 await check('non-owner and signed-out accounts cannot inspect/export/refresh backups',async()=>{for(const user of [null,{role:'user'},{role:'admin'}]){globalThis.__user=user;assert.equal((await backup.GET(new Request('https://test/api/backup'))).status,403);assert.equal((await createBackup()).status,403);assert.equal((await backup.GET(new Request('https://test/api/backup?id=123'))).status,403)}});
 globalThis.__user={role:'owner',email:'owner@example.test'};
 await check('workspace write and audit commit atomically; stale revision cannot overwrite',async()=>{await storage.put('WSV/workspace/new','{}');assert.equal(await commitWorkspace(database,'WSV',0,'WSV/workspace/new','actor','test',{changes:[]}),true);assert.equal(await commitWorkspace(database,'WSV',0,'WSV/workspace/conflict','other','test',{changes:[]}),false);assert.equal(sql.prepare('SELECT count(*) AS n FROM audit').get().n,1);assert.equal(sql.prepare("SELECT revision FROM workspaces WHERE company='WSV'").get().revision,1)});
 await check('audit failure rolls back the workspace revision and pointer',async()=>{sql.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON audit WHEN NEW.action='fail' BEGIN SELECT RAISE(ABORT,'test'); END;");const before=sql.prepare("SELECT * FROM workspaces WHERE company='WSV'").get();await assert.rejects(()=>commitWorkspace(database,'WSV',1,'WSV/workspace/bad','actor','fail',{}));assert.deepEqual(sql.prepare("SELECT * FROM workspaces WHERE company='WSV'").get(),before);sql.exec('DROP TRIGGER fail_audit')});
 sql.prepare("UPDATE workspaces SET data=? WHERE company='WSV'").run(JSON.stringify({storageKey:'WSV/workspace/initial'}));
 await check('malformed quantity and duplicate PO/month IDs cannot be saved',async()=>{for(const edit of [w=>w.items[0].qty_per_finish=-1,w=>w.items[0].qty_per_finish='NaN',w=>w.months.push(structuredClone(w.months[0])),w=>w.months.push({...structuredClone(w.months[0]),id:'different-id'}),w=>w.months[0].orders.push(structuredClone(w.months[0].orders[0]))]){const data=makeWorkspace('WSV');edit(data);const r=await workspace.PUT(new Request('https://test/api/workspace',{method:'PUT',body:JSON.stringify({company:'WSV',data,revision:1})}));assert.equal(r.status,400,await r.text())}});
 await check('saved subtotal cleanup preserves real POs and immutable Excel snapshots',()=>{
 const data=makeWorkspace('WSV'),m=data.months[0],real=structuredClone(m.orders[0]);const bad={...structuredClone(real),id:'TOTAL CLOUDMONSTER 3 HYPER LS',factoryPo:'TOTAL CLOUDMONSTER 3 HYPER LS',onPo:'TOTAL CLOUDMONSTER 3 HYPER LS',sku:'TOTAL CLOUDMONSTER 3 HYPER LS'};
 m.orders=[real,bad];m.latest=[real,bad];m.runs=[{id:'old',orders:[real,bad]}];m.versions=[{id:'old',orders:[real,bad],result:{orders:[real,bad],total:123}}];const original=JSON.stringify(m.versions[0].result),runs=JSON.stringify(m.runs);
 assert.equal(reconcileSummaryRows(data),true);assert.deepEqual(m.orders,[real]);assert.deepEqual(m.latest,[real]);assert.equal(m.versions[0].orders.length,2);assert.equal(JSON.stringify(m.versions[0].result),original);assert.equal(JSON.stringify(m.runs),runs);assert.match(m.versions[0].historicalWarning,/subtotal/);assert.equal(reconcileSummaryRows(data),false);assert.equal(isSummaryOrder({...real,sku:'TOTAL MODEL'}),false);
 });
 await check('valid saved workspace remains accepted by the new validation',async()=>{const data=makeWorkspace('WSV');const response=await workspace.PUT(new Request('https://test/api/workspace',{method:'PUT',body:JSON.stringify({company:'WSV',data,revision:1,action:'Validated workspace'})}));assert.equal(response.status,200,await response.clone().text());assert.equal((await response.json()).revision,2)});
 await check('ordinary admin/user boundaries and owner protection are enforced',async()=>{globalThis.__user={role:'user',email:'user@test'};assert.equal((await workspace.PUT(new Request('https://test/api/workspace',{method:'PUT',body:'{}'}))).status,403);assert.equal((await users.GET()).status,403);assert.equal((await history.GET(new Request('https://test/api/history?company=WSV'))).status,403);globalThis.__user={role:'admin',email:'admin@test'};assert.equal((await users.POST(new Request('https://test/api/users',{method:'POST',body:'{}'}))).status,403);globalThis.__user={role:'owner',email:'owner@test'};assert.equal((await users.POST(new Request('https://test/api/users',{method:'POST',body:JSON.stringify({email:'thanhtranscm@gmail.com',remove:true})}))).status,400)});
 await check('user access changes are recorded with before/after values in both workspaces',async()=>{const r=await users.POST(new Request('https://test/api/users',{method:'POST',body:JSON.stringify({email:'new@test.com',name:'New User',role:'admin',active:true})}));assert.equal(r.status,200);const rows=sql.prepare("SELECT * FROM audit WHERE action='Added authorized user'").all();assert.equal(rows.length,2);assert.equal(JSON.parse(rows[0].detail).after.role,'admin')});
 let result;
 await check('refresh captures both workspaces, users, complete audit and stored objects',async()=>{const r=await createBackup();assert.equal(r.status,200,await r.clone().text());result=await r.json();assert.equal(result.backup.objectCount,5);assert.equal(result.backup.stale,false);assert.equal(result.backup.revisions.WSV,2);assert.equal(result.backup.revisions.CTC,0)});
 await check('backup job is resumable, duplicate requests do not duplicate ZIP bytes, incomplete jobs never publish',async()=>{
  const previous=files.get('_owner-backups/latest.json');const started=await (await backup.POST()).json();assert.ok(started.job);assert.equal(files.get('_owner-backups/latest.json'),previous);
  globalThis.__user={role:'user'};assert.equal((await backup.PATCH(new Request('https://test/api/backup',{method:'PATCH',body:JSON.stringify(started.job)}))).status,403);globalThis.__user={role:'owner',email:'owner@example.test'};
  const advanced=await (await backup.PATCH(new Request('https://test/api/backup',{method:'PATCH',body:JSON.stringify(started.job)}))).json();
  let retry=await (await backup.PATCH(new Request('https://test/api/backup',{method:'PATCH',body:JSON.stringify(started.job)}))).json();
  // If this tiny archive already finished, finalization is idempotent as well.
  while(retry.job)retry=await (await backup.PATCH(new Request('https://test/api/backup',{method:'PATCH',body:JSON.stringify(retry.job)}))).json();assert.equal(retry.backup.id,started.job.id);
  assert.equal((await backup.PATCH(new Request('https://test/api/backup',{method:'PATCH',body:JSON.stringify(advanced.job)}))).status,200);
 });
 await check('ZIP contents, source checksum and every stored byte round trip',async()=>{const response=await backup.GET(new Request('https://test/api/backup?id='+result.backup.id));assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');const entries=unzipSync(new Uint8Array(await response.arrayBuffer()));const manifest=JSON.parse(strFromU8(entries['manifest.json'])),snapshot=JSON.parse(strFromU8(entries['database.json']));assert.equal(snapshot.tables.users[0].email,'new@test.com');assert.equal(snapshot.tables.audit.length,4);assert.equal(JSON.parse(strFromU8(entries['workspaces/CTC.json'])).name,'CTC');assert.equal(createHash('sha256').update(entries['source.zip']).digest('hex'),manifest.source.sha256);const source=unzipSync(entries['source.zip']);assert.ok(source['app/portal.tsx']);assert.ok(source['public/templates/purchase.xlsx']);assert.ok(source['pnpm-lock.yaml']);assert.equal(JSON.parse(strFromU8(source['.openai/hosting.json'])).project_id,undefined);assert.ok(!Object.keys(source).some(k=>k.startsWith('.env')));for(const o of manifest.objects)assert.deepEqual(entries[o.archivePath],files.get(o.key).bytes);const restoreDir=path.join(dir,'restore');await fs.mkdir(restoreDir);for(const name of ['database.json','manifest.json','restore.mjs'])await fs.writeFile(path.join(restoreDir,name),entries[name]);const helper=spawnSync(process.execPath,[path.join(restoreDir,'restore.mjs')],{encoding:'utf8'});assert.equal(helper.status,0,helper.stderr);const restored=new DatabaseSync(':memory:');restored.exec(await fs.readFile(path.join(restoreDir,'restore.sql'),'utf8'));assert.equal(restored.prepare('SELECT count(*) AS n FROM audit').get().n,4);assert.equal(restored.prepare("SELECT revision FROM workspaces WHERE company='WSV'").get().revision,2);restored.close();});
 await check('backup snapshots do not recursively include prior backups; stale data is flagged',async()=>{const r=await createBackup();assert.equal((await r.json()).backup.objectCount,5);sql.prepare("UPDATE workspaces SET revision=revision+1 WHERE company='CTC'").run();const status=await (await backup.GET(new Request('https://test/api/backup'))).json();assert.equal(status.backup.stale,true)});
 await check('new history/user changes make the backup stale without workspace edits',async()=>{await createBackup();sql.prepare('INSERT INTO audit(company,actor,action,detail,created) VALUES(?,?,?,?,?)').run('WSV','owner','Download','{}',new Date().toISOString());assert.equal((await (await backup.GET(new Request('https://test/api/backup'))).json()).backup.stale,true)});
 await check('failed multipart archive does not publish a new backup; download is the completed stored ZIP',async()=>{
 const previous=files.get('_owner-backups/latest.json'),create=storage.createMultipartUpload;let aborted=false;
 storage.createMultipartUpload=async()=>({async uploadPart(){throw Error('Upload failed')},async complete(){throw Error('Must not complete')},async abort(){aborted=true}});
 try{assert.equal((await createBackup()).status,400);assert.ok(aborted);assert.equal(files.get('_owner-backups/latest.json'),previous);}finally{storage.createMultipartUpload=create;}
 const response=await backup.GET(new Request('https://test/api/backup?id='+result.backup.id));const saved=files.get('_owner-backups/'+result.backup.id+'/complete.zip');assert.equal(Number(response.headers.get('Content-Length')),saved.bytes.length);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),saved.bytes);
 });
 await check('missing/changed stored files abort ZIP rather than returning an incomplete archive',async()=>{const row=files.get('_owner-backups/'+result.backup.id+'/snapshot.json');const snapshot=JSON.parse(strFromU8(row.bytes));files.delete('WSV/image-original');const source=JSON.parse(await fs.readFile('lib/backup-source.json','utf8'));await assert.rejects(()=>new Response(backupStream(snapshot.manifest,{database:{},workspaces:{}},source,storage)).arrayBuffer(),/unavailable or changed/)});
 await check('code changes require refreshing the source snapshot before download',async()=>{const key='_owner-backups/'+result.backup.id+'/snapshot.json',original=files.get(key);const snapshot=JSON.parse(strFromU8(original.bytes));snapshot.manifest.source.sha256='changed-code';await storage.put(key,JSON.stringify(snapshot));assert.equal((await backup.GET(new Request('https://test/api/backup?id='+result.backup.id))).status,400);files.set(key,original)});
 await check('R2 listing paginates past 1000 objects',async()=>{for(let i=0;i<1005;i++)await storage.put('CTC/paged-'+i,'x');assert.equal((await storedObjects(storage)).length,1009)});
 await check('history exposes expanded values and generated PO/pair details',async()=>{const changes={changes:Array.from({length:12},(_,i)=>({path:'months / November.settings.buffer.field'+i,before:0,after:i+1}))};assert.equal(auditSummary(changes,'Settings saved',true).length,12);const file={changes:[{path:'months / November.versions / result.xlsx',after:{name:'result.xlsx',POs:['WSV1','WSV2'],pairs:18}}]};const rows=auditSummary(file,'Generated result.xlsx',true);assert.ok(rows.some(r=>r.after==='WSV1, WSV2'));assert.ok(rows.some(r=>r.label==='Total pairs'&&r.after==='18'));});
 await check('history filters reject inverted dates and invalid cursors; index is used',async()=>{assert.equal((await history.GET(new Request('https://test/api/history?company=WSV&from=2026-11-01&to=2026-01-01'))).status,400);assert.equal((await history.GET(new Request('https://test/api/history?company=WSV&before=-2'))).status,400);const plan=sql.prepare("EXPLAIN QUERY PLAN SELECT * FROM audit WHERE company='WSV' ORDER BY id DESC LIMIT 200").all();assert.ok(plan.some(r=>r.detail.includes('idx_audit_company_id')))});

 await check('20 simultaneous admin saves: one commit, 19 conflicts, one audit row and no overwrite',async()=>{
  globalThis.__user={role:'admin',email:'admin@example.test'};
  const before=sql.prepare("SELECT * FROM workspaces WHERE company='WSV'").get();
  const data=(await (await workspace.GET(new Request('https://test/api/workspace?company=WSV'))).json()).data;
  const revision=sql.prepare("SELECT revision FROM workspaces WHERE company='WSV'").get().revision;
  const audits=sql.prepare("SELECT count(*) AS n FROM audit WHERE company='WSV'").get().n;
  const responses=await Promise.all(Array.from({length:20},(_,i)=>workspace.PUT(new Request('https://test/api/workspace',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({company:'WSV',revision,data:{...structuredClone(data),name:'Concurrent admin '+i},action:'Concurrent save'})}))));
  assert.equal(responses.filter(r=>r.status===200).length,1);assert.equal(responses.filter(r=>r.status===409).length,19);
  assert.equal(sql.prepare("SELECT revision FROM workspaces WHERE company='WSV'").get().revision,revision+1);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM audit WHERE company='WSV'").get().n,audits+1);
  globalThis.__user={role:'owner',email:'owner@example.test'};
 });
 await check('separate workspaces save independently; 30 simultaneous readers remain read-only',async()=>{
  const workspaces=await Promise.all(['WSV','CTC'].map(async company=>({company,...await (await workspace.GET(new Request('https://test/api/workspace?company='+company))).json()})));
  const writes=await Promise.all(workspaces.map(({company,data,revision})=>workspace.PUT(new Request('https://test/api/workspace',{method:'PUT',body:JSON.stringify({company,revision,data:{...data,name:'Independent '+company,importTemplates:[{id:'layout-'+company,company,name:'Custom layout',signature:'[\"FACTORY\",\"BUYER\"]',mapping:{sheet:'Orders',header:4,dataStart:8,fields:{factoryPo:1,onPo:2},sizes:[]},created:'2026-10-07'}]},action:'Independent edit'})}))));
  assert.ok(writes.every(r=>r.status===200));
  for(const company of ['WSV','CTC']){const stored=await (await workspace.GET(new Request('https://test/api/workspace?company='+company))).json();assert.equal(stored.data.importTemplates.length,1);assert.equal(stored.data.importTemplates[0].company,company);assert.equal(stored.data.importTemplates[0].id,'layout-'+company);}
  console.log('PASS import layouts persist through workspace save/reload separately for WSV and CTC');
  globalThis.__user={role:'user',email:'viewer@example.test'};
  const before=sql.prepare('SELECT company,revision FROM workspaces ORDER BY company').all();
  const reads=await Promise.all(Array.from({length:30},(_,i)=>workspace.GET(new Request('https://test/api/workspace?company='+(i%2?'WSV':'CTC')))));
  assert.ok(reads.every(r=>r.status===200));assert.deepEqual(sql.prepare('SELECT company,revision FROM workspaces ORDER BY company').all(),before);
  assert.equal((await workspace.PUT(new Request('https://test/api/workspace',{method:'PUT',body:'{}'}))).status,403);
  globalThis.__user={role:'owner',email:'owner@example.test'};
 });
 await check('large audit >2 MB: full detail in R2, compact D1 summary, full content retained',async()=>{
  const r=sql.prepare("SELECT revision FROM workspaces WHERE company='WSV'").get().revision;
  const detail={changes:[{path:'information / Large image.title',before:'old',after:'資料🙂'.repeat(250000)}]};
  await storage.put('WSV/workspace/large-audit',JSON.stringify(makeWorkspace('WSV')));
  assert.equal(await commitWorkspace(database,'WSV',r,'WSV/workspace/large-audit','admin','Large audit test',detail),true);
  const row=sql.prepare('SELECT detail FROM audit ORDER BY id DESC LIMIT 1').get();const stored=JSON.parse(row.detail);
  assert.ok(stored.storageKey.startsWith('WSV/audit/'));assert.ok(Buffer.byteLength(row.detail)<2000000);
  assert.deepEqual(JSON.parse(await (await storage.get(stored.storageKey)).text()),detail);
  const response=await history.GET(new Request('https://test/api/history?company=WSV'));
  assert.equal(response.status,200);const rows=await response.json();assert.ok(rows[0].detail.summary.length);
  assert.equal((await createBackup()).status,200);
  const latest=JSON.parse(await (await storage.get('_owner-backups/latest.json')).text());
  const listed=latest.objects.find(o=>o.key===stored.storageKey);assert.ok(listed);
  const zip=unzipSync(new Uint8Array(await (await backup.GET(new Request('https://test/api/backup?id='+latest.id))).arrayBuffer()));
  assert.deepEqual(JSON.parse(strFromU8(zip[listed.archivePath])),detail);
 });
 await check('uploaded file sandbox/nosniff, authorized 304 cache, unauthorized users blocked',async()=>{
  const row=sql.prepare("SELECT data FROM workspaces WHERE company='WSV'").get();const key=JSON.parse(row.data).storageKey;
  const data=JSON.parse(await (await storage.get(key)).text());data.information=[{id:'WSV/sandbox-svg',title:'Reference'}];
  await storage.put(key,JSON.stringify(data));await storage.put('WSV/sandbox-svg','<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',{httpMetadata:{contentType:'image/svg+xml'}});
  const request=new Request('https://test/api/files?id=WSV%2Fsandbox-svg');const response=await fileRoute.GET(request);
  assert.equal(response.status,200);assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.ok(response.headers.get('content-security-policy').includes('sandbox'));
  const cached=await fileRoute.GET(new Request(request.url,{headers:{'If-None-Match':response.headers.get('etag')}}));assert.equal(cached.status,304);
  globalThis.__user=null;assert.equal((await fileRoute.GET(request)).status,403);globalThis.__user={role:'owner',email:'owner@example.test'};
 });

 await check('30 concurrent images share one workspace read; visibility updates and revoked identities still take effect',async()=>{
  const data=makeWorkspace('WSV'),key='WSV/workspace/file-cache-a',id='WSV/cache-test';
  data.months[0].show=true;data.months[0].versions=[{id:'version',fileId:id}];await storage.put(key,JSON.stringify(data));await storage.put(id,new Uint8Array([1,2,3]),{httpMetadata:{contentType:'image/png'}});
  sql.prepare("UPDATE workspaces SET data=?,revision=77 WHERE company='WSV'").run(JSON.stringify({storageKey:key}));
  const get=storage.get;let reads=0;storage.get=async function(k){if(k===key)reads++;return get.call(this,k)};
  globalThis.__user={role:'user',email:'viewer@test'};
  try{const responses=await Promise.all(Array.from({length:30},()=>fileRoute.GET(new Request('https://test/api/files?id='+encodeURIComponent(id)))));assert.ok(responses.every(r=>r.status===200));assert.equal(reads,1);
   data.months[0].show=false;const next='WSV/workspace/file-cache-b';await storage.put(next,JSON.stringify(data));sql.prepare("UPDATE workspaces SET data=?,revision=78 WHERE company='WSV'").run(JSON.stringify({storageKey:next}));
   assert.equal((await fileRoute.GET(new Request('https://test/api/files?id='+encodeURIComponent(id)))).status,403);
   globalThis.__user=null;assert.equal((await fileRoute.GET(new Request('https://test/api/files?id='+encodeURIComponent(id)))).status,403);
  }finally{storage.get=get;globalThis.__user={role:'owner',email:'owner@example.test'};}
 });
 await check('source kit contains complete code, templates and ChatGPT handoff without database/upload reads',async()=>{
  const previousDb=globalThis.__db,list=storage.list;globalThis.__db=null;storage.list=()=>{throw Error('Source kit must not enumerate uploaded data')};
  try{const response=await sourceBackup.POST();assert.equal(response.status,200,await response.clone().text());const result=await response.json();assert.equal(result.backup.kind,'source');
   const downloaded=await sourceBackup.GET(new Request('https://test/api/backup/source?id='+result.backup.id));assert.equal(downloaded.status,200);const bytes=new Uint8Array(await downloaded.arrayBuffer()),release=JSON.parse(await fs.readFile('lib/backup-source.json','utf8'));assert.equal(createHash('sha256').update(bytes).digest('hex'),release.sha256);const code=unzipSync(bytes);
   for(const name of ['app/portal.tsx','lib/excel.ts','lib/production-export.ts','lib/order-import.ts','public/templates/purchase.xlsx','pnpm-lock.yaml','WEBSITE_HANDOFF.md','RESTORE_CONFIG.md','drizzle/0000_silky_goblin_queen.sql'])assert.ok(code[name],name);
   assert.ok(!code['database.json']);assert.ok(!Object.keys(code).some(k=>k.startsWith('objects/')||k.startsWith('workspaces/')||k.startsWith('.env')));
   const status=await (await sourceBackup.GET(new Request('https://test/api/backup/source'))).json();assert.equal(status.backup.stale,false);
  }finally{globalThis.__db=previousDb;storage.list=list;}
 });
 await check('source kit remains owner-only',async()=>{for(const user of [null,{role:'user'},{role:'admin'}]){globalThis.__user=user;assert.equal((await sourceBackup.POST()).status,403);assert.equal((await sourceBackup.GET(new Request('https://test/api/backup/source'))).status,403);}globalThis.__user={role:'owner',email:'owner@example.test'};});
 await check('stalled startup reads fail within their deadline; successful/rejected reads remain intact',async()=>{
  const {readStage}=await loaded('read-stage');assert.equal(await readStage('test success',async()=>42,100),42);
  await assert.rejects(()=>readStage('test stalled bucket',()=>new Promise(()=>{}),5),/timed out.*test stalled bucket/);
  await assert.rejects(()=>readStage('test missing file',async()=>{throw Error('File missing')},100),/File missing/);
 });
 await check('snapshot timeout cancels the old body, retries a fresh read of the same revision, and never retries malformed data',async()=>{
  const {workspaceData}=await loaded('workspace-store'),{readStage}=await loaded('read-stage');const get=storage.get;let calls=0,canceled=0;const keys=[];
  const record={data:JSON.stringify({storageKey:'WSV/workspace/retry-test'})};
  const shortRead=(name,fn)=>readStage(name,fn,15);
  try{
   storage.get=async key=>{keys.push(key);calls++;return {size:12,body:calls===1?new ReadableStream({cancel(){canceled++;}}):new Blob([JSON.stringify({value:'latest'})]).stream()};};
   assert.deepEqual(await workspaceData(record,shortRead),{value:'latest'});assert.equal(calls,2);assert.equal(canceled,1);assert.deepEqual(keys,['WSV/workspace/retry-test','WSV/workspace/retry-test']);
   calls=0;storage.get=async()=>{calls++;return {body:new ReadableStream({cancel(){canceled++;}})};};await assert.rejects(()=>workspaceData(record,shortRead),/timed out/);assert.equal(calls,2);
   calls=0;storage.get=async()=>{calls++;return {body:new Blob(['invalid JSON']).stream()};};await assert.rejects(()=>workspaceData(record,shortRead),SyntaxError);assert.equal(calls,1);
   calls=0;assert.deepEqual(await workspaceData({data:'{"inline":true}'},shortRead),{inline:true});assert.equal(calls,0);
  }finally{storage.get=get;}
 });
 await check('stalled snapshot recovers exact current data through complete verified ranges',async()=>{
  const {workspaceData}=await loaded('workspace-store'),{readStage}=await loaded('read-stage');const get=storage.get;const input={text:'á'.repeat(600000),value:'current'},bytes=new TextEncoder().encode(JSON.stringify(input));let full=0,ranges=0;const record={data:JSON.stringify({storageKey:'WSV/workspace/current'})};
  try{storage.get=async(key,options)=>{assert.equal(key,'WSV/workspace/current');if(!options){full++;return {size:bytes.length,body:new ReadableStream({cancel(){}})};}ranges++;const {offset,length}=options.range;return {arrayBuffer:async()=>bytes.slice(offset,offset+length).buffer};};const actual=await workspaceData(record,(name,fn)=>readStage(name,fn,50));assert.deepEqual(actual,input);assert.equal(full,2);assert.equal(ranges,2);
   storage.get=async(key,options)=>options?{arrayBuffer:async()=>new Uint8Array(0).buffer}:{size:bytes.length,body:new ReadableStream({cancel(){}})};await assert.rejects(()=>workspaceData(record,(name,fn)=>readStage(name,fn,50)),/incomplete/);
  }finally{storage.get=get;}
 });
 await check('workspace storage failures return an error without resetting saved data',async()=>{
  const get=storage.get;const before=sql.prepare('SELECT * FROM workspaces ORDER BY company').all();storage.get=async()=>{throw Error('File storage temporarily unavailable')};
  try{const r=await workspace.GET(new Request('https://test/api/workspace?company=WSV'));assert.equal(r.status,400);assert.match((await r.json()).error,/temporarily unavailable/);assert.deepEqual(sql.prepare('SELECT * FROM workspaces ORDER BY company').all(),before);}finally{storage.get=get;}
 });
 await check('narrow visibility saves preserve all data, return a tiny acknowledgement, and reject stale/admin-invalid writes',async()=>{
  const state=await (await workspace.GET(new Request('https://test/api/workspace?company=WSV'))).json(),month=state.data.months[0];
  const payload={company:'WSV',revision:state.revision,monthId:month.id,operation:'visibility',show:!month.show};
  const patch=body=>workspace.PATCH(new Request('https://test/api/workspace',{method:'PATCH',body:JSON.stringify(body)}));
  for(const user of [null,{role:'user'}]){globalThis.__user=user;assert.equal((await patch(payload)).status,403);}globalThis.__user={role:'owner',email:'owner@example.test'};
  assert.equal((await patch({...payload,show:'Hide'})).status,400);
  const response=await patch(payload);assert.equal(response.status,200,await response.clone().text());assert.ok((await response.clone().text()).length<100);const result=await response.json();assert.equal(result.revision,state.revision+1);
  const stored=await (await workspace.GET(new Request('https://test/api/workspace?company=WSV'))).json();const expected=structuredClone(state.data);expected.months[0].show=payload.show;assert.deepEqual(stored.data,expected);
  assert.equal((await patch(payload)).status,409);
  globalThis.__user={role:'user',email:'viewer@test'};const visible=await (await workspace.GET(new Request('https://test/api/workspace?company=WSV'))).json();assert.equal(visible.data.months.some(m=>m.id===month.id),payload.show);globalThis.__user={role:'owner',email:'owner@example.test'};
 });
 await check('narrow import preserves snapshots and other months, validates quantities, saves original reference and rejects conflicts',async()=>{
  const state=await (await workspace.GET(new Request('https://test/api/workspace?company=WSV'))).json(),month=state.data.months[0],profile=(month.profiles||state.data.profiles).find(p=>p.id===(month.profileId||(month.profiles||state.data.profiles)[0].id));
  const order={id:'WSV99990001',factoryPo:'WSV99990001',onPo:'PO380000001',sku:'3UG10016459',country:'BELGIUM',mos:'Ocean',profile:profile.id,sizes:structuredClone(profile.sizes),qty:profile.sizes.map((_,i)=>i===0?7:0),total:7};
  const original='WSV/import-speed-test';await storage.put(original,'original Excel bytes');const payload={company:'WSV',revision:state.revision,monthId:month.id,operation:'import',file:{id:original,name:'orders.xlsx'},orders:[order]};
  const patch=body=>workspace.PATCH(new Request('https://test/api/workspace',{method:'PATCH',body:JSON.stringify(body)}));
  assert.equal((await patch({...payload,orders:[{...order,total:8}]})).status,400);assert.equal((await patch({...payload,orders:[order,order]})).status,400);assert.equal((await patch({...payload,file:{id:'CTC/not-allowed',name:'wrong.xlsx'}})).status,400);
  const response=await patch(payload);assert.equal(response.status,200,await response.clone().text());const result=await response.json();assert.equal(result.data,undefined);assert.equal(result.orders.length,1);assert.equal(result.importRecord.fileId,original);
  const stored=await (await workspace.GET(new Request('https://test/api/workspace?company=WSV'))).json();const updated=stored.data.months.find(m=>m.id===month.id);assert.deepEqual(stored.data.items,state.data.items);assert.deepEqual(stored.data.months.filter(m=>m.id!==month.id),state.data.months.filter(m=>m.id!==month.id));assert.deepEqual(updated.versions,month.versions);assert.deepEqual(updated.latest,month.latest);assert.equal(updated.orders[0].total,7);assert.equal(updated.imports.length,(month.imports||[]).length+1);assert.deepEqual(updated.imports.at(-1).orders,updated.orders);assert.equal((await patch(payload)).status,409);
 });
 await check('basis-only save preserves all other data in WSV and CTC, rejects invalid/stale/user writes and returns a compact acknowledgement',async()=>{
  const patch=body=>workspace.PATCH(new Request('https://test/api/workspace',{method:'PATCH',body:JSON.stringify(body)}));
  for(const company of ['WSV','CTC']){
   globalThis.__user={role:'owner',email:'owner@example.test'};
   const before=await (await workspace.GET(new Request('https://test/api/workspace?company='+company))).json(),item=before.data.items[0];
   const payload={company,revision:before.revision,operation:'quantity-basis',changes:[{id:item.id,quantityBasis:'carton'}]};
   for(const user of [null,{role:'user'}]){globalThis.__user=user;assert.equal((await patch(payload)).status,403);}globalThis.__user={role:'owner',email:'owner@example.test'};
   for(const changes of [[],[{id:item.id,quantityBasis:'invalid'}],[...payload.changes,...payload.changes],[{id:'missing-id',quantityBasis:'pair'}]])assert.equal((await patch({...payload,changes})).status,400);
   const response=await patch(payload);assert.equal(response.status,200,await response.clone().text());assert.ok((await response.clone().text()).length<300);const saved=await response.json();assert.equal(saved.data,undefined);assert.equal(saved.revision,before.revision+1);
   const after=await (await workspace.GET(new Request('https://test/api/workspace?company='+company))).json(),expected=structuredClone(before.data);expected.items[0].quantityBasis='carton';assert.deepEqual(after.data,expected);
   assert.equal((await patch(payload)).status,409);
   const noop=await (await patch({...payload,revision:saved.revision})).json();assert.equal(noop.revision,saved.revision);
   const audit=sql.prepare("SELECT detail FROM audit WHERE company=? AND action='Updated material calculation basis' ORDER BY id DESC LIMIT 1").get(company);assert.equal(JSON.parse(audit.detail).changes[0].after,'carton');
   const reverted=await patch({...payload,revision:saved.revision,changes:[{id:item.id,quantityBasis:'pair'}]});assert.equal(reverted.status,200);
  }
 });
 await check('image notes persist and sync Standard in WSV/CTC without changing published files',async()=>{
  globalThis.__user={role:'owner',email:'owner@example.test'};
  for(const company of ['WSV','CTC']){
   const before=await (await workspace.GET(new Request('https://test/api/workspace?company='+company))).json();const data=structuredClone(before.data),item=data.items.find(m=>m.destination==='STANDARD'),version=item.versions[0];
   item.imageNote='Common placement for every image';
   const image={id:company+'/note-test-image',name:'note.png',months:[data.months[0].id],conditions:[],note:'Dán giày phải\nAbove logo'};version.images=[image];
   const put=(data,revision)=>workspace.PUT(new Request('https://test/api/workspace',{method:'PUT',body:JSON.stringify({company,data,revision,action:'Image note updated'})}));
   const response=await put(data,before.revision);assert.equal(response.status,200,await response.clone().text());const saved=await response.json();assert.deepEqual(saved.data.months,before.data.months);assert.equal(saved.data.items.find(m=>m.id===item.id).imageNote,item.imageNote);
   const linked=saved.data.items.filter(m=>m.destination!=='STANDARD').flatMap(m=>m.versions).filter(v=>v.item_code===version.item_code);assert.ok(linked.length);for(const v of linked)assert.equal(v.images[0].note,image.note);
   for(const invalidNote of [123,'x'.repeat(2001)]){const invalid=structuredClone(saved.data);invalid.items.find(m=>m.id===item.id).imageNote=invalidNote;assert.equal((await put(invalid,saved.revision)).status,400);}
   for(const note of [123,'x'.repeat(2001)]){const invalid=structuredClone(saved.data);invalid.items.find(m=>m.id===item.id).versions[0].images[0].note=note;assert.equal((await put(invalid,saved.revision)).status,400);}
   const cleared=structuredClone(saved.data);cleared.items.find(m=>m.id===item.id).versions[0].images[0].note='';const result=await put(cleared,saved.revision);assert.equal(result.status,200);assert.equal((await result.json()).data.items.find(m=>m.id===item.id).versions[0].images[0].note,'');
  }
 });
 await check('WSV/CTC writes, Standard code/image updates and overlapping revision numbers cannot cross workspace boundaries',async()=>{
  globalThis.__user={role:'owner',email:'owner@example.test'};
  for(const company of ['WSV','CTC']){
   const other=company==='WSV'?'CTC':'WSV';const before=await (await workspace.GET(new Request('https://test/api/workspace?company='+company))).json();const untouched=sql.prepare('SELECT * FROM workspaces WHERE company=?').get(other);const audits=sql.prepare('SELECT count(*) AS n FROM audit WHERE company=?').get(other).n;
   assert.equal(before.data.workspaceCompany,company);
   const put=data=>workspace.PUT(new Request('https://test/api/workspace',{method:'PUT',body:JSON.stringify({company,data,revision:before.revision,action:'Isolation check'})}));
   const wrong=structuredClone(before.data);wrong.workspaceCompany=other;assert.equal((await put(wrong)).status,400);
   const foreign=structuredClone(before.data);foreign.items[0].versions[0].images=[{id:other+'/foreign.png',months:[]}];assert.equal((await put(foreign)).status,400);
   const nested=structuredClone(before.data);nested.months[0].imports=[{fileId:other+'/source.xlsx',orders:[]}];assert.equal((await put(nested)).status,400);
   const changed=structuredClone(before.data),standard=changed.items.find(m=>m.destination==='STANDARD'&&m.item_code&&m.versions.length===1);assert.ok(standard);
   standard.item_code+='-ISOLATION';standard.versions[0].item_code=standard.item_code;standard.versions[0].images=[{id:company+'/isolated.png',months:[changed.months[0].id],conditions:[]}];
   changed.name='Custom display name';const saved=await put(changed);assert.equal(saved.status,200,await saved.clone().text());const result=await saved.json();assert.equal(result.data.workspaceCompany,company);assert.equal(result.data.items.find(m=>m.id===standard.id).item_code,standard.item_code);
   assert.deepEqual(sql.prepare('SELECT * FROM workspaces WHERE company=?').get(other),untouched);assert.equal(sql.prepare('SELECT count(*) AS n FROM audit WHERE company=?').get(other).n,audits);
  }
 });
 await check('PO month notices are scoped, admin-only, audited, and leave PO snapshots intact',async()=>{
  globalThis.__user={role:'owner',email:'owner@example.test'};
  for(const company of ['WSV','CTC']){
   const other=company==='WSV'?'CTC':'WSV',before=await (await workspace.GET(new Request('https://test/api/workspace?company='+company))).json();
   const month=before.data.months.find(m=>m.orders?.length&&!m.controlCleared);assert.ok(month);const po=month.orders[0],otherBefore=sql.prepare('SELECT * FROM workspaces WHERE company=?').get(other);
   const payload={company,revision:before.revision,operation:'po-month-notices',changes:[{sourceMonthId:month.id,poId:po.id,newMonth:'Mid February 2027'}]};
   const patch=input=>workspace.PATCH(new Request('https://test/api/workspace',{method:'PATCH',body:JSON.stringify(input)}));
   globalThis.__user={role:'user',email:'user@test'};assert.equal((await patch(payload)).status,403);globalThis.__user={role:'owner',email:'owner@example.test'};
   const response=await patch(payload);assert.equal(response.status,200,await response.clone().text());const saved=await response.json();assert.equal(saved.notes[0].newMonth,'Mid February 2027');
   const after=await (await workspace.GET(new Request('https://test/api/workspace?company='+company))).json();assert.deepEqual(after.data.months,before.data.months);assert.deepEqual(after.data.items,before.data.items);assert.deepEqual(sql.prepare('SELECT * FROM workspaces WHERE company=?').get(other),otherBefore);assert.equal((await patch(payload)).status,409);
   const invalid=await patch({...payload,revision:saved.revision,changes:[{sourceMonthId:month.id,poId:'missing',newMonth:'X'}]});assert.equal(invalid.status,400);
   const hidden=await patch({company,revision:saved.revision,operation:'visibility',monthId:month.id,show:false});assert.equal(hidden.status,200);const hiddenRevision=(await hidden.json()).revision;globalThis.__user={role:'user',email:'user@test'};const user=await (await workspace.GET(new Request('https://test/api/workspace?company='+company))).json();assert.equal(user.data.poMonthNotices.length,0);globalThis.__user={role:'owner',email:'owner@example.test'};
   const visible=await patch({company,revision:hiddenRevision,operation:'visibility',monthId:month.id,show:true});assert.equal(visible.status,200);const visibleRevision=(await visible.json()).revision;
   const cleared=await patch({...payload,revision:visibleRevision,changes:[{sourceMonthId:month.id,poId:po.id,newMonth:''}]});assert.equal(cleared.status,200);assert.equal((await cleared.json()).notes.length,0);
  }
 });
 console.log(`${count} server/backup integration checks passed`);
}finally{sql.close();await fs.rm(dir,{recursive:true,force:true})}
