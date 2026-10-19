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

## October 19 private control-plane increment — not deployed

The isolated service has a versioned **private-only** staging Wrangler manifest at
`ops/frms-qa-repair/wrangler.staging.toml`: D1 UUID and database name are
fixed, the separate R2 bucket is named, a single SQLite Durable Object owns the
receipt/nonce/audit lock, and `workers_dev=false`, `preview_urls=false`, with
no HTTP routes. `wrangler deploy --dry-run` is a **bundle check**, not
provisioning or a claim that any external binding exists.

The repair Worker now refuses even `prepare()` unless an authorized service
binding caller provides a 90-second HMAC-SHA256 capability that names
`prepare` or `apply`, exact release SHA, staging D1 UUID, tenant 999013,
GitHub runner run ID/attempt and a single-use 64-hex nonce. The HMAC key is
a separate private `CALLER_KEY_HEX` and its independently pinned
`CALLER_KEY_SHA256`; neither key nor proof appears in code or workflow inputs.
The Durable Object records consumed caller nonces transactionally. The HMAC
capability **does not replace** the independently signed Ed25519 grant for the
eight-row apply. This is a private RPC guard, **not a ready public caller or
evidence of a live authorized workflow**.

`ops/frms-qa-repair/verify-readiness.mjs` and
`.github/workflows/staging-frms-qa-private-readiness.yml` perform **GET-only**
verification of the actual D1 UUID/name, dedicated R2 bucket, zero custom
domains, disabled managed r2.dev domain and enabled deletion after at most
86400 seconds on the exact `frms-qa/999013/` prefix. Any unexpected API shape,
absence of bucket/token or permissive lifecycle fails closed. The workflow
requires `CLOUDFLARE_FRMS_QA_READ_API_TOKEN` in the protected staging
environment, with read-only D1/R2 metadata permissions; the name's existence
is not proof that the token is provisioned. A staging admin must independently
review the verified read-only output before setting
`PRIVATE_STORAGE_VERIFIED=restricted-r2-lifecycle-1d`. The JSON inventory is
only a resource readiness gate; it cannot attest deployed runtime secret values,
service binding permissions or issuance of an Ed25519 grant.

**Still required before any remote mutation:**

1. A reviewed and specifically authorized private staging deployment and
   service-binding **caller transport** whose lifetime holds the repository's
   `airtrust-staging-mutations-and-scorm-qa` group across preparation,
   signature approval, apply and durable confirmation. Do not expose an HTTP
   repair route. A nonce/HMAC alone does not prove a GitHub run is still active.
2. Independently provision dedicated private bucket and 24h deletion rule,
   release-pinned D1 binding, Durable Object, least-privilege Time Travel
   read-only token, protected Ed25519 public key/fingerprint, caller HMAC key
   and AES preimage key. No private Ed25519 signing key belongs in the Worker.
   The correct D1 UUID in source is not proof of the deployed Cloudflare binding.
3. A **separate exact grant** by release coordination for current deploy
   SHA/bundle, tenant 999013, exact 8 IDs, SQL digest, receipt, preimage and
   recovery bookmark, with at most 15-minute TTL and nonce. No general
   project authorization substitutes for this signature.
4. A governed mutation workflow with fail-closed receipts, shared lock and
   independent post-apply read-only preflight. An interrupted batch must
   remain quarantined until separately approved reconciliation/compensation.
5. Separate authorization and end-to-end evidence for the four **mutable**
   case-treatment/effectiveness/closure cycles; the data-link repair grant
   never authorizes those case updates.

At the last physical check, #39301760305 remained 0/4 with four legacy
alerts and four MANUAL journeys; browser #39301535598 failed at zero cases.
Do not repeat either unchanged and do not call infrastructure readiness an
FRMS operational acceptance.

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
