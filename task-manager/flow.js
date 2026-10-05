let flowState = null;
let flowReviewOpen = false;
let flowRefreshTimer = null;

const fqs = (s, r = document) => r.querySelector(s);
const fqsa = (s, r = document) => [...r.querySelectorAll(s)];
const fesc = (v = '') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const originalFetch = window.fetch.bind(window);

function selectedTaskId(){
  const eyebrow = fqs('#taskDialogEyebrow');
  return eyebrow?.textContent?.split(' · ')[0]?.trim() || null;
}
function flowPatchFromEditor(taskId){
  const host = fqs('#flowEditor');
  if (!host || host.dataset.taskId !== taskId) return null;
  return {
    designation: fqs('#flowDesignation',host)?.value || 'major',
    flowPhase: fqs('#flowPhase',host)?.value || 'later',
    flowOrder: Number(fqs('#flowOrder',host)?.value || 999),
    durationEstimate: fqs('#flowDuration',host)?.value?.trim() || '',
    timingType: fqs('#flowTimingType',host)?.value || 'flexible',
    earliestStart: fqs('#flowEarliest',host)?.value?.trim() || '',
    targetDate: fqs('#flowTargetDate',host)?.value || '',
    timingNote: fqs('#flowTimingNote',host)?.value?.trim() || ''
  };
}
window.fetch = async (input, init = {}) => {
  try {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (url.includes('/api/state') && String(init.method || 'GET').toUpperCase() === 'POST' && init.body) {
      const body = JSON.parse(init.body);
      if (body.action === 'updateTask' && body.taskId) {
        const flowPatch = flowPatchFromEditor(body.taskId);
        if (flowPatch) init = { ...init, body: JSON.stringify({ ...body, patch: { ...(body.patch || {}), ...flowPatch } }) };
      }
    }
  } catch (error) { console.warn('Flow save enrichment skipped', error); }
  return originalFetch(input, init);
};

async function flowApi(action, payload = {}){
  const options = action ? {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...payload})} : {cache:'no-store'};
  const response = await originalFetch('/api/state', options);
  if(!response.ok) throw new Error(await response.text());
  return response.json();
}
function fTasks(){ return flowState?.tasks || []; }
function fProjects(){ return flowState?.projects || []; }
function fTask(id){ return fTasks().find(t=>t.id===id); }
function fProject(id){ return fProjects().find(p=>p.id===id); }
function phaseOf(t){ return t.status === 'Waiting' ? 'waiting' : (t.flowPhase || 'later'); }
function phaseLabel(p){ return ({now:'NOW',next:'NEXT',later:'LATER',waiting:'WAITING'})[p] || 'LATER'; }
function timingLabel(type){ return ({hard:'Hard date',target:'Target',dependency:'Dependency',flexible:'Flexible'})[type] || 'Flexible'; }
function microProgress(id){ const list=fTasks().filter(t=>t.parentTaskId===id); const done=list.filter(t=>t.microDone).length; return {done,total:list.length}; }
function projectFamily(p){
  const ids = new Set([p.id]);
  fProjects().forEach(x=>{ if(x.parentProjectId===p.id) ids.add(x.id); });
  return ids;
}
function currentProject(){
  const title=fqs('#projectTitle')?.textContent?.trim();
  if(!title) return null;
  return fProjects().find(p=>p.title===title) || null;
}
function familyTasks(p){ const ids=projectFamily(p); return fTasks().filter(t=>ids.has(t.projectId) && !t.parentTaskId); }
function familyProjects(p){ return [p,...fProjects().filter(x=>x.parentProjectId===p.id)].filter(x=>familyTasks(p).some(t=>t.projectId===x.id)); }
function reviewTasks(p){ return familyTasks(p).filter(t=>t.classificationStatus==='proposed' && t.proposedDesignation); }
function visibleFlowTasks(projectId){
  return fTasks().filter(t=>t.projectId===projectId && !t.parentTaskId && t.status!=='Backlog' && !(t.classificationStatus==='proposed' && t.proposedDesignation));
}
function summaryCounts(p){
  const list=familyTasks(p).filter(t=>t.status!=='Done' && t.status!=='Backlog' && !(t.classificationStatus==='proposed' && t.proposedDesignation));
  return ['now','next','later','waiting'].reduce((acc,key)=>{acc[key]=list.filter(t=>phaseOf(t)===key).length;return acc;},{});
}

