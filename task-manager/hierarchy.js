let hierarchyState = null;

const hq = (s, r = document) => r.querySelector(s);
const hqa = (s, r = document) => [...r.querySelectorAll(s)];
const hesc = (v = '') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

async function hierarchyApi(action, payload = {}) {
  const opts = action
    ? { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({action,...payload}) }
    : { cache:'no-store' };
  const response = await fetch('/api/state', opts);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
function hubs(){ return hierarchyState?.hubs || []; }
function projects(){ return hierarchyState?.projects || []; }
function tasks(){ return hierarchyState?.tasks || []; }
function hub(id){ return hubs().find(h => h.id === id); }
function project(id){ return projects().find(p => p.id === id); }
function activeHubs(){ return hubs().filter(h => !h.archived).sort((a,b)=>(a.priority||50)-(b.priority||50)); }
function activeProjects(){ return projects().filter(p => !p.archived).sort((a,b)=>(a.priority||50)-(b.priority||50)); }
function hubProjects(hubId){ return activeProjects().filter(p => p.hubId === hubId); }
function majorTasksForProject(projectId){ return tasks().filter(t => t.projectId === projectId && !t.parentTaskId && t.status !== 'Backlog'); }
function projectProgress(projectId){
  const list = majorTasksForProject(projectId);
  if (!list.length) return 0;
  return Math.round(list.filter(t => t.status === 'Done').length / list.length * 100);
}
function hubProgress(hubId){
  const ps = hubProjects(hubId);
  if (!ps.length) return 0;
  return Math.round(ps.reduce((sum,p)=>sum+projectProgress(p.id),0)/ps.length);
}
function hubActiveCount(hubId){
  const ids = new Set(hubProjects(hubId).map(p=>p.id));
  return tasks().filter(t => ids.has(t.projectId) && !t.parentTaskId && ['Open','In Progress','Waiting'].includes(t.status)).length;
}
async function refreshHierarchy(){
  hierarchyState = await hierarchyApi();
  renderHubNav();
  renderProjectTriggers();
}

function ensureHierarchyUi(){
  const sideLabel = hq('.side-label');
  const old = hq('#sidebarProjects');
  if (sideLabel) sideLabel.textContent = 'HUBS';
  if (old) old.style.display = 'none';

  if (!hq('#hubNav') && old) {
    const host = document.createElement('div');
    host.id = 'hubNav';
    host.className = 'hub-nav';
    old.insertAdjacentElement('beforebegin', host);
  }
  if (!hq('#hierarchyProjectTriggers')) {
    const hidden = document.createElement('div');
    hidden.id = 'hierarchyProjectTriggers';
    hidden.hidden = true;
    document.body.appendChild(hidden);
  }
  if (!hq('#organizeHierarchyBtn')) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'organizeHierarchyBtn';
    btn.className = 'hub-organize-btn';
    btn.innerHTML = '<span>⌘</span><strong>Organize structure</strong>';
    hq('#hubNav')?.insertAdjacentElement('afterend', btn);
    btn.onclick = () => openOrganizer();
  }
  if (!hq('#hierarchyTopBtn')) {
    const quick = hq('#quickAddBtn');
    if (quick) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'hierarchyTopBtn';
      btn.className = 'btn secondary hierarchy-top-btn';
      btn.textContent = '▦ Organize';
      quick.insertAdjacentElement('beforebegin', btn);
      btn.onclick = () => openOrganizer();
    }
  }
  ensureHubDialog();
  ensureOrganizerDialog();
}
function renderHubNav(){
  ensureHierarchyUi();
  const host = hq('#hubNav');
  if (!host || !hierarchyState) return;
  host.innerHTML = activeHubs().map(h => `<button class="hub-nav-item" data-hub-open="${hesc(h.id)}" style="--hub-color:${hesc(h.color||'#67d8ff')}">
    <span class="hub-dot"></span><span class="hub-nav-copy"><strong>${hesc(h.title)}</strong><small>${hubProjects(h.id).length} projects · ${hubActiveCount(h.id)} active</small></span>
  </button>`).join('');
  hqa('[data-hub-open]',host).forEach(btn => btn.onclick = async () => {
    await refreshHierarchy();
    openHub(btn.dataset.hubOpen);
  });
}
function renderProjectTriggers(){
  const host = hq('#hierarchyProjectTriggers');
  if (!host || !hierarchyState) return;
  host.innerHTML = activeProjects().map(p=>`<button data-project="${hesc(p.id)}"></button>`).join('');
  hqa('[data-project]',host).forEach(btn => btn.onclick = () => openProjectInApp(btn.dataset.project));
}
function openProjectInApp(projectId){
  hq('[data-view="projects"]')?.click();
  setTimeout(() => {
    const matches = hqa(`[data-project="${CSS.escape(projectId)}"]`).filter(el => !el.closest('#hierarchyProjectTriggers') && !el.closest('#hubHierarchyDialog'));
    const target = matches.find(el=>el.classList.contains('project-card')) || matches[0];
    if (target) target.click();
  }, 40);
}

