import { get, put } from '@vercel/blob';
import { gunzipSync } from 'node:zlib';

const STATE_PATH = 'master-task-ledger/state.json';
const PROFILE_ALIASES = Object.freeze({ julio: 'julio_hansen' });
const HIERARCHY_VERSION = 1;

const DEFAULT_HUBS = Object.freeze([
  { id:'h-cla', title:'Creative Learning Academy', summary:'School operations, financial reporting, debt, taxes, funding opportunities and operating systems.', color:'#68d391', priority:1, archived:false },
  { id:'h-gc', title:"God's Contraband", summary:'The ongoing collective: releases, visuals, live work, strategy and business.', color:'#c084fc', priority:2, archived:false },
  { id:'h-career', title:'Career & Income', summary:'Remote bookkeeping, client work and personal income development.', color:'#60a5fa', priority:3, archived:false },
  { id:'h-network-hq', title:'Network HQ', summary:'The operating system for the creative network, task system and connected tools.', color:'#67e8f9', priority:4, archived:false },
  { id:'h-creative-network', title:'Creative Network', summary:'Collaborator development, relationship follow-ups and creative opportunities outside a single release.', color:'#f59e0b', priority:5, archived:false },
  { id:'h-everything-fades', title:'Everything Fades', summary:'The ongoing vintage business, inventory, ownership, brand and operating structure.', color:'#fb7185', priority:6, archived:false }
]);

const PROJECT_HUB_DEFAULTS = Object.freeze({
  'p-cla-financials':'h-cla','p-cla-refinance':'h-cla','p-cla-loans':'h-cla','p-cla-texas':'h-cla','p-cla-nps':'h-cla','p-cla-reporting':'h-cla','p-cla-taxes':'h-cla',
  'p-gc-release':'h-gc','p-gc-unstoppable':'h-gc','p-gc-album':'h-gc','p-gc-rollout':'h-gc','p-gc-live':'h-gc',
  'p-career-remote':'h-career',
  'p-network':'h-creative-network','p-network-profiles':'h-creative-network','p-network-camille':'h-creative-network','p-network-free':'h-creative-network','p-network-cam':'h-creative-network','p-network-relationships':'h-creative-network',
  'p-everything-fades':'h-everything-fades',
  'p-task-manager':'h-network-hq'
});

