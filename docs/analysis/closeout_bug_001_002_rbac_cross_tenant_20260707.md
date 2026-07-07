# Closeout — BUG-AIRTRUST-001 & BUG-AIRTRUST-002 (RBAC Cross-Tenant)

**Data**: 2026-07-07
**PR**: `fix(security): enforce tenant isolation for impersonation and admin users`

---

## 1. BUG-AIRTRUST-001 — Impersonação cross-tenant

**Arquivo**: `worker-airtrust/src/routes/auth.ts`
**SHA**: `12c97ec4`

**Fix**: Adicionada verificação de tenant na rota `POST /api/auth/impersonate`:
- Caller não-platform-admin com `empresaId` inválido/null/0 → 403 `INVALID_TENANT_CONTEXT`
- Caller não-platform-admin tentando impersonar usuário de outro tenant → 403 `WRONG_TENANT`
- Platform admin formal (`isPlatformAdminAccess`) pode impersonar cross-tenant
- Self-impersonate continua bloqueado
- Audit log preservado

**FAIL-CLOSED**: Sim. Contexto inválido bloqueia por padrão.

## 2. BUG-AIRTRUST-002 — Admin-usuarios cross-tenant

**Arquivo**: `worker-airtrust/src/routes/admin-usuarios.ts`
**SHA**: `12c97ec4`

**Fix**: Helper centralizado `requireTenantAccess()` substitui 6 bypass patterns:
- `!empresaId || empresaId <= 0` → 403 `INVALID_TENANT_CONTEXT` (exceto platform admin)
- Vínculo `usuarios_empresas` sempre verificado
- Platform admin formal mantém acesso cross-tenant
- ADMIN de tenant não pula mais checagem
- GET/PUT/DELETE/invite/permissoes bloqueiam usuário de outro tenant

**FAIL-CLOSED**: Sim.

## 3. Deploy

- **Worker**: Deployado (`fee414c9`) via `wrangler deploy --env production`
- **Pages**: NÃO deployado
- **Migrations**: NENHUMA aplicada
- **DML**: NENHUM executado

## 4. Testes

- 25 testes de tenant isolation (8 impersonate + 17 admin-usuarios)
- 11 testes auth existentes sem regressão
- `npm run lint`: PASS

## 5. Smoke pós-deploy

- Health: ✅ (`/api/health` — 200, database/storage OK)
- Unauthenticated impersonate: ✅ 401
- Unauthenticated admin-usuarios: ✅ 401
- Authenticated cross-tenant: coberto por 25 testes de integração

## 6. Produção read-only

- `user_platform_roles`: ✅ Tabela existe
- Platform admin ativo: ✅ user_id=60, role_code='platform_admin', não revogado, sem expiração
- Cross-tenant support: ✅ Funcional para platform admin formal

## 7. Sem

- ❌ Migration
- ❌ DML
- ❌ Pages deploy
- ❌ Frontend alterado
- ❌ FRMS/LMS/Qualificações/Simuladores alterados

## 8. Risco residual

Se `user_platform_roles` ficar vazio (todos os platform admins revogados), cross-tenant de suporte fica bloqueado (fail-closed). Nenhum usuário terá acesso cross-tenant até que um novo platform admin seja concedido.
