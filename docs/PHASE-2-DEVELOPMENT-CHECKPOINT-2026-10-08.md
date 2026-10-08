# Phase 2 development checkpoint — 2026-10-08

Status: isolated development milestone verified. Phase 2 is **not** complete or live. No production deployment, schema application, task write, Calendar write or cutover occurred.

## Owner explanation

We built the controlled editing layer and tested how two development views can share it. We also built the Calendar synchronization logic and tested direct Calendar edits, app edits, collisions and recovery with a simulated Calendar. The actual app screens and existing Google connection still need integration and live verification.

This checkpoint records working development code, not a claim that the live apps already share edits.

## Approval and implementation

The owner approved Phase 2 development/testing on 2026-10-08, with Task Manager remaining on Blob and no cutover. Code is on phase2/shared-work-editing, based on phase1/d1-centralization. PR #4 stays draft/unmerged.

- Standalone authenticated v2 development Worker; disabled unless WORK_WRITE_MODE=isolated-test, a matching DB marker exists, and there are **no migration batches**. The verified Phase 1 DB copy is therefore refused even if the environment flag is mistakenly enabled.
- Create/update hubs, projects and tasks; move/reparent with descendant consistency; complete/reopen/archive; people, dependencies and Drive reference metadata.
- Immutable canonical IDs, existing source aliases preserved, optimistic global/entity revisions, atomic change history and idempotent retry receipts. Concurrent graph writes cannot both commit against the same state revision.
- Additive, development-only work_operation_requests, work_event_metadata, work_calendar_cursors and work_calendar_outbox schema. It has NOT been applied to the production D1.
- Shared Network HQ/Task Manager development view adapters. They are **not imported by the production app screens**.
- Explicit Calendar event linkage; event metadata in D1; app edits enqueue durable intent atomically; conditional outgoing patches; paginated incremental reads; cursor expiry recovery; non-overlapping field merging; sticky conflicts with explicit version-reviewed resolution; cancellation/missing states preserve tasks.
- Server cycle runner prepared, but no production scheduler/webhook is registered.
- Server-only HTTP transport and an additive extension contract for the existing Apps Script bridge. The extension is not installed. It requires existing owner authentication plus an explicitly configured test calendar allowlist.
- Checksummed read-only Work export; no destructive restore or activation endpoint.

## Evidence

Run with Node 24 (node:sqlite is used only by the test harness):

```sh
node shared-backend/tests/phase2.mjs
```

102 isolated assertions passed: authentication/mode/checkpoint guards, request limits, hierarchy and cycle rejection, canonical identities, profile/Drive links, both development adapters reading each other's edits, stale-write rejection, retries, concurrent transactions, injected batch failure, Calendar round trips, pagination, ETags, independent-field merging, same-field conflicts, explicit conflict review, 412 rejection, remote-write/local-ack crash recovery, cursor failure/expiry, cancellation preservation, all-day events, recurrence refusal, bridge transport and export/restore into a fresh ephemeral database.

Worker bundling passed with Wrangler 4.92.0 --dry-run, no resource bindings and no upload/deployment. Generated output is reproducible and is not a production artifact.

The live Phase 1 owner shadow was re-read and compared to the authoritative payload in Network-HQ-Phase1-Verification-Backup-2026-10-08.zip: 69 tasks, 6 hubs, 21 projects, 34 people links, 8 dependencies, 1 resource, 114 aliases, **0 parity failures**. Batch phase1_68_f2ab6e322ba4 remains verified with activated_at=null. An older scratch payload did not match migration timestamps/batch identity; it was discarded as a comparison source in favor of the saved verified backup.

No live writes or live Google API calls were made. Blob revision 68 is the last Phase 1 checkpoint; it was not freshly read in this development run. Existing production sources/routes were not edited.

## Remaining Phase 2 gates

1. Obtain/review the exact deployed Apps Script source and OAuth manifest before extending its dispatcher. The current Site bridge calls expose calendar_status/list/upsert/sync_batch, not the new get/delta/If-Match contract. A Drive search for Apps Script/Bridge and then Network did not establish the deployed bridge source. Do not replace it blindly or disconnect its Google authorization.
2. Wire owner-authenticated development screens/proxies in the actual Sites and Task Manager source, preserving the existing production paths. The Task Manager currently uses /api/state; Network HQ's /api/work is the Phase 1 staging API.
3. Establish an explicitly isolated integration-test data boundary on the existing service; preserve the verified 69-task copy. Do not enable this v2 development Worker against that checkpoint. No second permanent D1 is permitted. Disposable local SQLite is used for current tests.
4. Validate real D1 behavior, existing Google authorization/scopes, explicit test Calendar ETags/cursors, scheduled propagation latency, private app auth and both actual app screens. The current fake provider tests cannot establish these facts.
5. Design/test recurring events, creation of new Calendar events and schedule-to-task semantics. Current scope deliberately supports existing explicitly linked non-recurring events and all-day events; it refuses recurring events instead of risking series damage. These limitations are not owner acceptance of final deferred scope.
6. Repeat source parity and the live recovery rehearsal, then prepare the concrete cutover proposal for separate approval. Re-export current data; never assume Blob stayed at revision 68 while development proceeded.

## Recovery

Development requires no production rollback: nothing was deployed. Disable development writes to freeze state, export/checksum newer Work rows, history, outbox, cursors and receipts; separately preserve newer Blob state and relevant Calendar state before restoring older app behavior. Retain all exports and databases. The test restores into a fresh in-memory DB, not on top of production.

See [developer setup/API contract](PHASE-2-DEVELOPER-HANDOFF.md) and [the development record](MERGER-DEVELOPMENT-RECORD.md).
