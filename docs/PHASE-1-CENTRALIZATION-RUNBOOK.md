# Phase 1 — Safe Data Centralization Runbook

## Purpose

Centralize the **Work** data model in Network HQ D1 without changing the current production behavior of Master Task Ledger.

Visible hierarchy:

`Hub → Project → Major Task → Microtask`

Phase 1 is complete only when the canonical work records are staged in D1 and parity-tested. Task Manager stays on its current private Blob backend until a later cutover phase.

## Pre-Phase-1 checkpoint

- Rollback branch: `safety/pre-d1-merger-2026-10-07`
- Safety plan: `docs/NETWORK-HQ-TASK-MANAGER-MERGER-SAFETY-PLAN.md`
- Task Manager live backend: private Vercel Blob
- Task Manager baseline revision: `68`
- Reconciled canonical task records: `69`
- Google Sheet source records accounted for: `23`
- Existing Network HQ task records accounted for: `22`
- Reconciliation conflicts: `0`
- Preserved status differences: `6`
- Network HQ migration unresolved issues: `0`

## What Phase 1 may change

- Add new `work_*` D1 tables from `shared-backend/schema/001_work_layer.sql`.
- Add authenticated server-side work/task operations.
- Stage canonical Hub / Project / Task / link records in the new tables.
- Create migration-batch, source-alias, revision, and change-history records.
- Run read-only parity checks.

## What Phase 1 must NOT change

- Do not point production Task Manager reads or writes at D1.
- Do not delete or overwrite the Blob state.
- Do not change existing Network HQ profile, relationship, event, schedule, demo, note, asset, or resource data.
- Do not retire Google Drive or Google Calendar integrations.
- Do not enable two-way Calendar mutation yet.
- Do not treat old `T-###` / `A-###` identifiers as canonical database identity.

## Execution order

### Gate 0 — baseline capture

1. Read current Task Manager `/api/state`.
2. Read `/api/reconciliation`.
3. Read Network HQ D1 tasks and migration status.
4. Confirm rollback branch exists.
5. Stop if reconciliation has unresolved conflicts.

### Gate 1 — additive D1 schema

Apply `shared-backend/schema/001_work_layer.sql` to the same D1 database used by Network HQ.

Requirements:
- only `CREATE TABLE IF NOT EXISTS`, indexes, and metadata inserts;
- no destructive migration against existing Network HQ tables;
- new tables are not read by production UI yet.

### Gate 2 — authenticated write surface

Before copying canonical records, expose an authenticated server-side Work API that supports:

- batch staging;
- Hub / Project / Task create and update;
- move/reparent;
- complete/reopen/archive;
- people links;
- dependencies;
- resources;
- expected-revision checks;
- idempotency keys;
- read-only export/parity status.

If this write surface does not exist, **stop here**. Do not fake the D1 import or switch the source of truth.

### Gate 3 — staged import

Create a migration batch with status `staged`.

Import in this dependency-safe order:
1. Hubs
2. Projects
3. Major tasks / outcomes
4. Microtasks
5. People links
6. Dependencies
7. Resources
8. Source aliases

Do not activate the batch yet.

### Gate 4 — parity verification

Export the staged D1 Work state and compare it with the private canonical migration payload using:

`node shared-backend/verify-work-parity.mjs source.json target.json`

Required results:
- identical canonical task identity set;
- no missing or extra canonical task;
- no orphan Hub / Project / parent / dependency links;
- people links preserved;
- task statuses preserved from the preferred current Task Manager value;
- source aliases preserve legacy collisions;
- no duplicate canonical IDs;
- zero unresolved validation failures.

### Gate 5 — shadow read

Only after parity passes:
- expose a read-only D1 Work endpoint to Task Manager diagnostics;
- compare the D1 hierarchy with the live Blob-rendered hierarchy;
- do not switch production reads yet.

## Stop conditions

Immediately halt Phase 1 if any of these occur:

- an existing Network HQ table would need destructive alteration;
- a canonical task cannot be mapped confidently;
- an import produces an orphaned parent/dependency/project;
- a newer status would be overwritten by an older external source;
- Network HQ runtime errors appear after additive schema/API changes;
- the only available D1 access would require exposing a database credential to the browser;
- the generic authenticated work/task write surface is unavailable.

## Rollback during Phase 1

Because Task Manager remains on Blob during Phase 1, rollback should be simple:

1. Stop the migration/cutover process.
2. Preserve any staged D1 `work_*` data for diagnosis; do not delete it impulsively.
3. Leave Task Manager on Blob.
4. Leave existing Network HQ tables and integrations unchanged.
5. If code changes affected production, restore the saved pre-merger checkpoint using the emergency rollback instructions in the merger safety plan.

## Current execution status

- Gate 0: **PASS** — baseline read and reconciliation verified.
- Gate 1 schema definition: **PREPARED ON PHASE-1 BRANCH**.
- Gate 2: **BLOCKED UNTIL GENERIC AUTHENTICATED D1 WORK/TASK WRITES ARE EXPOSED**. The current owner connector can list tasks and complete a task, but does not expose generic create/update/move/reparent/dependency writes.
- Gates 3–5: not started; intentionally blocked by Gate 2.

This is a safety stop, not a failed migration. Production Task Manager behavior remains unchanged.
