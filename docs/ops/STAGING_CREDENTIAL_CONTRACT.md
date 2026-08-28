# Staging Credential Contract

This is the durable credential contract for AirTrust staging. It exists so a
new agent, worktree, clone or conversation can run the same sanctioned staging
checks without possessing or reconstructing secret values.

## 1. Source of truth

GitHub Environment **`staging`** is the canonical persistent store for staging
credentials used by GitHub Actions. Secret values never belong to a worktree,
repository file, prompt, chat history, issue, PR, artifact or shell profile.

Changing worktrees cannot remove or alter a GitHub Environment secret. If a
staging job reports a missing credential after an agent/worktree change, first
verify that the job declares `environment: staging` and references the
canonical secret name. Do not create a local replacement.

Google Cloud Build is the sanctioned heavy-CI/backup execution path. When a
GCB job needs the same staging identity, it must receive it through the
centrally governed CI secret integration; no agent-local copy is canonical.

## 2. Permanent staging application identities

The canonical general-purpose login for agent/automation QA is:

`qa-agent@staging.airtrust.invalid`

This address is intentionally synthetic, staging-only and non-deliverable. Its
password is never stored in the repository; the durable value lives only in
GitHub Environment `staging` as `STAGING_SMOKE_PASSWORD`.

Two synthetic application identities are intentionally retained because they
serve different RBAC/fixture purposes.

| Secret/config name | Purpose | Store |
|---|---|---|
| `STAGING_SMOKE_EMAIL` | Must equal the canonical login `qa-agent@staging.airtrust.invalid` for compatibility with existing workflows | GitHub Environment `staging` |
| `STAGING_SMOKE_PASSWORD` | Password for the canonical general staging QA identity | GitHub Environment `staging` |
| `QA_EXAMINER_ADMIN_EMAIL` | Synthetic examiner-training QA tenant administrator | GitHub Environment `staging` |
| `QA_EXAMINER_ADMIN_PASSWORD` | Password for the synthetic examiner-training QA administrator | GitHub Environment `staging` |

The examiner identity is not an alias for the general smoke identity. The
examiner QA seed and certificate/session workflows depend on a dedicated
synthetic tenant and RBAC fixture. Do not collapse the two identities merely
to reduce secret count.

Both identities are staging-only and must never be real Costa do Sol users or
other operational production identities.

## 3. Permanent staging infrastructure credentials

The staging Environment also owns infrastructure credentials used by governed
workflows. Current sanctioned names include:

- `CLOUDFLARE_WORKER_API_TOKEN`
- `CLOUDFLARE_PAGES_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_D1_BACKUP_API_TOKEN`
- `CLOUDFLARE_D1_MIGRATION_API_TOKEN`

Their permission and rotation rules remain governed by
`docs/ops/CLOUDFLARE_CREDENTIAL_CONTRACT.md` and the official staging deploy
workflow. Do not invent new token names as a response to a failing agent.

## 4. Agent rules

1. Never request or paste a staging password just because a new agent lacks
   chat history.
2. Never create `.env` credentials inside a worktree as the canonical fix.
3. Never commit, print, upload or attach a credential value.
4. Run authenticated staging tests through workflows whose jobs declare
   `environment: staging`.
5. General agent/browser QA must use `qa-agent@staging.airtrust.invalid`.
6. Use `.github/workflows/staging-identity-readiness.yml` before concluding
   that either staging application identity is unusable.
7. Use `.github/workflows/cloudflare-credential-doctor.yml` for Cloudflare/D1
   credential diagnosis.
8. Use `.github/workflows/provision-staging-standard-identity.yml` to create,
   reseed or rotate the canonical general QA user after the central password
   secret is changed. Never rotate by generating a process-local password.
9. If a workflow requires a new staging role, create a synthetic staging-only
   identity deliberately, document its purpose, store it once in the central
   Environment and add a readiness check. Do not borrow a real user's password.
10. If a test is currently possible only by giving a password to an interactive
    agent/browser, move that test into a sanctioned Playwright/equivalent CI
    workflow. Secrets should be consumed by the runner, not disclosed to the
    agent.

## 5. Readiness semantics

A secret being present is not enough. A durable credential is READY only when:

- the required password secret is non-empty;
- `STAGING_SMOKE_EMAIL` resolves to the canonical standard login for workflows
  that still consume it as a secret;
- the staging host guard passes;
- a real authentication request to the staging API succeeds;
- the returned token/session resolves to the same masked identity;
- a read-only authenticated identity endpoint succeeds.

Readiness output must be sanitized: no password, access token, refresh token,
cookie, credential length, or reversible secret material is printed.

Expected result codes:

- `STAGING_SMOKE_IDENTITY_READY`
- `QA_EXAMINER_IDENTITY_READY`
- `STAGING_SMOKE_IDENTITY_MISSING`
- `STAGING_SMOKE_IDENTITY_NONCANONICAL`
- `QA_EXAMINER_IDENTITY_MISSING`
- `STAGING_SMOKE_IDENTITY_AUTH_FAILED`
- `QA_EXAMINER_IDENTITY_AUTH_FAILED`

A missing/invalid/noncanonical result is a central staging configuration
problem. Fix the existing Environment secret value under the same canonical
name and rerun the readiness check. Do not create a per-agent secret namespace.

## 6. Provisioning and rotation

The canonical provisioning workflow is
`.github/workflows/provision-staging-standard-identity.yml`.

It is staging-only and performs the following guarded sequence:

1. requires `refs/heads/main` and the confirmation phrase
   `AIRTRUST_STAGING_IDENTITY`;
2. reads `STAGING_SMOKE_PASSWORD` from GitHub Environment `staging`;
3. provisions/rotates `qa-agent@staging.airtrust.invalid` through the existing
   staging-only idempotent seed;
4. performs a real authenticated staging doctor run;
5. retires the exact legacy synthetic login
   `smoke.staging.20260701@airtrust.invalid`;
6. verifies one active canonical identity and zero active legacy identities.

Routine rotation therefore has only one durable password value. Update the
existing `STAGING_SMOKE_PASSWORD`, keep `STAGING_SMOKE_EMAIL` equal to
`qa-agent@staging.airtrust.invalid`, dispatch the provisioning workflow, and
require `STAGING_STANDARD_IDENTITY_READY`.

`scripts/ensure-staging-qa-session.sh` is not allowed to invent a password. If
central credentials are missing, it fails with
`STAGING_QA_CENTRAL_CREDENTIALS_REQUIRED` instead of creating a password that
the next agent cannot know.

## 7. Interactive testing

GitHub intentionally does not reveal Environment secret values to agents. This
is a security property, not a staging defect. Therefore the portable way for
multiple alternating agents to exercise authenticated staging is to dispatch a
sanctioned workflow that consumes the secret internally.

For browser-level coverage, keep a Playwright/equivalent workflow in the
repository and let the runner log in with the Environment secret. The agent can
inspect the sanitized test result and artifacts without ever learning the
password.

## 8. Rotation rule

Do not change secret names during routine password rotation. Stable names and a
fixed synthetic login are what make the setup independent of agents,
worktrees and chat history.
