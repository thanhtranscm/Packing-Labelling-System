import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
export const db=()=>{const d=(env as any).DB;if(!d)throw Error('Database unavailable');return d;};
export const bucket=()=>{const b=(env as any).BUCKET;if(!b)throw Error('File storage unavailable');return b;};
export async function identity(){const u=await getChatGPTUser();if(!u)throw Error('Sign in required');const email=u.email.toLowerCase(); const owner=['thanh15062003t2@gmail.com','thanhtranscm@gmail.com'].includes(email);const r:any=await db().prepare('SELECT * FROM users WHERE email = ?').bind(email).first();if(!owner&&(!r||!r.active))throw Error('Access denied. Ask your administrator to add your email.');return {...u,role:owner?'owner':r.role,displayName:r?.name||u.displayName};}
export function fail(e:any){const message=e.message||String(e);return Response.json({error:message},{status:/denied|required/.test(message)?403:400});}