function ensureHubDialog(){
  if (hq('#hubHierarchyDialog')) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'hubHierarchyDialog';
  dialog.className = 'dialog wide hierarchy-dialog';
  dialog.innerHTML = `<div class="dialog-card hierarchy-card">
    <button type="button" class="close" data-hub-close>×</button>
    <div id="hubHierarchyBody"></div>
  </div>`;
  document.body.appendChild(dialog);
  hq('[data-hub-close]',dialog).onclick = () => dialog.close();
}
function openHub(hubId){
  const h = hub(hubId); if (!h) return;
  const dialog = hq('#hubHierarchyDialog');
  const body = hq('#hubHierarchyBody',dialog);
  const ps = hubProjects(hubId);
  body.innerHTML = `<section class="hub-hero" style="--hub-color:${hesc(h.color||'#67d8ff')}">
      <div><div class="eyebrow">HUB</div><h2>${hesc(h.title)}</h2><p>${hesc(h.summary||'')}</p></div>
      <div class="hub-hero-stats"><strong>${hubProgress(h.id)}%</strong><span>project progress</span></div>
    </section>
    <div class="hub-toolbar"><div><strong>${ps.length} projects</strong><span>Persistent hub → finite projects → major tasks → microtasks</span></div><button type="button" class="btn primary" data-new-project="${hesc(h.id)}">＋ New project</button></div>
    <div class="hub-project-grid">${ps.length ? ps.map(p=>renderHubProjectCard(p)).join('') : '<div class="empty">No projects in this hub yet.</div>'}</div>`;
  hqa('[data-open-project]',body).forEach(btn=>btn.onclick=()=>{dialog.close();openProjectInApp(btn.dataset.openProject);});
  hqa('[data-edit-project]',body).forEach(btn=>btn.onclick=()=>openOrganizer({projectId:btn.dataset.editProject}));
  hq('[data-new-project]',body)?.addEventListener('click',async()=>{
    const title = prompt(`New project inside ${h.title}`);
    if (!title?.trim()) return;
    const out = await hierarchyApi('createProject',{project:{title:title.trim(),hubId:h.id,area:h.title,color:h.color,priority:ps.length+1}});
    hierarchyState = out.state || out;
    renderHubNav(); renderProjectTriggers(); openHub(h.id);
  });
  dialog.showModal();
}
function renderHubProjectCard(p){
  const list = majorTasksForProject(p.id);
  const next = list.filter(t=>t.status!=='Done').sort((a,b)=>(a.flowOrder??999)-(b.flowOrder??999))[0];
  const progress = projectProgress(p.id);
  return `<article class="hub-project-card" style="--project-color:${hesc(p.color||hub(p.hubId)?.color||'#67d8ff')}">
    <div class="hub-project-top"><span class="project-kicker">PROJECT</span><button type="button" class="mini-edit" data-edit-project="${hesc(p.id)}">Edit / move</button></div>
    <h3>${hesc(p.title)}</h3><p>${hesc(p.summary||'')}</p>
    <div class="hub-project-progress"><span><i style="width:${progress}%"></i></span><b>${progress}%</b></div>
    <div class="hub-project-meta"><span>${list.filter(t=>t.status!=='Done').length} active major tasks</span><span>${tasks().filter(t=>t.projectId===p.id&&t.parentTaskId).length} microtasks</span></div>
    ${next?`<div class="hub-next"><small>NEXT</small><strong>${hesc(next.title)}</strong></div>`:''}
    <button type="button" class="btn secondary open-project-btn" data-open-project="${hesc(p.id)}">Open project flow →</button>
  </article>`;
}

