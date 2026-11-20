// Reconcile the main displayed code with the user's October 5 workbook.
// Existing month coverage, images and generated snapshots remain authoritative.
export function reconcileMaster(data:any,company:string){
  if(company!=='WSV'||data.masterReference==='2026-10-05')return false;
  const korea=data.items.find((m:any)=>m.destination==='KOREA'&&m.list_no===5);
  const current=korea?.versions.find((v:any)=>v.item_code.trim()==='FKK-03');
  if(korea?.item_code.trim()==='FKK-02'&&current){
    korea.item_code=current.item_code;korea.description=current.description;korea.displayVersion=current.id;
  }
  data.masterReference='2026-10-05';return true;
}
