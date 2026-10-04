import { get, put } from '@vercel/blob';

const STATE_PATH = 'master-task-ledger/state.json';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}
function normalizeStatus(status = 'Open') {
  const value = String(status).toLowerCase();
  if (value === 'done' || value === 'completed') return 'Done';
  if (value === 'waiting' || value === 'blocked') return 'Waiting';
  if (value === 'in progress' || value === 'in_progress') return 'In Progress';
  if (value === 'backlog') return 'Backlog';
  return 'Open';
}
function cleanTask(task) {
  const now = new Date().toISOString();
  return {
    id: String(task.id || `A-${Date.now()}`), title: String(task.title || 'Untitled task').slice(0, 500),
    area: String(task.area || 'Inbox').slice(0, 120), projectId: task.projectId ? String(task.projectId) : null,
    milestoneId: task.milestoneId ? String(task.milestoneId) : null, goalId: task.goalId ? String(task.goalId) : null,
    priority: Math.max(1, Math.min(3, Number(task.priority || 2))), status: normalizeStatus(task.status),
    dueText: task.dueText ? String(task.dueText).slice(0, 250) : '', dueDate: task.dueDate || null,
    nextAction: task.nextAction ? String(task.nextAction).slice(0, 1000) : '', waitingOn: task.waitingOn ? String(task.waitingOn).slice(0, 500) : '',
    notes: task.notes ? String(task.notes).slice(0, 5000) : '', source: task.source ? String(task.source).slice(0, 250) : 'Task Manager',
    people: Array.isArray(task.people) ? task.people.map(String).slice(0, 30) : [], resources: Array.isArray(task.resources) ? task.resources.slice(0, 30) : [],
    dependsOn: Array.isArray(task.dependsOn) ? task.dependsOn.map(String).slice(0, 30) : [], todayRank: Number.isFinite(Number(task.todayRank)) ? Number(task.todayRank) : null,
    effort: task.effort ? String(task.effort).slice(0, 80) : '', createdAt: task.createdAt || now, updatedAt: now, completedAt: task.completedAt || null
  };
}
async function readBlobState() {
  try {
    const result = await get(STATE_PATH, { access: 'private' });
    if (!result || result.statusCode !== 200) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text);
  } catch { return null; }
}
function seedState() {
  const raw = process.env.TASK_SEED_JSON;
  if (!raw) throw new Error('TASK_SEED_JSON is not configured');
  const parsed = JSON.parse(raw);
  return { revision: Number(parsed.revision || 1), updatedAt: new Date().toISOString(), ...parsed };
}
async function writeState(state) {
  state.revision = Number(state.revision || 0) + 1; state.updatedAt = new Date().toISOString();
  await put(STATE_PATH, JSON.stringify(state), { access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json; charset=utf-8', cacheControlMaxAge: 0 });
  return state;
}
async function loadState() { const existing = await readBlobState(); if (existing) return existing; return writeState(seedState()); }
function nextTaskId(tasks) { const nums = tasks.map(t => /^A-(\d+)$/.exec(t.id)?.[1]).filter(Boolean).map(Number); return `A-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`; }
function nextProjectId(projects, title) { const base=String(title||'project').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)||'project';let id=base,n=2;const ids=new Set(projects.map(p=>p.id));while(ids.has(id))id=`${base}-${n++}`;return id; }

export default async function handler(req, res) {
  try {
    let state = await loadState();
    if (req.method === 'GET') return json(res, 200, state);
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); const action = body.action;
    if (action === 'createTask') {
      const task = cleanTask({ ...body.task, id: nextTaskId(state.tasks || []) }); state.tasks = [task, ...(state.tasks || [])]; state = await writeState(state); return json(res, 200, { state, task });
    }
    if (action === 'updateTask') {
      const idx=(state.tasks||[]).findIndex(t=>t.id===body.taskId); if(idx<0)return json(res,404,{error:'Task not found'}); const original=state.tasks[idx];
      state.tasks[idx]=cleanTask({...original,...(body.patch||{}),id:original.id,createdAt:original.createdAt,completedAt:original.completedAt}); state=await writeState(state); return json(res,200,{state,task:state.tasks[idx]});
    }
    if (action === 'completeTask' || action === 'reopenTask') {
      const idx=(state.tasks||[]).findIndex(t=>t.id===body.taskId); if(idx<0)return json(res,404,{error:'Task not found'}); const done=action==='completeTask';
      state.tasks[idx]={...state.tasks[idx],status:done?'Done':'Open',completedAt:done?new Date().toISOString():null,updatedAt:new Date().toISOString()}; state=await writeState(state); return json(res,200,{state,task:state.tasks[idx]});
    }
    if (action === 'createProject') {
      const title=String(body.project?.title||'').trim(); if(!title)return json(res,400,{error:'Project title required'});
      const project={id:nextProjectId(state.projects||[],title),title,area:String(body.project?.area||'General').slice(0,120),goalId:body.project?.goalId||null,parentProjectId:body.project?.parentProjectId||null,summary:String(body.project?.summary||'').slice(0,1200),color:body.project?.color||'#67d8ff',priority:Math.max(1,Math.min(9,Number(body.project?.priority||5))),archived:false};
      state.projects=[...(state.projects||[]),project];state=await writeState(state);return json(res,200,{state,project});
    }
    if (action === 'updateProject') {
      const idx=(state.projects||[]).findIndex(p=>p.id===body.projectId);if(idx<0)return json(res,404,{error:'Project not found'});state.projects[idx]={...state.projects[idx],...(body.patch||{}),id:state.projects[idx].id};state=await writeState(state);return json(res,200,{state,project:state.projects[idx]});
    }
    if (action === 'resetFromSeed') { state=await writeState(seedState()); return json(res,200,{state}); }
    return json(res,400,{error:'Unknown action'});
  } catch (error) { console.error(error); return json(res,500,{error:'Task state operation failed',detail:String(error?.message||error)}); }
}
