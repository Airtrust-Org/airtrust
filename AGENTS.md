# AirTrust agent guidance

AirTrust is a production multi-tenant aviation SaaS. Preserve tenant isolation,
RBAC, canonical LMS completion and real operational data. Never run production
deploys, D1 writes or migrations without explicit, scoped authorization. Keep
unrelated worktree changes intact; never reset, clean, stash or `git add .`.

## AirTrust Execution Contract

### Authority

- GitHub `Airtrust-Org/airtrust` and its `main` branch are the canonical code,
  branch, PR and merge authority.
- GitHub Actions is the canonical workflow/check surface when healthy.
- Google Cloud Build (GCB) is the official heavy-CI and governed backup
  execution path. When GitHub Actions has an operational incident, use the
  sanctioned GCB path without weakening required gates.
- Cloudflare is the staging and production runtime platform.
- GitLab is historical/legacy only. It is not a current code, merge, CI or
  release authority.
- CircleCI is retired and must not be used for current merge, release or
  deployment gates.
- Before CI-dependent work, inspect the current GitHub/GCB configuration in
  canonical `main`; do not reconstruct pipeline state from an old worktree or
  previous agent conversation.
- Do not bypass branch protection, required gates, tenant isolation, RBAC,
  migration governance or production authorization.

### Staging credentials and QA identities

- GitHub Environment `staging` is the persistent source of truth for staging
  secrets and synthetic QA login credentials. Worktrees, clones, shells and
  agent conversations are never credential stores.
- The canonical general-purpose staging QA login is
  `qa-agent@staging.airtrust.invalid`. It is synthetic and staging-only.
- Its durable password is `STAGING_SMOKE_PASSWORD` in GitHub Environment
  `staging`. Existing workflows that consume `STAGING_SMOKE_EMAIL` must keep
  that secret equal to the canonical login above.
- Agents must never ask for a staging password merely because they changed
  worktree or conversation. Diagnose the shared environment first.
- Never write staging credentials to tracked files, `.env` files inside a
  worktree, prompts, logs, artifacts or issue/PR bodies.
- General authenticated staging smoke uses the canonical QA login and
  `STAGING_SMOKE_PASSWORD` from Environment `staging`.
- Examiner-training synthetic QA uses `QA_EXAMINER_ADMIN_EMAIL` and
  `QA_EXAMINER_ADMIN_PASSWORD` from Environment `staging`. This identity is
  intentionally separate because it belongs to the disposable synthetic QA
  tenant and has different fixture/RBAC semantics.
- Cloudflare/D1 staging credentials must likewise be consumed only from the
  `staging` Environment by sanctioned workflows; never copy them into a local
  worktree to make an agent test pass.
- Before declaring credentials missing or invalid, run the sanctioned staging
  identity readiness workflow and, for Cloudflare credentials, the Cloudflare
  credential doctor. A failed readiness check is an infrastructure/config
  blocker to fix centrally, not a reason to create a per-agent secret copy.
- To provision/reseed/rotate the canonical general QA identity, use
  `.github/workflows/provision-staging-standard-identity.yml`. The seed must
  consume the central password; process-local/random fallback passwords are
  forbidden because the next agent cannot recover them.
- Authenticated tests that require a secret must run in a sanctioned GitHub
  Actions/GCB job that reads the Environment secret. If an interactive browser
  test needs the same coverage, add/extend a Playwright or equivalent staging
  workflow rather than exposing the password to the agent.
- See `docs/ops/STAGING_CREDENTIAL_CONTRACT.md` for the durable cross-agent
  contract and recovery procedure.

### Default autonomy

For requests to continue, finish, resolve, fix, merge, deploy, validate or
complete, continue through every safe, in-scope executable step to the stated
operational end state. Intermediate evidence is not a conversation boundary.
Do not stop merely because a browser test, upload, candidate, gate, CI, MR or
staging authentication checkpoint completed or expired. Use sanctioned seed,
reseed, browser restart/retry and recovery mechanisms directly.

### Real blockers

Return early only when further safe work is actually prevented: missing
artifact/SHA-specific production authorization; ungoverned destructive data
operation or migration; security, tenant or RBAC risk; unsatisfied required
gate/branch protection; no sanctioned external identity; or technical
impossibility after changing method following repeated failure. A blocker in
one independent front never stops another; production QA identity absence does
not block staging QA.

### Execution and testing

- After two substantially identical failures, change method.
- Distinguish product/package failures from browser, selector, stale-session
  and timeout failures; recover and retry reasonably before classifying failure.
- Test in order: reproduction, focused test, affected suite, required official
  CI. Do not rerun already-PASS evidence for the same SHA without an
  invalidating delta.
- For SCORM, use real runtime/UI evidence; never fabricate state. Automate
  slides and questions where possible, preserve checkpoints as evidence and
  complete independent validation without returning after each checkpoint.

### Production and communication

Production authorization is artifact/SHA/scope-specific. This contract never
authorizes bypassing production controls, improvised D1 SQL, migration
allowlists, operational identities or tenant/RBAC controls. Do not narrate
every command or send routine checkpoint updates. Finish with cause/fix/tests,
required gates and authorized merge/deploy/post-deploy evidence; never infer a
later state from an earlier one.
