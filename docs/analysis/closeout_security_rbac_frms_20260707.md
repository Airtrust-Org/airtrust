# Closeout — Security Phase 1 & 2 (RBAC + FRMS Tenant Isolation)

**Data**: 2026-07-07
**Auditoria base**: `docs/analysis/auditoria_preventiva_bugs_airtrust_20260707.md`

---

## Phase 1: BUG-001 & BUG-002 (RBAC Cross-Tenant)

### PR
`fix(security): enforce tenant isolation for impersonation and admin users`
**SHA**: `12c97ec4`

### Fix
| Bug | Arquivo | Mudança |
|---|---|---|
| BUG-001 | `auth.ts` | Impersonação agora valida tenant do target vs caller. Fail-closed. |
| BUG-002 | `admin-usuarios.ts` | 6 bypass patterns substituídos por `requireTenantAccess()`. Fail-closed. |

### Deploy
- Worker: `fee414c9`
- Pages: NÃO
- Migrations: NENHUMA
- DML: NENHUM

### Testes
- 25 tenant isolation tests (8 impersonate + 17 admin-usuarios)
- 11 auth integration tests (sem regressão)
- Lint: PASS

---

## Phase 2: BUG-003 & BUG-004 (FRMS Tenant Gaps)

### PR
`fix(security): enforce tenant isolation in FRMS escalas and FIRA upload`
**SHA**: `0a222235`

### Fix
| Bug | Arquivo | Mudança |
|---|---|---|
| BUG-003 | `frms.ts` | PUT/DELETE escalas agora validam tenant via `assertTripulanteEmpresa` antes da mutação. |
| BUG-004 | `frms-fira.ts` | Upload/lote FIRA agora usam `getEmpresaIdSafe(c)` (tenant JWT). Removido fallback `empresa_id='1'`. Fail-closed. |

### Deploy
- Worker: `a28df8e0`
- Pages: NÃO
- Migrations: NENHUMA
- DML: NENHUM

### Testes
- 5 tenant isolation tests (escalas PUT/DELETE)
- 3 tenant isolation tests (FIRA upload)
- Lint: PASS

---

## Smoke Pós-Deploy (ambas as fases)

| Check | Resultado |
|---|---|
| Health `/api/health` | ✅ 200, DB ok, storage ok |
| Unauthenticated impersonate | ✅ 401 |
| Unauthenticated admin-usuarios | ✅ 401 |
| Unauthenticated PUT escalas | ✅ 401 |
| Unauthenticated DELETE escalas | ✅ 401 |
| Unauthenticated FIRA upload | ✅ 401 |

Authenticated cross-tenant scenarios covered by 33 integration tests.

---

## Produção Read-Only

| Check | Resultado |
|---|---|
| `user_platform_roles` table | ✅ Exists |
| Active platform admin | ✅ user_id=60, `platform_admin`, not revoked |

---

## Resumo Final

| # | Bug | Status |
|---|---|---|
| BUG-001 | Impersonação cross-tenant | ✅ FIXED + DEPLOYED |
| BUG-002 | Admin-usuarios cross-tenant | ✅ FIXED + DEPLOYED |
| BUG-003 | FRMS escalas PUT/DELETE tenant | ✅ FIXED + DEPLOYED |
| BUG-004 | FIRA upload fallback empresa 1 | ✅ FIXED + DEPLOYED |

### Próximos achados recomendados
1. BUG-008/009/010 — Qualificações vencimento NULL (dado regulatório)
2. BUG-006 — LMS H5P mastery score
3. BUG-007 — Simuladores gate leitura/PDF
4. BUG-005 — Cache/frontend permissions localStorage

### Regras mantidas
- ❌ Nenhuma migration aplicada
- ❌ Nenhum DML executado
- ❌ Pages NÃO deployado
- ❌ Nenhum arquivo fora de escopo alterado
- ✅ Todos os contextos tenant inválidos bloqueiam (fail-closed)
- ✅ Platform admin formal mantém acesso cross-tenant
