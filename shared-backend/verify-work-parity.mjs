#!/usr/bin/env node

/**
 * Phase 1 parity verifier.
 *
 * Usage:
 *   node shared-backend/verify-work-parity.mjs source.json target.json
 *
 * The inputs are private exports produced by the migration tooling. Do not commit
 * those exports. This script contains no user task data and prints only counts and
 * canonical IDs that fail validation.
 */

import fs from 'node:fs';
import crypto from 'node:crypto';

const [, , sourcePath, targetPath] = process.argv;
if (!sourcePath || !targetPath) {
  console.error('Usage: node shared-backend/verify-work-parity.mjs <source.json> <target.json>');
  process.exit(2);
}

const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const source = read(sourcePath);
const target = read(targetPath);

const list = (obj, key) => Array.isArray(obj?.[key]) ? obj[key] : [];
const normalizeArray = value => [...new Set((Array.isArray(value) ? value : []).map(String))].sort();
const sameArray = (a, b) => JSON.stringify(normalizeArray(a)) === JSON.stringify(normalizeArray(b));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

const sourceTasks = list(source, 'tasks');
const targetTasks = list(target, 'tasks');
const sourceProjects = list(source, 'projects');
const targetProjects = list(target, 'projects');
const sourceHubs = list(source, 'hubs');
const targetHubs = list(target, 'hubs');

const sTask = new Map(sourceTasks.map(x => [String(x.id), x]));
const tTask = new Map(targetTasks.map(x => [String(x.id), x]));
const tProject = new Map(targetProjects.map(x => [String(x.id), x]));
const tHub = new Map(targetHubs.map(x => [String(x.id), x]));

const failures = [];
const missing = [];
const extra = [];

for (const id of sTask.keys()) if (!tTask.has(id)) missing.push(id);
for (const id of tTask.keys()) if (!sTask.has(id)) extra.push(id);

const fields = [
  'displayId', 'title', 'hubId', 'projectId', 'parentTaskId', 'designation',
  'status', 'priority', 'flowPhase', 'flowOrder', 'timingType', 'targetDate',
  'dueDate', 'completedAt'
];

for (const [id, s] of sTask) {
  const t = tTask.get(id);
  if (!t) continue;
  for (const field of fields) {
    const sv = s?.[field] ?? null;
    const tv = t?.[field] ?? null;
    if (String(sv ?? '') !== String(tv ?? '')) {
      failures.push({ id, type: 'field-mismatch', field });
    }
  }
  if (!sameArray(s.profileIds ?? s.people, t.profileIds ?? t.people)) {
    failures.push({ id, type: 'people-mismatch' });
  }
  if (!sameArray(s.dependsOn, t.dependsOn)) {
    failures.push({ id, type: 'dependency-mismatch' });
  }
}

for (const task of targetTasks) {
  const id = String(task.id);
  if (!task.hubId || !tHub.has(String(task.hubId))) {
    failures.push({ id, type: 'orphan-hub' });
  }
  if (!task.projectId || !tProject.has(String(task.projectId))) {
    failures.push({ id, type: 'orphan-project' });
  }
  if (task.parentTaskId) {
    const parent = tTask.get(String(task.parentTaskId));
    if (!parent) failures.push({ id, type: 'orphan-parent' });
    else if (String(parent.designation || 'major') === 'micro') failures.push({ id, type: 'micro-parent-is-micro' });
    if (String(task.parentTaskId) === id) failures.push({ id, type: 'self-parent' });
  }
  for (const dep of normalizeArray(task.dependsOn)) {
    if (dep === id) failures.push({ id, type: 'self-dependency' });
    else if (!tTask.has(dep)) failures.push({ id, type: 'orphan-dependency', dependency: dep });
  }
}

const duplicateCanonicalIds = targetTasks.length - new Set(targetTasks.map(x => String(x.id))).size;
const sourceFingerprint = hash({
  hubs: sourceHubs.map(x => x.id).sort(),
  projects: sourceProjects.map(x => x.id).sort(),
  tasks: sourceTasks.map(x => x.id).sort()
});
const targetFingerprint = hash({
  hubs: targetHubs.map(x => x.id).sort(),
  projects: targetProjects.map(x => x.id).sort(),
  tasks: targetTasks.map(x => x.id).sort()
});

const summary = {
  pass: missing.length === 0 && extra.length === 0 && failures.length === 0 && duplicateCanonicalIds === 0,
  source: { hubs: sourceHubs.length, projects: sourceProjects.length, tasks: sourceTasks.length },
  target: { hubs: targetHubs.length, projects: targetProjects.length, tasks: targetTasks.length },
  missingTasks: missing.length,
  extraTasks: extra.length,
  validationFailures: failures.length,
  duplicateCanonicalIds,
  identitySetMatches: sourceFingerprint === targetFingerprint
};

console.log(JSON.stringify({ summary, missing, extra, failures }, null, 2));
process.exit(summary.pass ? 0 : 1);
