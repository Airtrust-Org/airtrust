# RBAC Instructor Access — Assessment Report

**Date:** 2026-05-16  
**Phase:** RBAC Instructor Audit — Phase 2 (Assessment + Characterization Tests)  
**Production touched:** NO  
**Runtime RBAC changed:** NO  

---

## 1. Checkpoint

| Event | Commit Hash |
|-------|-------------|
| Restore point before RBAC work | `9dbb4eddd` |
| Final commit (this phase) | see `git log --oneline -1` |

---

## 2. Problem Description

The `normalizeRole()` function in `worker-airtrust/src/middleware/rbac.ts` (line 27) maps both
`instrutor` and `instructor` to the `manager` role:

```typescript
// worker-airtrust/src/middleware/rbac.ts:27
if (r === 'instrutor' || r === 'instructor') return 'manager'; // instrutor has manager-level access for routes
```

This means any user with the database-stored role `instrutor` (the Portuguese spelling used in
production) receives identical access to a `gestor`/`manager` user. There is no dedicated
`instructor` role in the type system, no dedicated `instructor` route guards, and no test coverage
for instructor-specific access decisions.

---

## 3. Where the Mapping Is Defined

| File | Line | Content |
|------|------|---------|
| `worker-airtrust/src/middleware/rbac.ts` | 14 | `export type UserRole = 'admin' \| 'manager' \| 'user';` |
| `worker-airtrust/src/middleware/rbac.ts` | 27 | `if (r === 'instrutor' \| r === 'instructor') return 'manager';` |

The `normalizeRole` function is private (not exported). There are two RBAC implementations:
- `worker-airtrust/src/middleware/rbac.ts` — primary, used by all routes via `requireRole(...)`
- `worker-airtrust/src/middleware/auth.ts` — contains a separate `requireRole` that does simple
  string comparison (no normalization), used only in legacy auth patterns

The routes use the `rbac.ts` version via named import.

---

## 4. Manager-Gated Routes Found

| Metric | Count |
|--------|-------|
| Total `requireRole` calls in routes (excl. imports) | 179 |
| Routes requiring `manager` (alone or with `admin`) | **143** |
| Routes requiring only `manager` (not `admin\|manager`) | 4 |
| Routes requiring only `admin` | 32 |

---

## 5. Access Matrix

| Route Area | Files | Category | Instructor Should Access? | Reason |
|------------|-------|----------|--------------------------|--------|
| Treinamentos planejados (CRUD) | `treinamentos-planejados.ts` | A | Likely YES | Instructor manages planned training |
| Solicitações treinamento (approvals) | `solicitacoes-treinamento.ts` | A | Likely YES | Training request workflow |
| Qualificações historico write | `qualificacoes/historico-write.ts` | A | Likely YES | Instructor records qualification history |
| LMS matrículas (view by course, bulk) | `lms-matriculas.ts` | A | Likely YES | Course enrollment management |
| LMS relatórios (conformidade, expirações) | `lms-relatorios.ts` | A | Likely YES | Training compliance reporting |
| LMS cursos (stats, read reports) | `lms-cursos.ts` | B | MAYBE | Read stats yes; create/delete/upload — product decision |
| FRMS fadiga-checkin manager panel | `frms-fadiga-checkin.ts` | B | MAYBE | Operational safety check; may depend on role in org |
| Qualificações/tipos (create, edit) | `qualificacoes/tipos.ts` | B | MAYBE | Type management — admin-like, instructor may need read only |
| Escalas CRUD (create, edit, delete schedules) | `escalas-crud.ts` | B | MAYBE | Full schedule management may exceed instructor scope |
| Escalas alocações (assign crew) | `escalas-alocacoes.ts` | B | MAYBE | Depends on whether instructor assigns crew |
| Horas-voo write (lancamentos) | `horas-voo.ts` | B | MAYBE | Flight hours are typically admin/ops |
| Aeronaves (create, update) | `aeronaves.ts` | C | NO | Fleet management is admin/ops |
| Funcionários mutations (create, update) | `funcionarios-mutations.ts` | C | NO | Employee management is HR/admin |
| Funcionários ferias (create, delete) | `funcionarios.ts` | C | NO | HR function |
| Setores-gestores (org management) | `setores-gestores.ts` | C | NO | Org structure is admin |
| Setores (create, update) | `setores.ts` | C | NO | Org structure is admin |
| Funcoes (create, update) | `funcoes.ts` | C | NO | Job function management is admin |
| Importação XLSX (employees, historico, tipos) | `importacao-xlsx.ts` | C | NO | Bulk import is admin/ops |
| Backup routes | `backup.ts` | C | NO | System admin only |
| Integrações EdApp | `integracoes_edapp.ts` | C | NO | System integration is admin |
| Integrações SigVoos | `integracoes_sigvoos.ts` | C | NO | System integration is admin |
| LMS cursos write/upload/delete | `lms-cursos.ts` | C | NO | Course authoring may be admin only |
| LMS edapp legado (importar) | `lms-edapp-legado.ts` | C | NO | Legacy import is admin |
| Notificações configuração | `notificacoes.ts` | C | NO | System config is admin |
| Notificações convocação (send, cancel) | `notificacoes-convocacao.ts` | C | NO | Summoning management — depends on product |
| Licencas (create, update, delete) | `licencas.ts` | C | NO | License management is admin |
| Hospedagem (create, update, delete) | `hospedagem.ts` | C | NO | Accommodation is ops/admin |
| Compliance requisitos (create, edit, delete) | `compliance-requisitos.ts` | C | NO | Compliance rule management is admin |
| Qualificações reclass queue | `qualificacoes-reclass.ts` | C | NO | Re-classification is admin workflow |
| Qualificações atribuição | `qualificacoes/atribuicao.ts` | C | NO | Assignment management is admin |
| Qualificações certificados write | `qualificacoes-certificados-write.ts` | C | NO | Certificate issuance is admin/ops |
| Categorias (create, update, delete) | `categorias.ts` | C | NO | Category management is admin |
| Escalas templates, padrões, restrições | multiple `escalas-*.ts` | C | NO | Schedule admin templates are ops/admin |
| Escalas situações, status, EVD | multiple `escalas-*.ts` | C | NO | Operational status management |
| Matriz treinamento registros | `matriz-treinamento.ts` | B | MAYBE | Training matrix may be instructor territory |
| Auditoria routes | `auditoria.ts`, `auditoria-detalhada.ts` | C | NO | Admin-only — correctly blocked today |

