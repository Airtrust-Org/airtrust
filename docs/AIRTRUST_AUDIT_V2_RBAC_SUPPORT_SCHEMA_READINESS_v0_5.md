# AirTrust — Audit v2 + RBAC/Suporte Schema Readiness v0.5

**Data:** 2026-06-04  
**Branch:** `main`  
**HEAD base:** `2a18c8c5ba796960f5b2f88fbe65806945a0a998`  
**Modo:** local-only. Sem D1 remoto. Sem deploy. Sem apply remoto. Sem backfill. Sem rebaseline.

## 1. Objetivo

Fechar a fundação mínima e versionada para:

- papéis persistidos de plataforma;
- grants e sessões auditáveis de suporte;
- dual-read local entre papel persistido e fallback legado;
- contrato pequeno de dual-audit legado + canônico v2.

## 2. O que foi versionado

### Migration local

`worker-airtrust/migrations/0389_platform_roles_support_access_foundation.sql`

Cria, de forma aditiva:

- `user_platform_roles`
- `support_access_grants`
- `support_access_sessions`

Sem:

- alterar tabelas legadas;
- remover `userId===1`;
- ativar runtime cross-tenant automaticamente;
- aplicar qualquer migration remota.

### Helpers

- `worker-airtrust/src/lib/rbac/platform-access.ts`
  - resolve platform roles persistidos;
  - preserva dual-read com `LEGACY_PLATFORM_ADMIN_USER_ID`;
  - separa `platform_admin` de `support_read_only`/`support_elevated`;
  - exige grant tenant-scoped + `supportReason` para suporte;
  - bloqueia mutação para suporte sem papel/grant elevados.
- `worker-airtrust/src/lib/audit/record-legacy-and-canonical-audit.ts`
  - registra writer legado;
  - tenta writer canônico v2;
  - preserva operação mesmo quando o writer v2 retorna falha controlada.

## 3. Modelo mínimo adotado

### Platform roles persistidos

Tabela: `user_platform_roles`

Papéis mínimos:

- `platform_admin`
- `support_read_only`
- `support_elevated`

Campos mínimos:

- `user_id`
- `role_code`
- `granted_by_user_id`
- `granted_reason`
- `expires_at`
- `revoked_at`

### Grants tenant-scoped de suporte

Tabela: `support_access_grants`

Níveis mínimos:

- `read_only`
- `elevated`

Regra:

- suporte só entra em tenant com grant ativo;
- suporte só entra com `support_reason`;
- `support_read_only` nunca autoriza mutação;
- `support_elevated` só autoriza mutação se o grant também for `elevated`.

### Sessão auditável

Tabela: `support_access_sessions`

Campos mínimos:

- `id`
- `user_id`
- `empresa_id`
- `access_level`
- `support_reason`
- `request_id`
- `correlation_id`
- `started_at`
- `ended_at`

## 4. O que não foi feito

- não houve enforcement amplo em rotas;
- não houve ativação de `support` no runtime geral;
- não houve remoção do fallback legado `userId===1`;
- não houve apply remoto;
- não houve deploy.

## 5. Critério de status

Com a migration local versionada, helpers de dual-read/dual-audit e testes locais:

- `RBAC_SUPPORT_V2 = READY_FOR_CONTROLLED_SCHEMA_MIGRATION`
- `AUDIT_V2 = READY_FOR_CONTROLLED_SCHEMA_MIGRATION`

Esses streams **não** estão resolvidos. O que existe agora é uma base segura para aplicação controlada futura.

## 6. Validações esperadas

- `migration-governance.test.ts`
- `platform-roles-support-access-schema.test.ts`
- `platform-access.test.ts`
- `record-legacy-and-canonical-audit.test.ts`
- `npm run ops:guard`
- `npx tsc --noEmit`
- `npm run test:worker`

## 7. Próximo passo correto

1. Aplicar `0389` apenas em ambiente controlado aprovado.
2. Validar dual-read persistido + fallback legado.
3. Só depois começar enforcement runtime de `support_read_only`.
4. Ligar eventos reais de sessão de suporte ao writer legado + v2.
