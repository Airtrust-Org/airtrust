# AirTrust agent guidance

AirTrust is a production multi-tenant aviation SaaS. Preserve tenant isolation,
RBAC, canonical LMS completion and real operational data. Never run production
deploys, D1 writes or migrations without explicit, scoped authorization. Keep
unrelated worktree changes intact; never reset, clean, stash or `git add .`.

## AirTrust Execution Contract

### Authority

- GitLab `origin/main` is the code authority; this repository is the Git
  authority, not Google Drive caches.
- Determine the current official CI/deploy path from repository runbooks. Do
  not bypass branch protection, required gates, tenant isolation, RBAC,
  migration governance or production authorization.

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
