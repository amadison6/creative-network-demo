let bridgeState=null;
const bq=(s,r=document)=>r.querySelector(s);
const bqa=(s,r=document)=>[...r.querySelectorAll(s)];

async function loadBridgeState(){
  try{
    const r=await fetch('/api/state',{cache:'no-store'});
    if(!r.ok)return;
    const out=await r.json(); bridgeState=out.state||out; ensureNativeProjectTriggers();
  }catch(error){console.error('Hierarchy bridge failed',error);}
}
function activeProjects(){return (bridgeState?.projects||[]).filter(p=>!p.archived);}
function ensureNativeProjectTriggers(){
  let host=bq('#hierarchyNativeProjectTriggers');
  if(!host){host=document.createElement('div');host.id='hierarchyNativeProjectTriggers';host.hidden=true;document.body.appendChild(host);}
  const sig=activeProjects().map(p=>p.id).join('|');
  if(host.dataset.sig===sig)return;
  host.dataset.sig=sig;host.replaceChildren();
  activeProjects().forEach(p=>{
    const btn=document.createElement('button');btn.type='button';btn.dataset.project=p.id;
    btn.addEventListener('click',()=>{
      bq('[data-view="projects"]')?.click();
      const card=bqa(`.project-card[data-project="${CSS.escape(p.id)}"]`).find(el=>!el.closest('#hierarchyNativeProjectTriggers'));
      card?.click();
    });
    host.appendChild(btn);
  });
}
window.addEventListener('DOMContentLoaded',loadBridgeState);
