# Phase 1 live additive deployment checkpoint


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

## Protected table verification

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

Private source payload was rebuilt from current revision 68 using the unchanged
branch builder in a data-only runtime. Counts: {"hubs":6,"projects":21,"tasks":69,"peopleLinks":34,"dependencies":8,"resources":1,"sourceAliases":114}.
No payload JSON or authentication secret is committed here.
