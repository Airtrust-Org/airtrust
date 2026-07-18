# Staging runtime forensics — 2026-07-18

## Verdict

`ROLLBACK_STAGING` was correct. No traffic split or edge cache was observed.

## Cloudflare evidence

- Failed deployment `ffb376ae-bad3-44b9-a8b6-ad5a444b8906` was 100% traffic,
  created at `2026-07-18T02:55:29Z`.
- It had `APP_VERSION=staging-2026-07-18T02:55:18Z-fd0a6c9b`, staging D1/R2
  bindings, and script ETag `b0cb0b40dce06a0e5808048beccb2fd781c7066661289baab63d44893c8ab1bd`.
- Rollback deployment `605a92ec-1d2f-40ae-8d2f-cbe1a7619aa2` restored
  `7f8bee25-8d7b-446d-84dd-184b636b0910` at 100% with the recorded message
  `Rollback staging: maintenance gate registered after route mounts`.
- The restored runtime returns the legacy 403 on all four canonical
  maintenance URLs. It reports the older `a4bffd61` application stamp and
  `X-AirTrust-Version: UDI`, demonstrating that the old header is a colo, not
  a Worker version.

## Root cause

`APP_VERSION` was a deploy-time binding, not bundle provenance. The candidate
version was deployed with a code path in which the maintenance gate was not
effective before maintenance router handlers. Those handlers emitted the
legacy localhost 403. The source at `fd0a6c9b` and a clean dry-run bundle both
contain `isMaintenancePath` and `localMaintenanceNotFound` before auth, so the
stamp alone could not prove that this source bundle answered the request.

The tracked `worker-airtrust/.tmp-worker-bundle/` also contains the legacy
message and must not be used as an input to a release. The current deploy
workflow must prove bundle identity through Cloudflare version metadata.

## Required release evidence

The next staging deployment must be 100%, return one Cloudflare Worker Version
ID on `/api/version`, `/api/health`, and all maintenance 404 responses, and
pass repeated nonce/no-cache probes before production is considered.
