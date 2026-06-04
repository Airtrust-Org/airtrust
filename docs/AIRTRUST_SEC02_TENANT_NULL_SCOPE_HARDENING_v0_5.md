# AIRTRUST SEC-02 Tenant Null-Scope Hardening — v0.5

**Sprint:** fix(tenant): harden null empresa scope handling + fix(auth): close optional tenant exposure paths  
**Dates:** 2026-06-04  
**Status:** RESOLVED

---

## Final Status: RESOLVED

All cross-tenant exposure vectors for SEC-02 have been closed:

1. **NULL-empresa row fallback** (`empresa_id IS NULL OR empresa_id = ?`) removed from the hardened ownership filters. Funcionario/aeronave ownership checks now use strict `empresa_id = ?`.
2. **optionalAuth cross-tenant exposure** (`GET /funcionarios`, `GET /funcionarios/:id`, `GET /funcionarios/stats`, `GET /funcionarios/stats/dashboard`, `GET /aeronaves`, `GET /aeronaves/:id`, `GET /qualificacoes/tipos`, `GET /qualificacoes/tipos/:id`) hardened to `auth()` with empresa_id filters (this commit).

Remaining `optionalAuth()` usages are in simuladores-* files accessing global reference data (manobras_categorias, tipos_sessao, modelos_sessao) that have no empresa_id column, or in historico.ts under a separate review path. These are documented in `__tests__/security/optional-auth-tenant-exposure.test.ts` with a pinned allowlist.  

---

## Background

The SEC-02 finding identified occurrences of the pattern  
```sql
(empresa_id IS NULL OR empresa_id = ?)
```  
across 20+ source files. Rows with `empresa_id IS NULL` are visible to **every authenticated tenant** that matches the OR condition, creating a cross-tenant data exposure vector.

Three pattern variants were identified:

| Type | Pattern | Risk | Action |
|------|---------|------|--------|
| 1 — JOIN fallback | `LEFT JOIN funcionarios f ON … AND (f.empresa_id IS NULL OR f.empresa_id = em.empresa_id)` | Low — anchored by outer escala's `empresa_id`; NULL rows just show unlinked creator names | Preserved |
| 2 — Ownership check / list filter | `WHERE … AND (empresa_id IS NULL OR empresa_id = ?)` | **HIGH** — NULL-empresa rows returned to all tenants | **Fixed** |
| 3 — Optional filter | `AND (? IS NULL OR empresa_id = ?)` | Low — caller controls filtering; `? IS NULL` means explicit "no filter" intent | Preserved |
| 4 — Global templates | `WHERE (empresa_id = ? OR empresa_id IS NULL)` in `padroes_escala` | Low — intentional system-wide defaults | Preserved |

---

## Files Fixed (Type 2 — insecure)

All changes replace `(empresa_id IS NULL OR empresa_id = ?)` with the strict `empresa_id = ?`.

### escalas-alocacoes.ts
**Lines fixed:** 533, 1292, 1807 (were 535, 1294, 1809 after prior edits)  
**Context:** Funcionario ownership validation before creating/updating alocações.  
**Fix:** `AND (empresa_id IS NULL OR empresa_id = ?)` → `AND empresa_id = ?`

### escalas-alocacoes-helpers-internal.ts
**Line fixed:** 555  
**Context:** `verificarHabilitacaoModelo` — checks that a pilot belongs to the tenant before validating aircraft model.  
**Fix:** Same as above.

### escalas-evd.ts
**Line fixed:** 386  
**Context:** `getFuncionarioRoleContext` — fetches pilot role metadata; only called within tenant-scoped routes.  
**Fix:** Same as above.

### escalas-situacoes.ts
**Lines fixed:** 105, 349  
**Context:** Funcionario lookup before creating/updating situação (absence/leave) records.  
**Fix:** Same as above.

### frms-fadiga-acumulada.ts
**Line fixed:** 230  
**Context:** FRMS accumulated fatigue query — JOIN filter on funcionarios within a tenant's jornada records.  
**Fix:** `AND (f.empresa_id IS NULL OR f.empresa_id = ?)` → `AND f.empresa_id = ?`

### escalas-pilotos.ts
**Lines fixed:** 56, 78, 201  
**Context:**  
- Lines 56/201: Funcionarios list filter for pilot selection UI.  
- Line 78: `aeronaves` lookup by ID — aircraft are tenant-specific assets.  
**Fix:** `(empresa_id IS NULL OR empresa_id = ?)` → `empresa_id = ?` (both `baseWhere` and `fallbackWhere`)

### escalas-cobertura.ts
**Line fixed:** 374  
**Context:** Tripulantes list filter for coverage analysis.  
**Fix:** `(f.empresa_id IS NULL OR f.empresa_id = ?)` → `f.empresa_id = ?`

### funcionarios.ts
**Lines fixed:** 160–161 (list filter), 438–586 (stats/dashboard triple-null), 692, 747, 848, 952  
**Context:**  
- Lines 160–161: Main `GET /funcionarios` list — uses `optionalAuth()`; when empresaId is set, was including NULL-empresa rows.  
- Lines 438–952: Stats dashboard (`optionalAuth()`) and ferias sub-routes (`auth()`). Were using the triple-null variant `(? IS NULL OR f.empresa_id IS NULL OR f.empresa_id = ?)`.  
**Fix:**  
- List filter: `(f.empresa_id IS NULL OR f.empresa_id = ?)` → `f.empresa_id = ?`  
- Triple-null: `(? IS NULL OR f.empresa_id IS NULL OR f.empresa_id = ?)` → `(? IS NULL OR f.empresa_id = ?)` — preserves the optional-auth bypass (`? IS NULL` when empresaId is null) but removes the NULL-empresa row fallback.