**Category definitions:**
- **A** — Instructor should access post-fix (training delivery, training records)
- **B** — Product decision required; depends on how instructor role is used in practice
- **C** — Instructor should NOT access post-fix (admin, HR, system, org management)

---

## 6. Decision: Option A — Documentation + Characterization Tests Only

**Rationale for choosing Option A over Option B:**

1. **Route count is large and categories are mixed**: 143 manager-gated routes span 11+ distinct
   business domains. There is no clear boundary that can be drawn without detailed product input on
   which routes instructors actually use.

2. **No existing test coverage for instructor access**: The `rbac.test.ts` file tests local helpers,
   not the actual `normalizeRole` function. There are zero tests for instructor access to any route.
   Making a runtime change without test coverage is high-risk.

3. **The change requires a new `UserRole` type value**: Adding `'instructor'` requires changes to
   the type system, all `requireRole` call sites for Category A, and a new test suite. This is a
   scoped but non-trivial change that deserves its own dedicated RBAC phase.

4. **Usage pattern is unknown**: Without production access logs, we cannot determine which of the
   143 routes instructors actively use. Restricting access to routes they depend on would break
   instructor workflows.

5. **Risk asymmetry**: Option A (no change) preserves the status quo with documentation.
   Option B risks breaking instructor workflows if the Category A list is wrong.

**What was done:**
- Created characterization test file documenting current behavior (47 tests, all passing)
- Created this assessment report
- Updated `docs/RBAC_INSTRUCTOR_AUDIT.md` and `docs/PRODUCTION_READINESS_REPORT.md`
- No changes to `rbac.ts` or any route files

---

## 7. What Was Changed

| File | Change |
|------|--------|
| `worker-airtrust/src/__tests__/rbac-characterization.test.ts` | NEW — 47 characterization tests |
| `docs/RBAC_INSTRUCTOR_FIX_REPORT.md` | NEW — this report |
| `docs/RBAC_INSTRUCTOR_AUDIT.md` | UPDATED — phase 2 status |
| `docs/PRODUCTION_READINESS_REPORT.md` | UPDATED — RBAC status entry |
| `docs/PRE_PRODUCTION_OPERATIONAL_HARDENING_REPORT.md` | UPDATED — RBAC status |

**No changes to:**
- `worker-airtrust/src/middleware/rbac.ts`
- Any route file
- Any production resource

---

## 8. Validation Results

| Check | Result | Details |
|-------|--------|---------|
| TypeScript (`npx tsc --noEmit`) | **PASS** | 0 errors |
| Tests (`npm run test:all`) | **PASS** | 402/402 (47 new characterization tests included) |
| Frontend build (`npm run build`) | **PASS** | built in 5.35s |
| Worker dry-run (`wrangler deploy --dry-run`) | **PASS** | 5486.74 KiB / gzip: 1060.79 KiB |

---

## 9. Remaining Risks

1. **Over-provisioning continues until RBAC Phase 3**: Instructors retain full manager-level
   access to 143 routes including employee creation, org management, integrations, and backup.
   Mitigation: characterization tests will catch unintended normalization changes.

2. **No production usage data**: The access matrix classification (A/B/C) is based on semantic
   analysis, not actual usage logs. If RBAC Phase 3 restricts a route that instructors rely on,
   it will break workflows. Mitigation: collect production access logs for `instrutor` role before
   executing Phase 3.

3. **Dual RBAC implementation**: `rbac.ts` and `auth.ts` both export `requireRole` with different
   signatures and semantics. Routes using `auth.ts`'s `requireRole` (legacy pattern) bypass
   `normalizeRole` entirely. These were not counted in the 143 total. This dual implementation
   should be consolidated in Phase 3.

---

## 10. Recommendation for Phase 3 (RBAC Fix)

When executing the runtime fix (Option B):

1. Collect production access logs: `SELECT role, COUNT(*) FROM audit_logs WHERE role = 'instrutor' GROUP BY route ORDER BY COUNT(*) DESC`
2. Add `'instructor'` to `UserRole` union in `rbac.ts`
3. Change `normalizeRole` to return `'instructor'` for `'instrutor'`/`'instructor'`
4. Add `'instructor'` only to Category A route `requireRole()` calls (guided by usage logs)
5. Update the 47 characterization tests: `[CURRENT BEHAVIOR]` tests should now expect `'instructor'`
6. Run full validation suite
7. Deploy to staging and test instructor login end-to-end before production

---

**Production touched:** NO  
**Working tree clean after commit:** YES
