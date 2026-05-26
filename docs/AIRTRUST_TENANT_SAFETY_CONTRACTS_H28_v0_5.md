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

## 8. H28-B — Importação tenant scope
### Escopo aplicado
- `worker-airtrust/src/routes/importacao.ts`
- `worker-airtrust/src/services/importacao/QualificacaoHistoricoImportacao.ts`
- testes de rota/serviço para isolamento tenant

### Pontos corrigidos
- Router de importação passou a exigir `empresaId` válido em todos os fluxos relevantes, com fail-closed:
  - resposta `403` com `TENANT_CONTEXT_REQUIRED` quando tenant inválido/ausente.
- `empresaId` agora é propagado explicitamente para o serviço de histórico nas operações de validar/importar/listar.
- Fluxo batch de histórico (`/batch-historico-v3` e `/executar-json/:entidade` no caminho de histórico) passou a incluir escopo tenant.

### Listagens/execuções protegidas
- `GET /historico/list` agora chama listagem com tenant explícito e filtra `h.empresa_id = ?`.
- JOINs da listagem foram amarrados por tenant (`f.empresa_id = h.empresa_id`, `q.empresa_id = h.empresa_id`).
- `enriquecer-historico` agora opera apenas no tenant autenticado e atualiza por `id + empresa_id`.

### Auto-create/import antes vs depois
- Antes:
  - auto-create e inserts de histórico sem `empresa_id` explícito;
  - queries de validação/lista sem filtro tenant consistente.
- Depois:
  - auto-create de `funcionarios`/`qualificacoes_tipos` inclui `empresa_id`;
  - insert de `qualificacoes_historico` inclui `empresa_id`;
  - validações e buscas de existência usam `empresa_id`;
  - linha de histórico com CPF não resolvido no tenant falha em vez de inserir silenciosamente.

### Testes adicionados
- Novo: `worker-airtrust/src/__tests__/routes/importacao-tenant-scope.test.ts`
  - listagem limitada ao tenant;
  - fail-closed sem tenant;
  - erro interno explícito sem sucesso silencioso.
- Novo: `worker-airtrust/src/__tests__/services/qualificacao-historico-importacao-tenant.test.ts`
  - verifica auto-create/insert com `empresa_id`;
  - fail-closed do serviço sem tenant.

## 9. Validações executadas após H28-B
Executado com sucesso:
- `npx tsc -p worker-airtrust/tsconfig.json --noEmit`
- `npx tsc --noEmit`
- `npm run build`
- `npm run lint`
- `npm run test:worker` (446 testes passando)

## 10. Pendências
1. Não houve necessidade de migration nesta fase; se existir ambiente legado sem `empresa_id` nessas tabelas, tratar em fase dedicada de schema.
2. H29: hardening de rotas fail-open remanescentes.

## 11. Próxima fase recomendada
**H29 — Fail-open hardening** (Codex alto/médio-alto), priorizando contratos de erro explícitos nas rotas ainda permissivas.
