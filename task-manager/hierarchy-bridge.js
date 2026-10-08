let bridgeState=null;
let layoutHubId='h-gc';
let draggedTaskId='';
const bq=(s,r=document)=>r.querySelector(s);
const bqa=(s,r=document)=>[...r.querySelectorAll(s)];
const besc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

async function bridgeApi(action,payload={}){
  const opts=action?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...payload})}:{cache:'no-store'};
  const r=await fetch('/api/state',opts);
  if(!r.ok)throw new Error(await r.text());
  const out=await r.json();bridgeState=out.state||out;return out;
}
async function loadBridgeState(){
  try{await bridgeApi();ensureNativeProjectTriggers();installLayoutEditor();}
  catch(error){console.error('Hierarchy bridge failed',error);}
}
function hubs(){return bridgeState?.hubs||[];}
function allProjects(){return bridgeState?.projects||[];}
function allTasks(){return bridgeState?.tasks||[];}
function activeProjects(){return allProjects().filter(p=>!p.archived);}
function hub(id){return hubs().find(h=>h.id===id);}
function project(id){return allProjects().find(p=>p.id===id);}
function task(id){return allTasks().find(t=>t.id===id);}
function projectsForHub(hubId){return activeProjects().filter(p=>p.hubId===hubId).sort((a,b)=>(a.priority||50)-(b.priority||50));}
function tasksForHub(hubId){
  const projectIds=new Set(allProjects().filter(p=>p.hubId===hubId).map(p=>p.id));
  const h=hub(hubId);
  return allTasks().filter(t=>projectIds.has(t.projectId)||(h&&String(t.area||'').toLowerCase().includes(String(h.title||'').toLowerCase())));
}
function microtasksFor(parentId){return allTasks().filter(t=>t.parentTaskId===parentId);}
function majorTasksForProject(projectId){return allTasks().filter(t=>t.projectId===projectId&&!t.parentTaskId).sort((a,b)=>(a.flowOrder??999)-(b.flowOrder??999)||String(a.title).localeCompare(String(b.title)));}
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

