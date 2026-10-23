# FRMS QA — proposed token-free runtime recovery handoff (prototype, not deployed)

**Status: disposable security prototype only, pending separate architecture and security review.**
Relates to #1426, coordination #776. No staging/production rollout or data repair is
authorized by this proposal. The existing private Worker keeps its current fail-closed
requirements, including `D1_READ_TOKEN`.

## Evidence-based motivation

The Cloudflare D1 **Time Travel** current-bookmark endpoint is a GET requiring a
token with either D1 Read or D1 Write. The staging GitHub secret
`CLOUDFLARE_WORKER_API_TOKEN` was actually shown to succeed against that GET.
GET success **does not** establish least-privilege D1 Read access. That existing
staging deployment token must not be copied into the private Worker's runtime.

A future tightly governed Actions runner could fetch the Time Travel bookmark
with the *existing token inside its ephemeral job*, and pass only the bookmark
and a separate HMAC-authenticated, release-pinned claim across an authenticated
service binding. No new Cloudflare API token would be needed **for the runtime**
if this architecture passed additional review and full integration testing.

This is NOT an implementation of that caller, a Cloudflare API client, or a
change to the current `prepare`/`apply` flow. A D1 Sessions bookmark is NOT
substitutable for a real Time Travel bookmark.

## Prototype contract

`ops/frms-qa-repair/recovery-handoff-prototype.mjs` signs a fixed set of claims
with an HMAC domain separator distinct from the existing caller capability.
It binds exact staging Cloudflare account, database UUID, synthetic tenant
999013, release SHA, operation, GitHub run ID/attempt and caller nonce,
a fresh Time Travel bookmark, short-lived issue/capture/expiry timestamps,
and a distinct single-use recovery nonce. A disposable transaction-backed
ledger rejects replay. Invalid fields, timestamps, MACs, cross-run references
or a failed ledger fail closed. Tests use **only synthetic data**, not D1 or R2.

**Limitations:** an HMAC proves a particular key holder asserted the claim,
NOT that Cloudflare generated the claimed bookmark. The future runner must
independently prove a successful fixed-endpoint HTTPS GET, account/DB match,
freshness, a protected job identity and accurate audit/provenance; its key
must remain restricted. Reviewer must demonstrate network and
service-binding isolation, durable ledger preservation across updates,
and fail-safe behavior on interrupted preparations. A transport cannot
accept arbitrary caller-provided bookmarks. Data repair still needs the
**independent Ed25519 signature on exact receipt** with <=15-minute TTL,
the shared staging mutex, authenticated private caller, separate case
authorization and verified recovery/compensation. Do not enable apply from
this prototype. A standalone GitHub issue grant cannot replace Ed25519.

## Deployment status and next gate

The Cloudflare bucket and privacy/lifecycle are already verified; private
Worker, trusted caller and signer are NOT provisioned. This prototype
changes no production binding, Wrangler config, deploy workflow, Cloudflare
token or issue authorization. The next valid step is independent code and
threat-model review of the proposed trusted-runner/bookmark provenance,
followed by an isolated integration test. **No remote write or Worker
deployment is permitted on this evidence.**

## Increment: isolated trusted-runner fixed-endpoint acquisition

`ops/frms-qa-repair/trusted-runner-bookmark-acquisition.mjs` adds
`captureTrustedRunnerRecoveryHandoff` for a **future, separately authorized
trusted runner only**. It pins the exact HTTPS Cloudflare D1 Time Travel bookmark
GET URL for the known staging DB, uses redirects disabled, enforces a successful
JSON API envelope with a bounded bookmark, and then signs the acquired value
using the already-reviewed HMAC claim contract. Scope is checked **before**
any GET. Its bridge HMAC key is required to be distinct from the private caller
HMAC key; neither must be derived from a Cloudflare API token or copied into
an unauthorized transport. Tests explicitly confirm that a caller-supplied
bookmark is ignored, redirect/403/errors are denied, token values are absent
from returned proof, and replay/operation mismatch are rejected.

The code is **not** wired into GitHub Actions dispatch, a private
service-binding transport, `worker.mjs`, `adapters.mjs`, or a Cloudflare
deployment. No real Cloudflare requests are made in CI; tests inject an
in-memory fetcher. The existing Worker continues requiring
`FRMS_QA_D1_READ_TOKEN`; this experiment does **not** remove that requirement.
A genuine trusted runner must pin the GitHub run identity and `GITHUB_SHA`
outside this API, never accept account/DB from an untrusted actor,
keep the bridge key separate, and avoid printing the raw bookmark or claim.
The HMAC alone does **not** independently prove Cloudflare provenance;
TLS/runner attestation, lifecycle and audit need review. No new token is created
or requested by this increment.

**Mandatory gate before runtime integration:** security review of trust
boundaries, failure/replay recovery, provenance, run mutex and Ed25519
independent sign-off. A runtime change would require its own new protected PR,
staging validation and exact per-phase authorization. No existing bucket-only
grant may be reused.

## Governed staging READ-ONLY proof (no persistent bridge trust anchor)

The optional manual workflow `.github/workflows/staging-frms-qa-bookmark-local-readonly.yml`
pins the current `main` SHA, requires an explicit GET-only confirmation and
serializes on the shared staging mutex. Within one ephemeral GitHub Actions
job it uses the **already installed** `CLOUDFLARE_WORKER_API_TOKEN` and
the existing caller key to obtain a real Time Travel GET from the exact
staging D1 UUID. A newly randomized **ephemeral HMAC proof key** distinct
from the caller key is used only for immediate local verification, together
with a disposable in-memory replay ledger.

Only a sanitized PASS/FAIL is permitted in the job log. No bookmark, account
secret, HMAC key, MAC, private row, token or proof payload is printed or
persisted. The GET uses the existing Cloudflare token; it does not issue or
rotate a token. There is no POST/PUT/PATCH/DELETE, D1 SQL or R2 operation.
The tool cannot deploy or invoke the private FRMS Worker.

**This test deliberately does not establish an independently controlled,
persistent bridge trust anchor or a secure cross-service transport.** The
ephemeral HMAC key and replay ledger vanish with the job; this proof cannot
authorize `prepare` or `apply`. The independent Ed25519 authority,
runtime least-privilege architecture, governed service-binding caller and
specific F0 phase grant remain unsatisfied. Execution is permitted only as
diagnostic read-only verification; do not call the Worker operational.
