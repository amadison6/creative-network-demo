let microState = null;
const expandedParents = new Set();
let refreshQueued = false;

const q = (s, r = document) => r.querySelector(s);
const qa = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

async function taskApi(action, payload = {}) {
  const opts = action
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...payload }) }
    : { cache: 'no-store' };
  const response = await fetch('/api/state', opts);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function allTasks(){ return microState?.tasks || []; }
function taskById(id){ return allTasks().find(t => t.id === id); }
function microtasksFor(parentId){ return allTasks().filter(t => t.parentTaskId === parentId); }
function isMicrotask(id){ return Boolean(taskById(id)?.parentTaskId); }
function microProgress(parentId){
  const list = microtasksFor(parentId);
  const done = list.filter(t => t.microDone).length;
  return { list, done, total: list.length, percent: list.length ? Math.round(done / list.length * 100) : 0 };
}
function foldSignature(parentId){
  const { done, total } = microProgress(parentId);
  return `${done}:${total}:${expandedParents.has(parentId) ? 1 : 0}`;
}

async function refreshState(){
  try {
    microState = await taskApi();
    decorateAll();
    renderOpenDialogManager();
  } catch (error) {
    console.error('Microtask refresh failed', error);
  }
}

function queueRefresh(){
  if (refreshQueued) return;
  refreshQueued = true;
  setTimeout(async () => {
    refreshQueued = false;
    await refreshState();
  }, 90);
}

function hideMicrotasksFromPrimaryViews(){
  const ids = new Set(allTasks().filter(t => t.parentTaskId).map(t => t.id));
  if (!ids.size) return;
  qa('[data-task]').forEach(el => {
    if (!ids.has(el.dataset.task) || el.closest('.microtask-ui')) return;
    const wrapper = el.closest('article.task,.list-row,.priority-row,.step,.board-item,.waiting-item,.schedule-item');
    if (wrapper) wrapper.style.display = 'none';
    else el.style.display = 'none';
  });
}

function renderFold(parentId, color){
  const { list, done, total, percent } = microProgress(parentId);
  if (!total) return '';
  const open = expandedParents.has(parentId);
  return `<div class="microtask-fold microtask-ui ${open ? 'open' : ''}" data-microtask-fold="${esc(parentId)}" data-microtask-signature="${esc(foldSignature(parentId))}" style="--micro-color:${esc(color || '#62d6ff')}">
    <button class="microtask-toggle" type="button" data-microtask-toggle="${esc(parentId)}">
      <span class="micro-chevron">›</span><strong>Microtasks</strong>
      <span>${done}/${total} complete</span>
      <span class="microtask-count">${percent}%</span>
      <span class="microtask-mini-bar"><span style="width:${percent}%"></span></span>
    </button>
    <div class="microtask-list" ${open ? '' : 'hidden'}>
      ${list.map(item => `<div class="microtask-row ${item.microDone ? 'done' : ''}">
        <button type="button" class="microtask-check" data-micro-check="${esc(item.id)}" aria-label="${item.microDone ? 'Reopen' : 'Complete'} microtask">✓</button>
        <span class="microtask-title">${esc(item.title)}</span>
      </div>`).join('')}
    </div>
  </div>`;
}

function decorateTaskCards(){
  qa('article.task').forEach(card => {
    const taskButton = q('[data-task]', card);
    const parentId = taskButton?.dataset.task;
    if (!parentId || isMicrotask(parentId)) return;
    const { total } = microProgress(parentId);
    const selector = `[data-microtask-fold="${CSS.escape(parentId)}"]`;
    const existing = card.nextElementSibling?.matches?.(selector) ? card.nextElementSibling : document.querySelector(selector);
    if (!total) {
      existing?.remove();
      return;
    }
    const signature = foldSignature(parentId);
    if (existing?.dataset.microtaskSignature === signature) return;
    const color = getComputedStyle(card).getPropertyValue('--color').trim() || '#62d6ff';
    const shell = document.createElement('div');
    shell.innerHTML = renderFold(parentId, color);
    const fold = shell.firstElementChild;
    if (existing) existing.replaceWith(fold);
    else card.insertAdjacentElement('afterend', fold);
  });
}

function decorateProjectRows(){
  qa('.priority-row[data-task],.step[data-task],.board-item[data-task]').forEach(el => {
    const id = el.dataset.task;
    if (!id || isMicrotask(id)) return;
    const { done, total } = microProgress(id);
    const old = q('.microtask-progress-pill', el);
    if (!total) { old?.remove(); return; }
    const label = `${done}/${total} micro`;
    if (old && old.textContent !== label) old.textContent = label;
    else if (!old) el.insertAdjacentHTML('beforeend', `<span class="microtask-progress-pill microtask-ui">${label}</span>`);
  });
}

function decorateAll(){
  if (!microState) return;
  hideMicrotasksFromPrimaryViews();
  decorateTaskCards();
  decorateProjectRows();
  bindMicrotaskControls();
}

