let hierarchyState = null;
let enhanceQueued = false;
let organizerFocusProject = '';

const hq = (s, r = document) => r.querySelector(s);
const hqa = (s, r = document) => [...r.querySelectorAll(s)];
const hesc = (v = '') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const previousFetch = window.fetch.bind(window);

function hubs(){ return hierarchyState?.hubs || []; }
function projects(){ return hierarchyState?.projects || []; }
function tasks(){ return hierarchyState?.tasks || []; }
function hub(id){ return hubs().find(h => h.id === id); }
function project(id){ return projects().find(p => p.id === id); }
function task(id){ return tasks().find(t => t.id === id); }
function activeHubs(){ return hubs().filter(h => !h.archived).sort((a,b)=>(a.priority||50)-(b.priority||50)); }
function activeProjects(){ return projects().filter(p => !p.archived).sort((a,b)=>(a.priority||50)-(b.priority||50)); }
function hubProjects(hubId){ return activeProjects().filter(p => p.hubId === hubId); }
function majorTasks(projectId){ return tasks().filter(t => t.projectId === projectId && !t.parentTaskId); }
function microtasks(parentId){ return tasks().filter(t => t.parentTaskId === parentId); }
function activeMajorTasks(projectId){ return majorTasks(projectId).filter(t => !['Done','Backlog'].includes(t.status)); }
function hubActiveCount(hubId){ return hubProjects(hubId).reduce((n,p)=>n+activeMajorTasks(p.id).length,0); }
function projectProgress(projectId){
  const list = majorTasks(projectId).filter(t => t.status !== 'Backlog');
  return list.length ? Math.round(list.filter(t => t.status === 'Done').length / list.length * 100) : 0;
}
function projectPath(projectId){
  const p = project(projectId); if(!p) return '';
  return [hub(p.hubId)?.title,p.title].filter(Boolean).join(' → ');
}
function taskPath(id){
  const t = typeof id === 'string' ? task(id) : id; if(!t) return '';
  const p = project(t.projectId);
  const parent = t.parentTaskId ? task(t.parentTaskId) : null;
  return [hub(p?.hubId)?.title,p?.title,parent?.title].filter(Boolean).join(' → ');
}

function scheduleEnhance(){
  if(enhanceQueued) return;
  enhanceQueued = true;
  requestAnimationFrame(()=>{ enhanceQueued=false; enhance(); });
}
function ingestState(data){
  const next = data?.state || data;
  if(next?.projects && next?.tasks){ hierarchyState = next; scheduleEnhance(); }
}

window.fetch = async (input, init = {}) => {
  let nextInit = init;
  try{
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = String(init.method || 'GET').toUpperCase();
    if(url.includes('/api/state') && method === 'POST' && init.body){
      const body = JSON.parse(init.body);
      if(body.action === 'updateTask' && body.taskId){
        const editor = hq('#hierarchyTaskEditor');
        const editorTaskId = editor?.dataset.taskId;
        if(editor && editorTaskId === body.taskId){
          const type = hq('#hierarchyTaskType',editor)?.value || 'major';
          const existing = task(body.taskId);
          const patch = {...(body.patch||{})};
          if(type === 'micro'){
            const parentId = hq('#hierarchyTaskParent',editor)?.value || '';
            const parent = task(parentId);
            if(parent && !parent.parentTaskId){
              patch.parentTaskId = parent.id;
              patch.projectId = parent.projectId;
              patch.area = project(parent.projectId)?.area || patch.area || existing?.area || 'Inbox';
              patch.designation = 'micro';
              patch.milestoneId = null;
              patch.status = 'Backlog';
            }
          }else{
            patch.parentTaskId = null;
            patch.designation = 'major';
            if(existing?.parentTaskId && (patch.status === 'Backlog' || !patch.status)) patch.status = 'Open';
          }
          nextInit = {...init,body:JSON.stringify({...body,patch})};
        }
      }
    }
  }catch(error){ console.warn('Hierarchy save enrichment skipped',error); }

  const response = await previousFetch(input,nextInit);
  try{
    const url = typeof input === 'string' ? input : input?.url || '';
    if(url.includes('/api/state') && response.ok){
      response.clone().json().then(ingestState).catch(()=>{});
    }
  }catch{}
  return response;
};

