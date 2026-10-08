# Shared Work Backend — Phase 1

This directory defines the additive D1 work layer that will eventually be shared by Network HQ and Master Task Ledger.

## Visible hierarchy

`Hub → Project → Major Task → Microtask`

Goals and milestones may remain supporting metadata, but they are not additional required navigation layers.

## Source-of-truth boundaries

- **D1**: structured entities, hierarchy, task state, people links, dependencies, source aliases, revisions, sync metadata.
- **Google Calendar**: actual calendar events and meeting/session times.
- **Google Drive**: actual files/documents. D1 stores stable references and metadata rather than duplicating file bytes.
- **Task Manager Blob**: remains the live Task Manager store during Phase 1 and is retained as rollback until D1 parity and write tests pass.

## Safety rules

1. Phase 1 is additive. Do not modify or drop existing Network HQ profile, relationship, event, schedule, demo, asset, note, or resource tables.
2. Do not make Task Manager read from or write to the new work tables until parity verification passes.
3. Import records into a **staged migration batch** first. A staged batch is not production truth.
4. Every task uses an immutable canonical ID. Legacy `T-###` / `A-###` values are display/source IDs only.
5. Preserve source aliases so old ID collisions cannot merge unrelated tasks.
6. Every write increments the entity revision and records `last_change_source` plus a `work_changes` history record.
7. Use optimistic concurrency: an update with an outdated expected revision must fail instead of overwriting a newer change.
8. Keep the pre-merger safety branch and the existing private Blob state until after the proving period.

## Required API surface before cutover

The shared backend must expose authenticated server-side operations equivalent to:

- `listWorkState()` / `getTask()`
- `createHub()` / `updateHub()`
- `createProject()` / `updateProject()` / `moveProject()`
- `createTask()` / `updateTask()` / `completeTask()` / `reopenTask()` / `archiveTask()`
- `moveTask()` between projects
- `setTaskParent()` for Major ↔ Micro changes
- `setTaskPeople()`
- `setTaskDependencies()`
- `setTaskResources()`
- batch import in `staged` mode
- parity/status endpoint for migration verification

All mutating calls must accept `expectedRevision` (except creates) and an optional idempotency key.

## Phase 1 activation gate

D1 does **not** become canonical merely because records have been copied into it. Activation requires all of these to pass:

- expected canonical task count equals imported task count;
- every canonical ID exists exactly once;
- every active task references a valid Hub and Project;
- every Microtask references an existing parent Major Task;
- dependencies reference existing tasks and contain no self-dependencies;
- people links preserve canonical Network HQ profile IDs;
- status differences from older sources remain explicitly recorded instead of silently overwriting newer Task Manager state;
- no unresolved legacy-ID collision exists;
- read-only D1 rendering matches the current Task Manager hierarchy;
- Blob remains available for immediate rollback.

## Current Phase 1 baseline

Captured before D1 write cutover:

- Task Manager live store: private Vercel Blob, revision 68.
- Reconciliation registry: 69 canonical task records / 69 Task Manager records.
- External source coverage: 23 Google Sheet records and 22 existing Network HQ task records accounted for.
- Unresolved reconciliation conflicts: 0.
- Preserved status differences: 6.
- Existing Network HQ D1 task rows: 22.

The next gate is a generic authenticated Network HQ D1 work/task write API. The currently available owner connector can list tasks and complete tasks, but it does not yet expose generic create/update/move/reparent/dependency operations. Do not declare the D1 import complete until that write surface exists and the import is actually verified.
