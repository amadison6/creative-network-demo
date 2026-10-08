# Phase 1 verified checkpoint — 2026-10-08

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

## Counts and parity

| Entity | Source | Actual D1 export |
| --- | ---: | ---: |
| hubs | 6 | 6 |
| projects | 21 | 21 |
| tasks | 69 | 69 |
| taskPeople | 34 | 34 |
| dependencies | 8 | 8 |
| resources | 1 | 1 |
| sourceAliases | 114 | 114 |

All migrated fields were compared, including status, hierarchy, task text,
timing, revisions, canonical people links, dependencies, resources and aliases.
All canonical identity sets match. Missing/extra/duplicate identities, orphan
links, invalid parents and dependency cycles: 0. Import history: 96 rows with
matching expected IDs, source revision 68, and stage action.

## Protected legacy data

| Table | Rows checked | Projection unchanged | Truncated values |
| --- | ---: | --- | ---: |
| assets | 54 | Yes | 0 |
| availability_entries | 14 | Yes | 0 |
| demos | 7 | Yes | 0 |
| event_profiles | 30 | Yes | 0 |
| events | 16 | Yes | 0 |
| hub_memberships | 37 | Yes | 0 |
| hubs | 24 | Yes | 0 |
| links | 202 | Yes | 0 |
| location_relationships | 3 | Yes | 0 |
| notes | 1 | Yes | 0 |
| profiles | 50 | Yes | 8 |
| relationships | 90 | Yes | 0 |
| resources | 14 | Yes | 0 |
| schedule_entries | 8 | Yes | 0 |
| schedule_participants | 24 | Yes | 0 |
| shoot_locations | 1 | Yes | 0 |
| task_profiles | 15 | Yes | 0 |
| tasks | 22 | Yes | 1 |
| untitled_projects | 0 | Yes | 0 |

The 9 truncated legacy values were not byte-compared; their returned record
projections, IDs, revisions and timestamps were unchanged. No staging SQL writes
legacy tables. The exact private payload/export archive is separately saved;
no private source records or API tokens are committed in this checkpoint.
