# AirTrust — Hardening `empresa_id DEFAULT 1` — Wave 4 (Final)

Data: 2026-06-09
Repo: `<AIRTRUST_ROOT>`
Branch: `main`
Base inicial: `053f5de1`

## Sumário executivo

Wave 4 conclui a remoção de `empresa_id INTEGER DEFAULT 1` nas últimas tabelas operacionais
que ainda carregavam o default inseguro. Três tabelas foram tratadas:

- `importacoes_log` — remoção de DEFAULT 1, aplicação de NOT NULL
- `qualificacoes_tipos` — remoção de DEFAULT 1, aplicação de NOT NULL, backfill de 5 linhas soft-deleted
- `sgso_spi_config` — desativação de 7 linhas duplicadas com empresa_id=1

Quatro tabelas foram confirmadas como já hardened (NOT NULL, sem DEFAULT):

- `certificados_templates`, `escala_voo_diaria`, `notificacoes_convocacao_email_config`, `requisitos_compliance`

## Waves anteriores

| Wave | Migration | Tabelas |
|---|---|---|
| Wave 1 | 0396 | funcionarios, qualificacoes_historico, certificados, fichas_sessao, aeronaves, modelos_sessao |
| Wave 2 | 0397 | tabelas complementares |
| Wave 3 | 0399 | documentos, pasta_virtual, tipos_sessao, setores, funcoes, arquivos |

## Falha intermediária documentada

### Commit `38165b53`

Commit original da Wave 4. Continha:
- `worker-airtrust/migrations/0402_harden_empresa_id_wave4.sql` (A)
- `worker-airtrust/src/__tests__/migrations/empresa-id-wave4-hardening.test.ts` (A)
- `worker-airtrust/src/__tests__/migrations/migration-governance.test.ts` (M)
- `src/react-app/components/modals/__tests__/ModalNovaSessao.model-hydration.test.ts` (M) ← UI
- `src/react-app/pages/__tests__/Qualificacoes.planejadas-ui.test.ts` (M) ← UI

**Observação**: o commit misturou schema (Wave 4) com ajustes de testes de UI.
Essa mistura foi documentada mas não requer correção — os arquivos de UI são
testes de asserção textual que foram atualizados para refletir o refactor de
layout paralelo (`hideActions` → `{asTab && !hideActions && (`).

### Falha do `migrations apply`

Primeira tentativa de aplicar 0402 via `wrangler d1 migrations apply --remote` falhou
com `SQLITE_ERROR` — trigger `trg_qualificacoes_historico_set_tipo` referenciava
`qualificacoes_tipos` e o rebuild da tabela (DROP TABLE → RENAME) invalidava o trigger.

### Trigger que causou a falha

`trg_qualificacoes_historico_set_tipo` — AFTER INSERT ON qualificacoes_historico,
referencia `qualificacoes_tipos` em sub-SELECT. Durante o DROP TABLE, o D1
validou que o trigger ainda conseguia resolver suas referências e falhou.

### Objetos dependentes identificados

2 views:
- `qualificacoes_historico_v`
- `vw_tripulante_operacional`

5 triggers:
- `trg_qualificacoes_historico_set_tipo`
- `trg_qualificacoes_historico_update_tipo`
- `trg_apply_reclassification`
- `trg_qualificacoes_tipos_update`
- `trg_tipo_update_auditoria`

Todos foram dropados antes do rebuild e recriados depois. Os 2 triggers em
`qualificacoes_tipos_old` não foram afetados (tabela diferente).

### Correção da migration

A 0402 foi corrigida para incluir `DROP VIEW IF EXISTS` + `DROP TRIGGER IF EXISTS`
antes do rebuild de `qualificacoes_tipos`, e recriação completa de todas as views
e triggers após o `ALTER TABLE ... RENAME TO`.

Os índices foram criados com `IF NOT EXISTS` para idempotência.

### Método de aplicação

Após correção, a 0402 foi aplicada via `wrangler d1 execute --remote --file=`
(execução direta por arquivo), contornando a limitação do wrapper `migrations apply`
com triggers dependentes.

## Estado remoto após a falha

Após a falha do `migrations apply`, a transação foi integralmente revertida.
Nenhuma tabela `_new`, `_old`, ou parcialmente reconstruída foi deixada.
Após a correção e aplicação via `d1 execute --file`:

- `qualificacoes_tipos`: rebuild concluído, 93 rows, todas empresa_id=6
- `importacoes_log`: rebuild concluído, 58 rows, todas empresa_id=6
- `sgso_spi_config`: 7 rows empresa_id=1 com ativo=0, 7 rows empresa_id=6 com ativo=1
- Views e triggers: todos presentes e funcionais

## Migrations

| # | Arquivo | Método | Status |
|---|---|---|---|
| 0402 | `harden_empresa_id_wave4.sql` | `d1 execute --file` | ✅ Aplicada |
| 0403 | `reconcile_wave4_d1_ledger.sql` | `d1 execute --file` | ✅ Aplicada |