async function hierarchyApi(action,payload={}){
  const opts = action ? {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...payload})} : {cache:'no-store'};
  const r = await previousFetch('/api/state',opts);
  if(!r.ok) throw new Error(await r.text());
  const out = await r.json(); ingestState(out); return out;
}

function installStyles(){
  if(hq('#hierarchyV2Styles')) return;
  const style=document.createElement('style'); style.id='hierarchyV2Styles'; style.textContent=`
    #sidebarProjects.hub-sidebar{display:flex!important;flex-direction:column;gap:5px}.hub-side-item{width:100%;display:grid;grid-template-columns:8px 1fr auto;gap:9px;align-items:center;padding:9px 10px;border:1px solid transparent;background:transparent;color:inherit;border-radius:10px;text-align:left;cursor:pointer}.hub-side-item:hover{background:rgba(255,255,255,.045);border-color:rgba(255,255,255,.07)}.hub-side-dot{width:7px;height:7px;border-radius:50%;background:var(--hub)}.hub-side-copy{min-width:0}.hub-side-copy strong{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hub-side-copy small{display:block;margin-top:2px;font-size:9px;color:#6f879b}.hub-side-count{font-size:9px;color:#8da1b2;border:1px solid rgba(255,255,255,.08);border-radius:999px;padding:2px 5px}.hierarchy-side-organize{margin-top:7px;width:100%;padding:8px 10px;border-radius:9px;border:1px dashed rgba(255,255,255,.1);background:transparent;color:#71889c;text-align:left;font-size:10px;cursor:pointer}.hierarchy-side-organize:hover{color:#a9bdcb;border-color:rgba(255,255,255,.18)}
    .hierarchy-top-btn{margin-right:8px}.hub-project-groups{display:flex;flex-direction:column;gap:20px}.hub-project-section{border:1px solid rgba(255,255,255,.07);background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,.01));border-radius:16px;padding:16px;box-shadow:inset 3px 0 0 var(--hub)}.hub-project-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:13px}.hub-project-head .eyebrow{color:var(--hub)}.hub-project-head h3{margin:2px 0 4px;font-size:18px}.hub-project-head p{margin:0;color:#758ca0;font-size:11px;max-width:660px}.hub-project-head-meta{font-size:10px;color:#8196a7;white-space:nowrap}.hub-project-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.hub-project-shell{position:relative;min-width:0}.hub-project-shell .project-card{width:100%;height:100%}.project-structure-btn{position:absolute;right:10px;top:10px;z-index:4;border:1px solid rgba(255,255,255,.08);background:#121d26;color:#869bad;border-radius:7px;padding:4px 7px;font-size:9px;cursor:pointer}.project-structure-btn:hover{color:#d8e8f1}.home-project-shell{position:relative}.home-hub-pill{position:absolute;left:12px;top:10px;z-index:3;font-size:8px;letter-spacing:.08em;text-transform:uppercase;color:var(--hub);pointer-events:none}.home-project-shell .project-card{padding-top:32px!important}.hierarchy-path{font-weight:600;color:#7fcff4}.hierarchy-path .hub-name{color:var(--hub)}
    .hierarchy-structure-editor{margin:12px 0;padding:12px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(9,16,22,.45)}.hierarchy-structure-editor h3{margin:0 0 3px;font-size:12px}.hierarchy-structure-editor p{margin:0 0 10px;font-size:10px;color:#72899b}.hierarchy-editor-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.hierarchy-editor-grid label{font-size:9px;color:#738a9e}.hierarchy-editor-grid select{margin-top:5px;width:100%}.hierarchy-path-preview{grid-column:1/-1;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,.025);font-size:10px;color:#8da3b3}.hierarchy-path-preview strong{color:#cce6f4}
    .organizer-v2 .dialog-card{width:min(1080px,94vw);max-height:88vh;overflow:auto}.organizer-v2-head{display:flex;justify-content:space-between;gap:18px;margin-bottom:14px}.organizer-v2-head h2{margin:3px 0}.organizer-tabs{display:flex;gap:6px;margin:10px 0 16px}.organizer-tabs button{border:1px solid rgba(255,255,255,.08);background:transparent;color:#768ea0;border-radius:8px;padding:7px 10px;cursor:pointer}.organizer-tabs button.active{background:rgba(103,216,255,.09);color:#bfeeff;border-color:rgba(103,216,255,.25)}.organizer-section-title{display:flex;justify-content:space-between;align-items:center;margin:16px 0 8px}.organizer-section-title span{color:#6f8799;font-size:10px}.organizer-list{display:flex;flex-direction:column;gap:7px}.organizer-row{display:grid;grid-template-columns:minmax(200px,1.4fr) minmax(180px,1fr) 100px;gap:8px;align-items:end;padding:10px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:rgba(255,255,255,.018)}.organizer-row.task-row{grid-template-columns:minmax(220px,1.4fr) 130px minmax(190px,1fr) minmax(180px,1fr) 90px}.organizer-row label{font-size:9px;color:#70879b}.organizer-row input,.organizer-row select{width:100%;margin-top:4px}.organizer-name small{display:block;font-size:8px;color:#60788a}.organizer-name strong{font-size:11px}.organizer-note{padding:10px;border:1px solid rgba(255,255,255,.06);border-radius:10px;color:#72899a;font-size:10px}.structure-save-note{font-size:9px;color:#70d7ad;margin-top:5px}.hub-jump-flash{animation:hubFlash 1.2s ease}@keyframes hubFlash{0%{box-shadow:0 0 0 2px rgba(103,216,255,.55),inset 3px 0 0 var(--hub)}100%{box-shadow:none,inset 3px 0 0 var(--hub)}}
    @media(max-width:900px){.hub-project-cards{grid-template-columns:1fr}.organizer-row,.organizer-row.task-row{grid-template-columns:1fr}.hierarchy-editor-grid{grid-template-columns:1fr}.hierarchy-path-preview{grid-column:auto}}
  `; document.head.appendChild(style);
}

