# FRMS QA: private staging repair adapter

Scope: #1426 / #1476 / coordination #776. This is code for the reviewed eight-row
repair, not evidence that staging was repaired or IMA V3 scientifically validated.

## Cause and immutable scope

Authenticated QA run 39091457503 found 0/4 cases. Read-only run 39088839765
found four legacy alerts and four MANUAL journeys. Preserve the four-case assertion.
The adapter builds the already-reviewed plan internally; RPC callers cannot submit
SQL, table names, database bindings, keys, tenant IDs or fixture dates.

- D1: `airtrust-db-staging-baseline-20260701`
- UUID: `bf9963f4-eb12-439b-a830-20bbf577ac22`
- Tenant: `999013`, exactly fourteen active synthetic employees.
- Alerts: `qa-frms-ux-case-1` through `qa-frms-ux-case-4`.
- Journeys: `qa-frms-ux-j-2026-10-12-QA-FRMS-UX-01`,
  `qa-frms-ux-j-2026-10-11-QA-FRMS-UX-02`,
  `qa-frms-ux-j-2026-10-10-QA-FRMS-UX-01`,
  `qa-frms-ux-j-2026-10-09-QA-FRMS-UX-02`.
- SQL digest: `38a81ed05821919d87b424ddfc7b731bfc8d7d759dadebbb6a21d11edb349ed3`.

The controller now recomputes this digest from SQL, rather than trusting the
plan's declared hash. AES-GCM receives explicit UTF-8 bytes for Workerd support.
The existing seed module defers filesystem URL resolution until seed use; no seed
behavior, source classifications, limits or coefficients change.

## Private architecture

`ops/frms-qa-repair/worker.mjs` exposes only service-binding RPC `prepare()` and
`apply({receiptId, manifest, signatureBase64})`. HTTP always returns 404, with
workers.dev and previews disabled in the configuration template. No public API
or authentication whitelist is changed. No caller may supply a signing key.

One named Durable Object owns the lock, receipt references, append-only audit
records and permanent used nonces. Storage transactions reserve lock/nonce
atomically. Lock has no automatic expiry: a crashed process requires coordinated
inspection/recovery; it must never allow a second writer on a timeout. The lock
is **local to this service**, not a replacement for the repository's global
`airtrust-staging-mutations-and-scorm-qa` workflow concurrency group. The future
sanctioned caller must hold that group for the entire prepare/apply window and
serialize other database writers through coordination. No such caller is enabled
by this change.

The adapter reads target rows using tenant-scoped joins, hashes synthetic employee
state, memberships/roles/users and untouched tenant journeys/alerts, and stores
only encrypted preimages in a dedicated R2 bucket. Artifacts expire for reads
after one hour; infrastructure must also configure deletion lifecycle (one day),
public access disabled, restricted bindings and retention approved by coordination.
`PRIVATE_STORAGE_VERIFIED` is a trusted deployment attestation, **not an ACL check**.
It must not be set until these properties are independently verified. No ACL or
lifecycle was provisioned by this PR.

Recovery capture uses GET on the [Cloudflare D1 Time Travel bookmark API](https://developers.cloudflare.com/api/resources/d1/subresources/database/subresources/time_travel/methods/get_bookmark/),
with redirects rejected and a scoped read token. D1 session bookmarks are not
recovery evidence. Restore is never automatic. Preparation captures the bookmark,
apply captures a fresh bookmark and records it in the durable audit before D1.batch.

A separately controlled Ed25519 authority signs the complete receipt, release
SHA, DB UUID, eight IDs, digest, nonce and <=15-minute TTL. Public key fingerprint
and release SHA are deployment pins. AES key and public verification key remain
in private bindings; the Ed25519 **private** key must never be provisioned here.
No key generation or grant signing endpoint exists in the service.

Apply uses one real D1.batch, checks all eight CAS results and four valid linked
cases, then checks identity/untouched fingerprints. A failure after committed
batch is reported as requiring compensation; it is never called a rollback.
Inverse CAS remains a separate authorized operation in the existing executor;
this service intentionally exposes no unsigned compensation method. D1 Time
Travel restore affects the whole database and requires a separate recovery decision.

## Evidence and limits

Run `node --test scripts/__tests__/frms-qa-*.test.mjs` with repository Node version.
The new integration suite boots the real bundled service and exercises RPC,
D1.batch, R2 storage and Durable Object transactions in disposable Miniflare.
Only the Time Travel HTTP response is simulated, because this suite must never
contact remote Cloudflare. Tests cover encryption/readback, invalid grants,
identity/tenant drift, replay, concurrent apply, expired/corrupt storage, HTTP
rejection and rollback of earlier writes after a late D1 trigger failure.
This is not staging acceptance, a real Time Travel restore test, or scientific
validation. No production people are fixtures.

## Required external provisioning / application sequence

1. Review/integrate code after all eight official gates plus private integration.
2. Approve an exact deployment SHA/bundle and private resources, then add/use a
   sanctioned trusted-main workflow; template alone is not a deployment command.
   Configure service binding only for the governed runner, private R2 lifecycle,
   DO namespace, verified staging D1 binding, read-only recovery token, AES key,
   Ed25519 authority pin and runtime SHA. No production binding is permitted.
3. Hold the global staging concurrency group. Prepare real preimage and Time Travel
   receipt. Review sanitized receipt; keep encrypted data and key out of logs.
4. Obtain independent signed authorization for that exact receipt/SHA/artifact,
   UUID/tenant/eight IDs/digest/nonce/TTL. Generic continuation is insufficient.
5. Apply once, verify audit plus fresh read-only 4/4 preflight, then run authenticated
   Operação → Casos → detalhe → decisão → ações → relatórios → EVD. Any mutable
   treatment/effectiveness/closure cycle needs its own scope authorization.
6. Production remains separately SHA/artifact/scope/workflow-authorized. IMA V3
   stays shadow pending scientific review.
