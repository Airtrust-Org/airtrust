# Staging FRMS schema doctor (read-only)

`.github/workflows/staging-frms-schema-doctor.yml` +
`scripts/staging/frms-schema-doctor-readonly.mjs`

## Purpose

Prove — **read-only** — that FRMS migrations `0463_frms_iogp_schema_v2.sql`
(IOGP) and `0464_frms_parameter_governance_recalc.sql` (parameter governance)
are structurally present in the staging D1, so that
`worker-airtrust/src/lib/frms/parameter-governance.ts`
(`resolveFrmsOperationalContext` → `loadResolvedFrmsParameters`) can run.

Staging's D1 (`airtrust-db-staging-baseline-20260701`) was rebuilt from a
2026-07-01 schema-only production dump, which predates 0463/0464 — so its
`d1_migrations` ledger cannot be trusted on its own. **The real schema is the
authority; the ledger is complementary evidence.**

## Guarantees

- No migration is applied. No `INSERT`/`UPDATE`/`DELETE`/`REPLACE`/DDL. No
  `wrangler d1 migrations apply`, no `--file`, no seed, no cleanup.
- Every statement is `SELECT` / `PRAGMA table_info` / `sqlite_master` /
  `d1_migrations` / `airtrust_schema_changes_v2` and is validated against a
  mutating-SQL denylist before it reaches wrangler.
- The staging D1 name **and** id are hard-pinned in both the workflow and the
  script; the production and development D1 ids are hard-blocked.
- The D1 credential (`CLOUDFLARE_D1_MIGRATION_API_TOKEN` +
  `CLOUDFLARE_ACCOUNT_ID`) is consumed only from the `staging` GitHub
  Environment by the `doctor` job. No local/personal Cloudflare credential is
  ever used.
- Required tables, columns, indexes and the bootstrap-parameter minimum are
  **derived** from the real migration SQL and from
  `worker-airtrust/src/lib/frms/types.ts` (`LIMITES_DEFAULT`) — never a
  hardcoded guess list.

## Dispatch

```bash
gh workflow run staging-frms-schema-doctor.yml \
  --repo Airtrust-Org/airtrust \
  --ref main \
  -f confirmation=AIRTRUST_STAGING_FRMS_SCHEMA_DOCTOR \
  -f expected_deployed_sha=<40-hex SHA currently deployed to the staging Worker>
```

`expected_deployed_sha` is **not** required to equal `github.sha`: after this
doctor's own PR merges, `github.sha` moves forward while staging still serves
the older release. The guard instead calls the staging Worker `/api/version`
and requires `sourceSha === expected_deployed_sha` and `environment === staging`.

## Verdict

The run prints a JSON report (also uploaded as an artifact) and exits non-zero
on `FAIL`. `stagingSchemaParity = PASS` requires **all** of:

| Check | Meaning |
|---|---|
| `schema0463` | all 3 tables + their columns + all 5 indexes present |
| `schema0464` | all 4 tables + their columns + all 6 indexes + the ALTER columns on `frms_fatorizacao_jornada` and `frms_fadiga_checkin` present |
| `runtimeQueryAssignment` / `runtimeQueryRevision` / `runtimeQueryParameters` | the read-only equivalents of the `parameter-governance.ts` resolution queries compile with no `no such table` / `no such column` |
| `bootstrapReady` | exactly one `ACTIVE` `LEGACY_GENERAL` row in `frms_config_revisions`, and all 67 `LIMITES_DEFAULT` keys present as `parameter_key` for that revision |

Ledger absence (`0463_LEDGER=ABSENT` / `0464_LEDGER=ABSENT`) is **not** a
failure when the structure + runtime queries + bootstrap are proven.

A `FAIL` verdict lists `missingObjects`, `missingColumns`, `missingIndexes`,
`bootstrapMissing` and `missingMigrationsCandidates`. It does **not** apply
anything — remediation (a governed allowlisted apply of the missing FRMS-chain
migration) is a separate, separately-authorized step.