function renderSidebarHubs(){
  const host=hq('#sidebarProjects'); if(!host || !hierarchyState) return;
  const label=hq('.side-label'); if(label) label.textContent='HUBS';
  const sig=activeHubs().map(h=>`${h.id}:${h.title}:${hubProjects(h.id).length}:${hubActiveCount(h.id)}`).join('|');
  if(host.dataset.hubSig===sig && host.classList.contains('hub-sidebar') && hq('.hub-side-item',host)) return;
  host.className='side-projects hub-sidebar'; host.dataset.hubSig=sig;
  host.innerHTML=activeHubs().map(h=>`<button type="button" class="hub-side-item" data-hub-jump="${hesc(h.id)}" style="--hub:${hesc(h.color||'#67d8ff')}"><span class="hub-side-dot"></span><span class="hub-side-copy"><strong>${hesc(h.title)}</strong><small>${hubProjects(h.id).length} projects</small></span><span class="hub-side-count">${hubActiveCount(h.id)}</span></button>`).join('')+`<button type="button" class="hierarchy-side-organize" data-organize-structure>⌘ Organize structure</button>`;
  hqa('[data-hub-jump]',host).forEach(btn=>btn.onclick=()=>jumpToHub(btn.dataset.hubJump));
  hq('[data-organize-structure]',host)?.addEventListener('click',()=>openOrganizer());
}

function jumpToHub(hubId){
  hq('[data-view="projects"]')?.click();
  setTimeout(()=>{
    scheduleEnhance();
    setTimeout(()=>{
      const section=hq(`[data-hub-section="${CSS.escape(hubId)}"]`);
      if(section){ section.scrollIntoView({behavior:'smooth',block:'start'}); section.classList.add('hub-jump-flash'); setTimeout(()=>section.classList.remove('hub-jump-flash'),1300); }
    },30);
  },20);
}