function ensureOrganizerDialog(){
  if (hq('#hierarchyOrganizer')) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'hierarchyOrganizer';
  dialog.className = 'dialog wide hierarchy-dialog organizer-dialog';
  dialog.innerHTML = `<div class="dialog-card hierarchy-card organizer-card">
    <button type="button" class="close" data-organizer-close>×</button>
    <div class="organizer-head"><div><div class="eyebrow">STRUCTURE EDITOR</div><h2>Organize your work</h2><p>Move projects between hubs, move major tasks between projects, or promote/demote checklist items. Every save writes to the persistent Task Manager backend.</p></div></div>
    <div class="organizer-tabs"><button type="button" class="active" data-org-tab="projects">Hubs & Projects</button><button type="button" data-org-tab="tasks">Tasks & Microtasks</button></div>
    <div id="organizerBody"></div>
  </div>`;
  document.body.appendChild(dialog);
  hq('[data-organizer-close]',dialog).onclick=()=>dialog.close();
  hqa('[data-org-tab]',dialog).forEach(btn=>btn.onclick=()=>{
    hqa('[data-org-tab]',dialog).forEach(x=>x.classList.toggle('active',x===btn));
    dialog.dataset.tab=btn.dataset.orgTab;
    renderOrganizer();
  });
}
async function openOrganizer(options={}){
  await refreshHierarchy();
  const dialog=hq('#hierarchyOrganizer');
  dialog.dataset.tab=options.projectId?'projects':'projects';
  dialog.dataset.focusProject=options.projectId||'';
  hqa('[data-org-tab]',dialog).forEach(x=>x.classList.toggle('active',x.dataset.orgTab==='projects'));
  renderOrganizer();
  dialog.showModal();
  if(options.projectId) setTimeout(()=>hq(`[data-project-row="${CSS.escape(options.projectId)}"]`,dialog)?.scrollIntoView({block:'center'}),60);
}
function hubOptions(selected){ return activeHubs().map(h=>`<option value="${hesc(h.id)}" ${h.id===selected?'selected':''}>${hesc(h.title)}</option>`).join(''); }
function projectOptions(selected){ return activeProjects().map(p=>`<option value="${hesc(p.id)}" ${p.id===selected?'selected':''}>${hesc(hub(p.hubId)?.title||'Unassigned')} → ${hesc(p.title)}</option>`).join(''); }
function majorOptions(projectId, selected, excludeId){
  return tasks().filter(t=>t.projectId===projectId&&!t.parentTaskId&&t.id!==excludeId&&t.status!=='Done').map(t=>`<option value="${hesc(t.id)}" ${t.id===selected?'selected':''}>${hesc(t.title)}</option>`).join('');
}
function renderOrganizer(){
  const dialog=hq('#hierarchyOrganizer'); const body=hq('#organizerBody',dialog); if(!body)return;
  if(dialog.dataset.tab==='tasks') renderTaskOrganizer(body); else renderProjectOrganizer(body);
}
function renderProjectOrganizer(body){
  body.innerHTML = `<div class="organizer-section-head"><div><strong>Hubs</strong><span>Ongoing worlds that contain finite projects.</span></div><button type="button" class="btn secondary" id="addHubBtn">＋ Add hub</button></div>
    <div class="hub-edit-grid">${activeHubs().map(h=>`<div class="hub-edit-row" data-hub-row="${hesc(h.id)}"><span class="hub-dot" style="--hub-color:${hesc(h.color)}"></span><input data-hub-title value="${hesc(h.title)}"><input data-hub-summary value="${hesc(h.summary||'')}" placeholder="Hub description"><button type="button" class="btn secondary" data-save-hub="${hesc(h.id)}">Save</button></div>`).join('')}</div>
    <div class="organizer-section-head"><div><strong>Projects</strong><span>Move a project to a different Hub or rename it. Tasks stay attached to the project.</span></div></div>
    <div class="project-edit-list">${activeProjects().map(p=>`<div class="project-edit-row" data-project-row="${hesc(p.id)}"><div class="project-edit-name"><small>PROJECT</small><input data-project-title value="${hesc(p.title)}"></div><label>Hub<select data-project-hub>${hubOptions(p.hubId)}</select></label><label>Priority<input data-project-priority type="number" min="1" max="99" value="${Number(p.priority||50)}"></label><button type="button" class="btn secondary" data-save-project="${hesc(p.id)}">Save</button></div>`).join('')}</div>`;
  hq('#addHubBtn',body)?.addEventListener('click',async()=>{
    const title=prompt('New hub name'); if(!title?.trim())return;
    const out=await hierarchyApi('createHub',{hub:{title:title.trim(),priority:activeHubs().length+1}}); hierarchyState=out.state||out; renderOrganizer(); renderHubNav(); renderProjectTriggers();
  });
  hqa('[data-save-hub]',body).forEach(btn=>btn.onclick=async()=>{
    const row=btn.closest('[data-hub-row]'); btn.disabled=true;
    const out=await hierarchyApi('updateHub',{hubId:btn.dataset.saveHub,patch:{title:hq('[data-hub-title]',row).value,summary:hq('[data-hub-summary]',row).value}}); hierarchyState=out.state||out; btn.disabled=false; renderHubNav();
  });
  hqa('[data-save-project]',body).forEach(btn=>btn.onclick=async()=>{
    const row=btn.closest('[data-project-row]'); btn.disabled=true;
    const out=await hierarchyApi('updateProject',{projectId:btn.dataset.saveProject,patch:{title:hq('[data-project-title]',row).value,hubId:hq('[data-project-hub]',row).value,priority:Number(hq('[data-project-priority]',row).value||50),parentProjectId:null}}); hierarchyState=out.state||out; location.reload();
  });
}
function renderTaskOrganizer(body){
  const active = tasks().filter(t=>t.status!=='Done').sort((a,b)=>{
    const pa=project(a.projectId)?.title||''; const pb=project(b.projectId)?.title||''; return pa.localeCompare(pb)||((a.parentTaskId?1:0)-(b.parentTaskId?1:0))||a.title.localeCompare(b.title);
  });
  body.innerHTML=`<div class="organizer-section-head"><div><strong>Tasks & Microtasks</strong><span>Major tasks appear in project flow. Microtasks stay tucked inside a major task.</span></div><input id="orgTaskSearch" class="org-search" placeholder="Search tasks…"></div>
    <div class="task-edit-list">${active.map(t=>renderTaskEditRow(t)).join('')}</div>`;
  const filter=()=>{const q=String(hq('#orgTaskSearch',body)?.value||'').toLowerCase();hqa('[data-task-row]',body).forEach(row=>row.hidden=q&&!row.dataset.search.includes(q));};
  hq('#orgTaskSearch',body)?.addEventListener('input',filter);
  hqa('[data-task-type]',body).forEach(select=>select.onchange=()=>toggleTaskRow(select.closest('[data-task-row]')));
  hqa('[data-task-project]',body).forEach(select=>select.onchange=()=>{const row=select.closest('[data-task-row]');refreshParentOptions(row);});
  hqa('[data-save-task-structure]',body).forEach(btn=>btn.onclick=async()=>{
    const row=btn.closest('[data-task-row]'); const id=btn.dataset.saveTaskStructure; const original=tasks().find(t=>t.id===id); if(!original)return;
    const type=hq('[data-task-type]',row).value; let projectId=hq('[data-task-project]',row).value||null; let parentTaskId=null;
    if(type==='micro'){
      parentTaskId=hq('[data-task-parent]',row).value||null;
      const parent=tasks().find(t=>t.id===parentTaskId); if(!parent){alert('Choose a parent major task first.');return;} projectId=parent.projectId;
    }
    btn.disabled=true;
    const patch={projectId,parentTaskId,designation:type==='micro'?'micro':'major',milestoneId:null};
    if(type==='micro') patch.status='Backlog'; else if(original.parentTaskId && original.status==='Backlog') patch.status='Open';
    const out=await hierarchyApi('updateTask',{taskId:id,patch}); hierarchyState=out.state||out; location.reload();
  });
  hqa('[data-task-row]',body).forEach(toggleTaskRow);
}
function renderTaskEditRow(t){
  const type=t.parentTaskId?'micro':'major'; const p=project(t.projectId); const search=[t.title,p?.title,hub(p?.hubId)?.title].filter(Boolean).join(' ').toLowerCase();
  return `<div class="task-edit-row" data-task-row="${hesc(t.id)}" data-search="${hesc(search)}"><div class="task-edit-name"><small>${hesc(t.id)}</small><strong>${hesc(t.title)}</strong></div><label>Type<select data-task-type><option value="major" ${type==='major'?'selected':''}>Major task</option><option value="micro" ${type==='micro'?'selected':''}>Microtask</option></select></label><label>Project<select data-task-project><option value="">Unassigned</option>${projectOptions(t.projectId)}</select></label><label class="parent-picker">Parent major<select data-task-parent><option value="">Choose parent…</option>${majorOptions(t.projectId,t.parentTaskId,t.id)}</select></label><button type="button" class="btn secondary" data-save-task-structure="${hesc(t.id)}">Save</button></div>`;
}
function toggleTaskRow(row){
  if(!row)return; const micro=hq('[data-task-type]',row)?.value==='micro'; const parentLabel=hq('.parent-picker',row); if(parentLabel) parentLabel.hidden=!micro; if(micro) refreshParentOptions(row);
}
function refreshParentOptions(row){
  const select=hq('[data-task-parent]',row); if(!select)return; const projectId=hq('[data-task-project]',row)?.value; const taskId=row.dataset.taskRow; const current=tasks().find(t=>t.id===taskId)?.parentTaskId||''; select.innerHTML=`<option value="">Choose parent…</option>${majorOptions(projectId,current,taskId)}`;
}

window.addEventListener('DOMContentLoaded', async () => {
  try {
    ensureHierarchyUi();
    await refreshHierarchy();
  } catch (error) {
    console.error('Hierarchy layer failed to load',error);
  }
});