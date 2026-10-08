# Network HQ + Task Manager Merger Safety Plan

Saved baseline: 2026-10-07 (Pacific time)

## Goal

Merge Network HQ and Master Task Ledger safely by centralizing structured data first, proving synchronization, and only then combining the user interfaces.

The final operating model is:

- D1 = canonical structured data / shared brain
- Network HQ = people, relationships, venues, studios, resources, projects, network context
- Task Manager = Hub → Project → Major Task → Microtask execution view
- Google Calendar = calendar event system
- Google Drive = file/document storage
- ChatGPT = an additional controlled interface to the same backend

The interfaces may eventually live inside one Network HQ shell, but they should not be combined until the shared backend is proven.

## Canonical hierarchy

Visible work hierarchy:

Hub → Project → Major Task → Microtask

Examples:

Creative Learning Academy → Year-End Financial Report → September Monthly Report → review/categorize/reconcile steps

God's Contraband → Album Rollout → Finish Mixes → song-level checklist items

Hubs persist. Projects finish. Major Tasks are meaningful project steps. Microtasks are checklist-level actions.

## Current baseline state

At the time this safety plan was saved:

- Task Manager production: https://master-task-ledger.vercel.app/
- Repository: amadison6/creative-network-demo
- Stable pre-merger code commit before this document: f3ab1d21043ea5757fc1a7bfa60d25284b4aafb6
- Current task reconciliation stage: reconciled-staging
- Canonical task records accounted for: 69
- Task Manager records accounted for: 69
- Google Sheet records accounted for: 23
- Network HQ task records accounted for: 22
- External-only task records remaining: 0
- Unresolved identity conflicts: 0
- Known status differences retained for audit: 6
- Network HQ D1 migration reports no unresolved migration issues.

The original Master Task Ledger Google Sheet remains a backup/reference source. Task Manager's current private Blob store remains the live task backend until D1 cutover is fully verified.

## Safe execution order

### Phase 1 — Preserve the baseline

1. Keep the existing Task Manager Blob data untouched as rollback storage.
2. Keep existing Network HQ D1 profile, relationship, event, schedule, resource, demo, and asset tables untouched.
3. Keep the original Master Task Ledger Google Sheet unchanged as a backup/reference.
4. Keep existing Google Calendar and Google Drive integrations in place.
5. Do not remove any Google Apps Script/calendar bridge until the replacement path has been verified end-to-end.

### Phase 2 — Expand D1 safely

Add or expand a task/work layer alongside existing Network HQ data rather than rewriting existing tables.

Required structured entities/capabilities include:

- hubs
- projects
- tasks
- parent task relationships
- task dependencies
- task ↔ people relationships
- task ↔ resource/file relationships
- timing / flow metadata
- immutable canonical IDs
- revision numbers / optimistic concurrency
- change history / source-of-change metadata

The D1 task API must support at minimum:

- create task
- edit task
- move task between projects
- move project between hubs
- convert Major Task ↔ Microtask
- change parent Major Task
- complete / reopen
- change status / priority / timing
- link / unlink people
- link / unlink resources
- dependencies
- archive / restore

### Phase 3 — Copy, do not move

Copy the reconciled canonical task set into D1 while Task Manager continues using its current Blob backend.

Do not delete, overwrite, or repurpose the Blob backup.

Before any cutover, verify:

- canonical record count matches
- titles and statuses match
- hub/project placement matches
- Major/Micro relationships match
- dependencies match
- people/profile links match
- completed history is preserved
- no orphaned records exist
- no legacy ID collision causes a merge

### Phase 4 — Shadow-read testing

Task Manager should be able to read the D1 representation in a hidden/testing mode while continuing to write to Blob.

Compare the rendered result from Blob and D1 before allowing D1 to become live.

### Phase 5 — Controlled D1 write testing

Use a small noncritical subset first.

Test:

- drag a task to another project
- convert Major ↔ Micro
- change parent task
- complete and reopen
- link a person
- change timing
- edit task text/notes

Verify the same record is visible correctly from Network HQ.

### Phase 6 — Google Calendar synchronization

Calendar synchronization is a required cutover gate, not an optional later feature.

Desired architecture:

Google Calendar ↔ D1 ↔ Network HQ / Task Manager

A change may originate in any of the three interfaces and should propagate to the others when relevant.

D1 calendar-linked records should preserve at minimum:

- Google event ID
- calendar ID
- canonical internal event/task ID
- revision/version
- last sync timestamp
- source of most recent change
- conflict state when two edits collide

Required tests:

- Google Calendar → D1 → both apps
- Network HQ → D1 → Google Calendar + Task Manager
- Task Manager → D1 → Google Calendar + Network HQ
- reschedule
- cancellation
- title/details edit
- new linked event
- stale-write/conflict handling

Only calendar-linked information should sync to Google Calendar. Internal task organization changes do not need to alter the calendar unless calendar data changed.

### Phase 7 — Task Manager cutover

Only after all prior gates pass:

1. Make D1 the Task Manager live structured-data backend.
2. Keep Blob frozen and readable as a rollback snapshot.
3. Do not delete the old Blob state.
4. Verify production reads and writes against D1.

### Phase 8 — Proving period

Keep Task Manager and Network HQ as separate interfaces temporarily while both use the same D1 backend.

Verify real-world changes made from each surface propagate correctly.

Do not merge the interfaces until this period is stable.

### Phase 9 — UI merger

After shared-backend stability is proven, Network HQ can become the parent shell with areas such as:

- Network
- Work
- Calendar
- Files
- Music

Task Manager becomes the Work area rather than a separate database/product.

## Storage responsibilities after merger

### D1

Store structured data and relationships:

- profiles
- hubs
- projects
- tasks
- task hierarchy
- relationships
- links between tasks and people
- event metadata
- file metadata/references
- sync metadata
- revision/change history

### Google Drive

Continue storing actual files where appropriate:

- PDFs
- contracts
- agreements
- decks
- spreadsheets
- invoices
- press kits
- production documents
- creative references
- other uploaded documents

D1 stores stable Drive references and metadata rather than duplicating the underlying file unnecessarily.

### Google Calendar

Continue storing actual calendar events.

D1 stores links/sync metadata connecting calendar events to internal projects, tasks, people, or hubs.

## Non-negotiable safety rules

1. Never perform a destructive in-place migration when a copy/verify/cutover approach is possible.
2. Never use legacy task numbers such as T-023 as the sole database identity.
3. Never let an older source silently overwrite a newer revision.
4. Never expose unrestricted D1 credentials to browser code.
5. Never delete the previous working storage layer at cutover.
6. Never remove Google Calendar/Drive bridges until replacements have passed end-to-end tests.
7. A partial migration is a failed migration; do not cut over when counts or relationships do not match.
8. Preserve post-baseline changes before any rollback so they can be inspected/reapplied later if desired.

# Fail-safe rollback checkpoint

This document defines the baseline to return to if the D1 centralization or app merger causes instability.

A dedicated Git branch should preserve this code state. The intended checkpoint branch name is:

`safety/pre-d1-merger-2026-10-07`

The rollback target is the system as it exists at this checkpoint:

- Task Manager remains a separate production app.
- Task Manager uses its current private Blob backend for live task state.
- Network HQ continues using its existing D1 data/schema and current task capabilities.
- The canonical reconciliation registry remains available but does not force a D1 task cutover.
- Google Calendar integration remains on the pre-merger path.
- Google Drive remains the file/document store.
- No new shared D1 task tables/APIs are required for the restored apps to operate.

## Exact emergency rollback prompt

Copy/paste the following prompt into ChatGPT if the migration or merger goes wrong:

---

**EMERGENCY ROLLBACK — restore the Network HQ + Master Task Ledger system to the saved pre-D1-merger checkpoint from October 7, 2026.**

Use the saved safety plan in `docs/NETWORK-HQ-TASK-MANAGER-MERGER-SAFETY-PLAN.md` and the checkpoint branch `safety/pre-d1-merger-2026-10-07` as the authoritative rollback reference.

Before changing anything, preserve/export any data created after the checkpoint into a quarantine backup so it is not permanently lost. Do not merge those newer records into the restored production state unless I explicitly approve it.

Then restore the system to the checkpoint architecture:

1. Restore the application code/UI to the checkpoint branch/version.
2. Restore Master Task Ledger / Task Manager to its pre-merger private Blob backend and stop using D1 as its live task store.
3. Disable any new D1 task write/sync/cutover layer introduced after the checkpoint without deleting its data.
4. Restore Network HQ to its pre-merger behavior and existing D1 tables; do not overwrite or delete existing Network HQ profiles, relationships, events, schedules, resources, demos, files, photos, or revision history.
5. Disable any new Calendar sync worker introduced after the checkpoint and restore the pre-merger Google Calendar path. Do not delete or recreate Google Calendar events unless necessary to match the checkpoint.
6. Keep Google Drive files/references intact and restore the pre-merger file integration path if it changed.
7. Restore `https://master-task-ledger.vercel.app/` to the checkpoint-compatible production deployment/code.
8. Verify the restored system before declaring rollback complete: Task Manager loads; existing tasks are present; Hub → Project → Major Task → Microtask organization works; drag-and-drop editing works; Network HQ loads; profiles/resources remain intact; Calendar still works; Drive-linked files still work.
9. Report exactly what was restored, what post-checkpoint data was quarantined, and any differences that could not be automatically reverted.

Do not delete post-checkpoint databases, tables, backups, branches, or exports during rollback. The goal is to return production behavior to the saved checkpoint while preserving newer data for possible recovery.

---

## Definition of rollback success

Rollback is successful only when:

- the Task Manager production site works from its pre-merger backend
- the existing task structure is present
- Network HQ works independently as it did at the checkpoint
- existing Network HQ data is intact
- Google Calendar still functions on the pre-merger integration path
- Google Drive files/references remain accessible
- newer failed-migration data has been preserved separately rather than deleted