function groupProjectPage(){
  const grid=hq('.project-page-grid'); if(!grid || !hierarchyState || grid.classList.contains('hub-project-groups')) return;
  const cards=hqa(':scope > .project-card',grid); if(!cards.length) return;
  const byProject=new Map(cards.map(c=>[c.dataset.project,c]));
  const frag=document.createDocumentFragment();
  activeHubs().forEach(h=>{
    const ps=hubProjects(h.id).filter(p=>byProject.has(p.id)); if(!ps.length) return;
    const section=document.createElement('section'); section.className='hub-project-section'; section.dataset.hubSection=h.id; section.style.setProperty('--hub',h.color||'#67d8ff');
    const head=document.createElement('div'); head.className='hub-project-head'; head.innerHTML=`<div><div class="eyebrow">HUB</div><h3>${hesc(h.title)}</h3><p>${hesc(h.summary||'')}</p></div><div class="hub-project-head-meta">${ps.length} project${ps.length===1?'':'s'} · ${hubActiveCount(h.id)} active major tasks</div>`;
    const holder=document.createElement('div'); holder.className='hub-project-cards';
    ps.forEach(p=>{
      const card=byProject.get(p.id); if(!card)return;
      const shell=document.createElement('div'); shell.className='hub-project-shell'; shell.appendChild(card);
      const edit=document.createElement('button'); edit.type='button'; edit.className='project-structure-btn'; edit.textContent='Edit / move'; edit.onclick=e=>{e.preventDefault();e.stopPropagation();openOrganizer({projectId:p.id});}; shell.appendChild(edit); holder.appendChild(shell);
    });
    section.append(head,holder); frag.appendChild(section);
  });
  grid.replaceChildren(frag); grid.classList.add('hub-project-groups');
  const header=hq('.page-header',grid.closest('.page'));
  if(header){ const eye=hq('.eyebrow',header), title=hq('h1',header), p=hq('p',header); if(eye)eye.textContent='HUBS → PROJECTS'; if(title)title.textContent='Hubs & Projects'; if(p)p.textContent='Choose an ongoing Hub, then open the finite project you want to move forward.'; }
}

function decorateHomeProjects(){
  const grid=hq('.project-grid'); if(!grid || !hierarchyState || grid.dataset.hierarchyHome==='1') return;
  const cards=hqa(':scope > .project-card',grid); if(!cards.length) return;
  cards.forEach(card=>{
    const p=project(card.dataset.project), h=hub(p?.hubId); if(!p||!h)return;
    const shell=document.createElement('div'); shell.className='home-project-shell'; shell.style.setProperty('--hub',h.color||p.color||'#67d8ff');
    const pill=document.createElement('span'); pill.className='home-hub-pill'; pill.textContent=h.title;
    shell.append(card,pill); grid.appendChild(shell);
  });
  grid.dataset.hierarchyHome='1';
  const panel=grid.closest('.panel'); if(panel){ const h2=hq('h2',panel), sub=hq('.panel-sub',panel); if(h2)h2.textContent='Active Hubs & Projects'; if(sub)sub.textContent='Hub → Project → Major Task → Microtask'; }
}

function decorateTaskPaths(){
  if(!hierarchyState)return;
  hqa('[data-task]').forEach(el=>{
    const t=task(el.dataset.task); if(!t)return; const p=project(t.projectId), h=hub(p?.hubId); if(!p||!h)return;
    const row=el.closest('article.task,.list-row,.schedule-item,.waiting-item,.priority-row,.step,.board-item');
    const crumb=row?.querySelector('.breadcrumb');
    if(crumb && crumb.dataset.hierarchyPath!=='1'){
      crumb.dataset.hierarchyPath='1'; crumb.classList.add('hierarchy-path'); crumb.style.setProperty('--hub',h.color||p.color||'#67d8ff'); crumb.innerHTML=`<span class="hub-name">${hesc(h.title)}</span> → ${hesc(p.title)}${t.parentTaskId?` → ${hesc(task(t.parentTaskId)?.title||'Major task')}`:''}`;
    }
    if(row?.classList.contains('schedule-item')){ const small=row.querySelector('small'); if(small)small.textContent=`${h.title} → ${p.title}`; }
  });
}

