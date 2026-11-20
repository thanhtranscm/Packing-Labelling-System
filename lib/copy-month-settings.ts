import {activeProfile,prepareMonthSettings} from './size-settings';

// Copy only settings and the active size table. Keep the target's profile identity
// so its pending orders remain tied to their existing month and table.
export function copyMonthSettings(source:any,target:any,workspace:any){
 if(!source||!target||source.id===target.id)throw Error('Select a different source month.');
 const sourceProfile=activeProfile(source,workspace);
 const targetProfiles=structuredClone(target.profiles||workspace.profiles||[]);
 const targetId=target.profileId||targetProfiles[0]?.id;
 const index=targetProfiles.findIndex((p:any)=>p.id===targetId);
 if(index<0)throw Error('Target month has no saved size table.');
 targetProfiles[index]={...targetProfiles[index],sizes:structuredClone(sourceProfile.sizes)};
 const candidate={...target,settings:structuredClone(source.settings),profiles:targetProfiles,profileId:targetId};
 const validated=prepareMonthSettings(candidate,workspace);
 return {settings:validated.settings,profiles:targetProfiles,profileId:targetId};
}
