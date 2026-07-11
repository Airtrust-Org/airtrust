# Reconciliação do ledger de migrations em staging

Escopo: leitura, sem escrita no ledger. Ambiente sintético, sem dados reais.

## Por que isto existe

`airtrust-db-staging-baseline-20260701` foi restaurado a partir de um dump de
schema, não por replay completo de `wrangler d1 migrations apply`
(`docs/D1_STAGING_MIGRATION_AUDIT_REPORT.md`). Isso significa que o
`d1_migrations` ledger pode divergir do schema real: uma migration pode ter
seus objetos presentes no banco sem estar registrada no ledger, ou vice-versa.
Rodar `wrangler d1 migrations apply` sem antes checar isso arrisca reaplicar
(ou pular) migrations de forma inconsistente.

## Ferramenta

`scripts/staging/migration-ledger-preflight.mjs` — **somente leitura**, roda
apenas contra `airtrust-db-staging-baseline-20260701`
(`bf9963f4-eb12-439b-a830-20bbf577ac22`); qualquer outro `database_id`/nome é
recusado antes de qualquer query. Não altera o ledger, não aplica nenhuma
migration.

```
node scripts/staging/migration-ledger-preflight.mjs
```

Compara, para cada migration versionada em `worker-airtrust/migrations/`:

1. presença de linha correspondente em `d1_migrations`;
2. presença das tabelas que a migration declara via `CREATE TABLE` em
   `sqlite_master`.

## Estados possíveis

| Estado | Significado |
|---|---|
| `aplicada_e_registrada` | Ledger e schema concordam — seguro. |
| `aplicada_mas_nao_registrada` | Objetos existem, ledger não sabe — comum neste ambiente (restaurado por dump). Não bloqueia sozinho. |
| `registrada_mas_nao_aplicada` | Ledger diz que rodou, mas os objetos não existem — **vermelho**, `apply-approved-migrations.sh` recusa prosseguir. |
| `pendente` | Nem ledger nem schema têm evidência — candidata legítima a aplicação. |
| `ambigua` | Só parte dos objetos esperados existe — **vermelho**, exige revisão humana antes de qualquer escrita. |
| `pendente_ou_nao_verificavel` | Migration sem `CREATE TABLE` (ALTER/index/dado) — só o ledger é sinal disponível. |

`registrada_mas_nao_aplicada` e `ambigua` fazem o script sair com código
diferente de zero (`PREFLIGHT_RED`). `apply-approved-migrations.sh` chama este
preflight antes de qualquer escrita e recusa prosseguir se o resultado não for
verde — **nunca** escreve no ledger automaticamente para "corrigir" um estado
ambíguo.

## O que fazer com um estado vermelho

1. Não aplicar nenhuma migration adicional.
2. Não rodar `wrangler d1 migrations apply` (tentaria a cadeia inteira).
3. Produzir um plano de correção separado (documentado, revisado por humano)
   antes de qualquer `INSERT`/`DELETE` manual no `d1_migrations`.
4. Qualquer escrita no ledger exige: confirmação explícita, evidência de
   schema (via este mesmo preflight), backup verificado
   (`scripts/staging/backup-d1-staging.sh`), e comando versionado — nunca uma
   correção improvisada em produção ou staging.

## Não fazer

- Não usar `wrangler d1 migrations apply` enquanto o preflight indicar que ele
  tentaria reaplicar a cadeia inteira sem allowlist.
- Não tratar `aplicada_mas_nao_registrada` como bug a "corrigir" sozinho —
  neste ambiente restaurado por dump, é o estado esperado para a maioria das
  migrations históricas.
