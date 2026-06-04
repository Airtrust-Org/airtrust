# AirTrust — Audit v2 + RBAC/Suporte v2 Gradual Enforcement Result And Product Handoff v0.5

**Data:** 2026-06-04
**Branch:** `main`
**Escopo:** Bloco 4 de 6 — `Audit v2 parity gap + RBAC/Suporte v2 gradual enforcement`
**Ambiente usado:** `staging` (`airtrust-api-staging`, D1 `airtrust-db-staging`)
**Restrições preservadas:** sem deploy, sem produção, sem `DQ-01`, sem `MIG-01`, sem remoção do fallback legado, sem enforcement amplo

## 1. Resultado executivo

- `RBAC_SUPPORT_V2 = GRADUAL_ENFORCEMENT_ACTIVE_FOR_CONTROLLED_SCOPE`
- `AUDIT_V2 = PARITY_VALIDATED_FOR_CONTROLLED_SCOPE`
- Fallback legado `userId===1`: preservado e coberto por guard arquitetural
- Enforcement amplo: **não** ativado

## 2. Audit v2 schema/parity

- Gap inicial confirmado em `staging`: `AUDIT_EVENTS_V2_EXISTS=0`, `OBJECTS_0385_COUNT=0`, `D1_MIGRATIONS_ROWS=4`
- Migration aplicada na janela controlada: `worker-airtrust/migrations/0385_audit_events_v2.sql`
- Gates executados:
  - `bash scripts/controlled-execution-gate.sh` → `READY_FOR_MANUAL_CONTROLLED_EXECUTION`
  - `bash scripts/audit-v2-schema-gate.sh` → `READY_FOR_MANUAL_CONTROLLED_EXECUTION`
  - `bash scripts/run-audit-rbac-v2-staging-readonly.sh` → `PASS` pré e pós
  - `bash scripts/run-audit-v2-staging-schema-apply.sh` → `COMPLETED`
- Approval: `AUDITV2-STAGING-20260604-FILIPE`
- Safe command: `bash scripts/run-audit-v2-staging-schema-apply.sh`
- Snapshot: `worker-airtrust/.wrangler/state/v3/d1/controlled-execution-snapshots/staging/audit-v2-staging-pre-window-20260604T201500Z-schema.sql`
- Rollback: `docs/controlled-execution/audit-v2-staging-rollback-plan-20260604.md`
- Diagnóstico pós: `AUDIT_EVENTS_V2_EXISTS=1`, `OBJECTS_0385_COUNT=6`, `AUDIT_EVENTS_V2_ROWS=0`, `LEDGER_0385_ROWS=0`
- Paridade validada para escopo controlado:
  - helper `record-legacy-and-canonical-audit` preserva writer legado
  - writer canônico `audit_events_v2` permanece acoplado ao helper existente
  - metadata continua sanitizada e sem PII pelos testes existentes
  - rotas sensíveis de certificados/admin agora passam pelo caminho auditável de suporte controlado

## 3. RBAC/Suporte v2 gradual enforcement

- Middleware novo: `worker-airtrust/src/middleware/platform-support.ts`
- Áreas com enforcement gradual controlado:
  - `POST /api/certificados/recuperar-orfaos`
  - `POST /api/certificados/limpar-refs-orfas`
  - `POST /api/certificados/historico/export-zip`
- Regras ativas no escopo controlado:
  - `tenant admin` continua autorizado
  - `platform_admin` continua autorizado, incluindo o fallback legado centralizado
  - `support_read_only` não executa mutação nem export sensível
  - `support_elevated` exige grant ativo + justificativa explícita
  - tentativas autorizadas/negadas geram trilha auditável controlada
  - sessão de suporte só é persistida se a tabela existir; fechamento da sessão é best-effort

## 4. Testes e validações

- `npm run ops:guard` → `PASS` com warnings históricos inventariados
- `npm run preflight` → `NOT_AVAILABLE`
- `npx tsc --noEmit` → ainda falha por erros históricos fora deste bloco; arquivos tocados ficaram sem ruído próprio no filtro dirigido
- `npm run test:worker` → `PASS` (`133` files, `874` tests)
- `git diff --check` → `PASS`
- Testes adicionados/ampliados no bloco:
  - `src/__tests__/migrations/audit-v2-schema-gate.test.ts`
  - `src/__tests__/routes/platform-support-gradual-enforcement.test.ts`
  - `src/__tests__/architecture/no-direct-platform-admin-user-id.test.ts`
  - ajuste de mock em `src/__tests__/routes/documentos-tenant-isolation.test.ts`

## 5. Handoff para Bloco 5

- Próximo bloco: `Product / performance / scale em staging`
- Pré-condições agora satisfeitas:
  - `audit_events_v2` existe em `staging`
  - `RBAC/Suporte v2` já tem enforcement gradual ativo em escopo pequeno e auditável
  - fallback legado permanece ativo para evitar troca abrupta de governança
- Limite que continua valendo:
  - não ampliar enforcement para todo o runtime sem nova validação operacional controlada
