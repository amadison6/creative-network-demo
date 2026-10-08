# Network HQ owner manual — completion requirement

completion_status: pending

Requested by the project owner on 2026-10-08. Create the final guide once the Network HQ + Master Task Manager merger is built and verified. This file records the requirement; it is not the finished-system manual.

## Completion gate

Phase 1 parity, a staged D1 copy, PR #4 merging, or a code deployment alone does not establish completion. Record explicit owner-approved completion with implementation and verification evidence before changing completion_status to built-and-verified.

The final evidence must cover the agreed shared D1 data model and app reads/writes, Google Calendar bidirectional propagation (including edits made directly in Google Calendar), Google Drive file references with files remaining in Drive, the agreed final interface, and a tested recovery procedure that preserves newer data. Any deferred scope must have explicit owner acceptance and be labeled as deferred in the guide.

Current checkpoint: Phase 1 verified staging only; Task Manager production remains Blob. PR #4 is draft/unmerged. On 2026-10-08 the owner explicitly approved Phase 2 development and testing while keeping Task Manager production on Blob. Production cutover remains separately approval-gated.

## Deliverable

A beginner-friendly “Network HQ Owner’s Manual,” preferably an editable DOCX plus PDF, saved privately and delivered to the owner.

Explain these terms in plain English with examples from the actual website: API, frontend, backend, database/D1, schema, canonical ID, Worker, binding, authentication, server-side secret, revision/change history, Hub, Project, Major Task, Microtask, dependency, reconciliation, parity, staging, shadow comparison, deployment, pull request/merge, cutover, rollback, synchronization/conflict, and Drive reference versus file.

Include:
- A diagram of the actual deployed website structure, showing interfaces, secure API/Worker, D1, Google Calendar, and Google Drive, with each component's responsibility.
- A data-flow diagram showing how an app edit and a direct Google Calendar edit propagate, including permission checks, conflict handling, and responses as actually implemented.
- A storage map explaining what lives in D1, Calendar, and Drive.
- Routine use, verification, maintenance, troubleshooting, and recovery instructions.
- A rollback explanation that preserves newer tasks/data and backups before restoring earlier working behavior.

Ground diagrams and instructions in the final implementation and verified behavior. Clearly label any planned or deferred feature. Do not include credentials, secret values, or private task contents. Do not activate, merge, deploy, cut over, or mutate production data merely to produce this document.

## Phase history and developer handoff

Explain each merger phase, its purpose in everyday language, what changed, how it was checked, whether it is planned/tested/live, and the approval needed for the next phase. Present the actual sequence; future phase names are planning labels until implementation decisions are recorded.

Maintain a development paper trail throughout the work, rather than waiting for the final manual. Use docs/MERGER-DEVELOPMENT-RECORD.md as the index. Link dated checkpoints, commits, pull requests, deployment versions, schema changes, test evidence, decisions and reasons, approvals, known limitations, unresolved issues, and recovery instructions. Record where code and services are hosted and how a new developer obtains access without publishing secret values. Include reproducible setup/check commands and the next safe task.

The final manual should have two reading levels: a plain-language owner guide and a developer handoff appendix. Preserve historical records; append corrections and clearly identify superseded facts.
