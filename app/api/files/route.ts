import {fileAccessIndex} from '@/lib/file-access';
import {bucket,db,identity,fail} from '@/lib/server';

export async function POST(req:Request){
 try{
  const user=await identity();
  if(user.role==='user')throw Error('Access denied');
  const f=await req.formData();
  const file=f.get('file') as File, company=f.get('company') as string;
  if(!file||!['WSV','CTC'].includes(company)||file.size>25000000)throw Error('Choose a file smaller than 25 MB');
  const id=company+'/'+crypto.randomUUID();
  await bucket().put(id,file.stream(),{
   httpMetadata:{contentType:file.type||'application/octet-stream'},
   customMetadata:{name:file.name}
  });
  return Response.json({id,name:file.name,type:file.type});
 }catch(e){return fail(e);}
}

export async function GET(req:Request){
 try{
  const user=await identity();
  const params=new URL(req.url).searchParams;
  const id=params.get('id')||'';
  if(!/^(WSV|CTC)\//.test(id))throw Error('Invalid file');
  const company=id.split('/')[0];
  const r:any=await db().prepare('SELECT data,revision FROM workspaces WHERE company = ?').bind(company).first();
  if(!r)throw Error('File unavailable');
  const access=await fileAccessIndex(r);
  if(!access.all.has(id))throw Error('File unavailable');
  if(user.role==='user'&&!access.visible.has(id))throw Error('Access denied');
  const obj=await bucket().get(id);
  if(!obj)return new Response('File unavailable',{status:404,headers:{'Cache-Control':'no-store'}});
  const etag=obj.httpEtag;
  const cacheHeaders={'Cache-Control':'private, max-age=3600',ETag:etag,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'; style-src 'unsafe-inline'"};
  if(req.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers:cacheHeaders});
  let filename=obj.customMetadata?.name;
  if(!filename){
   const restored=await bucket().get('_restored-file-metadata.json');
   if(restored)filename=JSON.parse(await restored.text())[id]?.customMetadata?.name;
  }
  return new Response(obj.body,{headers:{'Content-Type':obj.httpMetadata?.contentType||'application/octet-stream','Content-Disposition':`${params.get('download')==='1'?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(filename||'file')}`,...cacheHeaders}});
 }catch(e){return fail(e);}
}