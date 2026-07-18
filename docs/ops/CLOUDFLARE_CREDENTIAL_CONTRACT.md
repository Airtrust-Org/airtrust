# Cloudflare Credential Contract

This document is the single source of truth for which Cloudflare/AirTrust
credentials CI is allowed to use, where they live, who consumes them, and
what to do when one is missing, invalid, under-permissioned, or due for
rotation/revocation.

It contains **no secret values, no full Account IDs, no emails, and no
personal data**. Anything that looks like an identifier here is either a
canonical *name* or a category, never a value.

## 1. Root cause this contract fixes

Cloudflare's dashboard accumulated many overlapping User API Tokens because
one legacy workflow, `.github/workflows/validate-secrets.yml` (removed by
this change), still read a generic `secrets.CLOUDFLARE_API_TOKEN` and, on any
failure, instructed the reader to create **a new token with combined
Workers + Pages + Account permissions** — directly contradicting the
Worker/Pages token split that the real deploy workflows had already adopted
and successfully used. Every time someone ran that workflow (or followed its
printed instructions), it nudged toward creating yet another broad token
instead of fixing or rotating the one already in use.

**A local git worktree, clone, or branch never controls GitHub Actions
secrets.** Secrets are stored by GitHub at the repository level or inside a
named [GitHub Environment](https://docs.github.com/actions/deployment/targeting-different-environments/using-environments-for-deployment)
and are resolved by the Actions runner at job-execution time. No file in this
repository — tracked, untracked, or in an unrelated worktree — can create,
change, or reveal a GitHub secret's value.

## 2. Canonical secret names

Only these five names are allowed in the `secrets.*` context of any workflow
in this repository:

| Canonical secret name         | Scope                              | Lives in (GitHub)                    |
|--------------------------------|-------------------------------------|---------------------------------------|
| `CLOUDFLARE_WORKER_API_TOKEN`  | Cloudflare Worker (+ D1/R2 strictly required by the Worker) | Environment: `staging`, `production` (separate values per environment) |
| `CLOUDFLARE_PAGES_API_TOKEN`   | Cloudflare Pages only               | Environment: `staging`, `production` (separate values per environment) |
| `CLOUDFLARE_ACCOUNT_ID`        | Cloudflare account identifier (not a credential, but treated with the same discipline) | Environment: `staging`, `production` |
| `STAGING_SMOKE_EMAIL`          | AirTrust application login for the staging smoke test user | Environment: `staging` only |
| `STAGING_SMOKE_PASSWORD`       | AirTrust application login for the staging smoke test user | Environment: `staging` only |

It is **forbidden** to reference `secrets.CLOUDFLARE_API_TOKEN` (the old
generic name) anywhere in a workflow. `scripts/ci/guard-cloudflare-secret-contract.mjs`
enforces this on every `npm run lint` run.

### Rules per secret

1. **`CLOUDFLARE_WORKER_API_TOKEN`**
   - Only Worker-scoped permissions, plus D1/R2 permissions that the Worker
     itself strictly requires (e.g. staging D1 backups/migrations).
   - Must never carry Pages permissions.
   - Kept as separate values per GitHub Environment (`staging` vs
     `production`) even though the secret name is the same.

2. **`CLOUDFLARE_PAGES_API_TOKEN`**
   - Only Pages permissions.
   - Must never carry Worker or D1 write permissions.

3. **`CLOUDFLARE_ACCOUNT_ID`**
   - The Cloudflare account identifier used to build API paths. Not a
     secret in the cryptographic sense, but still never printed in full in
     any log — only used as an environment variable inside a job.
   - Do not create a second copy of this under a different name.

4. **`STAGING_SMOKE_EMAIL` / `STAGING_SMOKE_PASSWORD`**
   - AirTrust application credentials for the staging smoke-test user.
   - **Never** call these a "Cloudflare token" in code, comments, workflow
     names, or docs. They authenticate against the AirTrust API, not the
     Cloudflare API.
   - Only ever read inside jobs whose GitHub `environment:` is `staging`.

## 3. Who consumes each secret

| Workflow | Job(s) | Secret(s) read | Environment declared |
|---|---|---|---|
| `.github/workflows/deploy-staging.yml` | `backup`, `preflight`, `apply-migrations`, `deploy-worker` | `CLOUDFLARE_WORKER_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | `staging` |
| `.github/workflows/deploy-staging.yml` | `deploy-frontend` | `CLOUDFLARE_PAGES_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | `staging` |
| `.github/workflows/deploy-staging.yml` | `smoke` | `STAGING_SMOKE_EMAIL`, `STAGING_SMOKE_PASSWORD` | `staging` |
| `.github/workflows/deploy-airtrust.yml` | `deploy-worker` | `CLOUDFLARE_WORKER_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | `production` |
| `.github/workflows/deploy-airtrust.yml` | `deploy-pages` | `CLOUDFLARE_PAGES_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | `production` |
| `.github/workflows/apply-schema-change-v2.yml` | `apply` | `CLOUDFLARE_WORKER_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | `production` |
| `.github/workflows/smoke-staging.yml` | `smoke` | `STAGING_SMOKE_EMAIL`, `STAGING_SMOKE_PASSWORD` | `staging` |
| `.github/workflows/cloudflare-credential-doctor.yml` | `diagnose-worker` | `CLOUDFLARE_WORKER_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | input-selected (`staging`/`production`) |
| `.github/workflows/cloudflare-credential-doctor.yml` | `diagnose-pages` | `CLOUDFLARE_PAGES_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | input-selected (`staging`/`production`) |
| `.github/workflows/cloudflare-credential-doctor.yml` | `diagnose-smoke` | `STAGING_SMOKE_EMAIL`, `STAGING_SMOKE_PASSWORD` | `staging` (only valid combination) |

## 4. Minimum permissions per token (Cloudflare dashboard)

When creating or reviewing a token in the Cloudflare dashboard
(`https://dash.cloudflare.com/profile/api-tokens`), use the narrowest scope
that lets the job it backs succeed:

- **`CLOUDFLARE_WORKER_API_TOKEN`**: `Account > Workers Scripts > Edit`,
  plus `Account > D1 > Edit` and `Account > Workers R2 Storage > Edit` only
  if the environment's Worker jobs actually touch D1/R2 (staging does, for
  backups/migrations). No Pages permission.