function groupedProjectOptions(selected=''){
  return `<option value="">Inbox / no project</option>`+activeHubs().map(h=>{
    const ps=hubProjects(h.id); if(!ps.length)return'';
    return `<optgroup label="${hesc(h.title)}">${ps.map(p=>`<option value="${hesc(p.id)}" ${p.id===selected?'selected':''}>${hesc(p.title)}</option>`).join('')}</optgroup>`;
  }).join('');
}
function parentOptions(projectId,selected='',exclude=''){
  return `<option value="">Choose parent major task…</option>`+tasks().filter(t=>t.projectId===projectId&&!t.parentTaskId&&t.id!==exclude&&t.status!=='Done').sort((a,b)=>(a.flowOrder??999)-(b.flowOrder??999)).map(t=>`<option value="${hesc(t.id)}" ${t.id===selected?'selected':''}>${hesc(t.title)}</option>`).join('');
}
function selectedDialogTaskId(){ return hq('#taskDialogEyebrow')?.textContent?.split(' · ')[0]?.trim() || ''; }
function renderTaskStructureEditor(){
  const dialog=hq('#taskDialog'); if(!dialog?.open || !hierarchyState)return;
  const id=selectedDialogTaskId(), t=task(id); if(!t)return;
  const projectSelect=hq('#taskProjectInput',dialog); if(projectSelect && projectSelect.dataset.hierarchyGrouped!==id){ projectSelect.innerHTML=groupedProjectOptions(t.projectId||''); projectSelect.value=t.projectId||''; projectSelect.dataset.hierarchyGrouped=id; }
  let editor=hq('#hierarchyTaskEditor',dialog);
  if(!editor){ editor=document.createElement('section'); editor.id='hierarchyTaskEditor'; editor.className='hierarchy-structure-editor'; const nextLabel=[...dialog.querySelectorAll('label')].find(x=>x.textContent.trim().startsWith('Next action')); nextLabel?.insertAdjacentElement('beforebegin',editor); }
  if(editor.dataset.taskId!==id){
    editor.dataset.taskId=id;
    editor.innerHTML=`<h3>Place in structure</h3><p>Choose whether this is a visible major step or a checklist item hidden inside one.</p><div class="hierarchy-editor-grid"><label>Type<select id="hierarchyTaskType"><option value="major">Major task</option><option value="micro">Microtask</option></select></label><label id="hierarchyParentLabel">Parent major task<select id="hierarchyTaskParent"></select></label><div class="hierarchy-path-preview" id="hierarchyPathPreview"></div></div>`;
    hq('#hierarchyTaskType',editor).value=t.parentTaskId?'micro':'major';
  }
  const type=hq('#hierarchyTaskType',editor), parent=hq('#hierarchyTaskParent',editor), parentLabel=hq('#hierarchyParentLabel',editor), save=hq('#saveTaskBtn',dialog);
  const refresh=()=>{
    const pid=projectSelect?.value||t.projectId||''; const isMicro=type.value==='micro'; parentLabel.hidden=!isMicro;
    parent.innerHTML=parentOptions(pid,t.parentTaskId||'',id);
    if(t.parentTaskId && [...parent.options].some(o=>o.value===t.parentTaskId))parent.value=t.parentTaskId;
    const effectiveParent=isMicro?task(parent.value):null; const effectiveProject=effectiveParent?.projectId||pid; const p=project(effectiveProject), h=hub(p?.hubId);
    hq('#hierarchyPathPreview',editor).innerHTML=`<strong>${hesc(h?.title||'No Hub')}</strong> → ${hesc(p?.title||'No project')}${isMicro?` → ${hesc(effectiveParent?.title||'Choose a major task')}`:''}`;
    if(save)save.disabled=Boolean(isMicro && !parent.value);
  };
  type.onchange=refresh; projectSelect.onchange=refresh; parent.onchange=refresh; refresh();
  const context=hq('#taskContext',dialog); const first=context?.querySelector('.context-box span'); if(first)first.textContent=taskPath(t)||'Inbox / uncategorized';
}

