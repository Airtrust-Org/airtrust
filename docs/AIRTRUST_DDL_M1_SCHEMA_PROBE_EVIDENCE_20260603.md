# AirTrust — DDL M1 Schema Probe Evidence

## 1. Objetivo

Executar um probe estrutural read-only para decidir qual caminho seguir para a futura M1 de `solicitacoes_treinamento`, sem alterar schema, dados, runtime ou ambiente remoto.

## 2. Motivo da parada anterior

A Sprint X foi interrompida porque `ensureSolicitacoesTreinamentoLinkSchema()` pode ter criado `treinamento_planejado_id`, `status_pre_agendamento` e `idx_solicitacoes_treinamento_planejado` em alguns ambientes via runtime, enquanto a migration proposta continuaria usando `ALTER TABLE ... ADD COLUMN` simples. Em SQLite/D1, isso pode falhar com `duplicate column name`.

## 3. Ambiente consultado

- Repositório: `/Users/filipedaumas/SAAS/Airtrust`
- Branch: `main`
- HEAD consultado: `cf5866907d820fb085472f748243968c6d03510d`
- Probe local: snapshot D1 em `worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/`
- Probe de staging/produção: não executado

## 4. Autorização

- `AIRTRUST_ALLOW_SCHEMA_PROBE=UNSET`
- `AIRTRUST_SCHEMA_PROBE_TARGET=UNSET`
- `AIRTRUST_CONFIRM_READ_ONLY_SCHEMA_PROBE=UNSET`
- `AIRTRUST_CONFIRM_PRODUCTION_READ_ONLY=UNSET`

Conclusão: probe de staging/produção não estava autorizado. Para o alvo local, a execução foi feita explicitamente com env transitória e somente sobre snapshot local.

## 5. Resultado estrutural

| Target | Table exists | treinamento_planejado_id | status_pre_agendamento | idx_solicitacoes_treinamento_planejado | Status |
|---|---|---|---|---|---|
| `local` | yes | no | no | no | `PASS` |
| `staging/production` | unknown | unknown | unknown | unknown | `SKIPPED_SCHEMA_PROBE_NOT_AUTHORIZED` |

## 6. Interpretação

O snapshot local confirma apenas o caminho de ambiente limpo: a tabela `solicitacoes_treinamento` existe e não contém ainda as 2 colunas de link nem o índice parcial. Isso é compatível com uma M1 simples em ambiente local limpo.

Esse resultado não é suficiente para decidir a M1 do ambiente aprovado. O runtime DDL pode já ter criado essas estruturas em staging ou produção, e esse é exatamente o cenário que faria a migration simples falhar.

## 7. Decisão para M1

Decisão atual: **não criar a migration M1 ainda**.

Classificação aplicada ao R03: `BLOCKED_SCHEMA_PROBE_REQUIRED`.

Motivo: falta probe read-only autorizado em ambiente aprovado para confirmar se:

- as 2 colunas estão ausentes;
- as colunas já existem e só falta o índice;
- tudo já existe e a migration deve ser evitada.

## 8. Próxima ação

Autorizar probe read-only em ambiente aprovado com:

```bash
export AIRTRUST_ALLOW_SCHEMA_PROBE=YES
export AIRTRUST_SCHEMA_PROBE_TARGET=staging
export AIRTRUST_CONFIRM_READ_ONLY_SCHEMA_PROBE=YES
```

Ou, se o operador aprovar explicitamente produção read-only:

```bash
export AIRTRUST_ALLOW_SCHEMA_PROBE=YES
export AIRTRUST_SCHEMA_PROBE_TARGET=production
export AIRTRUST_CONFIRM_READ_ONLY_SCHEMA_PROBE=YES
export AIRTRUST_CONFIRM_PRODUCTION_READ_ONLY=YES
```

Depois disso, reexecutar `scripts/validation/probe-solicitacoes-treinamento-schema-readonly.sh` e só então decidir entre:

- `READY_FOR_SIMPLE_M1`
- `READY_FOR_INDEX_ONLY_M1`
- `READY_TO_REMOVE_RUNTIME_FALLBACK_NO_MIGRATION`
- `ENVIRONMENT_DRIFT_REQUIRES_PLAN`

## 9. Confirmações de segurança

- Nenhuma migration foi criada.
- Nenhum schema foi alterado.
- Nenhum `ALTER/CREATE/DROP/INSERT/UPDATE/DELETE` foi executado.
- Nenhum `wrangler d1 execute --remote` foi usado.
- Nenhum dado real foi alterado.
- Nenhum deploy foi executado.
- Nenhum secret foi versionado.
- Nenhuma PII foi registrada.