- **`CLOUDFLARE_PAGES_API_TOKEN`**: `Account > Cloudflare Pages > Edit`
  only. No Workers, no D1, no R2.
- Scope every token to the specific account, never "All accounts", and set
  an expiration date when the Cloudflare UI allows it.

## 5. GitHub secret name vs. the `CLOUDFLARE_API_TOKEN` environment variable

Wrangler (the Cloudflare CLI used by our deploy/diagnose jobs) only
recognizes one environment variable name at runtime: `CLOUDFLARE_API_TOKEN`.
That is a **local shell variable inside the job**, not a GitHub secret name.
The contract is satisfied by mapping the canonical GitHub secret into that
variable *inside the job's `env:` block*, for example:

```yaml
env:
  CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_WORKER_API_TOKEN }}
```

or

```yaml
env:
  CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_PAGES_API_TOKEN }}
```

It is **forbidden** to write `CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}`
or any expression that evaluates to it.
Always pick the one canonical secret that matches the job's purpose (Worker
or Pages) and map it directly.

## 6. Cloudflare token vs. AirTrust smoke credential

- A **Cloudflare token** (`CLOUDFLARE_WORKER_API_TOKEN`, `CLOUDFLARE_PAGES_API_TOKEN`)
  authenticates against the Cloudflare API (`api.cloudflare.com`) and is
  managed from the Cloudflare dashboard.
- A **smoke credential** (`STAGING_SMOKE_EMAIL`, `STAGING_SMOKE_PASSWORD`) is
  an AirTrust application login (email + password) used only to exercise
  the staging API as a real authenticated user. It is managed like any
  other AirTrust user account, has nothing to do with Cloudflare, and must
  never be described as a "token" in code, workflow names, or logs.

## 7. Diagnose before creating a new token

**Never create a new Cloudflare token as the first response to a failure.**
Before asking for a new token:

