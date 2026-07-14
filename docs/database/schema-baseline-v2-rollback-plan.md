# Rollback — Schema Baseline V2

Objetivo: desfazer apenas a governanca V2 se o bootstrap falhar, sem tocar tabelas funcionais e sem reexecutar migrations historicas.

## Pre-condicoes

- snapshot de backup em `~/.airtrust-prod-ops/schema-baseline-v2/<timestamp>`;
- `d1_migrations` inalterado antes e depois do bootstrap;
- nenhuma mudanca funcional aplicada fora de `worker-airtrust/schema-v2/bootstrap/0000_initialize_schema_ledger_v2.sql`.

## Passos

1. Confirmar que o problema esta restrito a `airtrust_schema_baselines_v2` e `airtrust_schema_changes_v2`.
2. Validar no backup o `schema_hash`, `source_commit` e `plan_hash` esperados.
3. Executar somente o SQL de rollback abaixo em janela controlada e com os mesmos gates do bootstrap:

```sql
DROP TABLE IF EXISTS airtrust_schema_changes_v2;
DROP TABLE IF EXISTS airtrust_schema_baselines_v2;
```

4. Revalidar:
   - `d1_migrations` preservado;
   - contagens funcionais de fichas auditadas preservadas;
   - contrato V2 volta a falhar apenas pela ausencia das tabelas de governanca.

## Nao fazer

- nao editar `d1_migrations`;
- nao reexecutar `0408`–`0429`;
- nao deployar Worker ou Pages;
- nao aplicar rollback em tabelas funcionais.
