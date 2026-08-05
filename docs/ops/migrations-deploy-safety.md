# AirTrust — Segurança do diretório de migrations e deploy

**Status:** canônico  
**Data:** 2026-08-04

## Invariantes

1. `worker-airtrust/migrations/` contém somente migrations forward elegíveis para enumeração.
2. O padrão para novas migrations é `^[0-9]{4}_[a-z0-9_]+\.sql$`.
3. As únicas exceções de nome são dois arquivos históricos já ledgerados e mantidos byte a byte:
   - `0098-indices-performance.sql`;
   - `132_add_funcionario_ativo.sql`.
4. Rollbacks ficam em `scripts/rollback/`.
5. Preflights ficam em `scripts/validation/`.
6. SQL manual, destrutivo, bloqueado ou arquivado fica em `scripts/sql/manual/`.
7. Arquivos auxiliares e backups, inclusive `*.bkp`, nunca ficam no `migrations_dir`.
8. Um arquivo com `NO_GO_MIGRATION_PRODUCAO` nunca é candidato canônico nem pode ser executado pelo wrapper de produção.
9. Deploy do Worker e alteração de schema são operações separadas. `scripts/deploy-worker-only.sh` nunca enumera nem aplica migrations.
10. `wrangler d1 migrations apply ... --remote` é proibido fora do caminho exato governado e isolado:
   `scripts/production/apply-simuladores-matriz-remote-migration.sh`.
11. O executor legado `worker-airtrust/scripts/aplicar-migration-0091-seguro.sh` permanece apenas como tombstone fail-closed e nunca consulta ou altera D1.
12. O guard de fontes operacionais reconhece somente renomes Git `R100` como movimentação byte a byte. Renomes modificados e cópias continuam em escopo e exigem marcadores.

## Guardas

### Pureza e enumeração

```bash
node scripts/guard-migrations-dir-purity.mjs
node scripts/guard-migrations-dir-purity.mjs --dry-run
```

O modo dry-run mostra em `candidateFiles` exatamente o conjunto que poderia ser enumerado. O guard falha para rollback, purge, preflight, SQL manual/diagnóstico, nome inválido, `NO_GO`, prefixo duplicado incompatível, arquivo não SQL, backup, symlink ou subdiretório.

### Aplicação remota genérica

```bash
node scripts/guard-no-generic-remote-migrations.mjs
```

A allowlist é baseada em caminho exato. Cópias, renomes ou novos wrappers falham até revisão explícita. Caminhos legados não recebem exceção: são aposentados em modo fail-closed.

### Fontes operacionais

```bash
node scripts/check-operational-sql-sources.mjs
```

Arquivos DML adicionados ou alterados exigem marcador de fonte/decisão. Um `R100` é excluído somente porque o Git comprova conteúdo idêntico; `R099` ou qualquer cópia continua bloqueada sem marcador.

### NO_GO

```bash
node scripts/check-no-go-migrations.mjs
```

O diretório canônico deve ter zero ocorrências. Os artefatos bloqueados preservados em `scripts/sql/manual/no-go/` continuam inventariados para auditoria.

## Aplicação de schema

O wrapper `scripts/apply-migration-production.sh` aceita um único arquivo canônico explícito, valida pureza do diretório, nome, caminho, symlink e marcador `NO_GO`, além dos gates já existentes. O fluxo Schema V2 permanece obrigatório quando o contrato específico assim determinar.

## Inventário movido nesta correção

- 14 rollbacks do diretório canônico → `scripts/rollback/`;
- `0420_notificacoes_log_add_empresa_id_preflight_audit.sql` → `scripts/validation/`;
- `purge-soft-deleted-qualificacoes.sql` → `scripts/sql/manual/destructive/`;
- `0432`, `0433` e `0435` marcados `NO_GO_MIGRATION_PRODUCAO` → `scripts/sql/manual/no-go/`;
- `0020_simuladores_final.sql.bkp` → `scripts/sql/manual/archive/`.

Os 20 artefatos foram preservados byte a byte. Nenhum conteúdo SQL foi alterado, nenhuma migration foi executada e nenhum dado foi removido.