function flowStep(t, proxy){
  const micro=microProgress(t.id);
  const classes=['flow-step'];
  if(t.status==='Done') classes.push('done');
  if(phaseOf(t)==='now' && t.status!=='Done') classes.push('current');
  if(t.designation==='outcome') classes.push('outcome');
  const details=[];
  if(t.durationEstimate) details.push(`<span class="flow-pill">◷ ${fesc(t.durationEstimate)}</span>`);
  if(t.timingType==='dependency') details.push('<span class="flow-pill dep">↳ Dependency</span>');
  if(t.timingType==='hard') details.push('<span class="flow-pill hard">Hard date</span>');
  if(micro.total) details.push(`<span class="flow-pill micro">▾ ${micro.done}/${micro.total} micro</span>`);
  const timing = t.targetDate ? `Target ${t.targetDate}` : (t.earliestStart || t.dueText || timingLabel(t.timingType));
  return `<button type="button" class="${classes.join(' ')}" data-flow-task="${fesc(t.id)}">
    <strong>${fesc(t.title)}</strong>
    <small>${fesc(timing)}</small>
    <div class="flow-step-meta">${details.join('')}</div>
  </button>`;
}
function renderReview(p){
  const list=reviewTasks(p);
  if(!list.length) return '';
  return `<section class="flow-review-banner">
    <div class="flow-review-head"><div><strong>${list.length} classification${list.length===1?'':'s'} ready for review</strong><div class="panel-sub">Nothing moves into a microtask or outcome role until you approve it.</div></div><button type="button" class="flow-review-toggle" id="flowReviewToggle">${flowReviewOpen?'Hide':'Review'} proposals</button></div>
    ${flowReviewOpen?`<div class="flow-review-list">${list.map(t=>{
      const parent=fTask(t.proposedParentTaskId);
      const proposal=t.proposedDesignation==='micro'?'Microtask':t.proposedDesignation==='outcome'?'Project outcome/header':'Major task';
      return `<div class="flow-review-row"><div><strong>${fesc(t.title)}</strong><small>Proposed: ${proposal}${parent?` → under ${fesc(parent.title)}`:''} · ${fesc(t.classificationConfidence||'')} confidence</small></div><div class="flow-review-actions"><button type="button" class="accept" data-flow-accept="${fesc(t.id)}">Accept</button><button type="button" data-flow-keep="${fesc(t.id)}">Keep major</button></div></div>`;
    }).join('')}</div>`:''}
  </section>`;
}
function renderFlowView(p, proxies){
  const counts=summaryCounts(p);
  const lanes=familyProjects(p).map(lane=>{
    const list=visibleFlowTasks(lane.id).sort((a,b)=>(a.flowOrder??999)-(b.flowOrder??999));
    if(!list.length) return '';
    return `<section class="flow-lane"><div class="flow-lane-head"><div><h4>${fesc(lane.title)}</h4><small>${fesc(lane.summary||'')}</small></div><span class="flow-chip"><strong>${list.filter(t=>t.status!=='Done').length}</strong> active</span></div><div class="flow-track">${['now','next','later','waiting'].map(ph=>`<div class="flow-column ${ph}"><div class="flow-column-head">${phaseLabel(ph)}</div><div class="flow-stack">${list.filter(t=>phaseOf(t)===ph).map(t=>flowStep(t,proxies.get(t.id))).join('')||'<div class="panel-sub">—</div>'}</div></div>`).join('')}</div></section>`;
  }).join('');
  return `<div class="flow-summary"><span class="flow-chip"><strong>${counts.now||0}</strong> Now</span><span class="flow-chip"><strong>${counts.next||0}</strong> Next</span><span class="flow-chip"><strong>${counts.later||0}</strong> Later</span><span class="flow-chip"><strong>${counts.waiting||0}</strong> Waiting</span></div>${renderReview(p)}<div class="flow-lanes">${lanes||'<div class="empty">No sequenced work yet.</div>'}</div>`;
}

function enhanceSequenceView(){
  const dialog=fqs('#projectDialog'); const body=fqs('#projectBody');
  if(!dialog?.open || !body) return;
  const sequenceButton=fqs('[data-project-mode="sequence"]');
  if(!sequenceButton?.classList.contains('active')) return;
  if(body.dataset.flowEnhanced==='1') return;
  const p=currentProject(); if(!p || !flowState) return;
  const proxies=new Map();
  fqsa('[data-task]',body).forEach(el=>{ if(el.dataset.task && typeof el.onclick==='function') proxies.set(el.dataset.task,el.onclick); });
  body.innerHTML=renderFlowView(p,proxies); body.dataset.flowEnhanced='1';
  fqsa('[data-flow-task]',body).forEach(btn=>btn.onclick=()=>{
    const handler=proxies.get(btn.dataset.flowTask);
    if(handler) handler.call(btn,new MouseEvent('click'));
    else {
      const proxy=fqs(`[data-task="${CSS.escape(btn.dataset.flowTask)}"]`);
      proxy?.click();
    }
  });
  fqs('#flowReviewToggle',body)?.addEventListener('click',()=>{flowReviewOpen=!flowReviewOpen;body.dataset.flowEnhanced='';enhanceSequenceView();});
  fqsa('[data-flow-accept]',body).forEach(btn=>btn.onclick=async()=>{btn.disabled=true;await flowApi('verifyClassification',{taskId:btn.dataset.flowAccept,accept:true});location.reload();});
  fqsa('[data-flow-keep]',body).forEach(btn=>btn.onclick=async()=>{btn.disabled=true;await flowApi('verifyClassification',{taskId:btn.dataset.flowKeep,accept:false});location.reload();});
}

