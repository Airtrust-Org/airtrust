# Migration Governance Plan — AirTrust

**Version:** 1.1  
**Date:** 2026-08-04  
**Status:** ACTIVE

## 1. Fonte canônica

`worker-airtrust/migrations/` é o único diretório configurado em `migrations_dir` e deve conter exclusivamente migrations forward elegíveis para enumeração.

Novas migrations seguem:

```text
^[0-9]{4}_[a-z0-9_]+\.sql$
```

Não se renumeram nem se alteram migrations históricas já aplicadas. Permanecem duas exceções imutáveis de nome, por compatibilidade de ledger:

- `0098-indices-performance.sql`;
- `132_add_funcionario_ativo.sql`.

Duplicidades históricas permanecem limitadas à allowlist exata versionada em `scripts/migration-directory-policy.mjs`. Novas duplicidades são proibidas.

## 2. Separação obrigatória de artefatos

| Tipo | Local |
|---|---|
| Migration forward | `worker-airtrust/migrations/` |
| Rollback | `scripts/rollback/` |
| Preflight/validação read-only | `scripts/validation/` |
| SQL manual/destrutivo | `scripts/sql/manual/` |
| SQL bloqueado por `NO_GO_MIGRATION_PRODUCAO` | `scripts/sql/manual/no-go/` |
| Backup/artefato legado não enumerável | `scripts/sql/manual/archive/` |
| Mudança governada Schema V2 | `worker-airtrust/schema-v2/changes/` |

Arquivos de rollback, purge, preflight, diagnóstico, SQL manual, `NO_GO`, não SQL, backups, symlinks ou subdiretórios são proibidos no diretório canônico.

## 3. Deploy e schema são operações separadas

`scripts/deploy-worker-only.sh` não aplica migrations e não contém caminho alternativo para habilitá-las. Deploy de código nunca enumera o diretório de migrations.

Produção usa uma mudança de schema explicitamente autorizada por vez, pelo wrapper ou workflow governado aplicável. O wrapper `scripts/apply-migration-production.sh` aceita somente um arquivo canônico explícito e mantém o bloqueio fail-closed para `NO_GO_MIGRATION_PRODUCAO`.

`wrangler d1 migrations apply ... --remote` é proibido fora do caminho exato, isolado e revisado:

```text
scripts/production/apply-simuladores-matriz-remote-migration.sh
```

A allowlist é por caminho exato e não se estende a cópias ou novos scripts.

## 4. Guards obrigatórios

```bash
node scripts/guard-migrations-dir-purity.mjs
node scripts/guard-migrations-dir-purity.mjs --dry-run
node scripts/guard-no-generic-remote-migrations.mjs
node scripts/check-no-go-migrations.mjs
node scripts/check-duplicate-migrations.mjs
```

O CI executa esses guards antes da instalação/build. O modo dry-run lista exatamente `candidateFiles`; nenhum arquivo destrutivo, operacional ou auxiliar pode aparecer.

## 5. Inventário de quarentena de 2026-08-04

Foram preservados sem alteração de conteúdo:

- 14 rollbacks movidos de `worker-airtrust/migrations/` para `scripts/rollback/`;
- `0420_notificacoes_log_add_empresa_id_preflight_audit.sql` movido para `scripts/validation/`;
- `purge-soft-deleted-qualificacoes.sql` movido para `scripts/sql/manual/destructive/`;
- `0432_revisao_completa_codigos_manobras.sql`, `0433_fix_loft_references.sql` e `0435_fix_vencimento_fim_mes_lms.sql` movidos para `scripts/sql/manual/no-go/`;
- `0020_simuladores_final.sql.bkp` movido para `scripts/sql/manual/archive/` após o guard detectar o backup legado no diretório canônico.

O purge e o backup permanecem somente como artefatos históricos/manuais. Não devem ser executados sem procedimento operacional novo e autorização explícita.

## 6. Restrições operacionais

- nenhuma migration automática em deploy;
- nenhuma aplicação remota genérica do diretório;
- nenhum bypass em runtime para `NO_GO_MIGRATION_PRODUCAO`;
- nenhum `DROP`, purge ou rollback no fluxo forward;
- nenhum backup ou arquivo auxiliar dentro de `migrations_dir`;
- nenhuma edição retroativa de migration aplicada para fazê-la passar;
- produção e ledger continuam sujeitos aos gates de branch, SHA, backup, confirmação e Schema V2 aplicáveis.

Detalhes de implementação: `docs/ops/migrations-deploy-safety.md`.