function bindMicrotaskControls(){
  qa('[data-microtask-toggle]').forEach(btn => {
    btn.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      const id = btn.dataset.microtaskToggle;
      if (expandedParents.has(id)) expandedParents.delete(id); else expandedParents.add(id);
      decorateTaskCards();
      bindMicrotaskControls();
    };
  });
  qa('[data-micro-check]').forEach(btn => {
    btn.onclick = async event => {
      event.preventDefault();
      event.stopPropagation();
      const item = taskById(btn.dataset.microCheck);
      if (!item) return;
      btn.disabled = true;
      try {
        const out = await taskApi('setMicrotaskDone', { taskId: item.id, done: !item.microDone });
        microState = out.state || out;
        decorateAll();
        renderOpenDialogManager();
      } catch (error) {
        console.error(error);
        btn.disabled = false;
      }
    };
  });
}

function selectedDialogTaskId(){
  const eyebrow = q('#taskDialogEyebrow');
  if (!eyebrow) return null;
  return eyebrow.textContent.split(' · ')[0].trim() || null;
}

function ensureManagerHost(){
  const dialog = q('#taskDialog');
  const actions = q('.dialog-actions', dialog);
  if (!dialog || !actions) return null;
  let host = q('#microtaskManager', dialog);
  if (!host) {
    host = document.createElement('section');
    host.id = 'microtaskManager';
    host.className = 'microtask-manager microtask-ui';
    actions.insertAdjacentElement('beforebegin', host);
  }
  return host;
}

function renderOpenDialogManager(){
  const dialog = q('#taskDialog');
  if (!dialog?.open || !microState) return;
  const id = selectedDialogTaskId();
  const task = taskById(id);
  const host = ensureManagerHost();
  if (!task || !host) return;

  if (task.parentTaskId) {
    const parent = taskById(task.parentTaskId);
    host.innerHTML = `<div class="microtask-parent-note"><strong>Microtask</strong>This checklist item belongs under ${esc(parent?.title || 'its parent task')}.</div>`;
    return;
  }

  const { list, done, total } = microProgress(task.id);
  host.innerHTML = `<div class="microtask-manager-head">
      <div><strong>Microtasks</strong><small>Keep checklist-level work tucked inside this larger task so the main view stays clean.</small></div>
      <span class="microtask-progress-pill">${done}/${total} complete</span>
    </div>
    <div class="microtask-manager-list">
      ${list.length ? list.map(item => `<div class="microtask-manager-row ${item.microDone ? 'done' : ''}">
        <button type="button" class="microtask-check" data-manager-check="${esc(item.id)}">✓</button>
        <span class="microtask-manager-title">${esc(item.title)}</span>
        <button type="button" class="microtask-delete" data-micro-delete="${esc(item.id)}" title="Remove microtask">×</button>
      </div>`).join('') : '<div class="empty">No microtasks yet. Add checklist items below when this task needs more detail.</div>'}
    </div>
    <div class="microtask-add">
      <textarea id="microtaskInput" placeholder="Add one per line — e.g. Pain & Hunger\nLA Blues\nAt Peace"></textarea>
      <button type="button" id="addMicrotasksBtn" class="btn primary">＋ Add</button>
    </div>
    <div class="microtask-hint">You can paste a whole checklist at once. Microtasks stay hidden from Today, Inbox, and the main project sequence.</div>`;

  qa('[data-manager-check]', host).forEach(btn => {
    btn.onclick = async () => {
      const item = taskById(btn.dataset.managerCheck); if (!item) return;
      btn.disabled = true;
      const out = await taskApi('setMicrotaskDone', { taskId: item.id, done: !item.microDone });
      microState = out.state || out;
      renderOpenDialogManager(); decorateAll();
    };
  });
  qa('[data-micro-delete]', host).forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Remove this microtask?')) return;
      const out = await taskApi('deleteMicrotask', { taskId: btn.dataset.microDelete });
      microState = out.state || out;
      renderOpenDialogManager(); decorateAll();
    };
  });
  q('#addMicrotasksBtn', host)?.addEventListener('click', async () => {
    const input = q('#microtaskInput', host);
    const titles = String(input?.value || '').split(/\n+/).map(x => x.trim()).filter(Boolean).slice(0,40);
    if (!titles.length) return;
    const addBtn = q('#addMicrotasksBtn', host); addBtn.disabled = true;
    try {
      for (const title of titles) {
        const out = await taskApi('createTask', { task: {
          title,
          parentTaskId: task.id,
          microDone: false,
          projectId: task.projectId || null,
          milestoneId: task.milestoneId || null,
          goalId: task.goalId || null,
          area: task.area || 'Inbox',
          priority: 3,
          status: 'Backlog',
          source: 'Microtask'
        }});
        microState = out.state || out;
      }
      if (input) input.value = '';
      expandedParents.add(task.id);
      renderOpenDialogManager(); decorateAll();
    } catch (error) {
      console.error(error);
      addBtn.disabled = false;
    }
  });
}

function mutationNeedsRefresh(mutations){
  return mutations.some(mutation => {
    const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes].filter(node => node.nodeType === 1);
    if (!changedNodes.length) return false;
    return changedNodes.some(node => !node.classList?.contains('microtask-ui') && !node.closest?.('.microtask-ui'));
  });
}

function observeApp(){
  const root = q('#viewRoot');
  if (root) new MutationObserver(mutations => {
    if (mutationNeedsRefresh(mutations)) queueRefresh();
  }).observe(root, { childList: true, subtree: true });
  const dialog = q('#taskDialog');
  if (dialog) new MutationObserver(() => {
    if (dialog.open) queueRefresh();
  }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
}

window.addEventListener('DOMContentLoaded', async () => {
  observeApp();
  await refreshState();
});