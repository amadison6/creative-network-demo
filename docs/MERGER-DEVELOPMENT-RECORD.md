# Merger development record and developer handoff

Last updated: 2026-10-08. This is a living engineering record, not a claim that the merger is finished.

## Owner-approved boundaries

The owner approved Phase 2 development/testing on 2026-10-08: “yes. i also want you to include/explain the phases of this merger in the manual … keep a paper trail … hand it over to an actual developer.”

Task Manager must remain on private Blob until separately approved cutover. PR #4 stays draft/unmerged. Preserve the existing Network HQ D1 and every legacy profile, relationship, event, schedule, note, asset, demo, resource and file record. Keep Drive files in Drive and Calendar events in Calendar. No second permanent D1. Credentials stay server-side.

## Phases explained

| Phase | Owner explanation | Current status | Evidence / next gate |
| --- | --- | --- | --- |
| Safety checkpoint | Save the working system so we can recover safely. | Recorded | safety/pre-d1-merger-2026-10-07; pre-merger commit a0a6d141002d39d8fbb43a6b9cf2f2736a59237c; safety plan below |
| Phase 1: centralize a copy | Copy the reconciled tasks into the existing D1 and prove they match before using them live. | Live staging verified, not active | 69 tasks; 0 parity failures; batch phase1_68_f2ab6e322ba4; checkpoint below |
| Phase 2: shared editing and Calendar sync | Build secure edits and test changes from both interfaces and Google Calendar, with conflict protection and recovery. | Development/testing authorized; live activation not authorized | Record implementation and test results separately from production state |
| Later: cutover | Change which backend the live Task Manager uses, after all checks pass. | Planned, separate owner approval required | Preserve newer data, repeat live parity, approve exact rollout/recovery plan |
| Later: one Network HQ interface | Consolidate the two views into the agreed final app while retaining the shared data. | Planned | Record actual scope, user acceptance and verification before calling the merger complete |

Later phase names are planning labels; preserve actual decisions and dates as the project progresses.

## Production checkpoint

- Task Manager: https://master-task-ledger.vercel.app — private Blob, revision 68 at the last verified checkpoint.
- Network HQ: https://creative-network-map.ausarmadison.chatgpt.site — existing Sites-managed D1 logical binding DB, project appgprj_6ab0c1e933608191b1e667e5e9c4147a.
- Physical Cloudflare DB name/UUID is hidden by Sites; logical identity was explicitly accepted by the owner. Do not create a replacement database.
- Network HQ deployed source 5620cd09d303417d64042847ddf47a02d1a37b2e; Site version 71. The GitHub merger repo is an audit/development repo, not the complete deployed Sites source.
- Phase 1 import: 6 hubs, 21 projects, 69 tasks, 34 people links, 8 dependencies, 1 resource reference, 114 aliases, 96 history rows.
- Task Manager reconciliation: cutoverReady=false; no unresolved conflicts; 6 preferred status differences intentionally preserved.
- Historical Google Sheet T-023 / Drew task is A-035, distinct from Task Manager T-023 / September Monthly Report.
- Private verification backup: Network-HQ-Phase1-Verification-Backup-2026-10-08.zip. Do not commit private exports to GitHub.
- Legacy pre/post projections matched for 19 protected tables. Native reads truncated 8 profile values and 1 legacy task value; hidden portions were not byte-compared.

## Code and evidence index

- GitHub: amadison6/creative-network-demo.
- Phase 1 branch: phase1/d1-centralization; PR #4 draft/unmerged.
- Deployed Sites source: open the existing project through Sites; preserve .openai/hosting.json, DB and BUCKET bindings, and existing integrations.
- [Safety and recovery](NETWORK-HQ-TASK-MANAGER-MERGER-SAFETY-PLAN.md)
- [Phase 1 runbook](PHASE-1-CENTRALIZATION-RUNBOOK.md)
- [Phase 1 live verification](PHASE-1-VERIFIED-2026-10-08.md)
- [Final manual requirements](OWNER-MANUAL-DELIVERABLE-REQUIREMENTS.md)
- [Sites Phase 1 integration](../shared-backend/SITES-PHASE-1-DEPLOYMENT.md)

## Handoff rules

Each meaningful milestone must append its date, purpose, approval scope, changed files/schema, commit/PR, deployment version if any, checks and results, limitations, next safe action, and recovery implications. Never overwrite old checkpoints with newly inferred facts. Keep proposed, tested, deployed and activated states distinct.

A new developer should obtain owner-granted access to GitHub, the existing Sites source/runtime, Vercel Task Manager and the existing Google connector. Document secret names and provisioning locations, never values. Before a deployment, check whether production data or code has changed since the last checkpoint.

Emergency recovery: first export/preserve newer Blob/D1/Calendar state and queued changes, then restore pre-merger production behavior. Keep the staged database, backups and history. A code rollback alone does not undo writes safely.

## 2026-10-08 — Phase 2 isolated development milestone

Approval: Phase 2 development/testing, no cutover. Branch phase2/shared-work-editing is based on the Phase 1 documentation checkpoint 8400bff8b669090a9e3e818fe60cd39d42b1785b; operational Phase 2 code is kept out of PR #4.

Built shared editing/validation/revisions/history, two development view adapters, Calendar event linkage/mirror/outbox/cursors/conditional patches/conflict review, unbound server cycle runner, server-only provider/bridge contract and checksummed exports. 102 isolated assertions and Worker dry-run bundling passed. Live Phase 1 shadow parity was rechecked against the verified backup: 69 tasks, zero differences; verified-not-active remains intact.

No Phase 2 production deployment/schema migration or live Calendar call occurred. Actual app screen integration, exact deployed Google bridge source/manifest review, real authorization/sync checks, recurring/new-event design and live recovery remain open. Phase 2 is not complete. Existing Task Manager /api/state Blob routing remains unchanged.

- [Detailed checkpoint and remaining gates](https://github.com/amadison6/creative-network-demo/blob/phase2/shared-work-editing/docs/PHASE-2-DEVELOPMENT-CHECKPOINT-2026-10-08.md)
- [Developer setup, API contract and architecture](https://github.com/amadison6/creative-network-demo/blob/phase2/shared-work-editing/docs/PHASE-2-DEVELOPER-HANDOFF.md)

Next safe task: obtain/review the current Apps Script bridge source and OAuth manifest, then integrate an explicitly isolated owner-authenticated test path. Preserve the verified Work copy and existing Google connection.

Follow-up in the same session: the saved Library connector source v2 was located and read after Drive discovery did not establish it. A small additive auth-preserving dispatcher patch was prepared; 20 more isolated bridge checks passed (122 total). Saved source is not proof of the currently deployed version, and its private secret was excluded from GitHub. Remaining gate: match deployed source/manifest, reconcile legacy iCalendar UIDs to REST event IDs explicitly, then validate real app/provider behavior. Phase 2 draft PR: https://github.com/amadison6/creative-network-demo/pull/6 (unmerged).