function decorateTaskCards(){
  if(!flowState) return;
  fqsa('article.task').forEach(card=>{
    const button=fqs('[data-task]',card); const t=fTask(button?.dataset.task); if(!t || t.parentTaskId) return;
    const meta=fqs('.task-meta',card); if(!meta) return;
    let badge=fqs('.flow-badge-inline',meta);
    if(!badge){ badge=document.createElement('span'); badge.className='flow-badge-inline'; meta.prepend(badge); }
    badge.textContent=phaseLabel(phaseOf(t));
  });
}
function ensureFlowEditor(){
  const dialog=fqs('#taskDialog'); if(!dialog?.open || !flowState) return;
  const id=selectedTaskId(); const t=fTask(id); if(!t) return;
  let host=fqs('#flowEditor',dialog);
  if(!host){ host=document.createElement('section');host.id='flowEditor';host.className='flow-editor';fqs('#taskContext',dialog)?.insertAdjacentElement('beforebegin',host); }
  if(host.dataset.taskId===id) return;
  host.dataset.taskId=id;
  if(t.parentTaskId){ host.innerHTML='<h3>Flow & timing</h3><p>This is a microtask, so its timing is inherited from the major task above it.</p>';return; }
  host.innerHTML=`<h3>Flow & timing</h3><p>Control where this appears in the project flow. Saving the task also saves these fields.</p><div class="flow-editor-grid">
    <label>Designation<select id="flowDesignation"><option value="major">Major task</option><option value="outcome">Outcome / header</option></select></label>
    <label>Stage<select id="flowPhase"><option value="now">Now</option><option value="next">Next</option><option value="later">Later</option><option value="waiting">Waiting</option></select></label>
    <label>Sequence<input id="flowOrder" type="number" min="1" step="1"></label>
    <label>Duration estimate<input id="flowDuration" placeholder="45 min / 2 days / 1 week"></label>
    <label>Timing type<select id="flowTimingType"><option value="dependency">Dependency</option><option value="target">Target</option><option value="hard">Hard date</option><option value="flexible">Flexible</option></select></label>
    <label>Target date<input id="flowTargetDate" type="date"></label>
    <label class="full">Earliest start / trigger<input id="flowEarliest" placeholder="After the shoot / once documents arrive"></label>
    <label class="full">Timing note<input id="flowTimingNote" placeholder="Why this timing matters"></label>
  </div>`;
  fqs('#flowDesignation',host).value=t.designation||'major'; fqs('#flowPhase',host).value=phaseOf(t); fqs('#flowOrder',host).value=t.flowOrder??999; fqs('#flowDuration',host).value=t.durationEstimate||''; fqs('#flowTimingType',host).value=t.timingType||'flexible'; fqs('#flowTargetDate',host).value=t.targetDate||''; fqs('#flowEarliest',host).value=t.earliestStart||''; fqs('#flowTimingNote',host).value=t.timingNote||'';
}

async function refreshFlowState(){
  try{ flowState=await flowApi(); decorateTaskCards(); ensureFlowEditor(); enhanceSequenceView(); }
  catch(error){ console.error('Flow layer refresh failed',error); }
}
function queueFlowRefresh(){ clearTimeout(flowRefreshTimer); flowRefreshTimer=setTimeout(refreshFlowState,80); }
function observeFlow(){
  const root=fqs('#viewRoot'); if(root)new MutationObserver(queueFlowRefresh).observe(root,{childList:true,subtree:true});
  const project=fqs('#projectDialog'); if(project)new MutationObserver(queueFlowRefresh).observe(project,{attributes:true,attributeFilter:['open']});
  const task=fqs('#taskDialog'); if(task)new MutationObserver(queueFlowRefresh).observe(task,{attributes:true,attributeFilter:['open']});
  const body=fqs('#projectBody'); if(body)new MutationObserver(()=>{ if(body.dataset.flowEnhanced!=='1') queueFlowRefresh(); }).observe(body,{childList:true,subtree:true});
}
window.addEventListener('DOMContentLoaded',async()=>{observeFlow();await refreshFlowState();});
