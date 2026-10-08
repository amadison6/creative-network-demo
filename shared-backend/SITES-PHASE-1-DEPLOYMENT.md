# Phase 1 in the existing Network HQ Site — verified

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

## Deployment provenance and access

Network HQ runs on ChatGPT Sites as Creative Network Map at
https://creative-network-map.ausarmadison.chatgpt.site.
Sites manages its physical Cloudflare resources privately. Do not invent a D1
UUID or deploy the standalone example against its placeholder identifiers.
The user explicitly accepted the existing Site + DB binding identity.

- Existing production baseline: Site version 70, source
  `390d23bf0809173879a5d999906da8fdbd06498d`.
- Current additive deployment: Site version 71, deployment
  `appgdep_6ac74e02f164819192d132fa406e1e36`, environment revision 5.
- The existing DB / BUCKET manifest bindings and owner-only access were preserved.
- Only 11 new work_* tables/indexes were applied. Existing migration SQL and
  snapshots were preserved. No legacy ALTER/DROP/data rewrite was included.
- Work REST requests require WORK_API_TOKEN. The native MCP owner authentication
  passes that secret internally after its existing owner check; no token is
  returned to clients. No credential is committed to source or browser code.
- There is no operational task-write or activation/cutover endpoint.

## Source and audit patch

`sites-integration.patch` records the additive runtime, migration and test changes
against version 70. The full generated Drizzle snapshot is in the saved Site
source; it is omitted from the audit patch to avoid copying every unrelated
existing table definition into this PR. Restore the exact saved Site source for
deployment rather than applying the audit patch alone.

The isolated SQLite test and production build passed before deployment. Full
TypeScript checking still has one pre-existing optional-DB error in
app/api/schedule/route.ts; the Work files introduced no type error. Live native
owner calls and complete source/export parity subsequently passed.

## Safe stop and rollback

Task Manager still uses private Blob; Network HQ still uses its existing D1.
Google Calendar and Drive integrations were neither severed nor activated for
new two-way Work mutation. Drive remains the actual file/document store.

Do not merge PR #4, activate the batch, switch Task Manager reads/writes, or begin
Phase 2 without explicit approval. On a behavior rollback, preserve staged data
and newer backups first, then restore Site version 70 and/or the pre-merger GitHub
checkpoint as appropriate. Do not delete the work_* data to roll back behavior.
