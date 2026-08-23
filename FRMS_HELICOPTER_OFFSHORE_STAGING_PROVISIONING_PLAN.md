# FRMS_HELICOPTER_OFFSHORE — Staging Provisioning Plan

**Status: PLANNING ONLY. No remote D1 write, migration, seed, profile,
assignment, or deploy is performed by this document.** Every SQL statement
below is exact and ready to run in a future, separately authorized window —
none of it has been executed against staging.

## 1. Scope and canonical state

| Item | Value |
|---|---|
| MR that fixed the self-contained bootstrap | [!79](https://gitlab.com/airtrust-group/airtrust/-/merge_requests/79) (MERGED) |
| Source SHA validated by GCB | `94461c0ad3e02bcec4aaa82a9e52f0049ea08806` |
| `main` after merge | `f93577e6464214cc0775ebc5f62de9a24276a1eb` |
| GCB build | `ba6a1581-a19d-4631-a76c-331e4b55787d` — 8/8 PASS |
| Baseline revision id | `frms-helicopter-offshore-baseline-v1` |
| profile_code (logical) | `HELICOPTER_OFFSHORE` |
| model / policy_version | `LEGACY_MODEL_V2` |
| Parameter count (verified programmatically) | **128** = 67 (`LimitesMap`) + 25 (`FadigaBusinessPolicy`) + 36 (`FrmsFortnightPolicy`) |
| Staging D1 (binding `DB`) | `airtrust-db-staging-baseline-20260701` |
| Staging D1 database id | `bf9963f4-eb12-439b-a830-20bbf577ac22` |
| QA tenant | `empresa_id = 999006` ("AirTrust Staging Examiner QA") |

> **`empresa_id = 999006` is a fictitious QA vehicle only.** It exists
> exclusively to prove the resolution chain (profile → assignment →
> revision → parameters → readiness) end-to-end in a real database. It is
> **not evidence of a real offshore operation, a real customer, or
> regulatory approval** for any tenant. Any QA result obtained against it
> must never be cited as proof of normative compliance for a production
> tenant.

## 2. Architecture correction (documentation only)

**`frms_regulatory_profiles.empresa_id` is `NOT NULL`** (migration
`0463_frms_iogp_schema_v2.sql`). This is a factual schema constraint, not a
policy choice made in this plan: **there is no such thing as a global
regulatory profile.** A regulatory profile is always scoped to exactly one
`empresa_id`.

Earlier phrasing describing `HELICOPTER_OFFSHORE` as "the global regulatory
profile" was imprecise. The correct model is:

```
empresa (tenant)
  → frms_regulatory_profiles   (tenant-scoped row; empresa_id NOT NULL)
      → frms_profile_assignments  (links the tenant to that profile, ACTIVE)
          → frms_config_revisions   (profile_code + policy_version, may be
                                      global i.e. empresa_id IS NULL, or
                                      tenant-specific)
              → frms_config_parameters (the 128 governed values)
```

The **baseline** (`FRMS_HELICOPTER_OFFSHORE_BASELINE_V1`) is a
**global, versioned revision**: `frms_config_revisions.empresa_id IS NULL`,
`profile_code = 'HELICOPTER_OFFSHORE'`. It does **not** create any
`frms_regulatory_profiles` row and does **not** create any
`frms_profile_assignments` row — this was already true after MR !79 (the
seed contains zero `INSERT`s into either table; verified in
`frms-helicopter-offshore-baseline-v1.test.ts`).

To operationalize `HELICOPTER_OFFSHORE` for a specific tenant, three
**separate, explicit** steps are required — never automatic, never implied
by applying the baseline seed:

1. Create a `frms_regulatory_profiles` row **for that tenant**
   (`empresa_id = <tenant>`, `profile_code = 'HELICOPTER_OFFSHORE'`).
2. Create a `frms_profile_assignments` row linking that tenant to that
   profile (`status = 'ACTIVE'`).
3. `resolveFrmsOperationalContext` / `checkFrmsGovernanceReadiness` then
   resolve the tenant → profile → the existing global
   `frms-helicopter-offshore-baseline-v1` revision → its 128 parameters, with
   no further data needed (the revision itself is shared/global; only the
   profile and the assignment are per-tenant).

No global profile is being invented to work around the `NOT NULL`
constraint — the constraint is real and is respected: the per-tenant
profile row is a thin pointer ("this tenant operates under
HELICOPTER_OFFSHORE"), while the substantive governed values live once, in
the shared global revision.

## 3. Confirmed current staging state (read-only inspection, prior session)

| Migration | State |
|---|---|
| `0463_frms_iogp_schema_v2.sql` | APPLIED |
| `0464_frms_parameter_governance_recalc.sql` | **NOT APPLIED** |
| `0465_*` | APPLIED |

`frms_configuracao_limites`: **0 active rows** in staging.

**Consequence:** applying `0464` as-is today would bootstrap
`frms-legacy-global-v2` incompletely (its own
`INSERT ... SELECT ... FROM frms_configuracao_limites WHERE ativo = 1`
yields zero LimitesMap rows against an empty table — confirmed by
`frms-helicopter-offshore-empty-legacy-staging-repro.test.ts`).

This **does not block `HELICOPTER_OFFSHORE`** after !79 — its bootstrap is
fully self-contained and independent of `frms_configuracao_limites` and of
`frms-legacy-global-v2`.

It **does** mean: **`frms-legacy-global-v2` must never receive an
operational tenant assignment in staging while it remains incomplete.**
`checkFrmsGovernanceReadiness` already fails closed (`revision: 'INVALID'`,
`missingParameters` populated) if any tenant is assigned to a profile that
resolves to that incomplete revision — this plan does not touch or repair
`frms-legacy-global-v2`; it is explicitly out of scope for `HELICOPTER_OFFSHORE`.

## 4. Exact future write sequence

1. Confirm the candidate SHA to deploy/provision from (must be a `main`
   commit that includes !79; currently `f93577e6...`).
2. Confirm the target D1 is genuinely staging
   (`bf9963f4-eb12-439b-a830-20bbf577ac22`, name
   `airtrust-db-staging-baseline-20260701`) — never the production id.
3. Read-only preflight: re-run the ledger/table inspection (§3 above) to
   confirm nothing has changed since this plan was written.
4. Generate a D1 backup of staging (see §7).
5. Validate the backup is restorable/readable before touching anything.
6. Apply **only** migration `0464_frms_parameter_governance_recalc.sql`.
7. Validate post-`0464` state: `frms_migrations` ledger entry present;
   `frms_config_revisions`, `frms_profile_assignments`,
   `frms_config_parameters`, `frms_recalc_runs` tables exist;
   `frms-legacy-global-v2` revision exists (confirmed incomplete — expected,
   not a blocker for this plan).
8. Apply the self-contained `frms_helicopter_offshore_baseline_v1.sql` seed
   (`scripts/frms-seeds/frms_helicopter_offshore_baseline_v1.sql`, generated
   by `scripts/frms-seeds/generate-frms-helicopter-offshore-baseline-v1.ts`).
9. Validate the revision row: `id = 'frms-helicopter-offshore-baseline-v1'`,
   `profile_code = 'HELICOPTER_OFFSHORE'`, `policy_version = 'LEGACY_MODEL_V2'`,
   `status = 'ACTIVE'`, `empresa_id IS NULL`.
10. Validate exactly 128 rows in `frms_config_parameters` for that
    `revision_id`.
11. Validate zero missing / zero extra / zero mismatched parameters against
    the programmatic source of truth (`planFrmsHelicopterOffshoreProvisioning`,
    §7 of MR !79 — see `scripts/frms-seeds/lib/frms-helicopter-offshore-provisioning.mjs`).
12. Create the `frms_regulatory_profiles` row for `empresa_id = 999006`
    (SQL in §6.A below) — **only if** step 11 confirms `NOT_PROVISIONED` for
    the revision itself; the profile/assignment steps are independent and
    additive regardless.
13. Create the `frms_profile_assignments` row for `empresa_id = 999006`
    (SQL in §6.B below).
14. Validate effective-dating and uniqueness: exactly one `ACTIVE`
    assignment for `empresa_id = 999006` at the reference date, and exactly
    one active `frms_regulatory_profiles` row for that
    `(empresa_id, profile_code)` at that date.
15. Execute `checkFrmsGovernanceReadiness(db, 999006, <referenceDate>)`.
16. Require `ready === true` (see §9 postconditions) before proceeding.
17. Execute the QA functional plan (§10).
18. Validate provenance columns end-to-end (see §10).
19. Only after 1–18 all pass: evaluate whether/when a Worker deploy is
    needed (the governance code from !70/!79 is already live in `main`;
    a deploy may not even be required for this data-only provisioning —
    that determination is itself a separate, explicit decision, not implied
    by this plan).

## 5. Governed state machine used at every write step

Every write in steps 6, 8, 12, 13 above must be preceded by a read that
classifies the current state as exactly one of:

- **`NOT_PROVISIONED`** — the target row(s) do not exist yet → safe to
  create.
- **`ALREADY_PROVISIONED_IDENTICAL`** — the target row(s) already exist and
  match the desired state exactly → no-op, not an error, not a re-write.
- **`DIVERGENT`** — the target row(s) exist but differ (missing field,
  extra field, value mismatch, wrong status/effective dates) → **FAIL
  CLOSED**. Never resolved automatically. Never masked with
  `INSERT OR IGNORE` or `INSERT OR REPLACE` — both would silently accept or
  destroy a row that may have been intentionally changed or already
  diverged for a real reason.

The parameter-level version of this classifier already exists and is
tested: `planFrmsHelicopterOffshoreProvisioning` in
`scripts/frms-seeds/lib/frms-helicopter-offshore-provisioning.mjs`
(13 passing tests in `frms-helicopter-offshore-provisioning.test.ts`,
including the divergence and reapply-identical cases). The same
NOT_PROVISIONED / IDENTICAL / DIVERGENT decision must be applied by hand
(or via an equivalent small script, not written in this documentation-only
phase) to the profile and assignment rows before executing §6's SQL.

## 6. Exact SQL prepared for the future window (NOT executed)

Column names below are copied verbatim from the real schema
(`migrations/0463_frms_iogp_schema_v2.sql`,
`migrations/0464_frms_parameter_governance_recalc.sql`) — nothing invented.
IDs are deterministic so the classifier in §5 can detect
`ALREADY_PROVISIONED_IDENTICAL` on a safe re-run of this plan.

### 6.A — `frms_regulatory_profiles` for empresa 999006

Schema (`0463`): `id, empresa_id, profile_code, service_category,
approval_reference, policy_version, effective_from, effective_to,
limits_json, source_document_hash, active, created_at, updated_at,
deleted_at`.

```sql
-- Read first (classifier §5):
SELECT id, empresa_id, profile_code, policy_version, active, deleted_at,
       effective_from, effective_to
  FROM frms_regulatory_profiles
 WHERE empresa_id = 999006
   AND profile_code = 'HELICOPTER_OFFSHORE';

-- If NOT_PROVISIONED, create:
INSERT INTO frms_regulatory_profiles (
  id, empresa_id, profile_code, service_category, approval_reference,
  policy_version, effective_from, effective_to, limits_json,
  source_document_hash, active, created_at, updated_at, deleted_at
) VALUES (
  'frms-reg-profile-999006-helicopter-offshore-v1',
  999006,
  'HELICOPTER_OFFSHORE',
  'QA_FIXTURE',                          -- service_category: explicitly marks this as the QA vehicle, not a real operation
  NULL,                                  -- approval_reference: no real regulatory approval backs this QA tenant
  'LEGACY_MODEL_V2',
  '1970-01-01',                          -- effective_from: intentionally always-effective for QA validation
  NULL,                                  -- effective_to: open-ended
  NULL,                                  -- limits_json: parameters live in frms_config_parameters, not here
  NULL,                                  -- source_document_hash: no source document for a QA fixture
  1,                                     -- active
  '<ISO8601 timestamp at execution time>',
  '<ISO8601 timestamp at execution time>',
  NULL
);
```

### 6.B — `frms_profile_assignments` for empresa 999006

Schema (`0464`): `id, empresa_id, regulatory_profile_id, profile_code,
status, effective_from, effective_to, created_by, approved_at, approved_by,
reason, source, created_at`.

```sql
-- Read first (classifier §5):
SELECT id, empresa_id, regulatory_profile_id, profile_code, status,
       effective_from, effective_to
  FROM frms_profile_assignments
 WHERE empresa_id = 999006 AND status = 'ACTIVE';

-- If NOT_PROVISIONED, create:
INSERT INTO frms_profile_assignments (
  id, empresa_id, regulatory_profile_id, profile_code, status,
  effective_from, effective_to, created_by, approved_at, approved_by,
  reason, source, created_at
) VALUES (
  'frms-assignment-999006-helicopter-offshore-v1',
  999006,
  'frms-reg-profile-999006-helicopter-offshore-v1',  -- must equal the id inserted in 6.A
  'HELICOPTER_OFFSHORE',
  'ACTIVE',
  '1970-01-01',
  NULL,
  NULL,                                   -- created_by: no human actor for a scripted QA fixture
  '<ISO8601 timestamp at execution time>',
  NULL,                                   -- approved_by: see reason
  'FRMS_HELICOPTER_OFFSHORE staging QA validation fixture — empresa_id 999006 is a fictitious QA tenant, not a real offshore operation',
  'STAGING_QA_PROVISIONING_PLAN',
  '<ISO8601 timestamp at execution time>'
);
```

### 6.C — Uniqueness already enforced by schema

- `frms_profile_assignments` has `UNIQUE (empresa_id, regulatory_profile_id, effective_from)`.
- `frms_config_revisions` has `UNIQUE (empresa_id, profile_code, revision_number)`.
- `frms_config_parameters` has `UNIQUE (revision_id, parameter_key)`.

These constraints mean a genuinely accidental duplicate insert fails loudly
(SQLite `UNIQUE` violation) rather than silently duplicating — consistent
with the fail-closed posture in §5. This plan's classifier step exists to
catch the case *before* hitting the constraint, with a clear decision
recorded, rather than relying on the constraint as the only safety net.

## 7. Backup / compensation (prepared, not executed)

**Backup** (Cloudflare D1 official flow only):

```bash
npx wrangler d1 backup create airtrust-db-staging-baseline-20260701 --remote
```

**Validate the backup**:

```bash
npx wrangler d1 backup list airtrust-db-staging-baseline-20260701 --remote
# confirm the new backup id/timestamp appears before proceeding
```

**Compensation for the writes in §6** (specific, ordered `DELETE`s by the
exact deterministic IDs used above — not a schema rollback):

```sql
-- Reverse order of creation:
DELETE FROM frms_profile_assignments
 WHERE id = 'frms-assignment-999006-helicopter-offshore-v1';

DELETE FROM frms_regulatory_profiles
 WHERE id = 'frms-reg-profile-999006-helicopter-offshore-v1';

-- If the baseline revision/parameters also need to be reverted (only if
-- this specific provisioning window created them — do NOT delete if another
-- environment/window already depends on them):
DELETE FROM frms_config_parameters
 WHERE revision_id = 'frms-helicopter-offshore-baseline-v1';

DELETE FROM frms_config_revisions
 WHERE id = 'frms-helicopter-offshore-baseline-v1';
```

**Compensation for migration `0464`**: do not attempt a manual
`DROP TABLE`/`DROP COLUMN` rollback. Use the official governed
restoration path: Cloudflare D1 Time Travel
(`npx wrangler d1 time-travel restore airtrust-db-staging-baseline-20260701 --timestamp=<pre-migration-timestamp> --remote`)
or restore from the backup taken in this same section, per whichever the
team's existing AirTrust restore runbook designates as primary. A raw
`DROP TABLE frms_config_revisions, frms_profile_assignments,
frms_config_parameters, frms_recalc_runs` is a last-resort fallback only if
Time Travel/backup restore is unavailable, and must not be treated as the
default plan.

## 8. Readiness postconditions (all required for `READY`)

`checkFrmsGovernanceReadiness(db, 999006, <referenceDate>).ready === true`
requires, all simultaneously:

- `0464` present in the migration ledger.
- Governance tables (`frms_config_revisions`, `frms_profile_assignments`,
  `frms_config_parameters`) present and queryable.
- Exactly one active `frms_regulatory_profiles` row for
  `(empresa_id = 999006, profile_code = 'HELICOPTER_OFFSHORE')` at the
  reference date → `profile: 'READY'`.
- Exactly one `ACTIVE` `frms_profile_assignments` row for
  `empresa_id = 999006` at the reference date → `assignment: 'READY'`.
- The resolved revision is `frms-helicopter-offshore-baseline-v1` → `revision: 'READY'`.
- Exactly 128 parameters present for that revision.
- `missingParameters = []`.
- No extra/unexpected parameters (checked separately by
  `planFrmsHelicopterOffshoreProvisioning`, not by the readiness guard
  itself, which only checks required keys).
- No mismatches against the desired baseline values.
- No ambiguity: not more than one candidate at any resolution stage
  (`assignment !== 'AMBIGUOUS'`, `revision !== 'AMBIGUOUS'`).
- `model_version` (`policy_version`) resolves to `LEGACY_MODEL_V2`.
- Overall `ready === true`.

## 9. QA functional plan (prepared, not executed)

Using `empresa_id = 999006` **strictly as a fixture** — results here prove
the resolution chain works, not that any real value is normatively correct
for a real operator:

- Jornada normal (day-shift, no biological stressors) — governed vs.
  `LEGACY_MODEL_V2` equivalence.
- WOCL window (operations spanning 00:00–06:00 local).
- Sleep/acumulado de sono.
- KSS score derivation.
- Accumulated flight/duty hours windows (7d/28d/mês/365d).
- Fortnight indicator (`buildFrmsFortnightIndicatorMap`).
- Alerts (`processarAlertas`) at each severity threshold.
- Operational decision output.

For each case, compare:

```
LEGACY_MODEL_V2 (current runtime behavior, LIMITES_DEFAULT-derived)
       vs.
HELICOPTER_OFFSHORE baseline (governed, resolved via empresa 999006 fixture)
```

**Expected result: byte-for-byte equivalence** for every governed value
(already proven once in `frms-helicopter-offshore-baseline-v1-equivalence.test.ts`
against the corrected 128-parameter seed; this QA step re-proves it against
a real staging D1 execution, not a local sqlite file).

**Provenance validation** — every produced row
(`frms_fatorizacao_jornada`, `frms_fadiga_checkin`) must carry:

- `empresa_id = 999006`
- `profile_code = 'HELICOPTER_OFFSHORE'`
- `regulatory_profile_id = 'frms-reg-profile-999006-helicopter-offshore-v1'`
- `config_revision_id = 'frms-helicopter-offshore-baseline-v1'`
- `model_version = 'LEGACY_MODEL_V2'`

**Explicit caution:** a passing QA run against tenant 999006 demonstrates
*mechanism* correctness (the plumbing resolves and computes correctly). It
must **never** be cited as evidence of *normative* compliance (e.g. "IOGP
690-2 compliance confirmed") for any real customer — that requires a
separate regulatory review, as already flagged in
`FRMS_HELICOPTER_OFFSHORE_BASELINE_V1_REVIEW.md` §4.

## 10. Explicitly prohibited in this phase

This document prepares the plan only. It does **not** execute, and must not
be treated as authorization to execute:

- migration `0464` against staging or any remote database;
- the `HELICOPTER_OFFSHORE_BASELINE_V1` seed against staging or any remote
  database;
- any `frms_regulatory_profiles` / `frms_profile_assignments` INSERT against
  staging or any remote database;
- any other remote D1 write;
- any Worker deploy;
- any Pages deploy;
- any SIGVOOS interaction;
- anything against production.

Executing the sequence in §4 requires a separate, explicit authorization
from the user, in a future session, at which point this document is the
reference runbook to follow — including re-verifying §3's current-state
inspection immediately before any write, since staging state may have
changed since this plan was written (2026-08-22).
