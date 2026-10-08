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

## Current execution status (2026-10-08T13:30:52.265Z)

**Phase 1 is complete and stopped before cutover.**

- Existing Sites project: `appgprj_6ab0c1e933608191b1e667e5e9c4147a`.
- Existing logical D1 binding: `DB`. No second permanent database was created.
- The user accepted this verified identity in place of the hidden physical D1
  name/UUID. Saved Site version 71 is deployed; its source remains
  `5620cd09d303417d64042847ddf47a02d1a37b2e`.
- Gate 0: baseline PASS — Blob revision 68, 69 canonical records, source coverage
  23 Google Sheet / 22 Network HQ, 0 conflicts and 6 preserved status differences.
- Gates 1–2: additive work_* schema and secure staging API deployed on the same
  Site/backend. WORK_API_TOKEN remains a server-side Sites secret.
- Gate 3: live staged copy PASS — 6 hubs, 21 projects, 69 tasks, 34 people links,
  8 dependencies, 1 resource reference and 114 source aliases.
- Gate 4: live full parity PASS — independent actual D1 export comparison and
  server-side verification both report identical identities/fields/links/statuses
  with 0 validation failures. 96 import-history identities and revisions match.
- Gate 5: owner-authenticated read-only shadow export is live through
  `network_work_phase1_state` / `GET /api/work/v1/work/state`. Its hierarchy and
  all migrated fields match the current Blob source. Production reads are unchanged.
- Batch: `phase1_68_f2ab6e322ba4`.
- SHA-256 source checksum: `f2ab6e322ba4fc21fc5013f3746594e1641d8e125ba6ab0d92a36671ece8afad`.
- Batch database status: `verified`; API stage: `verified-not-active`;
  `activated_at = null`.
- Task Manager full /api/state is unchanged at revision 68 on private Blob.
  /api/reconciliation intentionally remains reconciled-staging / cutoverReady false.
- Protected pre/post projections for 19 legacy tables are unchanged. 8 profile
  values and 1 legacy-task value were truncated by the native read interface;
  those hidden portions were not byte-compared. Other checked projections were complete.
- Owner migration health still reports 0 unresolved issues. Calendar/Drive
  configuration and legacy event/schedule/resource/asset/demo data were preserved.
- Historical Sheet T-023 maps to the separate Drew task A-035, while current Task
  Manager T-023 remains its distinct canonical task.
- PR #4 remains draft and unmerged. No activation or Phase 2 action was performed.

The refreshed native Network HQ plugin handled staging and verification. The
previously authorized Vercel fallback was not used; no credential transfer or
Sandbox creation occurred. Private source/export inputs were saved separately
in Network-HQ-Phase1-Verification-Backup-2026-10-08.zip, and the included offline
verifier reproduced the passing result from that archive.

See `docs/PHASE-1-VERIFIED-2026-10-08.md` for the verification checkpoint.
A later cutover requires explicit user approval and its own operational/calendar
sync validation. Preserve newer data before restoring pre-merger behavior.