function decorateProjectDialog(){
  const dialog=hq('#projectDialog'); if(!dialog?.open || !hierarchyState)return;
  const title=hq('#projectTitle',dialog)?.textContent?.trim(); const p=projects().find(x=>x.title===title); if(!p)return; const h=hub(p.hubId); const area=hq('#projectArea',dialog); if(area&&h)area.textContent=`${h.title} → PROJECT`;
  if(!hq('#projectMoveBtn',dialog)){
    const btn=document.createElement('button'); btn.type='button'; btn.id='projectMoveBtn'; btn.className='btn secondary'; btn.textContent='Edit / move project'; btn.onclick=()=>openOrganizer({projectId:p.id}); hq('.project-head',dialog)?.appendChild(btn);
  }else hq('#projectMoveBtn',dialog).onclick=()=>openOrganizer({projectId:p.id});
}

function ensureOrganizer(){
  if(hq('#hierarchyOrganizerV2'))return;
  const dialog=document.createElement('dialog'); dialog.id='hierarchyOrganizerV2'; dialog.className='dialog wide organizer-v2'; dialog.innerHTML=`<div class="dialog-card"><button type="button" class="close" data-org-close>×</button><div class="organizer-v2-head"><div><div class="eyebrow">STRUCTURE EDITOR</div><h2>Organize the hierarchy</h2><p class="panel-sub">Hub → Project → Major Task → Microtask. Structural saves write to the persistent backend.</p></div></div><div class="organizer-tabs"><button type="button" class="active" data-org-tab="projects">Hubs & Projects</button><button type="button" data-org-tab="tasks">Tasks & Microtasks</button></div><div id="organizerV2Body"></div></div>`; document.body.appendChild(dialog);
  hq('[data-org-close]',dialog).onclick=()=>dialog.close(); hqa('[data-org-tab]',dialog).forEach(btn=>btn.onclick=()=>{hqa('[data-org-tab]',dialog).forEach(x=>x.classList.toggle('active',x===btn));dialog.dataset.tab=btn.dataset.orgTab;renderOrganizer();});
}
function ensureOrganizerButtons(){
  const quick=hq('#quickAddBtn'); if(quick&&!hq('#hierarchyTopBtn')){const btn=document.createElement('button');btn.type='button';btn.id='hierarchyTopBtn';btn.className='btn secondary hierarchy-top-btn';btn.textContent='▦ Organize';btn.onclick=()=>openOrganizer();quick.insertAdjacentElement('beforebegin',btn);}
}
async function openOrganizer(opts={}){ if(!hierarchyState){const out=await hierarchyApi();ingestState(out);} ensureOrganizer(); organizerFocusProject=opts.projectId||''; const dialog=hq('#hierarchyOrganizerV2'); dialog.dataset.tab='projects'; hqa('[data-org-tab]',dialog).forEach(x=>x.classList.toggle('active',x.dataset.orgTab==='projects')); renderOrganizer(); dialog.showModal(); if(organizerFocusProject)setTimeout(()=>hq(`[data-org-project="${CSS.escape(organizerFocusProject)}"]`,dialog)?.scrollIntoView({block:'center'}),50); }
function renderOrganizer(){ const dialog=hq('#hierarchyOrganizerV2'), body=hq('#organizerV2Body',dialog); if(!body||!hierarchyState)return; dialog.dataset.tab==='tasks'?renderTaskOrganizer(body):renderProjectOrganizer(body); }
function hubOpts(selected){return activeHubs().map(h=>`<option value="${hesc(h.id)}" ${h.id===selected?'selected':''}>${hesc(h.title)}</option>`).join('');}
function projectOpts(selected){return activeProjects().map(p=>`<option value="${hesc(p.id)}" ${p.id===selected?'selected':''}>${hesc(hub(p.hubId)?.title||'Unassigned')} → ${hesc(p.title)}</option>`).join('');}
function renderProjectOrganizer(body){
  body.innerHTML=`<div class="organizer-section-title"><div><strong>Hubs</strong><span>Ongoing worlds. These do not need to be completed.</span></div><button type="button" class="btn secondary" id="addHubV2">＋ Hub</button></div><div class="organizer-list">${activeHubs().map(h=>`<div class="organizer-row" data-org-hub="${hesc(h.id)}"><label>Hub name<input data-hub-title value="${hesc(h.title)}"></label><label>Description<input data-hub-summary value="${hesc(h.summary||'')}"></label><button type="button" class="btn secondary" data-save-hub="${hesc(h.id)}">Save</button></div>`).join('')}</div><div class="organizer-section-title"><div><strong>Projects</strong><span>Finite outcomes that live inside a Hub.</span></div></div><div class="organizer-list">${activeProjects().map(p=>`<div class="organizer-row" data-org-project="${hesc(p.id)}"><label>Project<input data-project-title value="${hesc(p.title)}"></label><label>Hub<select data-project-hub>${hubOpts(p.hubId)}</select></label><button type="button" class="btn secondary" data-save-project="${hesc(p.id)}">Save</button></div>`).join('')}</div><div class="organizer-note">After a Hub or Project move, the page refreshes once so every native view is reading the same saved backend state.</div>`;
  hq('#addHubV2',body)?.addEventListener('click',async()=>{const title=prompt('New Hub name');if(!title?.trim())return;await hierarchyApi('createHub',{hub:{title:title.trim(),priority:activeHubs().length+1}});renderOrganizer();renderSidebarHubs();});
  hqa('[data-save-hub]',body).forEach(btn=>btn.onclick=async()=>{const row=btn.closest('[data-org-hub]');btn.disabled=true;await hierarchyApi('updateHub',{hubId:btn.dataset.saveHub,patch:{title:hq('[data-hub-title]',row).value.trim(),summary:hq('[data-hub-summary]',row).value.trim()}});btn.textContent='Saved';setTimeout(()=>location.reload(),180);});
  hqa('[data-save-project]',body).forEach(btn=>btn.onclick=async()=>{const row=btn.closest('[data-org-project]');btn.disabled=true;await hierarchyApi('updateProject',{projectId:btn.dataset.saveProject,patch:{title:hq('[data-project-title]',row).value.trim(),hubId:hq('[data-project-hub]',row).value,parentProjectId:null}});btn.textContent='Saved';setTimeout(()=>location.reload(),180);});
}
function renderTaskOrganizer(body){
  const list=tasks().filter(t=>t.status!=='Done').sort((a,b)=>(project(a.projectId)?.title||'').localeCompare(project(b.projectId)?.title||'')||Number(Boolean(a.parentTaskId))-Number(Boolean(b.parentTaskId))||a.title.localeCompare(b.title));
  body.innerHTML=`<div class="organizer-section-title"><div><strong>Tasks & Microtasks</strong><span>Move work into the right project, or tuck checklist items under a major task.</span></div><input id="orgTaskSearchV2" placeholder="Search tasks…"></div><div class="organizer-list">${list.map(t=>`<div class="organizer-row task-row" data-org-task="${hesc(t.id)}" data-search="${hesc([t.title,projectPath(t.projectId)].join(' ').toLowerCase())}"><div class="organizer-name"><small>${hesc(t.id)}</small><strong>${hesc(t.title)}</strong></div><label>Type<select data-task-type><option value="major" ${t.parentTaskId?'':'selected'}>Major</option><option value="micro" ${t.parentTaskId?'selected':''}>Micro</option></select></label><label>Project<select data-task-project>${projectOpts(t.projectId)}</select></label><label data-parent-label>Parent<select data-task-parent>${parentOptions(t.projectId,t.parentTaskId||'',t.id)}</select></label><button type="button" class="btn secondary" data-save-task="${hesc(t.id)}">Save</button></div>`).join('')}</div><div class="organizer-note">Major tasks are visible in project flow. Microtasks remain hidden until their parent task is expanded.</div>`;
  const search=hq('#orgTaskSearchV2',body); if(search)search.oninput=()=>{const q=search.value.toLowerCase();hqa('[data-org-task]',body).forEach(r=>r.hidden=q&&!r.dataset.search.includes(q));};
  hqa('[data-org-task]',body).forEach(row=>{const type=hq('[data-task-type]',row), proj=hq('[data-task-project]',row), parent=hq('[data-task-parent]',row), label=hq('[data-parent-label]',row), id=row.dataset.orgTask; const refresh=()=>{label.hidden=type.value!=='micro';parent.innerHTML=parentOptions(proj.value,task(id)?.parentTaskId||'',id);};type.onchange=refresh;proj.onchange=refresh;refresh();});
  hqa('[data-save-task]',body).forEach(btn=>btn.onclick=async()=>{const row=btn.closest('[data-org-task]'), id=btn.dataset.saveTask, old=task(id), type=hq('[data-task-type]',row).value;let projectId=hq('[data-task-project]',row).value,parentTaskId=null,status=old.status;if(type==='micro'){parentTaskId=hq('[data-task-parent]',row).value||null;const parent=task(parentTaskId);if(!parent){alert('Choose a parent major task.');return;}projectId=parent.projectId;status='Backlog';}else if(old.parentTaskId&&status==='Backlog')status='Open';btn.disabled=true;await hierarchyApi('updateTask',{taskId:id,patch:{projectId,parentTaskId,designation:type,status,milestoneId:null,area:project(projectId)?.area||old.area}});btn.textContent='Saved';setTimeout(()=>location.reload(),180);});
}

