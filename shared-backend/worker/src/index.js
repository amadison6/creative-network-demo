import { compareWorkState } from '../../work-parity-core.mjs';
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function authorized(request, env) {
  const expected = env.WORK_API_TOKEN;
  if (!expected) return false;
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${expected}`;
}

async function bodyJson(request) {
  try { return await request.json(); } catch { return null; }
}

function boolInt(value) { return value ? 1 : 0; }
function text(value, fallback = '') { return value == null ? fallback : String(value); }
function nullable(value) { return value == null || value === '' ? null : String(value); }
function number(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }

function topoSort(items, idKey, parentKeys = []) {
  const pending = [...items];
  const ids = new Set(pending.map(item => String(item[idKey])));
  const emitted = new Set();
  const out = [];
  let guard = pending.length * 3 + 3;
  while (pending.length && guard-- > 0) {
    let progressed = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const item = pending[i];
      const parents = parentKeys.map(key => item[key]).filter(Boolean).map(String);
      const ready = parents.every(parent => !ids.has(parent) || emitted.has(parent));
      if (!ready) continue;
      pending.splice(i, 1);
      out.push(item);
      emitted.add(String(item[idKey]));
      progressed = true;
    }
    if (!progressed) break;
  }
  if (pending.length) throw new Error(`Cycle or unresolved parent relationship: ${pending.map(x => x[idKey]).join(', ')}`);
  return out;
}

function q(db, sql, ...params) {
  return db.prepare(sql).bind(...params);
}

async function relationalChecks(db, expectedTaskCount = null) {
  const [taskCount, orphanProject, orphanHub, orphanParent, orphanDependency, selfDependency, microParentMicro] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS n FROM work_tasks').first(),
    db.prepare(`SELECT COUNT(*) AS n FROM work_tasks t LEFT JOIN work_projects p ON p.id=t.project_id WHERE p.id IS NULL`).first(),
    db.prepare(`SELECT COUNT(*) AS n FROM work_tasks t LEFT JOIN work_hubs h ON h.id=t.hub_id WHERE h.id IS NULL`).first(),
    db.prepare(`SELECT COUNT(*) AS n FROM work_tasks t LEFT JOIN work_tasks p ON p.id=t.parent_task_id WHERE t.parent_task_id IS NOT NULL AND p.id IS NULL`).first(),
    db.prepare(`SELECT COUNT(*) AS n FROM work_task_dependencies d LEFT JOIN work_tasks t ON t.id=d.task_id LEFT JOIN work_tasks p ON p.id=d.depends_on_task_id WHERE t.id IS NULL OR p.id IS NULL`).first(),
    db.prepare(`SELECT COUNT(*) AS n FROM work_task_dependencies WHERE task_id=depends_on_task_id`).first(),
    db.prepare(`SELECT COUNT(*) AS n FROM work_tasks t JOIN work_tasks p ON p.id=t.parent_task_id WHERE p.designation='micro'`).first()
  ]);
  const checks = {
    taskCount: Number(taskCount?.n || 0),
    expectedTaskCount,
    taskCountMatches: expectedTaskCount == null ? true : Number(taskCount?.n || 0) === Number(expectedTaskCount),
    orphanProject: Number(orphanProject?.n || 0),
    orphanHub: Number(orphanHub?.n || 0),
    orphanParent: Number(orphanParent?.n || 0),
    orphanDependency: Number(orphanDependency?.n || 0),
    selfDependency: Number(selfDependency?.n || 0),
    microParentMicro: Number(microParentMicro?.n || 0)
  };
  checks.pass = checks.taskCountMatches && [
    checks.orphanProject, checks.orphanHub, checks.orphanParent,
    checks.orphanDependency, checks.selfDependency, checks.microParentMicro
  ].every(n => n === 0);
  return checks;
}

async function payloadChecks(db, payload) {
  if (!payload || payload.schemaVersion !== 1 || !payload.batchId || !payload.checksum) throw new Error('Invalid migration identity');
  if (!Array.isArray(payload.tasks) || payload.tasks.length > 500 || payload.expectedTaskCount !== payload.tasks.length) throw new Error('Invalid task count');
  for (const key of ['hubs','projects','taskPeople','dependencies','resources','sourceAliases']) if (!Array.isArray(payload[key])) throw new Error('Missing payload section: ' + key);
  const profiles = await db.prepare('SELECT id FROM profiles WHERE archived_at IS NULL').all();
  const checks = compareWorkState(payload, payload, (profiles.results || []).map(p => p.id));
  if (!checks.summary.pass) throw new Error('Invalid migration relationships: ' + JSON.stringify(checks.failures));
  const core = {};
  for (const key of ['schemaVersion','sourceRevision','generatedAt','hubs','projects','tasks','taskPeople','dependencies','resources','sourceAliases']) core[key] = payload[key];
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(core)));
  const checksum = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2,'0')).join('');
  if (checksum !== payload.checksum) throw new Error('Payload checksum mismatch');
  return checks;
}

async function stageMigration(env, payload) {
  if (!payload || !payload.batchId || !payload.checksum) return reply({ error: 'Missing batchId/checksum' }, 400);
  if (!Array.isArray(payload.hubs) || !Array.isArray(payload.projects) || !Array.isArray(payload.tasks)) {
    return reply({ error: 'Invalid migration payload' }, 400);
  }

  await payloadChecks(env.DB, payload);

  const active = await env.DB.prepare(`SELECT COUNT(*) AS n FROM work_migration_batches WHERE status='active'`).first();
  if (Number(active?.n || 0) > 0) {
    return reply({ error: 'An active Work migration already exists; Phase 1 staging refuses to overwrite active data.' }, 409);
  }

  const existingBatch = await env.DB.prepare(`SELECT * FROM work_migration_batches WHERE batch_id=?`).bind(payload.batchId).first();
  if (existingBatch && existingBatch.checksum !== payload.checksum) {
    return reply({ error: 'Batch ID already exists with a different checksum' }, 409);
  }

  if (existingBatch) {
    if (!['staged','verified'].includes(existingBatch.status)) return reply({error:'Existing migration requires review'},409);
    const state = await (await getState(env)).json();
    const parity = compareWorkState(payload, state);
    return reply({ok:parity.summary.pass,stage:existingBatch.status === 'verified'?'verified-not-active':'staged-not-active',alreadyStaged:true,batchId:payload.batchId,parity},parity.summary.pass?200:409);
  }
  const occupied = await env.DB.prepare('SELECT COUNT(*) AS n FROM work_migration_batches').first();
  const taskRows = await env.DB.prepare('SELECT COUNT(*) AS n FROM work_tasks').first();
  if (Number(occupied?.n || 0) || Number(taskRows?.n || 0)) return reply({error:'Work staging is not empty; preserve existing data and review before another import'},409);

  const createdAt = text(payload.generatedAt, new Date().toISOString());
  const statements = [];
  // A unique singleton, inside the same transaction, prevents concurrent first imports.
  statements.push(q(env.DB, 'INSERT INTO work_schema_meta (key,value,updated_at) VALUES (?,?,?)', 'phase1_batch_id', payload.batchId, createdAt));
  statements.push(q(env.DB, 'INSERT OR IGNORE INTO work_schema_meta (key,value,updated_at) VALUES (?,?,?)', 'work_schema_version', '1', createdAt));
  statements.push(q(env.DB, `INSERT INTO work_migration_batches
    (batch_id,source_name,source_revision,status,expected_task_count,imported_task_count,checksum,notes,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(batch_id) DO UPDATE SET source_revision=excluded.source_revision, checksum=excluded.checksum,
      expected_task_count=excluded.expected_task_count, status='staged'`,
    payload.batchId, 'master-task-ledger-canonical', nullable(payload.sourceRevision), 'staged',
    number(payload.expectedTaskCount, payload.tasks.length), 0, payload.checksum,
    'Phase 1 staged import; not production source of truth', createdAt));

  for (const hub of payload.hubs) {
    statements.push(q(env.DB, `INSERT INTO work_hubs
      (id,title,summary,color,priority,archived,revision,created_at,updated_at,archived_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title,summary=excluded.summary,color=excluded.color,
      priority=excluded.priority,archived=excluded.archived,revision=excluded.revision,updated_at=excluded.updated_at,archived_at=excluded.archived_at`,
      text(hub.id), text(hub.title), text(hub.summary), text(hub.color), number(hub.priority,50), boolInt(hub.archived),
      number(hub.revision,1), text(hub.createdAt,createdAt), text(hub.updatedAt,createdAt), nullable(hub.archivedAt)));
  }

  for (const project of topoSort(payload.projects, 'id', ['parentProjectId'])) {
    statements.push(q(env.DB, `INSERT INTO work_projects
      (id,hub_id,title,summary,area,goal_id,parent_project_id,color,priority,archived,revision,created_at,updated_at,archived_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET hub_id=excluded.hub_id,title=excluded.title,summary=excluded.summary,area=excluded.area,
      goal_id=excluded.goal_id,parent_project_id=excluded.parent_project_id,color=excluded.color,priority=excluded.priority,
      archived=excluded.archived,revision=excluded.revision,updated_at=excluded.updated_at,archived_at=excluded.archived_at`,
      text(project.id), text(project.hubId), text(project.title), text(project.summary), text(project.area), nullable(project.goalId),
      nullable(project.parentProjectId), text(project.color), number(project.priority,50), boolInt(project.archived), number(project.revision,1),
      text(project.createdAt,createdAt), text(project.updatedAt,createdAt), nullable(project.archivedAt)));
  }

  const orderedTasks = topoSort(payload.tasks, 'id', ['parentTaskId','proposedParentTaskId']);
  for (const task of orderedTasks) {
    if (!String(task.id || '').startsWith('task_')) throw new Error(`Non-canonical task ID rejected: ${task.id}`);
    statements.push(q(env.DB, `INSERT INTO work_tasks
      (id,display_id,hub_id,project_id,parent_task_id,title,designation,status,priority,area,goal_id,milestone_id,micro_done,
       classification_status,classification_confidence,proposed_designation,proposed_parent_task_id,flow_phase,flow_order,
       duration_estimate,timing_type,earliest_start,target_date,due_text,due_date,timing_note,next_action,waiting_on,notes,source,
       today_rank,effort,revision,last_change_source,migration_batch_id,created_at,updated_at,completed_at,archived_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET display_id=excluded.display_id,hub_id=excluded.hub_id,project_id=excluded.project_id,
       parent_task_id=excluded.parent_task_id,title=excluded.title,designation=excluded.designation,status=excluded.status,
       priority=excluded.priority,area=excluded.area,goal_id=excluded.goal_id,milestone_id=excluded.milestone_id,micro_done=excluded.micro_done,
       classification_status=excluded.classification_status,classification_confidence=excluded.classification_confidence,
       proposed_designation=excluded.proposed_designation,proposed_parent_task_id=excluded.proposed_parent_task_id,
       flow_phase=excluded.flow_phase,flow_order=excluded.flow_order,duration_estimate=excluded.duration_estimate,
       timing_type=excluded.timing_type,earliest_start=excluded.earliest_start,target_date=excluded.target_date,due_text=excluded.due_text,
       due_date=excluded.due_date,timing_note=excluded.timing_note,next_action=excluded.next_action,waiting_on=excluded.waiting_on,
       notes=excluded.notes,source=excluded.source,today_rank=excluded.today_rank,effort=excluded.effort,revision=excluded.revision,
       last_change_source=excluded.last_change_source,migration_batch_id=excluded.migration_batch_id,updated_at=excluded.updated_at,
       completed_at=excluded.completed_at,archived_at=excluded.archived_at`,
      text(task.id), nullable(task.displayId), text(task.hubId), text(task.projectId), nullable(task.parentTaskId), text(task.title),
      text(task.designation,'major'), text(task.status,'Open'), number(task.priority,2), text(task.area), nullable(task.goalId), nullable(task.milestoneId),
      boolInt(task.microDone), text(task.classificationStatus,'verified'), nullable(task.classificationConfidence), nullable(task.proposedDesignation),
      nullable(task.proposedParentTaskId), text(task.flowPhase,'later'), number(task.flowOrder,999), text(task.durationEstimate), text(task.timingType,'flexible'),
      text(task.earliestStart), text(task.targetDate), text(task.dueText), nullable(task.dueDate), text(task.timingNote), text(task.nextAction),
      text(task.waitingOn), text(task.notes), text(task.source,'Task Manager'), task.todayRank == null ? null : number(task.todayRank), text(task.effort),
      number(task.revision,1), text(task.lastChangeSource,'task-manager-phase1-import'), payload.batchId, text(task.createdAt,createdAt),
      text(task.updatedAt,createdAt), nullable(task.completedAt), nullable(task.archivedAt)));
  }

  // Link tables are append/update safe. The new Work layer is not production-readable during Phase 1.
  for (const person of payload.taskPeople || []) {
    statements.push(q(env.DB, `INSERT INTO work_task_people (task_id,profile_id,role,created_at) VALUES (?,?,?,?)
      ON CONFLICT(task_id,profile_id) DO UPDATE SET role=excluded.role`,
      text(person.taskId), text(person.profileId), text(person.role), text(person.createdAt,createdAt)));
  }
  for (const dep of payload.dependencies || []) {
    statements.push(q(env.DB, `INSERT INTO work_task_dependencies (task_id,depends_on_task_id,dependency_type,created_at) VALUES (?,?,?,?)
      ON CONFLICT(task_id,depends_on_task_id) DO UPDATE SET dependency_type=excluded.dependency_type`,
      text(dep.taskId), text(dep.dependsOnTaskId), text(dep.dependencyType,'finish_to_start'), text(dep.createdAt,createdAt)));
  }
  for (const resource of payload.resources || []) {
    statements.push(q(env.DB, `INSERT INTO work_task_resources
      (id,task_id,label,url,resource_type,external_id,metadata_json,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET task_id=excluded.task_id,label=excluded.label,url=excluded.url,resource_type=excluded.resource_type,
        external_id=excluded.external_id,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`,
      text(resource.id), text(resource.taskId), text(resource.label), text(resource.url), text(resource.resourceType,'link'), nullable(resource.externalId),
      nullable(resource.metadataJson), text(resource.createdAt,createdAt), text(resource.updatedAt,createdAt)));
  }
  for (const alias of payload.sourceAliases || []) {
    statements.push(q(env.DB, `INSERT INTO work_source_aliases
      (source_name,source_record_id,canonical_task_id,source_status,source_revision,source_title_hash,last_seen_at)
      VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(source_name,source_record_id) DO UPDATE SET canonical_task_id=excluded.canonical_task_id,
        source_status=excluded.source_status,source_revision=excluded.source_revision,source_title_hash=excluded.source_title_hash,last_seen_at=excluded.last_seen_at`,
      text(alias.sourceName), text(alias.sourceRecordId), text(alias.canonicalTaskId), nullable(alias.sourceStatus), nullable(alias.sourceRevision),
      nullable(alias.sourceTitleHash), text(alias.lastSeenAt,createdAt)));
  }

  for (const [entityType, records] of [['hub',payload.hubs],['project',payload.projects],['task',payload.tasks]]) {
    for (const record of records) statements.push(q(env.DB, `INSERT INTO work_changes
      (id,entity_type,entity_id,action,before_json,after_json,source_app,source_revision,entity_revision,idempotency_key,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      `${payload.batchId}:${entityType}:${record.id}`,entityType,record.id,'stage',null,JSON.stringify(record),
      'task-manager-phase1-import',payload.sourceRevision,number(record.revision,1),`${payload.batchId}:${entityType}:${record.id}`,createdAt));
  }

  statements.push(q(env.DB, `UPDATE work_migration_batches SET imported_task_count=?, status='staged' WHERE batch_id=?`, payload.tasks.length, payload.batchId));
  await env.DB.batch(statements);

  const checks = await relationalChecks(env.DB, number(payload.expectedTaskCount, payload.tasks.length));
  if (!checks.pass) {
    await env.DB.prepare(`UPDATE work_migration_batches SET status='failed', notes=? WHERE batch_id=?`)
      .bind(`Relational validation failed: ${JSON.stringify(checks)}`, payload.batchId).run();
    return reply({ ok: false, batchId: payload.batchId, checks }, 409);
  }
  return reply({ ok: true, stage: 'staged-not-active', batchId: payload.batchId, checksum: payload.checksum, checks }, 201);
}

async function getState(env) {
  const [hubs, projects, tasks, people, dependencies, resources, aliases, batches] = await Promise.all([
    env.DB.prepare('SELECT * FROM work_hubs ORDER BY priority,title').all(),
    env.DB.prepare('SELECT * FROM work_projects ORDER BY priority,title').all(),
    env.DB.prepare('SELECT * FROM work_tasks ORDER BY project_id,flow_order,title').all(),
    env.DB.prepare('SELECT * FROM work_task_people ORDER BY task_id,profile_id').all(),
    env.DB.prepare('SELECT * FROM work_task_dependencies ORDER BY task_id,depends_on_task_id').all(),
    env.DB.prepare('SELECT * FROM work_task_resources ORDER BY task_id,id').all(),
    env.DB.prepare('SELECT * FROM work_source_aliases ORDER BY source_name,source_record_id').all(),
    env.DB.prepare('SELECT * FROM work_migration_batches ORDER BY created_at DESC').all()
  ]);
  return reply({
    stage: 'phase1-shadow',
    hubs: hubs.results || [], projects: projects.results || [], tasks: tasks.results || [],
    taskPeople: people.results || [], dependencies: dependencies.results || [], resources: resources.results || [],
    sourceAliases: aliases.results || [], migrationBatches: batches.results || []
  });
}

async function verifyBatch(env, batchId, payload) {
  const batch = await env.DB.prepare('SELECT * FROM work_migration_batches WHERE batch_id=?').bind(batchId).first();
  if (!batch) return reply({ error: 'Migration batch not found' }, 404);
  if (!['staged','verified'].includes(batch.status)) return reply({error:'Batch state is not eligible for Phase 1 verification'},409);
  await payloadChecks(env.DB, payload);
  if (payload.batchId !== batchId || payload.checksum !== batch.checksum) return reply({error:'Verification source does not match staged batch'},409);
  const state = await (await getState(env)).json();
  const parity = compareWorkState(payload, state);
  const checks = await relationalChecks(env.DB, batch.expected_task_count);
  const history = await env.DB.prepare('SELECT COUNT(*) AS n FROM work_changes WHERE id LIKE ?').bind(batchId + ':%').first();
  const historyMatches = Number(history?.n || 0) === payload.hubs.length + payload.projects.length + payload.tasks.length;
  if (!checks.pass || !parity.summary.pass || !historyMatches) return reply({ ok:false,batchId,checks,parity,historyMatches },409);
  await env.DB.prepare(`UPDATE work_migration_batches SET status='verified', verified_at=? WHERE batch_id=? AND status IN ('staged','verified')`)
    .bind(new Date().toISOString(), batchId).run();
  return reply({ok:true,stage:'verified-not-active',productionSourceChanged:false,batchId,checksum:batch.checksum,checks,parity,historyMatches});
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/health') return reply({ ok: true, service: 'network-hq-shared-work', phase: 1, productionSourceChanged: false });
    if (!authorized(request, env)) return reply({ error: 'Unauthorized' }, 401);

    try {
      if (request.method === 'GET' && path === '/v1/work/state') return await getState(env);
      if (request.method === 'POST' && path === '/v1/work/migrations/stage') {
        const payload = await bodyJson(request);
        return await stageMigration(env, payload);
      }
      const verifyMatch = /^\/v1\/work\/migrations\/([^/]+)\/verify$/.exec(path);
      if (request.method === 'POST' && verifyMatch) return await verifyBatch(env, decodeURIComponent(verifyMatch[1]), await bodyJson(request));
      return reply({ error: 'Not found' }, 404);
    } catch (error) {
      console.error('Phase 1 Work API rejected request', String(error?.message || error));
      return reply({ error: 'Work API request failed; no cutover performed' }, 500);
    }
  }
};
