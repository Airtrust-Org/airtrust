# AIRTRUST v0.5-H28 — Tenant safety contracts

## 1. Escopo
Fase focada em reduzir risco imediato de auth/tenant com patch mínimo, sem refactor estrutural, sem migration e sem deploy.

Itens priorizados:
1. `/api/assistente`
2. `/api/sessoes` simplificado
3. Importação (`/api/importacao`) somente para decisão H28-A vs H28-B

## 2. Riscos do H27 tratados nesta fase
- P0: endpoint de assistente sem contrato de auth explícito no módulo de rota.
- P1: endpoint simplificado `/api/sessoes` sem filtro explícito por `empresa_id`.

## 3. `/api/assistente` — antes/depois
### Antes
- `worker-airtrust/src/routes/assistente.ts` não aplicava `auth()` localmente.
- Dependia de proteção global do mount `/api/*` em `index.ts`.
- Handler aceitava `userId/empresaId` vazios e seguia execução até consultas com contexto frágil.

### Depois
- Adicionado `app.use('*', auth())` no módulo de rota.
- Handler agora valida contexto autenticado e tenant:
  - `userId` inválido => `401` com `AUTH_REQUIRED`.
  - `empresaId` inválido => `403` com `TENANT_CONTEXT_REQUIRED`.
- Fluxo autenticado com tenant válido permanece funcional.

## 4. `/api/sessoes` simplificado — antes/depois
### Antes
- Rota já exigia `auth()`, mas query list/count não filtrava `empresa_id`.
- Risco de listagem cross-tenant.

### Depois
- Rota faz fail-closed quando `empresaId` ausente/inválido (`403`, `TENANT_CONTEXT_REQUIRED`).
- Query principal agora usa `WHERE deleted_at IS NULL AND empresa_id = ?`.
- Query de total também usa `empresa_id = ?`.
- Tratamento de erro da P2-06 foi preservado (`500`, `success:false`, `SESSOES_LIST_FAILED`).

## 5. Importação — decisão H28-B
### Diagnóstico H28
- `worker-airtrust/src/routes/importacao.ts` já tem `auth()`, porém não propaga tenant explicitamente para os serviços.
- `worker-airtrust/src/services/importacao/QualificacaoHistoricoImportacao.ts` contém validação/importação com auto-create e queries sem filtro explícito de `empresa_id`.

### Decisão
- **Não alterado nesta fase** por risco alto de regressão operacional em fluxo crítico de importação.
- Aberta recomendação de subfase **H28-B** dedicada para tenant scope em importação, com contrato claro e testes específicos de isolamento.

## 6. Testes adicionados/ajustados
- Novo: `worker-airtrust/src/__tests__/routes/assistente-auth.test.ts`
  - sem auth => 401
  - sem tenant válido => 403
  - autenticado + tenant válido => 200

- Ajustado: `worker-airtrust/src/__tests__/routes/sessoes-list.test.ts`
  - garante isolamento por tenant (empresa A não vê empresa B)
  - valida fail-closed sem tenant válido (403)
  - mantém cobertura de erro interno (`success:false`, 500)

## 7. Validações executadas
Executado com sucesso:
- `npx tsc -p worker-airtrust/tsconfig.json --noEmit`
- `npx tsc --noEmit`
- `npm run build`
- `npm run lint`
- `npm run test:worker` (441 testes passando)

## 8. Pendências
1. H28-B: tenant scope explícito em importação (router + serviços + auto-create).
2. H29: hardening de rotas fail-open remanescentes.

## 9. Próxima fase recomendada
**H28-B — Importação tenant scope** (Codex alto), com:
- mapeamento completo de `empresa_id` em validação/execução/importação-v2;
- regra fail-closed sem tenant;
- testes multi-tenant cobrindo auto-create e histórico.
