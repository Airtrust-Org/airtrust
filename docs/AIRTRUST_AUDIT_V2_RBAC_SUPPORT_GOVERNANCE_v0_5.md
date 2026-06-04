# AirTrust — Audit v2 + RBAC/Suporte + Governance v0.5

**Data:** 2026-06-04  
**Branch:** `main`  
**HEAD base:** `7a19ffccfa0640cd5a4d2055d704ff0d27c6fd37`  
**Modo:** local-only. Sem D1 remoto. Sem deploy. Sem migration nova. Sem backfill. Sem rebaseline.

## 1. Resumo executivo

Esta etapa reavaliou a superfície sensível ligada a `admin`, `support`, `maintenance`, `debug`, `certificados` e `audit`.

Resultado real desta passada:

- o fallback legado `userId===1` continua restrito ao helper central de compatibilidade e **não foi reespalhado**;
- `support` continua **não ativo** no runtime atual e não recebeu permissão implícita de escrita nem de admin;
- a exportação em massa de certificados (`POST /api/certificados/historico/export-zip`) foi endurecida para **admin only**;
- operações sensíveis de certificados (`recuperar-orfaos`, `limpar-refs-orfas`, `export-zip`) agora registram trilha de auditoria em **writer legado** e tentam também o **writer canônico v2**;
- não houve alteração de schema, então `RBAC/Suporte v2` e o rollout pleno de `Audit v2` **não podem** ser marcados como resolvidos.

## 2. Matriz de superfícies auditadas

| Área | Rota / helper | Risco | Estado após a passada |
|---|---|---|---|
| Platform fallback | `middleware/tenant.ts` → `isLegacyPlatformAdminUserId`, `isPlatformAdminContext` | compatibilidade legada `userId===1` | **preservado e centralizado** |
| Auth/RBAC | `middleware/auth.ts`, `middleware/rbac.ts` | elevação indevida de papel | **sem novo bypass** |
| Support | `support-role-not-yet-active.test.ts` | suporte virar admin sem schema | **bloqueado/fail-closed** |
| Admin resets | `/api/admin/reset/*` | mutação destrutiva cross-tenant | **tenant-scoped + auditado** |
| Manual migrations | `/api/migrations/*`, `/api/admin/apply-migration-*` | DDL/manual ops | **mantido atrás de `ENABLE_MANUAL_MIGRATIONS` + admin** |
| Maintenance | rotas FRMS/Sigvoos com `MAINTENANCE_SECRET` | operação administrativa fora de contrato | **mantido fail-closed** |
| Certificados debug | `/api/certificados/debug/*`, `/api/certificados/admin/debug-*` | superfície residual de inspeção | **mantido atrás de `ENABLE_ADMIN_DEBUG_ROUTES` + admin** |
| Certificados admin ops | `/api/certificados/recuperar-orfaos` | mutação sensível sem trilha forte | **audit trail melhorado** |
| Certificados admin ops | `/api/certificados/limpar-refs-orfas` | mutação sensível sem trilha forte | **audit trail melhorado** |
| Certificados export | `/api/certificados/historico/export-zip` | exportação em massa exposta a qualquer autenticado | **corrigido para admin only** |

## 3. Achados e decisões

### RBAC-compat

- Busca obrigatória `rg -n "userId\\s*===\\s*1|user_id\\s*===\\s*1" worker-airtrust/src` voltou sem ocorrências fora do helper central.
- O fallback legado continua dependente de schema futuro de `platform_admin`; portanto:
  - `RBAC_SUPPORT_V2` **não** pode ser `RESOLVED_FOR_CURRENT_SCHEMA`.
  - status correto: `PARTIAL_BLOCKED_BY_SCHEMA`.

### Support

- O guard `support-role-not-yet-active.test.ts` continua provando que `support` não recebe acesso `admin`.
- Não existe `support_read_only` persistido nem sessão auditável de suporte no schema atual.
- Decisão correta: manter `support` fora do runtime ativo e não forçar pseudo-RBAC sem base persistida.

### Audit trail

- O writer v2 (`recordAuditEventV2`) já existe e falha fechado sem quebrar a operação principal.
- Nesta etapa ele passou a ser usado com segurança em três operações sensíveis de certificados:
  - `CERTIFICADOS_RECUPERAR_ORFAOS`
  - `CERTIFICADOS_LIMPAR_REFS_ORFAS`
  - `CERTIFICADOS_EXPORT_ZIP`
- O writer legado (`registrarAuditoria`) foi mantido em paralelo para não depender de ativação plena do stream v2.
- Como não houve ativação por flag, paridade operacional nem schema novo nesta etapa:
  - `AUDIT_V2` **não** pode ser `RESOLVED`.
  - status correto: `MITIGATED_WITH_EXISTING_AUDIT_HELPERS`.

## 4. Testes e evidências desta passada

- `documentos-tenant-isolation.test.ts`
  - confirmou que `export-zip` continua tenant-scoped;
  - confirmou que `export-zip` agora bloqueia role não-admin antes de tocar R2;
  - confirmou que `recuperar-orfaos` e `limpar-refs-orfas` seguem tenant-scoped e agora deixam trilha v2.
- `admin-reset-tenant-scope.test.ts`
  - reconfirmou escopo por tenant nas mutações destrutivas de reset.
- `maintenance-guards.test.ts`
  - confirmou fail-closed `503` sem `MAINTENANCE_SECRET`;
  - confirmou `403` com token ausente/inválido mesmo em localhost;
  - confirmou que FRMS e SIGVOOS só executam o fluxo de maintenance com secret explícito válido.
- validações de baseline na raiz
  - `npx tsc --noEmit` -> `PASS`;
  - `npm run test:worker` -> `PASS` (`123` arquivos, `830` testes);
  - `npm run ops:guard` -> `PASS` com warnings históricos inventariados;
  - `npm run preflight` -> `NOT_AVAILABLE`;
  - `git diff --check` -> `PASS`.

## 5. Status canônico desta etapa

| Stream | Status |
|---|---|
| `RBAC_SUPPORT_V2` | `PARTIAL_BLOCKED_BY_SCHEMA` |
| `AUDIT_V2` | `MITIGATED_WITH_EXISTING_AUDIT_HELPERS` |
| `MNT-01` | `DOCUMENTED_ROTATION_REQUIRED` |
| `RES-03` | `ACCEPTED_LOW_RISK_DOCUMENTED` |

## 6. Riscos residuais

- `support` read-only continua sem persistência de papel, grants e sessão auditável.
- o fallback `userId===1` ainda existe por compatibilidade e só pode sair com migration/dual-read.
- o `ops:guard` segue emitindo warnings por utilitários históricos fora do fluxo operacional aprovado.
- `preflight` continua sem script canônico no `package.json` da raiz.

## 7. Próximos blocos recomendados

1. Fechar `Audit v2` em ambiente aprovado com flag/paridade reais.
2. Implementar `RBAC/Suporte v2` somente depois do `audit-first`.
3. Rodar uma limpeza dedicada dos utilitários históricos ainda detectados pelo `ops:guard`.