const FLOW_DEFAULTS = Object.freeze({
  'T-004': { designation:'major', proposedDesignation:'outcome', classificationStatus:'proposed', classificationConfidence:'high', flowPhase:'now', flowOrder:1, durationEstimate:'Ongoing', timingType:'target', timingNote:'Top-level album outcome; review whether it should remain a visible task or become the project outcome.' },
  'T-009': { designation:'major', proposedDesignation:'outcome', classificationStatus:'proposed', classificationConfidence:'medium', flowPhase:'next', flowOrder:1, durationEstimate:'30–60 min', timingType:'dependency', timingNote:'Broad loan-access umbrella; specific accounts live underneath as independent waiting tasks.' },
  'T-011': { designation:'major', proposedDesignation:'outcome', classificationStatus:'proposed', classificationConfidence:'high', flowPhase:'now', flowOrder:1, durationEstimate:'Ongoing', timingType:'target', timingNote:'Remote-income goal/workstream; application actions should carry the day-to-day work.' },
  'T-019': { designation:'major', proposedDesignation:'outcome', classificationStatus:'proposed', classificationConfidence:'high', flowPhase:'now', flowOrder:1, durationEstimate:'Ongoing', timingType:'dependency', timingNote:'Broad refinance/P&L workstream; the year-end reporting chain carries the actual sequence.' },
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

  'T-023': { designation:'major', classificationStatus:'verified', flowPhase:'now', flowOrder:1, durationEstimate:'60–90 min', timingType:'target', timingNote:'Current CLA month-close bottleneck.' },
  'T-031': { designation:'major', classificationStatus:'verified', flowPhase:'next', flowOrder:2, durationEstimate:'60–90 min', timingType:'dependency', earliestStart:'After September transaction review' },
  'T-032': { designation:'major', classificationStatus:'verified', flowPhase:'next', flowOrder:2, durationEstimate:'60–90 min', timingType:'dependency', earliestStart:'After September monthly report is final' },
  'T-033': { designation:'major', classificationStatus:'verified', flowPhase:'later', flowOrder:1, durationEstimate:'1–2 hrs', timingType:'dependency', earliestStart:'After YTD financials are updated' },
  'T-034': { designation:'major', classificationStatus:'verified', flowPhase:'later', flowOrder:2, durationEstimate:'30–60 min', timingType:'dependency', earliestStart:'After tax package is complete' },
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
function cleanHub(hub) {
  return {
    id:String(hub.id || '').slice(0,90),
    title:String(hub.title || 'Untitled hub').slice(0,160),
    summary:String(hub.summary || '').slice(0,1200),
    color:String(hub.color || '#67d8ff').slice(0,30),
    priority:Math.max(1,Math.min(99,Number(hub.priority || 50))),
    archived:Boolean(hub.archived)
  };
}
function cleanProject(project) {
  return {
    ...project,
    id:String(project.id || '').slice(0,100),
    title:String(project.title || 'Untitled project').slice(0,200),
    area:String(project.area || 'General').slice(0,120),
    goalId:project.goalId ? String(project.goalId) : null,
    hubId:project.hubId ? String(project.hubId) : (PROJECT_HUB_DEFAULTS[project.id] || null),
    parentProjectId:project.parentProjectId ? String(project.parentProjectId) : null,
    summary:String(project.summary || '').slice(0,1200),
    color:String(project.color || '#67d8ff').slice(0,30),
    priority:Math.max(1,Math.min(99,Number(project.priority || 50))),
    archived:Boolean(project.archived)
  };
}
function ensureProject(projects, project) {
  const idx = projects.findIndex(p => p.id === project.id);
  if (idx >= 0) projects[idx] = cleanProject({ ...projects[idx], ...project });
  else projects.push(cleanProject(project));
}
function patchTask(tasks, id, patch) {
  const idx=tasks.findIndex(t=>t.id===id);
  if(idx<0)return;
  tasks[idx]=cleanTask({...tasks[idx],...patch,id:tasks[idx].id,createdAt:tasks[idx].createdAt,completedAt:tasks[idx].completedAt,updatedAt:new Date().toISOString()});
}
function applyHierarchyMigration(state) {
  if (Number(state.hierarchyVersion || 0) >= HIERARCHY_VERSION) return { state, changed:false };
  const hubs = DEFAULT_HUBS.map(cleanHub);
  const projects = (state.projects || []).map(cleanProject);
  const tasks = (state.tasks || []).map(withFlowDefaults);
  const milestones = (state.milestones || []).map(m => ({...m}));

  const setProject = (id, patch) => {
    const idx=projects.findIndex(p=>p.id===id);
    if(idx>=0) projects[idx]=cleanProject({...projects[idx],...patch,id});
  };

  // Creative Learning Academy: Hub → finite projects.
  setProject('p-cla-financials',{title:'Year-End Financial Report',hubId:'h-cla',parentProjectId:null,summary:'Build the year-end financial package from monthly closes through YTD reporting.',priority:1,archived:false});
  setProject('p-cla-refinance',{title:'Refinance Package',hubId:'h-cla',parentProjectId:null,summary:'Prepare lender-ready financials and supporting refinance documentation.',priority:2});
  setProject('p-cla-loans',{hubId:'h-cla',parentProjectId:null,priority:3});
  setProject('p-cla-texas',{hubId:'h-cla',parentProjectId:null,priority:4});
  setProject('p-cla-nps',{hubId:'h-cla',parentProjectId:null,priority:6});
  setProject('p-cla-reporting',{title:'Recurring Financial Reporting System',hubId:'h-cla',parentProjectId:null,priority:7});
  ensureProject(projects,{id:'p-cla-taxes',title:'Tax Filing',area:'CLA',goalId:'g-cla-financials',hubId:'h-cla',parentProjectId:null,summary:'Assemble and file the current CLA tax package.',color:'#68d391',priority:5,archived:false});

  patchTask(tasks,'T-023',{title:'September Monthly Report',projectId:'p-cla-financials',milestoneId:null,designation:'major',parentTaskId:null,flowPhase:'now',flowOrder:1,timingNote:'Finish the September close as one visible major task; detailed close steps live inside as microtasks.'});
  patchTask(tasks,'T-031',{projectId:'p-cla-financials',milestoneId:null,parentTaskId:'T-023',designation:'micro',status:'Backlog',dependsOn:[],flowPhase:'later',flowOrder:999,timingNote:''});
  ['A-013','A-018','A-020'].forEach(id=>patchTask(tasks,id,{projectId:'p-cla-financials',milestoneId:null}));
  patchTask(tasks,'T-032',{projectId:'p-cla-financials',milestoneId:null,parentTaskId:null,designation:'major',flowPhase:'next',flowOrder:2,dependsOn:['T-023']});
  patchTask(tasks,'T-019',{projectId:'p-cla-refinance',milestoneId:null,dependsOn:['T-032']});
  patchTask(tasks,'T-033',{projectId:'p-cla-taxes',milestoneId:null,flowOrder:1});
  patchTask(tasks,'T-034',{projectId:'p-cla-taxes',milestoneId:null,flowOrder:2});

  // God's Contraband: persistent Hub with sibling projects.
  setProject('p-gc-release',{title:"God's Contraband — legacy container",hubId:'h-gc',archived:true});
  setProject('p-gc-album',{title:'Album Rollout',hubId:'h-gc',parentProjectId:null,summary:'Take the album from final audio and credits through distribution and release.',priority:1});
  setProject('p-gc-unstoppable',{title:'Unstoppable Music Video',hubId:'h-gc',parentProjectId:null,priority:2});
  setProject('p-gc-rollout',{title:'Strategy & Business',hubId:'h-gc',parentProjectId:null,summary:'Management, company structure, rights, agreements and rollout strategy decisions.',priority:3});
  setProject('p-gc-live',{title:'Live Rollout',hubId:'h-gc',parentProjectId:null,priority:4});
  patchTask(tasks,'T-014',{projectId:'p-gc-album'});

  // Creative Network: persistent Hub with relationship-specific projects.
  setProject('p-network',{title:'Creative Network — legacy container',hubId:'h-creative-network',archived:true});
  setProject('p-network-profiles',{title:'Profile Enrichment',hubId:'h-creative-network',parentProjectId:null,priority:1});
  setProject('p-network-camille',{title:'Camille Songs',hubId:'h-creative-network',parentProjectId:null,priority:2});
  setProject('p-network-free',{title:'Free Artist Development',hubId:'h-creative-network',parentProjectId:null,priority:3});
  setProject('p-network-cam',{title:'Cam Catalog',hubId:'h-creative-network',parentProjectId:null,priority:4});
  ensureProject(projects,{id:'p-network-relationships',title:'Relationships & Opportunities',area:'Collaborators',goalId:'g-network',hubId:'h-creative-network',parentProjectId:null,summary:'Follow-ups, invitations, introductions and creative relationship opportunities.',color:'#f59e0b',priority:5,archived:false});
  patchTask(tasks,'T-001',{projectId:'p-network-relationships'});

  // Other persistent worlds.
  setProject('p-career-remote',{title:'Remote Bookkeeping Income',hubId:'h-career',parentProjectId:null});
  setProject('p-everything-fades',{title:'Ownership & Operating Structure',hubId:'h-everything-fades',parentProjectId:null});
  setProject('p-task-manager',{title:'Master Task Ledger',hubId:'h-network-hq',parentProjectId:null});

  // Milestones are retained for history, but the visible hierarchy is Hub → Project → Major → Micro.
  const next = {...state,hierarchyVersion:HIERARCHY_VERSION,hubs,projects,tasks,milestones};
  return {state:next,changed:true};
}
function normalizeState(state) {
  let changed = false;
  const migrated = applyHierarchyMigration(state);
  if (migrated.changed) changed = true;
  const base = migrated.state;
  const hubs = (base.hubs || DEFAULT_HUBS).map(cleanHub);
  const projects = (base.projects || []).map(project => cleanProject({...project,hubId:project.hubId || PROJECT_HUB_DEFAULTS[project.id] || null}));
  const tasks = (base.tasks || []).map(task => {
    const normalized = withFlowDefaults(task);
    if (JSON.stringify(task) !== JSON.stringify(normalized)) changed = true;
    return normalized;
  });
  const next = {
    ...base,
    hierarchyVersion:HIERARCHY_VERSION,
    hubs,
    projects,
    tasks,
    integration: {
      ...(base.integration || {}),
      networkHq: {
        ...((base.integration || {}).networkHq || {}),
        canonicalProfileLinks: true,
        sourceOfTruth: 'pending-d1-cutover'
      }
    }
  };
  if (!base.integration?.networkHq?.canonicalProfileLinks) changed = true;
  if (!Array.isArray(base.hubs)) changed = true;
  if (JSON.stringify(base.projects || []) !== JSON.stringify(projects)) changed = true;
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
function nextHubId(hubs, title) { const base=`h-${String(title||'hub').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,46)||'hub'}`;let id=base,n=2;const ids=new Set(hubs.map(h=>h.id));while(ids.has(id))id=`${base}-${n++}`;return id; }

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
      const patch=body.patch||{};
      if (patch.parentTaskId) {
        const parent=(state.tasks||[]).find(t=>t.id===String(patch.parentTaskId));
        if(!parent)return json(res,400,{error:'Parent task not found'});
        if(parent.parentTaskId)return json(res,400,{error:'Microtasks support one nested level only'});
        if(parent.id===original.id)return json(res,400,{error:'Task cannot be its own parent'});
      }
      state.tasks[idx]=cleanTask({...original,...patch,id:original.id,createdAt:original.createdAt,completedAt:original.completedAt,updatedAt:new Date().toISOString()}); state=await writeState(state); return json(res,200,{state,task:state.tasks[idx]});
    }
    if (action === 'verifyClassification') {
      const idx=(state.tasks||[]).findIndex(t=>t.id===body.taskId); if(idx<0)return json(res,404,{error:'Task not found'});
      const task=state.tasks[idx]; const accept=Boolean(body.accept);
      if (!task.proposedDesignation) return json(res,400,{error:'No proposed classification'});
      if (accept && task.proposedDesignation === 'micro') {
        const parentId=task.proposedParentTaskId; const parent=(state.tasks||[]).find(t=>t.id===parentId);
        if(!parent || parent.parentTaskId)return json(res,400,{error:'Proposed parent is invalid'});
        state.tasks[idx]=cleanTask({...task,parentTaskId:parentId,projectId:parent.projectId,designation:'micro',classificationStatus:'verified',proposedDesignation:null,proposedParentTaskId:null,status:'Backlog',updatedAt:new Date().toISOString()});
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
    if (action === 'createHub') {
      const title=String(body.hub?.title||'').trim(); if(!title)return json(res,400,{error:'Hub title required'});
      const hub=cleanHub({...body.hub,id:nextHubId(state.hubs||[],title)}); state.hubs=[...(state.hubs||[]),hub];state=await writeState(state);return json(res,200,{state,hub});
    }
    if (action === 'updateHub') {
      const idx=(state.hubs||[]).findIndex(h=>h.id===body.hubId);if(idx<0)return json(res,404,{error:'Hub not found'});state.hubs[idx]=cleanHub({...state.hubs[idx],...(body.patch||{}),id:state.hubs[idx].id});state=await writeState(state);return json(res,200,{state,hub:state.hubs[idx]});
    }
    if (action === 'createProject') {
      const title=String(body.project?.title||'').trim(); if(!title)return json(res,400,{error:'Project title required'});
      const project=cleanProject({id:nextProjectId(state.projects||[],title),title,area:String(body.project?.area||'General').slice(0,120),goalId:body.project?.goalId||null,hubId:body.project?.hubId||null,parentProjectId:body.project?.parentProjectId||null,summary:String(body.project?.summary||'').slice(0,1200),color:body.project?.color||'#67d8ff',priority:Math.max(1,Math.min(99,Number(body.project?.priority||5))),archived:false});
      state.projects=[...(state.projects||[]),project];state=await writeState(state);return json(res,200,{state,project});
    }
    if (action === 'updateProject') {
      const idx=(state.projects||[]).findIndex(p=>p.id===body.projectId);if(idx<0)return json(res,404,{error:'Project not found'});state.projects[idx]=cleanProject({...state.projects[idx],...(body.patch||{}),id:state.projects[idx].id});state=await writeState(state);return json(res,200,{state,project:state.projects[idx]});
    }
    if (action === 'resetFromSeed') { const normalized=normalizeState(seedState()).state; state=await writeState(normalized); return json(res,200,{state}); }
    return json(res,400,{error:'Unknown action'});
  } catch (error) { console.error(error); return json(res,500,{error:'Task state operation failed',detail:String(error?.message||error)}); }
}