1. Run `.github/workflows/cloudflare-credential-doctor.yml` (manual dispatch)
   for the specific `target_environment` and `credential` that is failing.
2. Read the objective result code it prints (see the codes below). Every
   code maps to exactly one remediation path.
3. Only after confirming the existing canonical secret is genuinely missing,
   revoked, or under-permissioned should a replacement value be issued —
   and it should be stored under the **same canonical secret name**, not a
   new one.

### Result codes and what each one means

| Code | Meaning | What it does NOT mean |
|---|---|---|
| `SECRET_PRESENT_AND_VALID` | The secret exists, the Cloudflare token is active, and the read-only resource check succeeded. | — |
| `SECRET_MISSING` | The GitHub secret has no value in this environment. | Does not mean the token was revoked. |
| `TOKEN_INVALID_OR_REVOKED` | The secret has a value, but Cloudflare's `/user/tokens/verify` rejected it. | Does not mean the secret is absent. |
| `TOKEN_PERMISSION_INSUFFICIENT` | The token is valid and active, but lacks permission for the read-only resource check. | Does not mean the token is invalid. |
| `ACCOUNT_ID_MISSING` | `CLOUDFLARE_ACCOUNT_ID` has no value in this environment. | — |
| `SMOKE_CREDENTIALS_MISSING` | `STAGING_SMOKE_EMAIL` and/or `STAGING_SMOKE_PASSWORD` have no value. | — |
| `SMOKE_CREDENTIALS_PRESENT_NOT_TESTED` | Both smoke credential names have a value; no login was attempted. | Does not confirm the credentials still work — only that they exist. |

## 8. Procedures

### Secret missing (`SECRET_MISSING` / `ACCOUNT_ID_MISSING` / `SMOKE_CREDENTIALS_MISSING`)

1. Confirm which GitHub Environment (`staging` or `production`) the failing
   job runs under.
2. In GitHub: Settings → Environments → the matching environment → Secrets,
   add the canonical secret name from Section 2. Never invent a new name.
3. Re-run `cloudflare-credential-doctor.yml` for that environment/credential
   and confirm `SECRET_PRESENT_AND_VALID` (or the smoke "present" code).

### Token invalid or revoked (`TOKEN_INVALID_OR_REVOKED`)

1. In the Cloudflare dashboard, locate the token by the label that matches
   this environment/purpose (e.g. "AirTrust Worker – staging").
2. If it was rotated or revoked intentionally, generate its replacement
   with the same minimum permissions (Section 4) and update the existing
   GitHub secret's value under the same canonical name.
3. If it was not intentionally revoked, treat this as a security event:
   confirm no unauthorized access occurred before reissuing.
4. Re-run the diagnostic to confirm `SECRET_PRESENT_AND_VALID`.

### Permission insufficient (`TOKEN_PERMISSION_INSUFFICIENT`)

1. Do not create a new token. Edit the existing token's permissions in the
   Cloudflare dashboard to add exactly the missing scope from Section 4.
2. Re-run the diagnostic to confirm `SECRET_PRESENT_AND_VALID`.

### Rotation (planned, non-emergency)

1. Create the replacement Cloudflare token with the same minimum
   permissions and the same purpose (Worker or Pages) as the one it
   replaces.
2. Update the value of the existing canonical GitHub secret in the
   corresponding environment. Do not add a new secret name.
3. Run `cloudflare-credential-doctor.yml` for the affected
   environment/credential and confirm `SECRET_PRESENT_AND_VALID`.
4. Only after the new value is confirmed working, revoke the old Cloudflare
   token in the dashboard.

### Revocation

1. Confirm via `cloudflare-credential-doctor.yml` (or the token's "Last
   used" column in the Cloudflare dashboard) that nothing in this
   repository still depends on the token being revoked.
2. Get explicit authorization before revoking — this repository's policy is
   that revocation is a separate, deliberate action, never bundled silently
   into an unrelated change.
3. Revoke in the Cloudflare dashboard. Do not delete the corresponding
   GitHub secret unless the canonical secret itself is being decommissioned
   (which should not happen for the five names in Section 2).
