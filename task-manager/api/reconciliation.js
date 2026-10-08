import { get, put } from '@vercel/blob';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const STATE_PATH = 'master-task-ledger/state.json';
const REGISTRY_PATH = 'master-task-ledger/reconciliation.json';
const REGISTRY_VERSION = 2;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readPrivateJson(path) {
  try {
    const result = await get(path, { access: 'private' });
    if (!result || result.statusCode !== 200) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function writePrivateJson(path, value) {
  await put(path, JSON.stringify(value), {
    access: 'private',
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: 'application/json; charset=utf-8',
    cacheControlMaxAge: 0
  });
}

function decodeExternalSnapshot() {
  const compressed = process.env.RECONCILIATION_SNAPSHOT_GZIP_B64;
  if (!compressed) return { version: 1, sources: {}, externalOnlyPayloads: {} };
  try {
    const text = gunzipSync(Buffer.from(compressed, 'base64')).toString('utf8');
    const parsed = JSON.parse(text);
    return {
      version: Number(parsed.version || 1),
      sources: parsed.sources || {},
      externalOnlyPayloads: parsed.externalOnlyPayloads || {}
    };
  } catch {
    return { version: 1, sources: {}, externalOnlyPayloads: {} };
  }
}

function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stableCanonicalId(seed) {
  const digest = createHash('sha256').update(String(seed)).digest('hex').slice(0, 24);
  return `task_${digest}`;
}

function freshRegistry(previous = null) {
  const now = new Date().toISOString();
  return {
    version: REGISTRY_VERSION,
    stage: 'reconciled-staging',
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    entries: {},
    sourceLookup: {},
    conflicts: [],
    resolvedConflicts: [],
    statusDifferences: [],
    notes: [
      'Canonical IDs are immutable identity keys; legacy task IDs remain human-facing references.',
      'This registry is rebuilt from current source snapshots on every run so stale mappings cannot accumulate.',
      'Task Manager is the preferred status/value source until the Network HQ D1 task-write cutover is verified.'
    ]
  };
}

function ensureEntry(registry, canonicalId, seed = {}, previous = null) {
  if (!registry.entries[canonicalId]) {
    const prior = previous?.entries?.[canonicalId];
    registry.entries[canonicalId] = {
      canonicalId,
      title: seed.title || prior?.title || '',
      sourceRefs: [],
      sourceStatuses: {},
      appTaskId: null,
      createdAt: prior?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
  return registry.entries[canonicalId];
}

function attachSource(registry, canonicalId, sourceRef, record = {}, previous = null) {
  const entry = ensureEntry(registry, canonicalId, record, previous);
  if (!entry.sourceRefs.includes(sourceRef)) entry.sourceRefs.push(sourceRef);
  if (record.status) entry.sourceStatuses[sourceRef] = String(record.status);
  if (!entry.title && record.title) entry.title = String(record.title);
  if (sourceRef.startsWith('task-manager:')) entry.appTaskId = sourceRef.split(':').slice(1).join(':');
  entry.updatedAt = new Date().toISOString();
  registry.sourceLookup[sourceRef] = canonicalId;
  return entry;
}

function dedupe(items, keyFn) {
  const seen = new Set();
  return items.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function nextTaskId(tasks) {
  const nums = (tasks || [])
    .map(task => /^A-(\d+)$/.exec(String(task.id || ''))?.[1])
    .filter(Boolean)
    .map(Number);
  return `A-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
}

function buildIndexes(tasks) {
  const byId = new Map(tasks.map(task => [String(task.id), task]));
  const byTitle = new Map();
  for (const task of tasks) {
    const key = normalizeTitle(task.title);
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(task);
  }
  return { byId, byTitle };
}

function previousCanonicalFor(previous, sourceRef) {
  return previous?.sourceLookup?.[sourceRef] || null;
}

function canonicalForAppTask(previous, task) {
  const sourceRef = `task-manager:${task.id}`;
  return previousCanonicalFor(previous, sourceRef) || stableCanonicalId(`${sourceRef}|${task.createdAt || ''}`);
}

function makeImportedTask(payload, entry, id) {
  const now = new Date().toISOString();
  return {
    id,
    title: String(payload.title || entry.title || 'Imported task'),
    area: payload.area || 'Inbox',
    projectId: payload.projectId || null,
    milestoneId: null,
    goalId: null,
    parentTaskId: null,
    microDone: false,
    designation: 'major',
    proposedDesignation: null,
    proposedParentTaskId: null,
    classificationStatus: 'verified',
    classificationConfidence: null,
    flowPhase: payload.flowPhase || 'later',
    flowOrder: Number.isFinite(Number(payload.flowOrder)) ? Number(payload.flowOrder) : 999,
    durationEstimate: payload.durationEstimate || '',
    timingType: payload.timingType || 'flexible',
    earliestStart: payload.earliestStart || '',
    targetDate: payload.targetDate || '',
    timingNote: payload.timingNote || '',
    priority: Number(payload.priority || 2),
    status: payload.status || 'Open',
    dueText: payload.dueText || '',
    dueDate: payload.dueDate || null,
    nextAction: payload.nextAction || '',
    waitingOn: payload.waitingOn || '',
    notes: payload.notes || '',
    source: payload.source || 'Reconciliation import',
    profileIds: Array.isArray(payload.profileIds) ? payload.profileIds : [],
    people: Array.isArray(payload.people) ? payload.people : (Array.isArray(payload.profileIds) ? payload.profileIds : []),
    resources: Array.isArray(payload.resources) ? payload.resources : [],
    dependsOn: Array.isArray(payload.dependsOn) ? payload.dependsOn : [],
    todayRank: 0,
    effort: payload.effort || '',
    createdAt: now,
    updatedAt: now,
    completedAt: null
  };
}

function recordStatusDifferences(registry) {
  registry.statusDifferences = [];
  for (const entry of Object.values(registry.entries)) {
    const appRef = entry.sourceRefs.find(ref => ref.startsWith('task-manager:'));
    if (!appRef) continue;
    const appStatus = entry.sourceStatuses[appRef];
    for (const ref of entry.sourceRefs) {
      if (ref === appRef) continue;
      const externalStatus = entry.sourceStatuses[ref];
      if (appStatus && externalStatus && appStatus !== externalStatus) {
        registry.statusDifferences.push({
          type: 'status-difference',
          canonicalId: entry.canonicalId,
          appRef,
          externalRef: ref,
          existingRef: appRef,
          incomingRef: ref,
          appStatus,
          externalStatus
        });
      }
    }
  }
  registry.statusDifferences = dedupe(
    registry.statusDifferences,
    item => `${item.canonicalId}|${item.appRef}|${item.externalRef}|${item.appStatus}|${item.externalStatus}`
  );
}

function summarize(registry, taskCount) {
  const entries = Object.values(registry.entries);
  const sourceCounts = {};
  for (const ref of Object.keys(registry.sourceLookup)) {
    const source = ref.split(':')[0];
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
  }
  const externalOnly = entries.filter(entry => !entry.sourceRefs.some(ref => ref.startsWith('task-manager:')));
  return {
    stage: registry.stage,
    canonicalRecords: entries.length,
    taskManagerRecords: taskCount,
    sourceCounts,
    externalOnlyRecords: externalOnly.length,
    conflicts: registry.conflicts.length,
    resolvedConflicts: registry.resolvedConflicts.length,
    statusDifferences: registry.statusDifferences.length,
    cutoverReady: false,
    nextGate: 'Expose authenticated Network HQ D1 task create/update/move APIs, then migrate canonical records and point Task Manager at D1.'
  };
}

async function reconcile({ applyMissing = false } = {}) {
  const state = await readPrivateJson(STATE_PATH);
  if (!state) throw new Error('Task Manager state is unavailable');

  const snapshot = decodeExternalSnapshot();
  const previous = (await readPrivateJson(REGISTRY_PATH)) || null;
  const registry = freshRegistry(previous);
  let tasks = Array.isArray(state.tasks) ? [...state.tasks] : [];
  let { byId, byTitle } = buildIndexes(tasks);

  // Rebuild every Task Manager mapping from the current live state. Old mappings only
  // provide stable canonical IDs; stale records are not copied into the new registry.
  for (const task of tasks) {
    const sourceRef = `task-manager:${task.id}`;
    const canonicalId = canonicalForAppTask(previous, task);
    attachSource(registry, canonicalId, sourceRef, task, previous);
  }

  // Reconcile each external snapshot against the current Task Manager state.
  for (const [source, records] of Object.entries(snapshot.sources || {})) {
    for (const record of Array.isArray(records) ? records : []) {
      const sourceId = String(record.sourceId || '');
      if (!sourceId) continue;
      const sourceRef = `${source}:${sourceId}`;
      const oldCanonicalId = previousCanonicalFor(previous, sourceRef);
      const sameId = byId.get(sourceId);

      // If a prior reconciliation already linked this external source to a live app task,
      // preserve that canonical identity. This is how resolved legacy-ID collisions remain safe.
      if (oldCanonicalId && registry.entries[oldCanonicalId]) {
        attachSource(registry, oldCanonicalId, sourceRef, record, previous);
        if (sameId && normalizeTitle(sameId.title) !== normalizeTitle(record.title)) {
          const sameIdCanonical = registry.sourceLookup[`task-manager:${sameId.id}`];
          if (sameIdCanonical && sameIdCanonical !== oldCanonicalId) {
            registry.resolvedConflicts.push({
              type: 'legacy-id-collision',
              legacyId: sourceId,
              existingRef: `task-manager:${sameId.id}`,
              incomingRef: sourceRef,
              linkedAppRef: registry.entries[oldCanonicalId]?.sourceRefs.find(ref => ref.startsWith('task-manager:')) || null,
              existingTitle: sameId.title || '',
              incomingTitle: record.title || '',
              resolution: 'separate-canonical-records-linked-to-distinct-live-tasks'
            });
          }
        }
        continue;
      }

      if (sameId && normalizeTitle(sameId.title) === normalizeTitle(record.title)) {
        const appRef = `task-manager:${sameId.id}`;
        const canonicalId = registry.sourceLookup[appRef] || canonicalForAppTask(previous, sameId);
        attachSource(registry, canonicalId, sourceRef, record, previous);
        continue;
      }

      const sameTitle = byTitle.get(normalizeTitle(record.title)) || [];
      if (sameTitle.length === 1) {
        const appTask = sameTitle[0];
        const appRef = `task-manager:${appTask.id}`;
        const canonicalId = registry.sourceLookup[appRef] || canonicalForAppTask(previous, appTask);
        attachSource(registry, canonicalId, sourceRef, record, previous);
        continue;
      }

      // Preserve a stable external-only canonical ID when one existed previously, but do not
      // copy any stale source refs. Otherwise derive a deterministic canonical ID.
      const canonicalId = oldCanonicalId || stableCanonicalId(`${sourceRef}|${record.title || ''}`);
      attachSource(registry, canonicalId, sourceRef, record, previous);

      if (sameId) {
        registry.conflicts.push({
          type: 'legacy-id-collision',
          legacyId: sourceId,
          existingRef: `task-manager:${sameId.id}`,
          incomingRef: sourceRef,
          existingTitle: sameId.title || '',
          incomingTitle: record.title || '',
          resolution: 'kept-as-separate-canonical-records'
        });
      } else {
        registry.conflicts.push({
          type: 'external-only-record',
          incomingRef: sourceRef,
          incomingTitle: record.title || '',
          resolution: applyMissing && snapshot.externalOnlyPayloads?.[sourceRef] ? 'eligible-for-import' : 'preserved-in-registry'
        });
      }
    }
  }

  const imported = [];
  if (applyMissing) {
    // Import only external-only records with an explicit private payload. Never infer task content.
    for (const entry of Object.values(registry.entries)) {
      if (entry.sourceRefs.some(ref => ref.startsWith('task-manager:'))) continue;
      const importRef = entry.sourceRefs.find(ref => snapshot.externalOnlyPayloads?.[ref]);
      if (!importRef) continue;
      const payload = snapshot.externalOnlyPayloads[importRef];
      const id = nextTaskId(tasks);
      const task = makeImportedTask(payload, entry, id);
      tasks.unshift(task);
      const appRef = `task-manager:${id}`;
      attachSource(registry, entry.canonicalId, appRef, task, previous);
      imported.push({ canonicalId: entry.canonicalId, appTaskId: id, sourceRef: importRef });
    }

    if (imported.length) {
      const nextState = {
        ...state,
        tasks,
        revision: Number(state.revision || 0) + 1,
        updatedAt: new Date().toISOString(),
        integration: {
          ...(state.integration || {}),
          networkHq: {
            ...((state.integration || {}).networkHq || {}),
            canonicalProfileLinks: true,
            sourceOfTruth: 'pending-d1-cutover',
            reconciliationRegistry: REGISTRY_PATH
          }
        }
      };
      await writePrivateJson(STATE_PATH, nextState);
      ({ byId, byTitle } = buildIndexes(tasks));
    }
  }

  registry.conflicts = dedupe(
    registry.conflicts.filter(item => {
      // An import resolves an external-only conflict immediately in this same request.
      if (item.type !== 'external-only-record') return true;
      return !registry.sourceLookup[item.incomingRef] || !registry.entries[registry.sourceLookup[item.incomingRef]]?.sourceRefs.some(ref => ref.startsWith('task-manager:'));
    }),
    item => `${item.type}|${item.existingRef || ''}|${item.incomingRef || ''}`
  );
  registry.resolvedConflicts = dedupe(
    registry.resolvedConflicts,
    item => `${item.type}|${item.existingRef || ''}|${item.incomingRef || ''}|${item.linkedAppRef || ''}`
  );

  recordStatusDifferences(registry);
  registry.updatedAt = new Date().toISOString();
  await writePrivateJson(REGISTRY_PATH, registry);

  return {
    registry,
    imported,
    summary: summarize(registry, tasks.length)
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    const applyMissing = String(req.query?.applyMissing || '') === '1';
    const detail = String(req.query?.detail || '') === '1';
    const result = await reconcile({ applyMissing });
    return json(res, 200, {
      summary: result.summary,
      imported: result.imported,
      conflicts: result.registry.conflicts,
      resolvedConflicts: result.registry.resolvedConflicts,
      statusDifferences: result.registry.statusDifferences,
      ...(detail ? { entries: Object.values(result.registry.entries) } : {})
    });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: 'Reconciliation failed', detail: String(error?.message || error) });
  }
}
