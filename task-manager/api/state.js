import { get, put } from '@vercel/blob';
import { gunzipSync } from 'node:zlib';

const STATE_PATH = 'master-task-ledger/state.json';
const PROFILE_ALIASES = Object.freeze({ julio: 'julio_hansen' });

const FLOW_DEFAULTS = Object.freeze({
  'T-004': { designation:'major', proposedDesignation:'outcome', classificationStatus:'proposed', classificationConfidence:'high', flowPhase:'now', flowOrder:1, durationEstimate:'Ongoing', timingType:'target', timingNote:'Top-level album outcome; review whether it should remain a visible task or become the project outcome.' },
  'T-009': { designation:'major', proposedDesignation:'outcome', classificationStatus:'proposed', classificationConfidence:'medium', flowPhase:'next', flowOrder:1, durationEstimate:'30–60 min', timingType:'dependency', timingNote:'Broad loan-access umbrella; specific accounts live underneath as independent waiting tasks.' },
  'T-011': { designation:'major', proposedDesignation:'outcome', classificationStatus:'proposed', classificationConfidence:'high', flowPhase:'now', flowOrder:1, durationEstimate:'Ongoing', timingType:'target', timingNote:'Remote-income goal/workstream; application actions should carry the day-to-day work.' },
  'T-019': { designation:'major', proposedDesignation:'outcome', classificationStatus:'proposed', classificationConfidence:'high', flowPhase:'now', flowOrder:1, durationEstimate:'Ongoing', timingType:'dependency', timingNote:'Broad refinance/P&L workstream; the September close chain carries the actual sequence.' },
  'T-005': { designation:'major', proposedDesignation:'outcome', classificationStatus:'proposed', classificationConfidence:'medium', flowPhase:'later', flowOrder:1, durationEstimate:'Multi-session', timingType:'target' },
  'T-008': { designation:'major', proposedDesignation:'outcome', classificationStatus:'proposed', classificationConfidence:'medium', flowPhase:'later', flowOrder:1, durationEstimate:'Ongoing', timingType:'flexible' },

  'A-001': { designation:'major', classificationStatus:'verified', flowPhase:'now', flowOrder:1, durationEstimate:'1–2 hrs', timingType:'target', timingNote:'Complete prep before scheduling the strategy follow-up.' },
  'A-002': { designation:'major', classificationStatus:'verified', flowPhase:'next', flowOrder:2, durationEstimate:'1–2 hrs', timingType:'target' },
  'A-003': { designation:'major', proposedDesignation:'micro', proposedParentTaskId:'A-001', classificationStatus:'proposed', classificationConfidence:'high', flowPhase:'now', flowOrder:11, durationEstimate:'10 min', timingType:'dependency' },
  'A-004': { designation:'major', proposedDesignation:'micro', proposedParentTaskId:'A-001', classificationStatus:'proposed', classificationConfidence:'medium', flowPhase:'now', flowOrder:12, durationEstimate:'20–30 min', timingType:'dependency' },
  'A-005': { designation:'major', classificationStatus:'verified', flowPhase:'next', flowOrder:3, durationEstimate:'15–30 min', timingType:'dependency', timingNote:'Schedule only after the prep packet is ready.' },
  'A-006': { designation:'major', proposedDesignation:'micro', proposedParentTaskId:'A-001', classificationStatus:'proposed', classificationConfidence:'high', flowPhase:'now', flowOrder:13, durationEstimate:'20–30 min', timingType:'dependency' },
  'A-007': { designation:'major', proposedDesignation:'micro', proposedParentTaskId:'A-001', classificationStatus:'proposed', classificationConfidence:'high', flowPhase:'now', flowOrder:14, durationEstimate:'15–20 min', timingType:'dependency' },
  'A-008': { designation:'major', proposedDesignation:'micro', proposedParentTaskId:'A-001', classificationStatus:'proposed', classificationConfidence:'high', flowPhase:'now', flowOrder:15, durationEstimate:'15–20 min', timingType:'dependency' },
  'A-009': { designation:'major', proposedDesignation:'micro', proposedParentTaskId:'A-001', classificationStatus:'proposed', classificationConfidence:'high', flowPhase:'now', flowOrder:16, durationEstimate:'20 min', timingType:'dependency' },
  'A-010': { designation:'major', proposedDesignation:'micro', proposedParentTaskId:'A-001', classificationStatus:'proposed', classificationConfidence:'high', flowPhase:'now', flowOrder:17, durationEstimate:'20–30 min', timingType:'dependency' },

  'T-023': { designation:'major', classificationStatus:'verified', flowPhase:'now', flowOrder:1, durationEstimate:'60–90 min', timingType:'target', timingNote:'Current CLA bottleneck.' },
  'T-031': { designation:'major', classificationStatus:'verified', flowPhase:'next', flowOrder:2, durationEstimate:'60–90 min', timingType:'dependency', earliestStart:'After September transaction review' },
  'T-032': { designation:'major', classificationStatus:'verified', flowPhase:'next', flowOrder:3, durationEstimate:'60–90 min', timingType:'dependency', earliestStart:'After September P&L is final' },
  'T-033': { designation:'major', classificationStatus:'verified', flowPhase:'later', flowOrder:4, durationEstimate:'1–2 hrs', timingType:'dependency', earliestStart:'After YTD financials are updated' },
  'T-034': { designation:'major', classificationStatus:'verified', flowPhase:'later', flowOrder:5, durationEstimate:'30–60 min', timingType:'dependency', earliestStart:'After tax package is complete' },
  'T-016': { designation:'major', classificationStatus:'verified', flowPhase:'waiting', flowOrder:1, durationEstimate:'15–30 min once access arrives', timingType:'dependency' },
  'T-017': { designation:'major', classificationStatus:'verified', flowPhase:'waiting', flowOrder:1, durationEstimate:'15–30 min once access arrives', timingType:'dependency' },
  'T-018': { designation:'major', classificationStatus:'verified', flowPhase:'later', flowOrder:1, durationEstimate:'2–4 hrs research', timingType:'flexible' },

  'T-024': { designation:'major', classificationStatus:'verified', flowPhase:'now', flowOrder:1, durationEstimate:'30–45 min', timingType:'target', timingNote:'Translate the rooftop scout into concrete shot decisions.' },
  'T-027': { designation:'major', classificationStatus:'verified', flowPhase:'next', flowOrder:2, durationEstimate:'1–2 days', timingType:'dependency', earliestStart:'After scout notes are organized' },
  'T-028': { designation:'major', classificationStatus:'verified', flowPhase:'later', flowOrder:3, durationEstimate:'1 shoot day', timingType:'dependency', earliestStart:'After shoot plan and date are locked' },
  'T-029': { designation:'major', classificationStatus:'verified', flowPhase:'later', flowOrder:4, durationEstimate:'5–7 days', timingType:'dependency', earliestStart:'After the shoot' },
  'T-030': { designation:'major', classificationStatus:'verified', flowPhase:'later', flowOrder:5, durationEstimate:'Release day', timingType:'dependency', earliestStart:'After final edit approval' },
  'T-025': { designation:'major', classificationStatus:'verified', flowPhase:'later', flowOrder:1, durationEstimate:'10 min', timingType:'target' },
  'T-026': { designation:'major', classificationStatus:'verified', flowPhase:'now', flowOrder:1, durationEstimate:'30–45 min', timingType:'target' },
  'T-012': { designation:'major', classificationStatus:'verified', flowPhase:'later', flowOrder:1, durationEstimate:'1–2 hrs', timingType:'target' },
  'T-001': { designation:'major', classificationStatus:'verified', flowPhase:'later', flowOrder:1, durationEstimate:'10–15 min', timingType:'flexible' },
  'T-007': { designation:'major', classificationStatus:'verified', flowPhase:'later', flowOrder:1, durationEstimate:'10–15 min', timingType:'flexible' },
  'T-015': { designation:'major', classificationStatus:'verified', flowPhase:'later', flowOrder:2, durationEstimate:'30–60 min', timingType:'flexible' },
  'T-013': { designation:'major', classificationStatus:'verified', flowPhase:'now', flowOrder:1, durationEstimate:'Build session', timingType:'target' }
});

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
function normalizeProfileIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).map(id => PROFILE_ALIASES[id] || id).filter(Boolean))].slice(0, 40);
}
function normalizePhase(value, status) {
  const v = String(value || '').toLowerCase();
  if (status === 'Waiting') return 'waiting';
  if (['now','next','later','waiting'].includes(v)) return v;
  return 'later';
}
function normalizeDesignation(value, parentTaskId) {
  if (parentTaskId) return 'micro';
  return ['major','outcome','micro'].includes(value) ? value : 'major';
}
function cleanTask(task) {
  const now = new Date().toISOString();
  const profileIds = normalizeProfileIds(task.profileIds || task.people || []);
  const parentTaskId = task.parentTaskId ? String(task.parentTaskId) : null;
  const status = normalizeStatus(task.status);
  return {
    id: String(task.id || `A-${Date.now()}`), title: String(task.title || 'Untitled task').slice(0, 500),
    area: String(task.area || 'Inbox').slice(0, 120), projectId: task.projectId ? String(task.projectId) : null,
    milestoneId: task.milestoneId ? String(task.milestoneId) : null, goalId: task.goalId ? String(task.goalId) : null,
    parentTaskId, microDone: Boolean(task.microDone),
    designation: normalizeDesignation(task.designation, parentTaskId),
    proposedDesignation: task.proposedDesignation ? String(task.proposedDesignation).slice(0, 30) : null,
    proposedParentTaskId: task.proposedParentTaskId ? String(task.proposedParentTaskId) : null,
    classificationStatus: task.classificationStatus === 'proposed' ? 'proposed' : 'verified',
    classificationConfidence: ['high','medium','low'].includes(task.classificationConfidence) ? task.classificationConfidence : null,
    flowPhase: normalizePhase(task.flowPhase, status),
    flowOrder: Number.isFinite(Number(task.flowOrder)) ? Number(task.flowOrder) : 999,
    durationEstimate: task.durationEstimate ? String(task.durationEstimate).slice(0, 120) : (task.effort ? String(task.effort).slice(0,120) : ''),
    timingType: ['hard','target','dependency','flexible'].includes(task.timingType) ? task.timingType : 'flexible',
    earliestStart: task.earliestStart ? String(task.earliestStart).slice(0, 250) : '',
    targetDate: task.targetDate ? String(task.targetDate).slice(0, 40) : '',
    timingNote: task.timingNote ? String(task.timingNote).slice(0, 800) : '',
    priority: Math.max(1, Math.min(3, Number(task.priority || 2))), status,
    dueText: task.dueText ? String(task.dueText).slice(0, 250) : '', dueDate: task.dueDate || null,
    nextAction: task.nextAction ? String(task.nextAction).slice(0, 1000) : '', waitingOn: task.waitingOn ? String(task.waitingOn).slice(0, 500) : '',
    notes: task.notes ? String(task.notes).slice(0, 5000) : '', source: task.source ? String(task.source).slice(0, 250) : 'Task Manager',
    profileIds, people: profileIds,
    resources: Array.isArray(task.resources) ? task.resources.slice(0, 30) : [],
    dependsOn: Array.isArray(task.dependsOn) ? task.dependsOn.map(String).slice(0, 30) : [], todayRank: Number.isFinite(Number(task.todayRank)) ? Number(task.todayRank) : null,
    effort: task.effort ? String(task.effort).slice(0, 80) : '', createdAt: task.createdAt || now, updatedAt: task.updatedAt || now, completedAt: task.completedAt || null
  };
}
function withFlowDefaults(task) {
  const defaults = FLOW_DEFAULTS[task.id] || {};
  const merged = { ...defaults, ...task };
  if (task.parentTaskId) {
    merged.designation = 'micro';
    merged.classificationStatus = 'verified';
    merged.proposedDesignation = null;
    merged.proposedParentTaskId = null;
  }
  return cleanTask(merged);
}
function normalizeState(state) {
  let changed = false;
  const tasks = (state.tasks || []).map(task => {
    const normalized = withFlowDefaults(task);
    if (JSON.stringify(task) !== JSON.stringify(normalized)) changed = true;
    return normalized;
  });
  const next = {
    ...state,
    tasks,
    integration: {
      ...(state.integration || {}),
      networkHq: {
        ...((state.integration || {}).networkHq || {}),
        canonicalProfileLinks: true,
        sourceOfTruth: 'pending-d1-cutover'
      }
    }
  };
  if (!state.integration?.networkHq?.canonicalProfileLinks) changed = true;
  return { state: next, changed };
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
  const compressed = process.env.TASK_SEED_GZIP_B64;
  if (compressed) {
    const text = gunzipSync(Buffer.from(compressed, 'base64')).toString('utf8');
    const parsed = JSON.parse(text);
    return { revision: Number(parsed.revision || 1), updatedAt: new Date().toISOString(), ...parsed };
  }
  const raw = process.env.TASK_SEED_JSON;
  if (!raw) throw new Error('TASK_SEED_GZIP_B64 or TASK_SEED_JSON is not configured');
  const parsed = JSON.parse(raw);
  return { revision: Number(parsed.revision || 1), updatedAt: new Date().toISOString(), ...parsed };
}
async function writeState(state) {
  state.revision = Number(state.revision || 0) + 1; state.updatedAt = new Date().toISOString();
  await put(STATE_PATH, JSON.stringify(state), { access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json; charset=utf-8', cacheControlMaxAge: 0 });
  return state;
}
async function loadState() {
  const existing = await readBlobState();
  const base = existing || seedState();
  const normalized = normalizeState(base);
  if (!existing || normalized.changed) return writeState(normalized.state);
  return normalized.state;
}
function nextTaskId(tasks) { const nums = tasks.map(t => /^A-(\d+)$/.exec(t.id)?.[1]).filter(Boolean).map(Number); return `A-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`; }
function nextProjectId(projects, title) { const base=String(title||'project').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)||'project';let id=base,n=2;const ids=new Set(projects.map(p=>p.id));while(ids.has(id))id=`${base}-${n++}`;return id; }

export default async function handler(req, res) {
  try {
    let state = await loadState();
    if (req.method === 'GET') return json(res, 200, state);
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); const action = body.action;
    if (action === 'createTask') {
      const requestedParentId = body.task?.parentTaskId ? String(body.task.parentTaskId) : null;
      if (requestedParentId) {
        const parent = (state.tasks || []).find(t => t.id === requestedParentId);
        if (!parent) return json(res, 400, { error: 'Parent task not found' });
        if (parent.parentTaskId) return json(res, 400, { error: 'Microtasks support one nested level only' });
      }
      const task = cleanTask({ ...body.task, id: nextTaskId(state.tasks || []) }); state.tasks = [task, ...(state.tasks || [])]; state = await writeState(state); return json(res, 200, { state, task });
    }
    if (action === 'updateTask') {
      const idx=(state.tasks||[]).findIndex(t=>t.id===body.taskId); if(idx<0)return json(res,404,{error:'Task not found'}); const original=state.tasks[idx];
      state.tasks[idx]=cleanTask({...original,...(body.patch||{}),id:original.id,createdAt:original.createdAt,completedAt:original.completedAt,updatedAt:new Date().toISOString()}); state=await writeState(state); return json(res,200,{state,task:state.tasks[idx]});
    }
    if (action === 'verifyClassification') {
      const idx=(state.tasks||[]).findIndex(t=>t.id===body.taskId); if(idx<0)return json(res,404,{error:'Task not found'});
      const task=state.tasks[idx]; const accept=Boolean(body.accept);
      if (!task.proposedDesignation) return json(res,400,{error:'No proposed classification'});
      if (accept && task.proposedDesignation === 'micro') {
        const parentId=task.proposedParentTaskId; const parent=(state.tasks||[]).find(t=>t.id===parentId);
        if(!parent || parent.parentTaskId)return json(res,400,{error:'Proposed parent is invalid'});
        state.tasks[idx]=cleanTask({...task,parentTaskId:parentId,designation:'micro',classificationStatus:'verified',proposedDesignation:null,proposedParentTaskId:null,status:'Backlog',updatedAt:new Date().toISOString()});
      } else if (accept) {
        state.tasks[idx]=cleanTask({...task,designation:task.proposedDesignation,classificationStatus:'verified',proposedDesignation:null,proposedParentTaskId:null,updatedAt:new Date().toISOString()});
      } else {
        state.tasks[idx]=cleanTask({...task,designation:'major',classificationStatus:'verified',proposedDesignation:null,proposedParentTaskId:null,updatedAt:new Date().toISOString()});
      }
      state=await writeState(state); return json(res,200,{state,task:state.tasks[idx]});
    }
    if (action === 'linkTaskProfiles') {
      const idx=(state.tasks||[]).findIndex(t=>t.id===body.taskId); if(idx<0)return json(res,404,{error:'Task not found'});
      const profileIds=normalizeProfileIds(body.profileIds||[]); state.tasks[idx]={...state.tasks[idx],profileIds,people:profileIds,updatedAt:new Date().toISOString()}; state=await writeState(state); return json(res,200,{state,task:state.tasks[idx]});
    }
    if (action === 'setMicrotaskDone') {
      const idx=(state.tasks||[]).findIndex(t=>t.id===body.taskId); if(idx<0)return json(res,404,{error:'Task not found'});
      if(!state.tasks[idx].parentTaskId)return json(res,400,{error:'Task is not a microtask'});
      state.tasks[idx]={...state.tasks[idx],microDone:Boolean(body.done),status:'Backlog',updatedAt:new Date().toISOString()}; state=await writeState(state); return json(res,200,{state,task:state.tasks[idx]});
    }
    if (action === 'deleteMicrotask') {
      const idx=(state.tasks||[]).findIndex(t=>t.id===body.taskId); if(idx<0)return json(res,404,{error:'Task not found'});
      if(!state.tasks[idx].parentTaskId)return json(res,400,{error:'Only microtasks can be removed this way'});
      const [task]=state.tasks.splice(idx,1); state=await writeState(state); return json(res,200,{state,task});
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
    if (action === 'resetFromSeed') { const normalized=normalizeState(seedState()).state; state=await writeState(normalized); return json(res,200,{state}); }
    return json(res,400,{error:'Unknown action'});
  } catch (error) { console.error(error); return json(res,500,{error:'Task state operation failed',detail:String(error?.message||error)}); }
}
