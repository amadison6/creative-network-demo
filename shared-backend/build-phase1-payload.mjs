#!/usr/bin/env node

/**
 * Build the private Phase 1 D1 staging payload from a Task Manager state export
 * plus the private reconciliation registry.
 *
 * Usage:
 *   node shared-backend/build-phase1-payload.mjs state.json reconciliation.json phase1.json
 *
 * Never commit state.json, reconciliation.json, or phase1.json.
 */

import fs from 'node:fs';
import crypto from 'node:crypto';

const [, , statePath, registryPath, outputPath = 'phase1-private.json'] = process.argv;
if (!statePath || !registryPath) {
  console.error('Usage: node shared-backend/build-phase1-payload.mjs <state.json> <reconciliation.json> [output.json]');
  process.exit(2);
}

const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const sourceLookup = registry.sourceLookup || {};
const registryEntries = registry.entries || {};

const canonicalTaskId = displayId => {
  if (!displayId) return null;
  const id = sourceLookup[`task-manager:${displayId}`];
  if (!id) throw new Error(`Missing canonical task mapping for task-manager:${displayId}`);
  return id;
};

const taskByDisplayId = new Map((state.tasks || []).map(task => [String(task.id), task]));
const projectById = new Map((state.projects || []).map(project => [String(project.id), project]));
const now = new Date().toISOString();
const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');

const hubs = (state.hubs || []).map(hub => ({
  id: String(hub.id),
  title: String(hub.title || ''),
  summary: String(hub.summary || ''),
  color: String(hub.color || ''),
  priority: Number(hub.priority || 50),
  archived: Boolean(hub.archived),
  revision: Number(hub.revision || 1),
  createdAt: hub.createdAt || now,
  updatedAt: hub.updatedAt || state.updatedAt || now,
  archivedAt: hub.archivedAt || null
}));

const projects = (state.projects || []).map(project => ({
  id: String(project.id),
  hubId: String(project.hubId || ''),
  title: String(project.title || ''),
  summary: String(project.summary || ''),
  area: String(project.area || ''),
  goalId: project.goalId || null,
  parentProjectId: project.parentProjectId || null,
  color: String(project.color || ''),
  priority: Number(project.priority || 50),
  archived: Boolean(project.archived),
  revision: Number(project.revision || 1),
  createdAt: project.createdAt || now,
  updatedAt: project.updatedAt || state.updatedAt || now,
  archivedAt: project.archivedAt || null
}));

const tasks = (state.tasks || []).map(task => {
  const id = canonicalTaskId(task.id);
  const project = projectById.get(String(task.projectId || ''));
  if (!project) throw new Error(`Task ${task.id} has missing project ${task.projectId}`);
  return {
    id,
    displayId: String(task.id),
    hubId: String(project.hubId || ''),
    projectId: String(task.projectId),
    parentTaskId: task.parentTaskId ? canonicalTaskId(task.parentTaskId) : null,
    title: String(task.title || ''),
    designation: String(task.designation || (task.parentTaskId ? 'micro' : 'major')),
    status: String(task.status || 'Open'),
    priority: Number(task.priority || 2),
    area: String(task.area || ''),
    goalId: task.goalId || null,
    milestoneId: task.milestoneId || null,
    microDone: Boolean(task.microDone),
    classificationStatus: String(task.classificationStatus || 'verified'),
    classificationConfidence: task.classificationConfidence || null,
    proposedDesignation: task.proposedDesignation || null,
    proposedParentTaskId: task.proposedParentTaskId ? canonicalTaskId(task.proposedParentTaskId) : null,
    flowPhase: String(task.flowPhase || 'later'),
    flowOrder: Number.isFinite(Number(task.flowOrder)) ? Number(task.flowOrder) : 999,
    durationEstimate: String(task.durationEstimate || ''),
    timingType: String(task.timingType || 'flexible'),
    earliestStart: String(task.earliestStart || ''),
    targetDate: String(task.targetDate || ''),
    dueText: String(task.dueText || ''),
    dueDate: task.dueDate || null,
    timingNote: String(task.timingNote || ''),
    nextAction: String(task.nextAction || ''),
    waitingOn: String(task.waitingOn || ''),
    notes: String(task.notes || ''),
    source: String(task.source || 'Task Manager'),
    todayRank: Number.isFinite(Number(task.todayRank)) ? Number(task.todayRank) : null,
    effort: String(task.effort || ''),
    revision: Number(task.revision || 1),
    lastChangeSource: 'task-manager-phase1-import',
    createdAt: task.createdAt || now,
    updatedAt: task.updatedAt || now,
    completedAt: task.completedAt || null,
    archivedAt: task.archivedAt || null
  };
});

const taskPeople = [];
const dependencies = [];
const resources = [];
for (const task of state.tasks || []) {
  const taskId = canonicalTaskId(task.id);
  for (const profileId of [...new Set([...(task.profileIds || []), ...(task.people || [])].map(String))]) {
    taskPeople.push({ taskId, profileId, role: '', createdAt: now });
  }
  for (const dependency of [...new Set((task.dependsOn || []).map(String))]) {
    if (!taskByDisplayId.has(dependency)) throw new Error(`Task ${task.id} depends on missing task ${dependency}`);
    dependencies.push({ taskId, dependsOnTaskId: canonicalTaskId(dependency), dependencyType: 'finish_to_start', createdAt: now });
  }
  for (const [index, resource] of (task.resources || []).entries()) {
    const label = String(resource?.label || '');
    const url = String(resource?.url || '');
    resources.push({
      id: `resource_${sha(`${taskId}|${index}|${label}|${url}`).slice(0, 24)}`,
      taskId,
      label,
      url,
      resourceType: String(resource?.type || 'link'),
      externalId: resource?.externalId || null,
      metadataJson: resource?.metadata ? JSON.stringify(resource.metadata) : null,
      createdAt: now,
      updatedAt: now
    });
  }
}

const sourceAliases = Object.entries(sourceLookup).map(([sourceRef, canonicalId]) => {
  const separator = sourceRef.indexOf(':');
  const sourceName = separator >= 0 ? sourceRef.slice(0, separator) : sourceRef;
  const sourceRecordId = separator >= 0 ? sourceRef.slice(separator + 1) : '';
  const entry = registryEntries[canonicalId] || {};
  return {
    sourceName,
    sourceRecordId,
    canonicalTaskId: canonicalId,
    sourceStatus: entry.sourceStatuses?.[sourceRef] || null,
    sourceRevision: null,
    sourceTitleHash: entry.title ? sha(String(entry.title)) : null,
    lastSeenAt: registry.updatedAt || now
  };
});

const payloadCore = {
  schemaVersion: 1,
  sourceRevision: String(state.revision ?? ''),
  generatedAt: now,
  hubs,
  projects,
  tasks,
  taskPeople,
  dependencies,
  resources,
  sourceAliases
};

const checksum = sha(JSON.stringify(payloadCore));
const payload = {
  ...payloadCore,
  batchId: `phase1_${String(state.revision ?? 'unknown')}_${checksum.slice(0, 12)}`,
  checksum,
  expectedTaskCount: tasks.length
};

fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
console.log(JSON.stringify({
  outputPath,
  batchId: payload.batchId,
  checksum,
  counts: {
    hubs: hubs.length,
    projects: projects.length,
    tasks: tasks.length,
    peopleLinks: taskPeople.length,
    dependencies: dependencies.length,
    resources: resources.length,
    sourceAliases: sourceAliases.length
  }
}, null, 2));
