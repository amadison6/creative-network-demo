# Phase 2 app integration checkpoint — 2026-10-08

Status: prepared and locally tested; **not deployed or activated**. Phase 2 and the full merger remain incomplete.

## Owner explanation

Separate development screens now exist in both app source projects. They create hubs/projects/tasks, edit and complete/reopen tasks, move/reparent tasks, link synthetic collaborators/dependencies, and attach Drive references. Both screens use the same editing rules through protected server routes. They currently require explicit refresh to see another view's changes. Existing Task Manager screens still use Blob; existing Network HQ screens and profile badges still use their legacy routes.

## Test boundary and authentication

- `shared-backend/work-test-boundary.mjs` maps trusted schema identifiers to a fixed `dev_work_*` namespace and `dev_profiles`. It rejects unknown Work identifiers and preserves quoted values/comments. This supports a test namespace in the existing logical DB, without another permanent D1 or any writes to the verified `work_*` checkpoint.
- `shared-backend/schema/003_development_namespace.sql` is prepared, **not applied remotely**. Synthetic profile records must be seeded explicitly; real profiles/files/task payloads are not copied by it.
- Sites browser route requires the existing trusted owner check plus an explicitly configured owner email. All test routes require WORK_DEVELOPMENT_ENABLED=isolated-test; the namespace still must contain the isolated marker and no migration batch.
- Browser source/actor labels are overwritten server-side. Receipt fingerprints record the trusted actor ID. Owner sessions are HMAC-signed, expire in one hour, and are handed to Task Manager using a POST form from the owner-authenticated Sites route. Cookies are Secure, HttpOnly, SameSite=Lax and Path=/; no API secrets are embedded in browser scripts.
- Task Manager uses a server-only transport to the **fixed existing Sites origin**. Only its development owner cookie is forwarded, not other Vercel/app cookies. Work API and Sites dispatch credentials remain server-side.
- No environment/secret/session rollout was performed. Real sign-in/dispatch and Vercel function packaging still require deployed integration tests.
- Browser routes cannot call link/pull/flush Calendar operations; no live Calendar provider or job was bound. The Google bridge extension remains uninstalled.

## Files and provenance

The audit repository contains reusable runtime modules, self-contained Task Manager development assets/functions, and Sites route templates under `sites-integration/`. The actual Sites checkout includes these development routes and matching assets beside existing routes. Sites route templates assume the existing app/lib/ledger.ts owner check; preserve that dependency.

The Task Manager root is self-contained: session modules are mirrored under `task-manager/lib/work/`, and browser modules are mirrored at its root. Reusable source originals are under `shared-backend/`; keep mirrors byte-identical when changing them. No production app entry points, Blob state API, deployed schema, old Calendar handlers, or Drive integrations were changed.

## Verification

```sh
node shared-backend/tests/phase2.mjs
node shared-backend/tests/bridge-extension.mjs
node shared-backend/tests/app-integration.mjs
```

- 102 earlier Work/Calendar/recovery assertions passed again.
- 20 saved bridge-dispatcher assertions passed again.
- 52 additional app-boundary assertions passed: both browser clients through server route handlers, authenticated Task Manager-to-Sites transport, same-data edits, stale rejection, retry receipts, actor/source spoof rejection, development/owner/origin/body gates, HMAC expiry/tampering, secure session handoff and cookie flags, namespace confinement, secret exclusion, and preservation of the checkpoint/legacy sentinel.
- Total: **174 isolated assertions**, using in-memory SQLite and in-process request handlers, not live D1/OAuth or a real browser.
- Sites production bundle build passed with the additional routes.
- TypeScript still reports the pre-existing `app/api/schedule/route.ts:155` optional DB error. New routes produced no TypeScript errors. This is a limitation, not a clean full-project typecheck.
- No control-browser skill was available, so browser interaction, layout, accessibility and actual hosted sign-in remain unverified. Static module syntax was checked.
- Fresh owner shadow read compared against the authoritative verified Phase 1 payload: 69 tasks, 6 hubs, 21 projects, 34 people links, 8 dependencies, 1 reference and 114 aliases; zero parity failures. Batch remains verified and not activated.
- Blob revision 68 is the previous checkpoint, not a newly verified revision in this continuation. No Blob writes were performed.

## Next safe tasks

1. Obtain the existing deployed Apps Script project/source, active deployment version, and appsscript.json OAuth manifest. Neither connected Drive account returned a native Apps Script project in the targeted search. A saved source file is insufficient to establish deployed identity.
2. Review the prepared test-namespace migration, synthetic seed, secret/session provisioning and exactly scoped test calendar before remote testing. Do not run original 002 Work migration or enable v2 against the verified checkpoint.
3. Validate actual Sites/Vercel auth, namespace isolation on D1, app screen behavior and private route access. Session handoff depends on matching configured owner ID/session signing key and existing Sites dispatch access; these are not configured by this checkpoint.
4. Verify deployed bridge extension, Google scopes, Calendar UID-to-REST-ID aliases, direct Calendar edits/app edits/conflicts and propagation latency on an explicit test calendar. Preserve production events.
5. Resolve recurring/new-event semantics and final interface scope; perform live recovery/parity before proposing separately approved cutover.

Recovery: no production rollback is needed for these undeployed changes. Disable the test feature, preserve newer test data and receipts, then restore earlier behavior. Never delete the staged checkpoint, newer production writes, backups or provider events.

## Saved Site source

The integration source was pushed to the existing private Sites repository as `5f4ae519c384106170d1b5a4b2f5bebde098ef45` and packaged successfully. It is saved as unpublished Site version 72; live production remains version 71/source `5620cd09d303417d64042847ddf47a02d1a37b2e`. No deployment call was made. The first source-save attempt needed a renewed short-lived credential; the same project/repository was reused.