function openTaskFlow(taskId){
  const t=task(taskId); if(!t?.projectId)return false; const projectId=t.projectId;
  hq('[data-view="projects"]')?.click();
  setTimeout(()=>{
    scheduleEnhance();
    setTimeout(()=>{
      const card=hq(`.project-card[data-project="${CSS.escape(projectId)}"]`); if(!card)return; card.click();
      const dialog=hq('#projectDialog'); if(dialog)dialog.dataset.focusTaskId=taskId;
      setTimeout(()=>{hq('[data-project-mode="sequence"]',dialog||document)?.click();},0);
    },25);
  },20);
  return true;
}
window.masterTaskHierarchy={openTaskFlow,jumpToHub,openOrganizer};

function enhance(){
  if(!hierarchyState)return;
  installStyles(); renderSidebarHubs(); ensureOrganizerButtons(); groupProjectPage(); decorateHomeProjects(); decorateTaskPaths(); renderTaskStructureEditor(); decorateProjectDialog();
}
function observe(){
  const root=hq('#viewRoot'); if(root)new MutationObserver(scheduleEnhance).observe(root,{childList:true,subtree:true});
  const side=hq('.sidebar'); if(side)new MutationObserver(scheduleEnhance).observe(side,{childList:true,subtree:true});
  const taskDialog=hq('#taskDialog'); if(taskDialog)new MutationObserver(scheduleEnhance).observe(taskDialog,{attributes:true,attributeFilter:['open']});
  const projectDialog=hq('#projectDialog'); if(projectDialog)new MutationObserver(scheduleEnhance).observe(projectDialog,{attributes:true,attributeFilter:['open']});
}

window.addEventListener('DOMContentLoaded',async()=>{
  installStyles(); observe();
  try{ const r=await previousFetch('/api/state',{cache:'no-store'}); if(r.ok)ingestState(await r.json()); }
  catch(error){ console.error('Hierarchy layer failed to load',error); }
});