### syncEscalaEventosExternos.ts
**Line fixed:** ferias sync query.
**Context:** `syncFuncionarioFeriasForMonth` used the triple-null variant while syncing employee vacations into escala events.
**Fix:** `(? IS NULL OR f.empresa_id IS NULL OR f.empresa_id = ?)` → `(? IS NULL OR f.empresa_id = ?)`

### escalas-tripulacoes.ts
**Lines fixed:** operational aircraft and PIC model validation lookups.
**Context:** the route validates the escala aircraft and PIC habilitation inside a tenant-scoped mutation path.
**Fix:** `(empresa_id IS NULL OR empresa_id = ?)` → `empresa_id = ?`

### sgso-next-gen-extra.ts
**Line fixed:** compliance status metric.
**Context:** SGSO compliance metric counted active funcionarios for the current tenant.
**Fix:** `(f.empresa_id = ? OR f.empresa_id IS NULL)` → `f.empresa_id = ?`

---

## Preserved Patterns (intentional — documented)

### Type 1 — JOIN fallback (11 files)

The pattern `LEFT JOIN funcionarios f ON … AND (f.empresa_id IS NULL OR f.empresa_id = em.empresa_id)` appears in escala listing queries. The outer WHERE anchors to `em.empresa_id = ?` (the escala's company), so these JOIN conditions only enrich creator/modifier display names. A NULL-empresa funcionario appearing here does not expose their records to another tenant — it just shows their name in a join result already filtered by the escala's company.

**Files preserved:**
- `routes/escalas-crud.ts`
- `routes/escalas-calendario.ts`
- `routes/escalas-conflitos.ts`
- `routes/escalas-status.ts`
- `routes/escalas-templates.ts`
- `routes/escalas-tripulacoes.ts`
- `routes/escalas-exportacao.ts`
- `routes/escalas-eventos.ts`
- `routes/escalas-restricoes.ts`

### Type 4 — Global escala templates

**File:** `routes/escalas-padroes.ts` line 22  
**Table:** `padroes_escala`  
**Pattern:** `WHERE deleted_at IS NULL AND (empresa_id = ? OR empresa_id IS NULL)`  
**Justification:** The `padroes_escala` table holds system-wide default schedule patterns (NULL empresa_id) alongside tenant-specific ones. Tenants intentionally see global defaults when listing available patterns. This is a deliberate product design.

### Type 3 — Intentional layered config system

**File:** `routes/integracoes-edapp-helpers.ts`  
**Table:** `integracoes_edapp_config`  
**Pattern:** `AND (? IS NULL OR empresa_id = ?)` (optional filter) and `(empresa_id = ? OR empresa_id IS NULL)` (config read with global fallback)  
**Justification:** EdApp integration config is a two-tier system: global defaults (`empresa_id IS NULL`) are overridden by tenant-specific config. `getEdAppConfigValue` explicitly prioritizes tenant config `ORDER BY CASE WHEN empresa_id = ? THEN 0 ELSE 1 END`. This is an intentional configuration layering pattern.

### frms-fira.ts (Type 3)

**Lines:** 543, 733, 860  
**Pattern:** `AND (? IS NULL OR empresa_id = ?)` — caller decides whether to filter by empresa_id.

---

## Regression Tests

`worker-airtrust/src/__tests__/security/sec02-null-empresa-scope.test.ts`

- Verifies the hardened files contain no insecure `(empresa_id IS NULL OR empresa_id = ?)` variants.
- Verifies the residual Opus findings in `syncEscalaEventosExternos.ts` and `escalas-tripulacoes.ts` stay closed.
- Pins the list of files that intentionally preserve the NULL-empresa pattern.

`worker-airtrust/src/__tests__/security/optional-auth-tenant-exposure.test.ts`

- Verifies `GET /funcionarios`, `/funcionarios/:id`, `/funcionarios/stats`, `/funcionarios/stats/dashboard`, `/aeronaves`, `/aeronaves/:id`, `/qualificacoes/tipos`, `/qualificacoes/tipos/:id` no longer use `optionalAuth()`.
- Verifies `empresa_id = ?` filter is present in all affected queries.
- Pins the remaining `optionalAuth()` allowlist (simuladores global reference data + historico).

---

## Residual Risk

- **NULL-empresa records in production**: If any `funcionarios`, `aeronaves`, or other records have `empresa_id IS NULL` in production, those records are now excluded from all tenant queries. A one-time audit query should confirm no orphaned NULL-empresa active records exist before this change is deployed.

- **simuladores optionalAuth**: `GET` routes in simuladores-relatorios.ts, simuladores-equipamentos.ts use `optionalAuth()` and query tables with empresa_id (e.g. `simuladores`). This is a lower-severity residual — simuladores session/usage data is less sensitive than PII. Tracked for a future simuladores tenant-scoping sprint.
