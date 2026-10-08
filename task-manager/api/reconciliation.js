import { get, put } from '@vercel/blob';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const STATE_PATH = 'master-task-ledger/state.json';
const REGISTRY_PATH = 'master-task-ledger/reconciliation.json';
const REGISTRY_VERSION = 1;

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

function emptyRegistry() {
  return {
    version: REGISTRY_VERSION,
    stage: 'reconciled-staging',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    entries: {},
    sourceLookup: {},
    conflicts: [],
    statusDifferences: [],
    notes: [
      'Canonical IDs are immutable identity keys; legacy task IDs remain human-facing references.',
      'Task Manager is the preferred status/value source until the Network HQ D1 task-write cutover is verified.'
    ]
  };
}

function ensureEntry(registry, canonicalId, seed = {}) {
  if (!registry.entries[canonicalId]) {
    registry.entries[canonicalId] = {
      canonicalId,
      title: seed.title || '',
      sourceRefs: [],
      sourceStatuses: {},
      appTaskId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
  return registry.entries[canonicalId];
}

function attachSource(registry, canonicalId, sourceRef, record = {}) {
  const entry = ensureEntry(registry, canonicalId, record);
  if (!entry.sourceRefs.includes(sourceRef)) entry.sourceRefs.push(sourceRef);
  if (record.status) entry.sourceStatuses[sourceRef] = String(record.status);
  if (!entry.title && record.title) entry.title = String(record.title);
  if (sourceRef.startsWith('task-manager:')) entry.appTaskId = sourceRef.split(':').slice(1).join(':');
  entry.updatedAt = new Date().toISOString();
  registry.sourceLookup[sourceRef] = canonicalId;
  return entry;
}

function dedupeConflicts(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = `${item.type}|${item.existingRef || ''}|${item.incomingRef || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function nextTaskId(tasks) {
  const nums = (tasks || [])
    .map(t => /^A-(\d+)$/.exec(String(t.id || ''))?.[1])
    .filter(Boolean)
    .map(Number);
  return `A-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
}

async function reconcile({ applyMissing = false } = {}) {
  const state = await readPrivateJson(STATE_PATH);
  if (!state) throw new Error('Task Manager state is unavailable');

  const snapshot = decodeExternalSnapshot();
  const registry = (await readPrivateJson(REGISTRY_PATH)) || emptyRegistry();
  registry.version = REGISTRY_VERSION;
  registry.stage = 'reconciled-staging';
  registry.conflicts = [];
  registry.statusDifferences = [];

  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  const byId = new Map(tasks.map(task => [String(task.id), task]));
  const byTitle = new Map();
  for (const task of tasks) {
    const key = normalizeTitle(task.title);
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(task);

    const sourceRef = `task-manager:${task.id}`;
    let canonicalId = registry.sourceLookup[sourceRef];
    if (!canonicalId) {
      canonicalId = stableCanonicalId(`${sourceRef}|${task.createdAt || ''}`);
    }
    attachSource(registry, canonicalId, sourceRef, task);
  }

  for (const [source, records] of Object.entries(snapshot.sources || {})) {
    for (const record of Array.isArray(records) ? records : []) {
      const sourceId = String(record.sourceId || '');
      if (!sourceId) continue;
      const sourceRef = `${source}:${sourceId}`;
      if (registry.sourceLookup[sourceRef]) {
        const canonicalId = registry.sourceLookup[sourceRef];
        attachSource(registry, canonicalId, sourceRef, record);
        continue;
      }

      const sameId = byId.get(sourceId);
      if (sameId && normalizeTitle(sameId.title) === normalizeTitle(record.title)) {
        const appRef = `task-manager:${sameId.id}`;
        const canonicalId = registry.sourceLookup[appRef] || stableCanonicalId(`${appRef}|${sameId.createdAt || ''}`);
        attachSource(registry, canonicalId, appRef, sameId);
        attachSource(registry, canonicalId, sourceRef, record);
        continue;
      }

      const sameTitle = byTitle.get(normalizeTitle(record.title)) || [];
      if (sameTitle.length === 1) {
        const appTask = sameTitle[0];
        const appRef = `task-manager:${appTask.id}`;
        const canonicalId = registry.sourceLookup[appRef] || stableCanonicalId(`${appRef}|${appTask.createdAt || ''}`);
        attachSource(registry, canonicalId, appRef, appTask);
        attachSource(registry, canonicalId, sourceRef, record);
        continue;
      }

      const canonicalId = stableCanonicalId(`${sourceRef}|${record.title || ''}`);
      attachSource(registry, canonicalId, sourceRef, record);
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

  // Record status drift without letting older sources overwrite the live Task Manager value.
  for (const entry of Object.values(registry.entries)) {
    const appRef = entry.sourceRefs.find(ref => ref.startsWith('task-manager:'));
    if (!appRef) continue;
    const appStatus = entry.sourceStatuses[appRef];
    for (const ref of entry.sourceRefs) {
      if (ref === appRef) continue;
      const externalStatus = entry.sourceStatuses[ref];
      if (appStatus && externalStatus && appStatus !== externalStatus) {
        registry.statusDifferences.push({ canonicalId: entry.canonicalId, appRef, externalRef: ref, appStatus, externalStatus });
      }
    }
  }

  let imported = [];
  if (applyMissing) {
    const mutableTasks = [...tasks];
    for (const entry of Object.values(registry.entries)) {
      if (entry.sourceRefs.some(ref => ref.startsWith('task-manager:'))) continue;
      const importRef = entry.sourceRefs.find(ref => snapshot.externalOnlyPayloads?.[ref]);
      if (!importRef) continue;
      const payload = snapshot.externalOnlyPayloads[importRef];
      const id = nextTaskId(mutableTasks);
      const now = new Date().toISOString();
      const task = {
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
      mutableTasks.unshift(task);
      const appRef = `task-manager:${id}`;
      attachSource(registry, entry.canonicalId, appRef, task);
      imported.push({ canonicalId: entry.canonicalId, appTaskId: id, sourceRef: importRef });
    }

    if (imported.length) {
      const nextState = {
        ...state,
        tasks: mutableTasks,
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
    }
  }

  registry.conflicts = dedupeConflicts(registry.conflicts);
  registry.statusDifferences = dedupeConflicts(registry.statusDifferences.map(item => ({ ...item, type: 'status-difference', existingRef: item.appRef, incomingRef: item.externalRef })));
  registry.updatedAt = new Date().toISOString();
  await writePrivateJson(REGISTRY_PATH, registry);

  const entries = Object.values(registry.entries);
  const externalOnly = entries.filter(entry => !entry.sourceRefs.some(ref => ref.startsWith('task-manager:')));
  const sourceCounts = {};
  for (const ref of Object.keys(registry.sourceLookup)) {
    const source = ref.split(':')[0];
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
  }

  return {
    registry,
    imported,
    summary: {
      stage: registry.stage,
      canonicalRecords: entries.length,
      taskManagerRecords: tasks.length + imported.length,
      sourceCounts,
      externalOnlyRecords: externalOnly.length - imported.length,
      conflicts: registry.conflicts.length,
      statusDifferences: registry.statusDifferences.length,
      cutoverReady: false,
      nextGate: 'Expose authenticated Network HQ D1 task create/update/move APIs, then migrate canonical records and point Task Manager at D1.'
    }
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
      statusDifferences: result.registry.statusDifferences,
      ...(detail ? { entries: Object.values(result.registry.entries) } : {})
    });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: 'Reconciliation failed', detail: String(error?.message || error) });
  }
}