function installLayoutStyles(){
  if(bq('#taskLayoutStyles'))return;
  const style=document.createElement('style');style.id='taskLayoutStyles';style.textContent=`
    .layout-launch{margin-right:8px}.layout-dialog .dialog-card{width:min(1500px,97vw);height:min(900px,92vh);max-height:92vh;display:flex;flex-direction:column;overflow:hidden}.layout-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:12px}.layout-head h2{margin:3px 0 4px;font-size:24px}.layout-head p{margin:0;color:#7690a4;font-size:11px}.layout-head-actions{display:flex;gap:8px;align-items:center}.layout-head select{min-width:210px}.layout-help{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px;color:#70879a;font-size:10px}.layout-help span{padding:5px 8px;border:1px solid rgba(255,255,255,.07);border-radius:999px;background:rgba(255,255,255,.02)}.layout-board{display:flex;gap:12px;overflow:auto;padding:4px 2px 16px;flex:1;align-items:flex-start}.layout-column{width:300px;min-width:300px;border:1px solid rgba(255,255,255,.08);background:#0b141b;border-radius:14px;overflow:hidden;box-shadow:inset 3px 0 0 var(--section-color)}.layout-column.unsorted{box-shadow:inset 3px 0 0 #718294}.layout-column-head{padding:12px 13px 10px;border-bottom:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.018)}.layout-column-head .kicker{font-size:8px;letter-spacing:.12em;color:var(--section-color);text-transform:uppercase}.layout-column-head h3{font-size:14px;margin:3px 0 2px}.layout-column-head small{color:#657d90;font-size:9px}.layout-dropzone{min-height:120px;padding:9px;display:flex;flex-direction:column;gap:8px}.layout-dropzone.drag-over{background:rgba(103,216,255,.055);outline:1px dashed rgba(103,216,255,.35);outline-offset:-4px}.layout-task{border:1px solid rgba(255,255,255,.08);background:#101c25;border-radius:10px;padding:9px;cursor:grab;user-select:none}.layout-task:active{cursor:grabbing}.layout-task.dragging{opacity:.35}.layout-task.done{opacity:.54}.layout-task-top{display:flex;gap:8px;align-items:flex-start}.layout-grip{color:#526a7d;font-size:14px;line-height:1}.layout-task-copy{min-width:0;flex:1}.layout-task-copy strong{display:block;font-size:11px;line-height:1.28}.layout-task-copy small{display:block;color:#688095;font-size:8px;margin-top:4px}.layout-task-badges{display:flex;gap:4px;flex-wrap:wrap;margin-top:7px}.layout-task-badges span{font-size:8px;padding:2px 5px;border:1px solid rgba(255,255,255,.07);border-radius:999px;color:#70899d}.layout-micro-zone{margin-top:8px;border:1px dashed rgba(255,255,255,.09);border-radius:8px;padding:6px;min-height:27px;color:#536a7c;font-size:8px}.layout-micro-zone.drag-over{border-color:#67d8ff;color:#9ae8ff;background:rgba(103,216,255,.06)}.layout-micro{display:flex;gap:6px;align-items:center;padding:5px 6px;margin-top:4px;border-radius:6px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.05);cursor:grab;color:#91a5b4;font-size:9px}.layout-micro.done{text-decoration:line-through;opacity:.58}.layout-empty{padding:16px 8px;color:#526b7e;font-size:10px;text-align:center}.layout-saving{position:absolute;right:18px;bottom:14px;padding:6px 9px;border-radius:999px;background:#101e27;border:1px solid rgba(255,255,255,.08);font-size:9px;color:#8aa2b4;opacity:0;transition:opacity .2s}.layout-saving.show{opacity:1}.layout-column-new{width:220px;min-width:220px;border:1px dashed rgba(255,255,255,.1);border-radius:14px;min-height:150px;background:transparent;color:#6e8495;cursor:pointer}.layout-column-new:hover{color:#a7bdca;border-color:rgba(103,216,255,.3);background:rgba(103,216,255,.025)}
  `;document.head.appendChild(style);
}
function installLayoutEditor(){
  installLayoutStyles();
  const quick=bq('#quickAddBtn');
  if(quick&&!bq('#layoutTasksBtn')){
    const btn=document.createElement('button');btn.type='button';btn.id='layoutTasksBtn';btn.className='btn secondary layout-launch';btn.textContent='↔ Layout tasks';btn.onclick=()=>openLayoutEditor('h-gc');quick.insertAdjacentElement('beforebegin',btn);
  }
  if(!bq('#taskLayoutDialog')){
    const dialog=document.createElement('dialog');dialog.id='taskLayoutDialog';dialog.className='dialog wide layout-dialog';dialog.innerHTML=`<div class="dialog-card"><button type="button" class="close" data-layout-close>×</button><div id="taskLayoutBody"></div><div id="layoutSaving" class="layout-saving">Saving…</div></div>`;document.body.appendChild(dialog);bq('[data-layout-close]',dialog).onclick=()=>dialog.close();
  }
}
async function openLayoutEditor(hubId='h-gc'){
  try{await bridgeApi();layoutHubId=hub(hubId)?hubId:(hubs()[0]?.id||'');installLayoutEditor();renderLayoutEditor();bq('#taskLayoutDialog')?.showModal();}
  catch(error){console.error(error);alert('Could not open the layout editor.');}
}
function renderLayoutEditor(){
  const body=bq('#taskLayoutBody');if(!body||!bridgeState)return;
  const h=hub(layoutHubId);const ps=projectsForHub(layoutHubId);const projectIds=new Set(ps.map(p=>p.id));
  const linked=tasksForHub(layoutHubId);
  const unsorted=linked.filter(t=>!projectIds.has(t.projectId)&&!t.parentTaskId);
  body.innerHTML=`<div class="layout-head"><div><div class="eyebrow">EDIT VIEW</div><h2>${besc(h?.title||'Tasks')} task layout</h2><p>Grab any task and place it in the project where it belongs. Drop a task inside another task to turn it into a microtask.</p></div><div class="layout-head-actions"><select id="layoutHubSelect">${hubs().filter(x=>!x.archived).sort((a,b)=>(a.priority||50)-(b.priority||50)).map(x=>`<option value="${besc(x.id)}" ${x.id===layoutHubId?'selected':''}>${besc(x.title)}</option>`).join('')}</select><button type="button" class="btn secondary" id="layoutNewSection">＋ New section</button></div></div><div class="layout-help"><span>Drag to another column → move project</span><span>Drop inside a task → make microtask</span><span>Drag a microtask back to a column → promote to major task</span><span>Completed tasks stay visible but dimmed</span></div><div class="layout-board">${unsorted.length?renderLayoutColumn(null,unsorted,'Unsorted / needs a section','#718294',true):''}${ps.map(p=>renderLayoutColumn(p,majorTasksForProject(p.id),p.title,p.color||h?.color||'#67d8ff')).join('')}<button type="button" class="layout-column-new" id="layoutNewColumn">＋ Create another project section</button></div>`;
  bq('#layoutHubSelect',body).onchange=e=>{layoutHubId=e.target.value;renderLayoutEditor();};
  bq('#layoutNewSection',body).onclick=createLayoutSection;bq('#layoutNewColumn',body).onclick=createLayoutSection;
  bindLayoutDnD(body);
}
function renderLayoutColumn(p,majors,title,color,unsorted=false){
  return `<section class="layout-column ${unsorted?'unsorted':''}" style="--section-color:${besc(color)}" data-layout-project="${besc(p?.id||'')}" data-layout-unsorted="${unsorted?'1':'0'}"><div class="layout-column-head"><div class="kicker">${unsorted?'INBOX':'PROJECT'}</div><h3>${besc(title)}</h3><small>${majors.length} major task${majors.length===1?'':'s'}</small></div><div class="layout-dropzone" data-project-drop="${besc(p?.id||'')}">${majors.length?majors.map(renderLayoutTask).join(''):'<div class="layout-empty">Drop tasks here</div>'}</div></section>`;
}
function renderLayoutTask(t){
  const children=microtasksFor(t.id).sort((a,b)=>String(a.title).localeCompare(String(b.title)));
  return `<article class="layout-task ${t.status==='Done'?'done':''}" draggable="true" data-layout-task="${besc(t.id)}"><div class="layout-task-top"><span class="layout-grip">⋮⋮</span><div class="layout-task-copy"><strong>${besc(t.title)}</strong><small>${besc(t.id)} · ${besc(t.status||'Open')}</small><div class="layout-task-badges">${t.flowPhase?`<span>${besc(String(t.flowPhase).toUpperCase())}</span>`:''}${children.length?`<span>${children.length} micro</span>`:''}${t.profileIds?.length?`<span>${t.profileIds.length} people</span>`:''}</div></div></div><div class="layout-micro-zone" data-micro-drop="${besc(t.id)}">${children.length?children.map(m=>`<div class="layout-micro ${m.microDone?'done':''}" draggable="true" data-layout-task="${besc(m.id)}"><span class="layout-grip">⋮</span><span>${besc(m.title)}</span></div>`).join(''):'Drop here to make microtask'}</div></article>`;
}
function bindLayoutDnD(root){
  bqa('[draggable="true"]',root).forEach(el=>{
    el.addEventListener('dragstart',e=>{draggedTaskId=el.dataset.layoutTask;el.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',draggedTaskId);});
    el.addEventListener('dragend',()=>{el.classList.remove('dragging');draggedTaskId='';bqa('.drag-over',root).forEach(x=>x.classList.remove('drag-over'));});
  });
  bqa('[data-project-drop]',root).forEach(zone=>{
    zone.addEventListener('dragover',e=>{e.preventDefault();if(draggedTaskId)zone.classList.add('drag-over');});
    zone.addEventListener('dragleave',e=>{if(!zone.contains(e.relatedTarget))zone.classList.remove('drag-over');});
    zone.addEventListener('drop',async e=>{e.preventDefault();e.stopPropagation();zone.classList.remove('drag-over');const id=e.dataTransfer.getData('text/plain')||draggedTaskId;const projectId=zone.dataset.projectDrop;if(!id||!projectId)return;await moveTaskToProject(id,projectId);});
  });
  bqa('[data-micro-drop]',root).forEach(zone=>{
    zone.addEventListener('dragover',e=>{e.preventDefault();e.stopPropagation();if(draggedTaskId&&draggedTaskId!==zone.dataset.microDrop)zone.classList.add('drag-over');});
    zone.addEventListener('dragleave',e=>{if(!zone.contains(e.relatedTarget))zone.classList.remove('drag-over');});
    zone.addEventListener('drop',async e=>{e.preventDefault();e.stopPropagation();zone.classList.remove('drag-over');const id=e.dataTransfer.getData('text/plain')||draggedTaskId;const parentId=zone.dataset.microDrop;if(!id||!parentId||id===parentId)return;await moveTaskUnderParent(id,parentId);});
  });
}
function showLayoutSaving(text='Saving…'){
  const pill=bq('#layoutSaving');if(!pill)return;pill.textContent=text;pill.classList.add('show');clearTimeout(showLayoutSaving.timer);showLayoutSaving.timer=setTimeout(()=>pill.classList.remove('show'),1200);
}
async function moveTaskToProject(taskId,projectId){
  const t=task(taskId),p=project(projectId);if(!t||!p)return;
  showLayoutSaving('Moving task…');
  const wasMicro=Boolean(t.parentTaskId);const nextStatus=wasMicro?(t.microDone?'Done':'Open'):(t.status==='Backlog'?'Open':t.status);
  try{await bridgeApi('updateTask',{taskId,patch:{projectId,parentTaskId:null,designation:'major',microDone:false,milestoneId:null,area:p.area||t.area,status:nextStatus,flowOrder:Math.max(1,...majorTasksForProject(projectId).map(x=>Number(x.flowOrder)||0))+1}});showLayoutSaving('Saved');renderLayoutEditor();}
  catch(error){console.error(error);showLayoutSaving('Save failed');}
}
async function moveTaskUnderParent(taskId,parentId){
  const t=task(taskId),parent=task(parentId);if(!t||!parent||parent.parentTaskId)return;
  if(microtasksFor(taskId).length){alert('Move this task’s existing microtasks out first, then you can place the task under another major task.');return;}
  const p=project(parent.projectId);showLayoutSaving('Nesting task…');
  try{await bridgeApi('updateTask',{taskId,patch:{projectId:parent.projectId,parentTaskId:parent.id,designation:'micro',microDone:t.status==='Done'||Boolean(t.microDone),milestoneId:null,area:p?.area||t.area,status:'Backlog',flowOrder:999}});showLayoutSaving('Saved');renderLayoutEditor();}
  catch(error){console.error(error);showLayoutSaving('Save failed');}
}
async function createLayoutSection(){
  const h=hub(layoutHubId);const title=prompt(`New project section inside ${h?.title||'this Hub'}`);if(!title?.trim())return;
  showLayoutSaving('Creating section…');
  try{await bridgeApi('createProject',{project:{title:title.trim(),hubId:layoutHubId,area:h?.title||'General',color:h?.color||'#67d8ff',priority:projectsForHub(layoutHubId).length+1,summary:''}});showLayoutSaving('Created');ensureNativeProjectTriggers();renderLayoutEditor();}
  catch(error){console.error(error);showLayoutSaving('Create failed');}
}

window.masterTaskLayout={open:(hubId='h-gc')=>openLayoutEditor(hubId)};
window.addEventListener('DOMContentLoaded',loadBridgeState);
