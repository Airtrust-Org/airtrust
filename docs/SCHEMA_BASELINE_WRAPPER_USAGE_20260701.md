# Schema Baseline Wrapper Usage

## Objetivo

`scripts/export-d1-schema-only.sh` inventaria o schema do D1 via `sqlite_master` em modo read-only e materializa artefatos auditáveis para revisão humana antes de qualquer baseline real. Ele é uma ferramenta pré-operacional: sozinho não autoriza baseline, rebuild de staging, bootstrap de ledger nem decisão de produção.

## O que ele faz

- Consulta apenas DDL (`table`, `index`, `view`, `trigger`) via `wrangler d1 execute --command --json`.
- Classifica objetos com decisão final `canonical` ou `excluded`.
- Marca objetos `suspicious` como dimensão de risco adicional, com `finalDecision` explícito no artefato correspondente.
- Materializa dependências textuais e FKs em `dependency_edges.json`.
- Falha fechado se um objeto canônico depender de objeto excluído ou ausente.
- Falha fechado se detectar `INSERT`, `UPDATE`, `DELETE`, `REPLACE`, `UPSERT` ou `DROP` como statements top-level fora de triggers.
- Aceita DDL legítima com cláusulas de FK como `ON UPDATE CASCADE` e `ON DELETE CASCADE`.
- Falha fechado se o schema fonte não estiver em estado pré-0412.
- Permanece em `audit-only` por padrão.

## O que ele não faz

- Não aplica baseline.
- Não cria D1.
- Não altera binding.
- Não executa migrations.
- Não exporta linhas de dados.
- Não exporta PII.
- Não altera `wrangler.toml`.

## Garantias de segurança

- Somente leitura contra a origem remota quando usado sem `--input-json`.
- Nenhum `--file` é usado com `wrangler d1 execute`.
- O SQL baseline só é escrito com `--write-sql` e apenas quando o manifest final fecha em `status = PASS`.
- `d1_migrations`, `_cf_%`, `sqlite_%`, `backup`, `tmp`, `legacy`, `_old` e residuais explícitos da auditoria são excluídos por política.
- Triggers em tabelas excluídas são excluídos automaticamente.
- Triggers canônicos com DML interno são reportados, não executados.

## Artefatos gerados

No diretório `docs/controlled-execution/schema-baseline-pre0412-<stamp>/`:

- `all_objects.json`
- `canonical_objects.json`
- `suspicious_objects.json`
- `excluded_objects.json`
- `dependency_edges.json`
- `blocked_dependencies.json`
- `schema_baseline_manifest.json`
- `schema_baseline_report.md`
- `schema_baseline_pre0412.sql` apenas com `--write-sql`

## Política de inclusão/exclusão

- `canonical`: objetos incluídos no baseline.
- `excluded`: objetos removidos do baseline por política ou por dependência estrutural.
- `suspicious`: dimensão de risco paralela usada para destacar objetos residuais/legados nomeados por política. Nesta versão do wrapper, os itens `suspicious` terminam em `finalDecision = excluded`.
- `blocked_dependencies.json`: contém apenas bloqueios de dependência estrutural. Violações pré-0412 e DML top-level aparecem em `schema_baseline_manifest.json` e `schema_baseline_report.md`.

## Limitações

- Dependências são inferidas por FKs, `tbl_name` de índices/triggers e referência textual heurística; revisão humana continua obrigatória.
- FKs quebradas em objetos já excluídos aparecem como warning para registro de dívida técnica histórica; não viram blocker sozinhas.
- O wrapper não inicializa ledger de migrations.
- `audit-only` não valida replay do SQL em D1 limpo.
- Mesmo com `status = PASS`, o wrapper não autoriza sozinho rebuild de staging, restore de DR ou aplicação em produção.

## Revisão recomendada antes de baseline real

1. Confirmar `schema_baseline_manifest.json` com `status = PASS`, `sql_emitted = false` no modo audit-only e sem findings bloqueantes.
2. Revisar `blocked_dependencies.json` para dependências estruturais inválidas.
3. Revisar `schema_baseline_manifest.json` e `schema_baseline_report.md` para violações pré-0412 ou DML top-level.
4. Revisar `suspicious_objects.json` e `excluded_objects.json` contra `docs/SCHEMA_OBJECT_CANONICALITY_AUDIT_20260701.md`.
5. Revisar triggers com DML interno inventariado.
6. Só então, em execução separada e aprovada, permitir `--write-sql`.

## Exemplos propostos

Auditoria read-only contra produção:

```bash
bash scripts/export-d1-schema-only.sh --stamp 20260701
```

Auditoria local a partir de JSON já coletado:

```bash
bash scripts/export-d1-schema-only.sh --input-json /tmp/sqlite-master.json --stamp 20260701
```

Escrita explícita do baseline SQL após revisão:

```bash
bash scripts/export-d1-schema-only.sh --stamp 20260701 --write-sql
```

Esse comando continua sendo apenas geração de artefato local. Ele não inicializa ledger, não cria D1, não aplica baseline, não executa staging rebuild e não substitui um runbook operacional aprovado.
