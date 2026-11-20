// Bound external reads so a stalled database/bucket cannot leave startup pending.
export async function readStage<T>(name:string,read:()=>Promise<T>,timeoutMs=20000):Promise<T>{
 const started=Date.now();let timer:ReturnType<typeof setTimeout>|undefined;
 console.info('Workspace read started:',name);
 try{return await Promise.race([Promise.resolve().then(read),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Workspace read timed out ('+name+'). Please retry.')),timeoutMs)})]);}
 catch(error){console.error('Workspace read failed:',name,Date.now()-started+'ms',error instanceof Error?error.message:String(error));throw error;}
 finally{if(timer)clearTimeout(timer);console.info('Workspace read finished:',name,Date.now()-started+'ms');}
}
