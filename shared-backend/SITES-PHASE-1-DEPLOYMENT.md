# Phase 1 staging in the existing Network HQ Site

The live Network HQ D1 is provisioned by ChatGPT Sites. It is not a database in
the owner's currently selected personal Cloudflare account. Sites owns the
physical Cloudflare resources; use the existing logical binding, never invent a
database UUID or deploy the standalone Worker example with its placeholders.

Verified target:

- Site: Creative Network Map
- project_id: `appgprj_6ab0c1e933608191b1e667e5e9c4147a`
- existing binding: `DB`
- existing live version: 70
- existing live source: `390d23bf0809173879a5d999906da8fdbd06498d`
- physical database name / UUID: not exposed by the available Sites tools
- published Site already hosts the authenticated Network HQ API and MCP endpoint
- live database overview confirmed profiles, relationships, tasks, events,
  schedules, resources, assets and their history; no work_* tables yet

The user required physical database name and ID verification before live writes.
Because those fields are managed privately by Sites, the prepared version is
saved without deployment pending explicit acceptance of the verified Site + DB
binding identity as the alternative identity check. This is not Phase 2 approval.

## Prepared delta

- Keep `.openai/hosting.json` and its existing DB / BUCKET declarations unchanged.
- Add only the 11 work_* tables and indexes using the new Drizzle migration.
- Keep all existing migration SQL and snapshots immutable.
- Add `/api/work/health`, `/api/work/v1/work/state`, and staged import/verify routes.
- Add three owner-authenticated Phase 1 MCP tools to the existing Site plugin.
- The staging API requires server-side WORK_API_TOKEN. MCP uses that secret only
  after the existing owner authentication passes and OWNER_EMAIL is configured.
- There is no operational write or activation/cutover endpoint.
- No existing Calendar, Drive, profile, task, event or schedule behavior changes.

## Validation completed locally

With the current private Blob revision 68 payload, isolated SQLite staging and
full parity passed for 6 hubs, 21 projects, 69 tasks, 34 people links,
8 dependencies, 1 resource reference and 114 aliases. Import history has 96 rows.
The test refuses invalid credentials/checksums, unknown profiles, cycles and
corrupted exports. It preserves separate Google Sheet T-023 and Task Manager
T-023 identities, with the Drew task linked to A-035. It verifies existing-table
schema/rows stay unchanged in the isolated test and no activation route exists.

This is local validation, not live D1 parity. Live gates 1–5 remain incomplete.
The production build passed. Full typechecking reports a pre-existing optional
DB error in app/api/schedule/route.ts; no new Work file reports a type error.

## After identity confirmation

1. Recheck live Blob revision/reconciliation and Network HQ health.
2. Configure WORK_API_TOKEN using Sites secret environment storage only. Do not
   put it in source, the browser, Library exports, or the GitHub PR.
3. Publish the saved additive Site version to the same project/binding.
4. Confirm the new tables and health response, then check existing Network HQ data
   and integrations have not changed.
5. Rebuild the private payload if the Blob revision changed. Stage only once.
6. Export actual D1 Work state; run the full verifier against the private source.
7. Call the full-verify operation using that same source payload. It can mark
   verified-not-active only after parity and audit history checks pass.
8. Expose the read-only shadow state through network_work_phase1_state. Stop.

Never point Task Manager at D1 or merge GitHub PR #4 during this Phase 1 process.
Preserve staged data and use saved Site version 70 plus the pre-merger GitHub
checkpoint for rollback of behavior if needed. Never delete the new tables/data
to roll back. Google Drive remains the actual file store.

## Saved review checkpoint (2026-10-08)

Prepared Site version: 71 (unpublished, deployment_id null).
Source commit: `5620cd09d303417d64042847ddf47a02d1a37b2e`.
Saved version ID: `appgprj_6ab0c1e933608191b1e667e5e9c4147a~appgver_463e958b09bc8191afad30d2b177c976`.
The live Site remains version 70. Native live overview still has no work_* tables.

`sites-integration.patch` records the additive runtime, migration and test changes
against the verified version-70 source. The full generated Drizzle snapshot is
in the saved Site source; it is omitted from the audit patch to avoid copying
all existing unrelated table definitions into this PR. Restore the exact saved
Site source for deployment rather than applying the audit patch alone.
