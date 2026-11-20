// Runs independently of React so an unloaded client bundle cannot hide recovery.
// Never reload automatically or touch saved workspace data.
export const bootRecoveryScript=`(()=>{
 const state=window.__plsBoot=window.__plsBoot||{phase:'html'};
 function show(){
  const panel=document.getElementById('pls-boot-recovery');
  if(state.phase==='ready'||!document.getElementById('pls-workspace-loading')||!panel)return;
  panel.hidden=false;
  const label=document.getElementById('pls-boot-message');
  if(label)label.textContent=state.phase==='html'?'Giao diện chưa tải xong. Hãy tải lại trang. / Interface did not start. Reload the page.':'Tải dữ liệu lâu hơn dự kiến. Bạn có thể chờ hoặc tải lại trang. / Loading is taking longer than expected.';
 }
 const timer=setTimeout(show,20000);
 window.addEventListener('error',()=>{if(state.phase==='html')show();},true);
 window.addEventListener('unhandledrejection',()=>{if(state.phase==='html')show();});
 document.addEventListener('click',event=>{if(event.target instanceof Element&&event.target.closest('[data-pls-reload]'))window.location.reload();});
 window.addEventListener('pls-workspace-ready',()=>{state.phase='ready';clearTimeout(timer);const panel=document.getElementById('pls-boot-recovery');if(panel)panel.hidden=true;});
})();`;
