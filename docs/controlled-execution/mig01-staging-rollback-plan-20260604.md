# AirTrust - MIG01 Staging Rollback Plan 2026-06-04

**Data:** 2026-06-04
**Branch:** `main`
**HEAD base:** `ff27b29`
**Modo:** rollback documentado para a janela `MIG-01` em `staging`. Sem producao. Sem deploy. Sem apply da `0389`.

## 1. Escopo

Este rollback cobre a janela controlada de `MIG-01` que gera um baseline SQL de schema a partir do snapshot SQLite local de staging.

Fora de escopo:

- aplicar `0389`;
- aplicar qualquer migration remota;
- executar `wrangler d1 migrations apply`;
- executar deploy;
- tocar producao;
- editar migrations historicas.

## 2. Snapshot associado

- **Snapshot pre-MIG SQLite:** `worker-airtrust/.wrangler/state/v3/d1/controlled-execution-snapshots/staging/dq01-staging-post-window-20260604T191117Z.sqlite`
- **Origem:** snapshot pos-DQ da janela `DQ-01` staging ja validada
- **Integridade:** `PRAGMA integrity_check = ok`
- **Tabelas visiveis:** `226`

## 3. Artefatos gerados pela janela

Artefatos esperados:

- `docs/controlled-execution/mig01-staging-schema-baseline-20260604.sql`
- `docs/controlled-execution/mig01-staging-rebaseline-summary-20260604.txt`
- `docs/AIRTRUST_MIG01_CONTROLLED_REBASELINE_EXECUTION_RESULT_AND_0389_HANDOFF_v0_5.md`

## 4. Como reverter

Como a janela nao aplica D1 remoto nem altera runtime, o rollback operacional e local/documental:

1. remover ou reverter os artefatos de baseline/resultados gerados pela janela;
2. restaurar a documentacao canonica para `MIG-01 = READY_FOR_CONTROLLED_REBASELINE_AFTER_DQ`;
3. manter o snapshot pre-MIG acima como fonte de verdade;
4. nao aplicar o baseline gerado em nenhum ambiente se a validacao pos-MIG falhar.

Se algum operador humano vier a aplicar manualmente o baseline fora deste runbook, o rollback remoto deve restaurar o snapshot pre-MIG aprovado antes de qualquer nova tentativa.

## 5. Criterios de rollback

Executar rollback documental/local se ocorrer qualquer um destes:

1. o baseline gerado nao puder ser replayado em SQLite limpo;
2. a contagem de objetos do baseline divergir do snapshot de entrada sem justificativa;
3. o baseline incluir `d1_migrations`, objetos da `0389` ou referencias de producao;
4. as validacoes pos-MIG falharem;
5. surgir evidencia de D1 remoto, deploy ou producao.

## 6. Validacao pos-rollback

Depois do rollback:

1. rerodar `bash scripts/audit-migration-chain-readiness.sh`;
2. confirmar que o snapshot pre-MIG segue legivel com `PRAGMA integrity_check = ok`;
3. confirmar que nao existem tracked changes de MIG pendentes;
4. registrar somente contagens agregadas, sem PII.
