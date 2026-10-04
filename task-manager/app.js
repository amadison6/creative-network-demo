const state = {
  data: null,
  view: 'home',
  query: '',
  focusFilter: 'all',
  projectMode: 'priority',
  selectedTask: null,
  selectedProject: null,
  connectionOpen: false,
  timerSeconds: 25 * 60,
  timerRunning: false,
  timerHandle: null
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

async function api(action, payload = {}) {
  const opts = action
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...payload }) }
    : { cache: 'no-store' };
  const r = await fetch('/api/state', opts);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function tasks(){ return state.data?.tasks || []; }
function projects(){ return state.data?.projects || []; }
function goals(){ return state.data?.goals || []; }
function milestones(){ return state.data?.milestones || []; }
function project(id){ return projects().find(p => p.id === id); }
function goal(id){ return goals().find(g => g.id === id); }
function milestone(id){ return milestones().find(m => m.id === id); }
function activeProjects(){ return projects().filter(p => !p.archived && !p.parentProjectId); }
function openTasks(){ return tasks().filter(t => !['Done','Backlog'].includes(t.status)); }
function colorForTask(t){ return project(t.projectId)?.color || '#36c8ff'; }
function priorityLabel(p){ return Number(p) === 1 ? 'High' : Number(p) === 2 ? 'Medium' : 'Low'; }
function greeting(){ const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }
function longDate(){ return new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'}).format(new Date()); }
function monthName(){ return new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric'}).format(new Date()); }

function taskProjectFamily(p){
  if (!p) return [];
  const ids = new Set([p.id]);
  projects().forEach(x => { if (x.parentProjectId === p.id) ids.add(x.id); });
  return tasks().filter(t => ids.has(t.projectId));
}
function projectProgress(p){
  const all = taskProjectFamily(p).filter(t => t.status !== 'Backlog');
  if (!all.length) return 0;
  return Math.round(all.filter(t => t.status === 'Done').length / all.length * 100);
}
function projectActiveCount(p){ return taskProjectFamily(p).filter(t => ['Open','In Progress','Waiting'].includes(t.status)).length; }
function taskPath(t){
  const m = milestone(t.milestoneId);
  const p = project(t.projectId);
  const parent = p?.parentProjectId ? project(p.parentProjectId) : null;
  const g = goal(t.goalId || p?.goalId || parent?.goalId);
  return [m?.title, p?.title, parent?.title, g?.title].filter(Boolean).filter((v,i,a) => a.indexOf(v) === i);
}
function unlocks(t){ return tasks().filter(x => (x.dependsOn || []).includes(t.id)); }
function requires(t){ return (t.dependsOn || []).map(id => tasks().find(x => x.id === id)).filter(Boolean); }
function isBlocked(t){ return requires(t).some(x => x.status !== 'Done'); }
function todayScore(t){
  if (['Done','Backlog'].includes(t.status)) return -9999;
  let s = 0;
  if (t.todayRank != null) s += 1000 - Number(t.todayRank) * 100;
  s += (4 - Number(t.priority || 2)) * 34;
  s += unlocks(t).length * 13;
  if (t.status === 'In Progress') s += 20;
  if (t.status === 'Waiting') s -= 30;
  if (isBlocked(t)) s -= 15;
  const timing = String(t.dueText || '').toLowerCase();
  if (timing.includes('today') || timing.includes('current')) s += 45;
  if (t.dueDate) {
    const days = (new Date(t.dueDate) - new Date()) / 86400000;
    if (days <= 1) s += 50; else if (days <= 7) s += 20;
  }
  return s;
}
function focusTasks(){
  const ranked = [...openTasks()].sort((a,b) => todayScore(b) - todayScore(a));
  const picked = [], areaCounts = new Map();
  for (const t of ranked) {
    const n = areaCounts.get(t.area) || 0;
    if (n >= 2 && picked.length < 4) continue;
    picked.push(t); areaCounts.set(t.area, n + 1);
    if (picked.length === 4) break;
  }
  return picked;
}
function matchesQuery(t){
  if (!state.query) return true;
  const q = state.query.toLowerCase();
  return [t.title,t.area,t.nextAction,t.waitingOn,project(t.projectId)?.title,...taskPath(t),...(t.people||[])].filter(Boolean).join(' ').toLowerCase().includes(q);
}
function filteredFocus(){
  let list = focusTasks().filter(matchesQuery);
  if (state.focusFilter === 'work') list = list.filter(t => /CLA|Career|Finance|Task Manager/i.test(t.area));
  if (state.focusFilter === 'creative') list = list.filter(t => /God's Contraband|Collaborators|Music/i.test(t.area));
  if (state.focusFilter === 'personal') list = list.filter(t => /Personal|Everything Fades|Health|Home/i.test(t.area));
  return list;
}
function stats(){
  const dueWeek = tasks().filter(t => t.status !== 'Done' && (/week|today|current/i.test(t.dueText || '') || t.dueDate)).length;
  return {
    focus: focusTasks().length,
    dueWeek,
    waiting: tasks().filter(t => t.status !== 'Done' && (t.status === 'Waiting' || t.waitingOn)).length,
    progress: overallProgress()
  };
}
function overallProgress(){
  const all = tasks().filter(t => t.status !== 'Backlog');
  if (!all.length) return 0;
  return Math.round(all.filter(t => t.status === 'Done').length / all.length * 100);
}
function inboxTasks(){ return tasks().filter(t => t.status === 'Backlog' || !t.projectId || t.area === 'Inbox'); }
function topProjectMilestones(p){
  const childIds = new Set([p.id, ...projects().filter(x => x.parentProjectId === p.id).map(x => x.id)]);
  const ms = milestones().filter(m => childIds.has(m.projectId));
  if (ms.length) return ms.slice(0,3).map(m => m.title);
  return taskProjectFamily(p).filter(t => t.status !== 'Done').slice(0,3).map(t => t.title);
}
function currentTaskLabel(t){
  if (t.status === 'Waiting') return 'Waiting';
  if (isBlocked(t)) return 'Blocked';
  return t.dueText || t.status;
}

function render(){
  renderSidebar();
  renderNav();
  const root = $('#viewRoot');
  if (!root) return;
  if (state.view === 'home' || state.view === 'today') root.innerHTML = renderToday();
  else if (state.view === 'inbox') root.innerHTML = renderTaskListPage('Inbox','Unsorted, deferred, or newly captured work.', inboxTasks());
  else if (state.view === 'projects') root.innerHTML = renderProjectsPage();
  else if (state.view === 'calendar') root.innerHTML = renderCalendarPage();
  else if (state.view === 'people') root.innerHTML = renderPeoplePage();
  else if (state.view === 'files') root.innerHTML = renderFilesPage();
  else if (state.view === 'reports') root.innerHTML = renderReportsPage();
  bindView();
  updateTimerDisplay();
}

function renderNav(){
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === state.view || (state.view === 'home' && b.dataset.view === 'home')));
}
function renderSidebar(){
  const ps = activeProjects().sort((a,b) => a.priority - b.priority).slice(0,7);
  $('#sidebarProjects').innerHTML = ps.map(p => `<button class="side-project" style="--color:${p.color || '#36c8ff'}" data-project="${esc(p.id)}">${esc(p.title)}</button>`).join('');
  $$('.side-project').forEach(b => b.onclick = () => openProject(b.dataset.project));
  const badge = $('#inboxBadge');
  const n = inboxTasks().filter(t => t.status !== 'Done').length;
  if (badge) { badge.hidden = !n; badge.textContent = n; }
}

function renderToday(){
  const s = stats();
  const focus = filteredFocus();
  return `<div class="page">
    <div class="dashboard-grid">
      <div class="dashboard-main">
        <section class="hero-banner">
          <div class="hero-meta">${esc(longDate())}<br>${tasks().filter(t=>t.status!=='Done').length} open tasks</div>
          <div class="eyebrow">MASTER TASK LEDGER</div>
          <h1>${greeting()}, Ausar</h1>
          <p>Let's make meaningful progress today.</p>
          <p class="hero-quote">“The next useful action matters more than the perfect plan.”</p>
        </section>

        <section class="stats">
          ${renderStat(s.focus,'Priority Tasks','◎','#ff647f')}
          ${renderStat(s.dueWeek,'Due / Active This Week','▣','#ae78ff')}
          ${renderStat(s.waiting,'Waiting On Others','◉','#4db6ff')}
          ${renderStat(`${s.progress}%`,'Overall Progress','✓','#34dfb0')}
        </section>

        <section class="panel">
          <div class="panel-head">
            <div class="panel-title"><span class="panel-icon">◎</span><div><h2>Today's Focus</h2><div class="panel-sub">A balanced mix of urgent, important, and diverse actions.</div></div></div>
            <div class="filters">
              ${focusFilterButton('all','All',focusTasks().length)}
              ${focusFilterButton('work','Work',focusTasks().filter(t=>/CLA|Career|Finance|Task Manager/i.test(t.area)).length)}
              ${focusFilterButton('creative','Creative',focusTasks().filter(t=>/God's Contraband|Collaborators|Music/i.test(t.area)).length)}
              ${focusFilterButton('personal','Personal',focusTasks().filter(t=>/Personal|Everything Fades|Health|Home/i.test(t.area)).length)}
            </div>
          </div>
          <div class="focus-list">${focus.length ? focus.map(renderTaskCard).join('') : '<div class="empty">No focus tasks match this filter.</div>'}</div>
        </section>

        <section class="panel">
          <button id="connectionToggle" class="connection-toggle">
            <span class="panel-title"><span class="panel-icon">⌘</span><span><strong>Project Connection Map</strong><small>See how today's work connects to milestones and larger outcomes.</small></span></span>
            <span class="filter">${state.connectionOpen ? 'Collapse' : 'Open map'} ${state.connectionOpen ? '−' : '＋'}</span>
          </button>
          ${state.connectionOpen ? renderConnectionMap(focus[0] || focusTasks()[0]) : ''}
        </section>

        <section class="panel">
          <div class="panel-head"><div class="panel-title"><span class="panel-icon">▦</span><div><h2>Projects Overview</h2><div class="panel-sub">Click a project to view tasks, sequence, and details.</div></div></div><button class="filter" data-go-projects>View all</button></div>
          <div class="project-grid">${renderProjectCards(activeProjects().sort((a,b)=>a.priority-b.priority).slice(0,4))}</div>
        </section>
      </div>

      <aside class="right-rail">
        ${renderCalendarRail()}
        ${renderFocusTimer()}
        ${renderQuickCapture()}
        ${renderWaitingRail()}
      </aside>
    </div>
  </div>`;
}
function renderStat(value,label,icon,color){ return `<div class="stat" style="--accent:${color}"><div class="stat-icon">${icon}</div><div><strong>${value}</strong><span>${label}</span></div></div>`; }
function focusFilterButton(id,label,count){ return `<button class="filter ${state.focusFilter===id?'active':''}" data-filter="${id}">${label} (${count})</button>`; }

function renderTaskCard(t){
  const p = project(t.projectId);
  const path = taskPath(t);
  const color = colorForTask(t);
  const meta = [];
  if (isBlocked(t)) meta.push('⊘ Blocked');
  if (unlocks(t).length) meta.push(`◇ Unlocks ${unlocks(t).length} task${unlocks(t).length===1?'':'s'}`);
  if (t.effort) meta.push(`◷ ${t.effort}`);
  if (t.waitingOn) meta.push(`Waiting: ${t.waitingOn}`);
  return `<article class="task" style="--color:${color}">
    <button class="check" data-complete="${esc(t.id)}">✓</button>
    <button class="task-main" data-task="${esc(t.id)}">
      <div class="task-title-row"><span class="task-title">${esc(t.title)}</span><span class="priority p${t.priority}">${priorityLabel(t.priority)}</span></div>
      <div class="breadcrumb"><span class="project-name">${esc(p?.parentProjectId ? project(p.parentProjectId)?.title || p.title : p?.title || t.area)}</span>${path.length ? ' → ' + path.slice(0,3).map(esc).join(' → ') : ''}</div>
      <div class="task-meta">${meta.map(x=>`<span>${esc(x)}</span>`).join('')}</div>
    </button>
    <span class="task-due">${esc(currentTaskLabel(t))}</span><span class="task-arrow">›</span>
  </article>`;
}

function renderConnectionMap(t){
  if (!t) return '<div class="connection"><div class="empty">No focus task selected.</div></div>';
  const req = requires(t);
  const path = taskPath(t).slice(0,3);
  const chain = [...req.slice(0,1).map(x=>({label:'Requires',title:x.title,color:'#34dfb0'})),{label:'Current',title:t.title,color:colorForTask(t)},...path.map((x,i)=>({label:i===path.length-1?'Outcome':'Next level',title:x,color:['#4db6ff','#36c8ff','#ae78ff'][i]||'#36c8ff'}))];
  return `<div class="connection"><div class="connection-track">${chain.map((n,i)=>`${i?'<span class="arrow">→</span>':''}<div class="node" style="--node:${n.color}"><small>${esc(n.label)}</small><strong>${esc(n.title)}</strong></div>`).join('')}</div></div>`;
}

function renderProjectCards(ps){
  return ps.map(p => {
    const prog = projectProgress(p), active = projectActiveCount(p), ms = topProjectMilestones(p);
    return `<button class="project-card" style="--color:${p.color || '#36c8ff'}" data-project="${esc(p.id)}">
      <h4>${esc(p.title)}</h4>
      <div class="bar"><span style="width:${prog}%"></span></div>
      <div class="project-foot"><span>${prog}% complete</span><span>${active} active</span></div>
      <div class="project-milestones">${ms.map(x=>`<span>${esc(x)}</span>`).join('')}</div>
      <div class="project-foot"><span>${taskProjectFamily(p).length} tasks</span><span>→</span></div>
    </button>`;
  }).join('');
}

function calendarMatrix(){
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  const first = new Date(y,m,1).getDay();
  const days = new Date(y,m+1,0).getDate();
  const cells = [];
  for (let i=0;i<first;i++) cells.push({n:'',muted:true});
  for (let d=1;d<=days;d++) cells.push({n:d,today:d===now.getDate()});
  while (cells.length%7) cells.push({n:'',muted:true});
  return cells;
}
function renderCalendarRail(){
  const focus = focusTasks().slice(0,3);
  return `<section class="rail-card">
    <div class="calendar-head"><strong>${esc(monthName())}</strong><span>‹ &nbsp; ›</span></div>
    <div class="mini-calendar">${['Su','Mo','Tu','We','Th','Fr','Sa'].map(x=>`<div class="cal-cell label">${x}</div>`).join('')}${calendarMatrix().map(c=>`<div class="cal-cell ${c.today?'today':''} ${c.muted?'muted':''}">${c.n}</div>`).join('')}</div>
    <div class="rail-divider"></div><h3>Today's Queue</h3>
    <div class="schedule-list">${focus.map((t,i)=>`<button class="schedule-item task-main" style="border-left-color:${colorForTask(t)}" data-task="${esc(t.id)}"><time>${['NOW','NEXT','LATER'][i]}</time><span><strong>${esc(t.title)}</strong><small>${esc(project(t.projectId)?.title || t.area)}</small></span></button>`).join('')}</div>
  </section>`;
}
function timerString(){ const m = Math.floor(state.timerSeconds/60), s = state.timerSeconds%60; return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
function renderFocusTimer(){ return `<section class="rail-card"><div class="eyebrow">FOCUS MODE</div><div class="timer"><div><div id="timerTime" class="timer-time">${timerString()}</div><div class="panel-sub">One task. No switching.</div></div><button id="timerPlay" class="timer-play">${state.timerRunning?'Ⅱ':'▶'}</button></div><div class="timer-controls"><button id="timerReset" class="tiny-btn">↺</button><button class="tiny-btn" title="25 minute focus">25</button></div></section>`; }
function renderQuickCapture(){ return `<section class="rail-card"><h3>Quick Capture</h3><div class="quick-capture"><textarea id="quickCaptureText" placeholder="Add a task, note, or idea…"></textarea><div class="capture-foot"><span class="panel-sub">Saves to Inbox</span><button id="captureSend" class="capture-send">↗</button></div></div></section>`; }
function renderWaitingRail(){
  const list = tasks().filter(t => t.status !== 'Done' && (t.status === 'Waiting' || t.waitingOn)).slice(0,4);
  return `<section class="rail-card"><div class="panel-head"><h3>Waiting On</h3><button class="filter" data-view-jump="inbox">View all →</button></div><div class="waiting-list">${list.length?list.map(t=>`<button class="waiting-item" data-task="${esc(t.id)}"><span><strong>${esc(t.waitingOn || 'Dependency')}</strong><small>${esc(t.title)}</small></span><em>${t.status==='Waiting'?'Open':'Pending'}</em></button>`).join(''):'<div class="empty">Nothing waiting right now.</div>'}</div></section>`;
}

function renderProjectsPage(){
  const ps = activeProjects().sort((a,b)=>a.priority-b.priority).filter(p => !state.query || [p.title,p.area,p.summary,goal(p.goalId)?.title].filter(Boolean).join(' ').toLowerCase().includes(state.query.toLowerCase()));
  return `<div class="page"><div class="page-header"><div class="eyebrow">PROJECTS</div><h1>Projects Overview</h1><p>See the larger outcome, current progress, and what needs to happen next.</p></div><div class="project-page-grid">${renderProjectCards(ps)}</div></div>`;
}
function renderTaskListPage(title,desc,list){
  const filtered = list.filter(matchesQuery);
  return `<div class="page"><div class="page-header"><div class="eyebrow">TASKS</div><h1>${esc(title)}</h1><p>${esc(desc)}</p></div><section class="panel"><div class="all-tasks">${filtered.length?filtered.map(t=>`<div class="list-row"><span class="status-dot ${t.status==='Waiting'?'waiting':t.status==='Done'?'done':''}"></span><button class="title-btn" data-task="${esc(t.id)}"><strong>${esc(t.title)}</strong><div class="breadcrumb">${esc(project(t.projectId)?.title || t.area)} · ${esc(t.status)}</div></button><span class="priority p${t.priority}">${priorityLabel(t.priority)}</span></div>`).join(''):'<div class="empty">Nothing here right now.</div>'}</div></section></div>`;
}
function renderCalendarPage(){
  const list = tasks().filter(t=>t.status!=='Done' && (t.dueDate || t.dueText)).sort((a,b)=>todayScore(b)-todayScore(a));
  return renderTaskListPage('Calendar & Timing','Tasks with current timing, deadlines, or scheduling context.',list);
}
function renderPeoplePage(){
  const map = new Map();
  tasks().forEach(t => (t.people||[]).forEach(id => {
    const rec = map.get(id) || {id,count:0,open:0}; rec.count++; if(t.status!=='Done') rec.open++; map.set(id,rec);
  }));
  const people = [...map.values()].sort((a,b)=>b.open-a.open||b.count-a.count);
  return `<div class="page"><div class="page-header"><div class="eyebrow">NETWORK HQ</div><h1>People in the work</h1><p>Task-linked collaborators. These IDs are ready to resolve against canonical Network HQ profiles.</p></div><div class="entity-grid">${people.length?people.map(p=>`<div class="entity-card"><strong>${esc(p.id)}</strong><small>${p.open} open · ${p.count} linked tasks</small></div>`).join(''):'<div class="empty">No people are linked to tasks yet.</div>'}</div></div>`;
}
function renderFilesPage(){
  const rows=[]; tasks().forEach(t => (t.resources||[]).forEach(r => rows.push({task:t,resource:r})));
  return `<div class="page"><div class="page-header"><div class="eyebrow">FILES</div><h1>Linked resources</h1><p>References, folders, and files attached to current work.</p></div><div class="entity-grid">${rows.length?rows.map(x=>`<a class="entity-card" href="${esc(x.resource.url||'#')}" target="_blank" rel="noopener"><strong>${esc(x.resource.label||'Resource')}</strong><small>${esc(x.task.title)}</small></a>`).join(''):'<div class="empty">No linked resources yet.</div>'}</div></div>`;
}
function renderReportsPage(){
  const done = tasks().filter(t=>t.status==='Done').length, waiting = tasks().filter(t=>t.status==='Waiting').length, active=openTasks().length;
  return `<div class="page"><div class="page-header"><div class="eyebrow">REPORTS</div><h1>System pulse</h1><p>A quick operational snapshot across the task system.</p></div><div class="report-grid"><div class="report-card"><strong>${active}</strong><span>Active tasks</span></div><div class="report-card"><strong>${done}</strong><span>Completed tasks</span></div><div class="report-card"><strong>${waiting}</strong><span>Explicitly waiting</span></div><div class="report-card"><strong>${overallProgress()}%</strong><span>Overall progress</span></div></div></div>`;
}

function bindView(){
  $$('[data-task]').forEach(b => b.onclick = () => openTask(b.dataset.task));
  $$('[data-project]').forEach(b => b.onclick = () => openProject(b.dataset.project));
  $$('[data-complete]').forEach(b => b.onclick = async e => { e.stopPropagation(); await mutate('completeTask',{taskId:b.dataset.complete}); });
  $$('[data-filter]').forEach(b => b.onclick = () => { state.focusFilter = b.dataset.filter; render(); });
  $$('[data-view-jump]').forEach(b => b.onclick = () => { state.view = b.dataset.viewJump; render(); });
  $('#connectionToggle')?.addEventListener('click',()=>{ state.connectionOpen = !state.connectionOpen; render(); });
  $('[data-go-projects]')?.addEventListener('click',()=>{ state.view='projects'; render(); });
  $('#timerPlay')?.addEventListener('click',toggleTimer);
  $('#timerReset')?.addEventListener('click',resetTimer);
  $('#captureSend')?.addEventListener('click',quickCapture);
}

function populateProjectSelects(){
  const opts = `<option value="">Inbox / no project</option>` + projects().filter(p=>!p.archived).sort((a,b)=>a.title.localeCompare(b.title)).map(p=>`<option value="${esc(p.id)}">${esc(p.area)} — ${esc(p.title)}</option>`).join('');
  $('#newProject').innerHTML = opts; $('#taskProjectInput').innerHTML = opts;
}
async function openTask(id){
  const t = tasks().find(x=>x.id===id); if(!t) return;
  state.selectedTask=id; populateProjectSelects();
  $('#taskDialogEyebrow').textContent = `${t.id} · ${t.area}`;
  $('#taskTitleInput').value=t.title; $('#taskProjectInput').value=t.projectId||''; $('#taskPriorityInput').value=String(t.priority); $('#taskStatusInput').value=t.status; $('#taskDueInput').value=t.dueText||''; $('#taskNextInput').value=t.nextAction||''; $('#taskWaitingInput').value=t.waitingOn||''; $('#taskNotesInput').value=t.notes||'';
  const req=requires(t).map(x=>x.title), unl=unlocks(t).map(x=>x.title);
  $('#taskContext').innerHTML = `<div class="context-box"><small>Project path</small><span>${esc(taskPath(t).join(' → ')||'Inbox / uncategorized')}</span></div><div class="context-box"><small>Requires</small><span>${esc(req.join(', ')||'Ready — no task dependency')}</span></div><div class="context-box"><small>Unlocks</small><span>${esc(unl.join(', ')||'No downstream task')}</span></div><div class="context-box"><small>Network HQ links</small><span>${esc((t.people||[]).join(', ')||'No collaborators linked yet')}</span></div>`;
  $('#taskToggleDone').textContent=t.status==='Done'?'Reopen task':'✓ Mark complete';
  $('#taskDialog').showModal();
}
async function saveSelectedTask(){
  const id=state.selectedTask; if(!id) return;
  const projectId=$('#taskProjectInput').value||null; const p=project(projectId);
  await mutate('updateTask',{taskId:id,patch:{title:$('#taskTitleInput').value.trim(),projectId,area:p?.area||'Inbox',priority:Number($('#taskPriorityInput').value),status:$('#taskStatusInput').value,dueText:$('#taskDueInput').value.trim(),nextAction:$('#taskNextInput').value.trim(),waitingOn:$('#taskWaitingInput').value.trim(),notes:$('#taskNotesInput').value.trim()}});
  $('#taskDialog').close();
}
async function toggleSelectedTask(){
  const t=tasks().find(x=>x.id===state.selectedTask); if(!t) return;
  await mutate(t.status==='Done'?'reopenTask':'completeTask',{taskId:t.id}); $('#taskDialog').close();
}
function openProject(id){
  const p=project(id); if(!p) return;
  state.selectedProject=id; state.projectMode='priority';
  $('#projectArea').textContent=p.area||'Project'; $('#projectTitle').textContent=p.title; $('#projectSummary').textContent=p.summary||goal(p.goalId)?.title||''; $('#projectProgress').textContent=`${projectProgress(p)}%`;
  renderProjectBody(); $('#projectDialog').showModal();
}
function renderProjectBody(){
  const p=project(state.selectedProject); if(!p) return;
  $$('[data-project-mode]').forEach(b=>b.classList.toggle('active',b.dataset.projectMode===state.projectMode));
  const all=taskProjectFamily(p), active=all.filter(t=>t.status!=='Done'&&t.status!=='Backlog');
  if(state.projectMode==='priority') $('#projectBody').innerHTML=`<div class="priority-list">${[...active].sort((a,b)=>todayScore(b)-todayScore(a)).map(t=>`<button class="priority-row task-main" data-task="${esc(t.id)}"><span><strong>${esc(t.title)}</strong><div class="breadcrumb">${esc(t.status)} · ${esc(t.dueText||'No timing')}</div></span><span class="priority p${t.priority}">${priorityLabel(t.priority)}</span></button>`).join('')||'<div class="empty">No active tasks.</div>'}</div>`;
  if(state.projectMode==='sequence'){
    const seq=[...active].sort((a,b)=>{const ma=milestone(a.milestoneId)?.sequence??999,mb=milestone(b.milestoneId)?.sequence??999;return ma-mb||todayScore(b)-todayScore(a)});
    $('#projectBody').innerHTML=`<div class="sequence">${seq.map((t,i)=>`${i?'<span class="arrow">→</span>':''}<button class="step ${i===0?'current':''} task-main" data-task="${esc(t.id)}"><small>${esc(milestone(t.milestoneId)?.title||t.status)}</small><strong>${esc(t.title)}</strong></button>`).join('')||'<div class="empty">No sequence yet.</div>'}</div>`;
  }
  if(state.projectMode==='board'){
    const cols=['Open','In Progress','Waiting','Done'];
    $('#projectBody').innerHTML=`<div class="board">${cols.map(c=>`<div class="board-col"><strong>${c}</strong>${all.filter(t=>t.status===c).map(t=>`<div class="board-item" data-task="${esc(t.id)}">${esc(t.title)}</div>`).join('')}</div>`).join('')}</div>`;
  }
  $$('[data-task]',$('#projectBody')).forEach(b=>b.onclick=()=>openTask(b.dataset.task));
}

async function mutate(action,payload){
  try{ setSync('Saving…'); const out=await api(action,payload); state.data=out.state||out; setSync('Saved'); render(); }
  catch(err){ console.error(err); setSync('Save failed',true); alert('Could not save that change.'); }
}
function setSync(text,error=false){ const pill=$('#syncPill'); if(pill){ pill.textContent=text; pill.style.color=error?'#ff8395':'#82a0b6'; } }
function openNewTask(prefill=''){
  populateProjectSelects(); $('#newTitle').value=prefill; $('#newProject').value=''; $('#newPriority').value='2'; $('#newNext').value=''; $('#newTaskDialog').showModal(); setTimeout(()=>$('#newTitle').focus(),20);
}
async function createTaskFromDialog(e){
  e.preventDefault(); const title=$('#newTitle').value.trim(); if(!title) return;
  const projectId=$('#newProject').value||null,p=project(projectId);
  await mutate('createTask',{task:{title,projectId,area:p?.area||'Inbox',priority:Number($('#newPriority').value),status:'Open',nextAction:$('#newNext').value.trim(),source:'Task Manager'}}); $('#newTaskDialog').close();
}
async function quickCapture(){
  const el=$('#quickCaptureText'); const title=el?.value.trim(); if(!title) return;
  await mutate('createTask',{task:{title,area:'Inbox',projectId:null,priority:2,status:'Open',source:'Quick Capture'}}); if(el) el.value='';
}

function updateTimerDisplay(){ const el=$('#timerTime'); if(el) el.textContent=timerString(); const play=$('#timerPlay'); if(play) play.textContent=state.timerRunning?'Ⅱ':'▶'; }
function toggleTimer(){
  state.timerRunning=!state.timerRunning;
  if(state.timerRunning){ if(state.timerHandle) clearInterval(state.timerHandle); state.timerHandle=setInterval(()=>{ if(state.timerSeconds>0) state.timerSeconds--; else { state.timerRunning=false; clearInterval(state.timerHandle); } updateTimerDisplay(); },1000); }
  else if(state.timerHandle){ clearInterval(state.timerHandle); state.timerHandle=null; }
  updateTimerDisplay();
}
function resetTimer(){ state.timerRunning=false; if(state.timerHandle) clearInterval(state.timerHandle); state.timerHandle=null; state.timerSeconds=25*60; updateTimerDisplay(); }

async function init(){
  try{
    state.data=await api(); setSync('Private workspace');
    $('#searchInput').addEventListener('input',e=>{state.query=e.target.value.trim();render();});
    $$('.nav-btn').forEach(b=>b.addEventListener('click',()=>{state.view=b.dataset.view;render();}));
    $('#quickAddBtn').addEventListener('click',()=>openNewTask());
    $('#newTaskForm').addEventListener('submit',createTaskFromDialog); $('#newTaskClose').addEventListener('click',()=>$('#newTaskDialog').close()); $('#newTaskCancel').addEventListener('click',()=>$('#newTaskDialog').close());
    $('#saveTaskBtn').addEventListener('click',saveSelectedTask); $('#taskToggleDone').addEventListener('click',toggleSelectedTask);
    $$('[data-project-mode]').forEach(b=>b.addEventListener('click',()=>{state.projectMode=b.dataset.projectMode;renderProjectBody();}));
    render();
  }catch(err){ console.error(err); $('#viewRoot').innerHTML='<div class="page"><section class="panel"><h2>Could not load the task system</h2><p class="panel-sub">Refresh once. If it continues, the private storage connection needs attention.</p></section></div>'; setSync('Connection error',true); }
}

init();
