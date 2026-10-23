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