### Reconciliação de ledger

A 0402 foi aplicada diretamente, sem registro automático no `d1_migrations`.
A 0403 reconcilia o ledger inserindo o registro da 0402, após verificar que
todos os schema shapes da Wave 4 estão presentes (idempotente).

Registro no ledger:
```
0402_harden_empresa_id_wave4.sql → 2026-06-09 04:27:18
```

## Backups

- `artifacts/db-backups/airtrust-db-pre-default1-wave4-20260609.sql` — pré-migration

## Replay local

Aplicação local da 0402 corrigida sobre cópia do dump real:
- `PRAGMA integrity_check` → ok
- `PRAGMA foreign_key_check` → zero ocorrências nas tabelas do escopo
- Contagens preservadas em todas as tabelas

## Schema final

### qualificacoes_tipos
```
empresa_id INTEGER NOT NULL  (sem DEFAULT)
93 rows: empresa_id=6 → 93
NULL: 0
empresa_id=1: 0
Índices: idx_qualificacoes_tipos_codigo, _empresa, _deleted_at, _categoria, _ativo
Triggers: trg_qualificacoes_tipos_update, trg_tipo_update_auditoria
```

### importacoes_log
```
empresa_id INTEGER NOT NULL  (sem DEFAULT)
58 rows: empresa_id=6 → 58
NULL: 0
empresa_id=1: 0
```

### sgso_spi_config
```
empresa_id INTEGER NOT NULL  (sem DEFAULT)
7 rows empresa_id=1 → ativo=0 (desativadas)
7 rows empresa_id=6 → ativo=1 (canônicas)
```

## Limitações conhecidas

- `PRAGMA integrity_check` e `PRAGMA foreign_key_check` remotos retornam `SQLITE_AUTH`
  na Cloudflare D1 API. A integridade foi verificada via replay local sobre dump real.
- `qualificacoes_tipos.codigo` mantém unique index global (não por tenant).
  Dois tenants não podem ter o mesmo código ativo. Catálogo compartilhado intencional.

## Tabelas globais / legado (excluídas por design)

| Tabela | Classificação |
|---|---|
| `auditoria`, `auditoria_avancada_v2` | Infraestrutura de auditoria |
| `notificacoes` | Globais por design |
| `_backup_qh_tmp` | Backup legado |
| `funcionarios_tmp`, `legacy_*`, `bkp_*` | Histórico/temp |
| `qualificacoes_tipos_backup_*`, `qualificacoes_tipos_old`, `qualificacoes_tipos_id_map` | Backups |

## Testes

- `empresa-id-wave4-hardening.test.ts` — 7 testes: schema, contagens, backfill, deactivation, NOT NULL, unique constraint, integrity
- `empresa-id-wave4-ledger-reconcile.test.ts` — 3 testes: pré-condições, gravação, idempotência
- `migration-governance.test.ts` — max prefix 403, FOREIGN_KEYS_OFF inclui 0402
- Todos os 166 worker tests + 72 frontend tests passam

## Deploy

- Worker: `2026-06-09T04:27:52Z-70f5305d` — healthy
- Pages: não deployado nesta wave (sem alterações de frontend)

## Commits finais

```
70f5305d fix(migrations): complete wave 4 trigger rebuild and ledger reconciliation
f397dd3e fix(ui): standardize filters, action icons, table padding across all tabs
1abc64b6 fix(schema): harden empresa id wave 4
```

## Riscos residuais

- `qualificacoes_tipos`: unique index global (codigo) — resolvido por design (catálogo compartilhado)
- `funcionarios`: tabela PII crítica — auditoria contínua recomendada
- `_backup_qh_tmp`: passivo histórico conhecido, fora do runtime

## Readiness multiempresa

Todas as tabelas operacionais estão com `empresa_id NOT NULL`, sem DEFAULT 1.
O runtime aplica tenant scope via `getTenantContext(c).empresaId` ou equivalente.
Nenhum resíduo `empresa_id = 1` ativo permanece.

**A trilha `empresa_id DEFAULT 1` está encerrada.** A plataforma está pronta para
expansão multiempresa no que diz respeito ao isolamento de dados por tenant.

## Próximos passos não bloqueantes

- Auditoria de `funcionarios` para PII/tenant hardening (já tem schema correto, verificar runtime)
- Migração de `notificacoes` legadas para modelo tenant-scoped, se necessário
- Limpeza de tabelas `_backup_*` e `legacy_*` em janela de manutenção

## Conclusão

Das 17 tabelas originalmente identificadas com `empresa_id INTEGER DEFAULT 1`:

- **11 tabelas** hardened por Waves 1-3
- **3 tabelas** hardened por Wave 4 (importacoes_log, qualificacoes_tipos, sgso_spi_config)
- **1 tabela** resolvida antes (modelos_aeronave, via F5)
- **2 tabelas** legado/globais (notificacoes, auditoria)

**Zero tabelas operacionais mantêm DEFAULT 1. Zero resíduos empresa_id=1 ativos.**
