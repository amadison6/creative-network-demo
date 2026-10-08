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
- Add an authenticated server-side **staging** API for the new Work tables.
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
- Do not activate operational Task Manager writes against D1 yet.

## Execution order

### Gate 0 — baseline capture

1. Read current Task Manager `/api/state`.
2. Read `/api/reconciliation`.
3. Read Network HQ D1 tasks and migration status.
4. Confirm rollback branch exists.
5. Stop if reconciliation has unresolved conflicts.

### Gate 1 — additive D1 schema

Apply `shared-backend/schema/001_work_layer.sql` to the same D1 database used by Network HQ.

For the Sites-managed target, deploy the equivalent additive Drizzle migration
through the existing Site. See `shared-backend/SITES-PHASE-1-DEPLOYMENT.md`.
Do not execute both schema paths against the same database.

Requirements:
- only additive `CREATE TABLE`, indexes, and work-schema metadata inserts;
- no destructive migration against existing Network HQ tables;
- new tables are not read by production UI yet.

### Gate 2 — authenticated staging write surface

Before copying canonical records, deploy the Phase 1 staging worker in
`shared-backend/worker/`, hosted by the existing Network HQ Site, with:

- a server-side binding to the **existing Network HQ D1 database**;
- `WORK_API_TOKEN` stored as a Worker secret;
- no D1 token or database credential exposed to either browser app.

The Phase 1 staging API supports:
- authenticated batch staging;
- read-only Work-state export;
- relational verification of task count and Hub / Project / parent / dependency integrity;
- explicit `staged-not-active` and `verified-not-active` states.

Full operational create/edit/move/reparent/complete/reopen APIs are required **before Phase 2 cutover**, but they do not need to be activated merely to make the Phase 1 shadow copy.

If the staging worker cannot be bound securely to the existing D1 database, **stop here**. Do not fake the D1 import or create a second permanent Work database.

### Gate 3 — private payload + staged import

Build the private canonical import payload with:

`node shared-backend/build-phase1-payload.mjs state.json reconciliation.json phase1-private.json`

Never commit the three private JSON files.

Create a migration batch with status `staged` and import in dependency-safe order:
1. Hubs
2. Projects
3. Parent Major tasks / outcomes
4. Microtasks / proposed-parent tasks
5. People links
6. Dependencies
7. Resources
8. Source aliases

Do not activate the batch yet.

### Gate 4 — parity verification

Export the staged D1 Work state and compare it with the private canonical migration payload using:

`node shared-backend/verify-work-parity.mjs source.json target.json`

The authenticated `/verify` operation requires that same full source payload as
its JSON body, and verifies the payload checksum plus audit-history count before
marking the batch `verified-not-active`. A task-count-only check is insufficient.

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
- the staging worker cannot be securely bound to the existing Network HQ D1 database.

## Rollback during Phase 1

Because Task Manager remains on Blob during Phase 1, rollback should be simple:

1. Stop the migration/cutover process.
2. Preserve any staged D1 `work_*` data for diagnosis; do not delete it impulsively.
3. Leave Task Manager on Blob.
4. Leave existing Network HQ tables and integrations unchanged.
5. If code changes affected production, restore the saved pre-merger checkpoint using the emergency rollback instructions in the merger safety plan.

## Current execution status


## Live checkpoint — 2026-10-08T08:14:30.336Z

The user explicitly authorized proceeding using the verified existing Sites DB
binding instead of its hidden physical Cloudflare name/UUID.

- Existing Site version 71 deployed successfully at
  https://creative-network-map.ausarmadison.chatgpt.site.
- Source commit: `5620cd09d303417d64042847ddf47a02d1a37b2e`.
- Deployment: `appgdep_6ac74e02f164819192d132fa406e1e36`.
- Runtime environment revision: 5; WORK_API_TOKEN is a Sites secret. Other keys
  were preserved. No credential was written to source or browser code.
- Native overview confirms all 38 existing tables plus exactly 11 work_* tables.
- Work tasks, hubs, projects, migration batches and history are empty: **the live
  import has NOT run and live parity has NOT passed**.
- Native before/after projections match for 19 protected legacy tables.
  There are 8 truncated values in profiles and 1 in tasks; this verifies the
  returned projections, not the hidden portions of those large fields.
- Owner-authenticated migration and schedule tools still respond successfully;
  migration health has no unresolved issues and baseline counts are unchanged.
- Task Manager full /api/state is unchanged: revision 68, 69 tasks on private Blob.
- PR #4 remains draft and unmerged; no source-of-truth cutover is authorized.

### Remaining tooling gate

The deployed Site contains owner-authenticated Phase 1 state/stage/verify tools,
but this conversation still exposes only the prior plugin tool list. Refresh or
reconnect the existing Creative Network Map plugin to load the new tools.
The local execution service and cloud browser reported the workspace offline.

Automatic approval review rejected a temporary Vercel Sandbox fallback because
it would transfer the Work bearer token and existing Sites authentication token
to another execution service without explicit authorization. The sandbox was
not created and the import was not attempted. Do not retry that path without
explicit approval of that credential transfer. Prefer the native Site plugin.

After tool availability is restored: re-read the Blob/reconciliation baseline,
build the private payload using the branch builder, stage 69 canonical records,
export D1 Work state, run full field/identity/link/dependency/alias parity and
verify the batch, then expose the read-only shadow comparison and STOP.
Preserve all new tables/data during any behavior rollback to Site version 70.
