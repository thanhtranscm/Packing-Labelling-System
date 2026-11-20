export function zoomLayout(natural:{w:number,h:number},box:{w:number,h:number},zoom:number){
 const fit=natural.w?Math.min(box.w/natural.w,box.h/natural.h):1;
 const w=natural.w?natural.w*fit*zoom:box.w,h=natural.h?natural.h*fit*zoom:box.h;
 const stageW=Math.max(box.w,w),stageH=Math.max(box.h,h);
 return {fit,w,h,stageW,stageH,left:(stageW-w)/2,top:(stageH-h)/2};
}
export function anchoredZoomScroll(before:ReturnType<typeof zoomLayout>,after:ReturnType<typeof zoomLayout>,scroll:{x:number,y:number},anchor:{x:number,y:number}){
 return {x:Math.max(0,after.left+(scroll.x+anchor.x-before.left)/Math.max(1,before.w)*after.w-anchor.x),y:Math.max(0,after.top+(scroll.y+anchor.y-before.top)/Math.max(1,before.h)*after.h-anchor.y)};
}
