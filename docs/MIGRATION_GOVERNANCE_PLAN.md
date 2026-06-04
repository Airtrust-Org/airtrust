# Migration Governance Plan — AirTrust

**Version:** 1.0  
**Date:** 2026-05-15  
**Status:** ACTIVE

---

## 1. Current Migration State

### 1.1 Migration Inventory

- **Canonical location:** `worker-airtrust/migrations/` (used by `wrangler d1 migrations apply`)
- **Total files in canonical location:** 360 SQL files
- **Total files across all paths (incl. archives):** 1,022 entries found by `find`
- **Highest regular migration:** `0388_documentos_canonical_schema.sql`
- **Reserved sentinel migration:** `9999_add_modelo_sessao_id_to_agendamentos.sql`
- **Non-standard files (outside sequential pattern):**
  - `0098-indices-performance.sql` (hyphenated legacy filename)
  - `132_add_funcionario_ativo.sql` (3-digit prefix, no leading zero)
  - `purge-soft-deleted-qualificacoes.sql` (no numeric prefix)

### 1.2 D1 Migration State

| Environment | DB | Applied migrations |
|-------------|----|--------------------|
| Staging | `airtrust-db-staging` | Schema imported from production export (not via `d1 migrations apply`) |
| Production | `airtrust-db` | Full migration history (production baseline) |
| Dev | `airtrust-db-dev` | Unknown; intended for local development |

**Important:** Staging was synchronized via schema export from production (DDL only, no data), bypassing the migration runner. This means staging's `d1_migrations` table does not reflect the current canonical set of 360 migrations in `worker-airtrust/migrations/`. This is acceptable for QA purposes but means migrations cannot be tested end-to-end in staging.

### 1.3 Archive Directories

Non-canonical migration files were found in:
- `.tmp-deploy-edapp-20260408195248/_arquivos_nao_usados/migrations/` — archived unused files
- Other archive paths

These archived files are not applied by wrangler and do not affect production. They are historical artifacts.

---

## 2. Duplicate Prefix Analysis

The `find`-based search (1,022 files across all directories) revealed many numeric prefix collisions. This is expected because the same prefix appears in both the canonical location and archive directories.

**Within the canonical `worker-airtrust/migrations/` (360 files), known issues:**

| Issue | Details | Risk |
|-------|---------|------|
| Non-sequential `132_add_funcionario_ativo.sql` | Uses 3-digit prefix instead of 4-digit | Low (applied once, already in production) |
| `9999_` sentinel | Reserved high-number migration | Low (intentional workaround) |
| `purge-soft-deleted-qualificacoes.sql` | No numeric prefix — wrangler ignores non-matching files | Low (effectively inert) |
| 30 duplicate prefixes in canonical history | Ambiguous governance / replay debt | Historical, applied to production |
| Forward references such as `0058 -> 0059` and `0354 -> 0387` | Historical replay fragility | Historical, applied/mitigated via bootstrap where needed |

**Historical note (Fase 6):** 3 duplicate prefixes (0332, 0347, 0367) were identified in the Fase 6 audit. These were resolved by applying schema export rather than the migration runner for staging.

---

## 3. Migration Freeze Strategy

### 3.1 Current Status: SOFT FREEZE

As of 2026-05-15, no new migrations should be applied to production without:
1. Prior testing on a restored staging environment (schema + data)
2. Review by Filipe (owner)
3. Documentation of rollback procedure for the specific migration

### 3.2 Approved Next Migration

The next regular migration must use prefix `0389` or higher (sequential from `0388`).

### 3.3 Prohibited Actions

- Adding a migration file that reuses an existing numeric prefix
- Using non-standard filenames (no prefix, wrong digit count) for new migrations
- Running `wrangler d1 migrations apply` on production without a backup
- Applying destructive DDL (`DROP TABLE`, `DROP COLUMN`) without a dedicated rollback migration

---

## 4. Baseline Approach

### 4.1 Production Baseline

Production is the authoritative schema source. All new environments should be initialized from a production schema export:

```bash
# Export schema from production (template — do not execute without authorization)
npx wrangler d1 export airtrust-db \
  --env production \
  --remote \
  --no-data \
  --output schema_baseline_$(date -u +%Y%m%d).sql
```

### 4.2 Staging Synchronization

When staging schema diverges from production:
1. Export production schema (DDL only)
2. Re-apply to staging (full schema replacement is safe if staging has no real data)
3. Re-run the functional seed: `bash scripts/staging/seed-functional-demo.sh`
4. Smoke test with `admin.staging.test@example.invalid`

---

## 5. Future Migration Policy

### 5.1 Naming Convention

All new migrations must follow:

```
NNNN_description_in_snake_case.sql
```

Where `NNNN` is a 4-digit zero-padded integer, sequential from the current maximum. Example: `0389_add_aeronave_certificado_field.sql`.

### 5.2 Migration File Requirements

Every migration file must include:
1. A comment header explaining the purpose
2. Idempotent DDL where possible (e.g., `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`)
3. No INSERT/UPDATE/DELETE unless it is purely reference data (lookup tables) with `INSERT OR IGNORE`
4. No `DROP TABLE` or `DROP COLUMN` without a corresponding rollback migration

Example header:
```sql
-- Migration: 0370_add_aeronave_certificado_field.sql
-- Date: YYYY-MM-DD
-- Purpose: Add certificado_vencimento column to aeronaves table
-- Rollback: ALTER TABLE aeronaves DROP COLUMN certificado_vencimento (if needed)
-- Risk: LOW (additive only)
```

### 5.3 Testing Requirements

Before applying any migration to production:
- [ ] Applied to staging and verified (schema matches intent)
- [ ] Application code tested against new schema
- [ ] No TypeScript errors after schema change
- [ ] Test suite passes (relevant tests updated if needed)

---

## 6. CI Guard Recommendation

To prevent future prefix collisions and naming violations, add a CI check:

**Proposed guard script:** `scripts/guards/check-migration-names.sh`

```bash
#!/usr/bin/env bash
# Validates migration filenames in worker-airtrust/migrations/
# Returns exit code 1 if any violations found

MIGRATIONS_DIR="worker-airtrust/migrations"
ERRORS=0

# Check for non-standard filenames (must match NNNN_*.sql)
while IFS= read -r -d '' file; do
  basename_f=$(basename "$file")
  if ! echo "$basename_f" | grep -qE '^[0-9]{4}_[a-z0-9_]+\.sql$'; then
    echo "VIOLATION: non-standard migration filename: $basename_f"
    ERRORS=$((ERRORS + 1))
  fi
done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -name "*.sql" -print0)

# Check for duplicate prefixes
find "$MIGRATIONS_DIR" -maxdepth 1 -name "*.sql" \
  | xargs -I{} basename {} \
  | grep -oE '^[0-9]{4}' \
  | sort | uniq -d | while read -r prefix; do
    echo "VIOLATION: duplicate prefix $prefix in migrations"
    ERRORS=$((ERRORS + 1))
  done

if [ "$ERRORS" -gt 0 ]; then
  echo "Migration governance check FAILED ($ERRORS violations)"
  exit 1
else
  echo "Migration governance check PASSED"
fi
```

Add to `package.json`:
```json
"guard:migration-names": "bash scripts/guards/check-migration-names.sh"
```

Add to CI pipeline (GitHub Actions or equivalent) before any deploy step.

---

## 7. Known Technical Debt

| Item | File | Risk | Priority |
|------|------|------|----------|
| `132_add_funcionario_ativo.sql` uses 3-digit prefix | `worker-airtrust/migrations/` | Low (historical, applied) | Rename when safe |
| `9999_` sentinel migration | `worker-airtrust/migrations/` | Low (intentional workaround) | Document intent |
| `purge-soft-deleted-qualificacoes.sql` no prefix | `worker-airtrust/migrations/` | Low (ignored by wrangler) | Move to scripts/ or delete |
| Staging not tracking migration state | D1 staging | Medium (can't test migration runner) | Rebuild staging via runner after next cleanup |
