const MICRO_SEED = {
  'T-023': [
    'Review remaining September transactions',
    'Resolve classifications that can be resolved now',
    'Isolate true holds as named follow-ups'
  ],
  'T-024': [
    'Choose skyline and background angles',
    'Map Free walking sequence',
    'Map Diontae section',
    'Map Dante section',
    'Confirm lighting / sunset / night plan',
    'Confirm power availability',
    'Confirm entrances and rooftop access',
    'Confirm crew and extras space',
    'Organize reference photos and video for Jordan'
  ],
  'T-027': [
    'Confirm minimum viable shot list',
    'Confirm Slide Thru booking and access window',
    'Confirm Jordan availability',
    'Confirm Addae availability',
    'Confirm Dante, Diontae, and Free availability',
    'Confirm gear and crew needs',
    'Confirm production budget',
    'Set shoot date and delivery timeline'
  ],
  'T-029': [
    'Review first cut',
    'Compile edit notes',
    'Approve final picture',
    'Confirm release-ready export'
  ]
};

async function stateApi(action, payload = {}) {
  const options = action
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...payload }) }
    : { cache: 'no-store' };
  const response = await fetch('/api/state', options);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function seedMicrotasks(){
  try {
    let state = await stateApi();
    let created = 0;
    for (const [parentId, titles] of Object.entries(MICRO_SEED)) {
      const parent = (state.tasks || []).find(task => task.id === parentId);
      if (!parent) continue;
      const existing = new Set((state.tasks || [])
        .filter(task => task.parentTaskId === parentId)
        .map(task => String(task.title || '').trim().toLowerCase()));
      for (const title of titles) {
        if (existing.has(title.toLowerCase())) continue;
        const out = await stateApi('createTask', { task: {
          title,
          parentTaskId: parent.id,
          microDone: false,
          designation: 'micro',
          classificationStatus: 'verified',
          projectId: parent.projectId || null,
          milestoneId: parent.milestoneId || null,
          goalId: parent.goalId || null,
          area: parent.area || 'Inbox',
          priority: 3,
          status: 'Backlog',
          source: 'Structured from existing task notes'
        }});
        state = out.state || out;
        existing.add(title.toLowerCase());
        created++;
      }
    }
    if (created) location.reload();
  } catch (error) {
    console.error('Microtask seed skipped', error);
  }
}

window.addEventListener('DOMContentLoaded', seedMicrotasks);
