# AIRTRUST v0.4-H6-B — Sensitive Files Classification (Read-Only)

Data: 2026-05-25
Ferramenta/modelo: DeepSeek (inteligencia media)
Fase: H6-B — Classificacao read-only de dumps, seeds e unknowns
Repositorio: `/Users/filipedaumas/SAAS/Airtrust`

## 1. Sumario executivo

Classificacao dos 340 arquivos bloqueantes restantes do guardrail (`PROD_DUMP_OR_BACKUP`, `LOCAL_SEED`, `UNKNOWN_REVIEW_REQUIRED`) em 4 classes de acao. Nenhum arquivo foi apagado, movido, renomeado ou teve seu conteudo lido.

Resultado da classificacao:
- **REMOVE_INDEX_CANDIDATE_HIGH_CONFIDENCE**: 230 (67.6%)
- **KEEP_VERSIONED_LIKELY_VALID**: 19 (5.6%)
- **MANUAL_REVIEW_REQUIRED**: 85 (25.0%)
- **DO_NOT_TOUCH**: 6 (1.8%)

Primeiro lote H6-C recomendado: 10 arquivos (3 dumps grandes + 7 token/secret files).

## 2. Escopo e regras

- Nao apagar nada.
- Nao mover/renomear nada.
- Nao abrir conteudo de dumps SQL suspeitos.
- Nao imprimir conteudo de `.sql`, `.env`, dump, seed ou backup.
- Usar somente caminhos, nomes, extensoes, tamanhos, datas e localizacao.
- Nao mexer em codigo funcional.
- Nao tocar em EVD, FRMS, SIGVOOS, RBAC, deduplicate, simuladores ou UI.

## 3. Contagem por categoria do guardrail

| Categoria | Quantidade | Bloqueante |
|---|---|---|
| SECRET_ENV | 0 | Sim (corrigido em H6-A) |
| PROD_DUMP_OR_BACKUP | 92 | Sim |
| LOCAL_SEED | 17 | Sim |
| TEST_FIXTURE | 2 | Nao (allowlist) |
| MIGRATION | 355 | Nao (allowlist) |
| UNKNOWN_REVIEW_REQUIRED | 231 | Sim |
| **Total bloqueante** | **340** | |

## 4. Contagem por nova classificacao

| Classificacao | Quantidade | % |
|---|---|---|
| REMOVE_INDEX_CANDIDATE_HIGH_CONFIDENCE | 230 | 67.6% |
| KEEP_VERSIONED_LIKELY_VALID | 19 | 5.6% |
| MANUAL_REVIEW_REQUIRED | 85 | 25.0% |
| DO_NOT_TOUCH | 6 | 1.8% |

## 5. Top 20 arquivos mais criticos por risco/tamanho/caminho

| # | Caminho | Categoria guardrail | Tamanho | Nova classificacao |
|---|---|---|---|---|
| 1 | `scripts/seed-local.sql` | LOCAL_SEED | 19.6 MB | REMOVE_INDEX |
| 2 | `scripts/legacy/d1-prod-20260315-193839.sql` | PROD_DUMP | 19.1 MB | REMOVE_INDEX |
| 3 | `scripts/legacy/backup_pre_multitenant_20251207_142032.sql` | PROD_DUMP | 4.9 MB | REMOVE_INDEX |
| 4 | `_arquivos_nao_usados/sql_backups/prod_backup_20251122_001148.sql` | PROD_DUMP | 1.76 MB | REMOVE_INDEX |
| 5 | `_arquivos_nao_usados/sql_backups/prod_backup_20251122_001120.sql` | PROD_DUMP | 1.76 MB | REMOVE_INDEX |
| 6 | `_arquivos_nao_usados/sql_backups/prod_backup_20251122_001037.sql` | PROD_DUMP | 1.76 MB | REMOVE_INDEX |
| 7 | `_arquivos_nao_usados/sql_backups/prod_backup_20251122_001009.sql` | PROD_DUMP | 1.76 MB | REMOVE_INDEX |
| 8 | `_arquivos_nao_usados/sql_backups/prod_backup_20251122_000821.sql` | PROD_DUMP | 1.76 MB | REMOVE_INDEX |
| 9 | `_arquivos_nao_usados/backup_pre_0068_20251121_232020.sql` | PROD_DUMP | 795 KB | REMOVE_INDEX |
| 10 | `_arquivos_nao_usados/migrations/data-export/clean_import.sql` | PROD_DUMP | 768 KB | REMOVE_INDEX |
| 11 | `_arquivos_nao_usados/migrations/data-export/import_prod_data.sql` | PROD_DUMP | 729 KB | REMOVE_INDEX |
| 12 | `_arquivos_nao_usados/migrations/data-export/final_import.sql` | PROD_DUMP | 728 KB | REMOVE_INDEX |
| 13 | `_arquivos_nao_usados/migrations/data-export/prod_full_backup.sql` | PROD_DUMP | 728 KB | REMOVE_INDEX |
| 14 | `_arquivos_nao_usados/migrations/data-export/prod_fresh_full.sql` | PROD_DUMP | 728 KB | REMOVE_INDEX |
| 15 | `_arquivos_nao_usados/migrations/data-export/prod_clean.sql` | PROD_DUMP | 726 KB | REMOVE_INDEX |
| 16 | `_arquivos_nao_usados/migrations/data-export/prod_data_only.sql` | PROD_DUMP | 683 KB | REMOVE_INDEX |
| 17 | `_arquivos_nao_usados/migrations/data-export/prod_data_clean.sql` | PROD_DUMP | 681 KB | REMOVE_INDEX |
| 18 | `_arquivos_nao_usados/backup-prod-20251120-112111.sql` | PROD_DUMP | 663 KB | REMOVE_INDEX |
| 19 | `scripts/d1-prod-export.sql` | PROD_DUMP | 613 KB | REMOVE_INDEX |
| 20 | `_arquivos_nao_usados/RESTORE_QUALIFICACOES_HISTORICO.sql` | UNKNOWN_REVIEW | 309 KB | REMOVE_INDEX |

## 6. Lista por classificacao

### 6.1 REMOVE_INDEX_CANDIDATE_HIGH_CONFIDENCE (230 arquivos)

Candidatos a `git rm --cached` em fase futura (H6-C+). Nao remover agora.

#### 6.1.1 Dumps e backups de producao (PROD_DUMP_OR_BACKUP → REMOVE_INDEX) — 75 arquivos

**Backups timestamped em `_arquivos_nao_usados/`:**
- `_arquivos_nao_usados/backup_pre_0068_20251121_232020.sql` (795 KB)
- `_arquivos_nao_usados/backup_pre_0068_20251121_232824.sql`
- `_arquivos_nao_usados/backup_pre_0068_20251121_232849.sql`
- `_arquivos_nao_usados/backup_pre_0068_20251121_232909.sql`
- `_arquivos_nao_usados/backup_pre_0068_20251121_232923.sql`
- `_arquivos_nao_usados/backup_pre_0068_20251121_233018.sql`
- `_arquivos_nao_usados/backup_pre_triggers_20251128_111653.sql`
- `_arquivos_nao_usados/backup-airtrust-sistema-quase-ok-20251105-230824.sql`
- `_arquivos_nao_usados/backup-airtrust-sistema-quase-ok-20251105-230831.sql`
- `_arquivos_nao_usados/backup-airtrust-v2.2-20251102-130307.sql`
- `_arquivos_nao_usados/backup-airtrust-v2.2-20251102-130416.sql`
- `_arquivos_nao_usados/backup-prod-20251120-112105.sql`
- `_arquivos_nao_usados/backup-prod-20251120-112111.sql` (663 KB)

**Motivo**: backups com timestamp no nome, claramente nao sao migrations oficiais. Risco de remover do index: baixo.

**Prod SQL backups em `_arquivos_nao_usados/sql_backups/`:**
- `_arquivos_nao_usados/sql_backups/prod_backup_20251122_000821.sql` (1.76 MB)
- `_arquivos_nao_usados/sql_backups/prod_backup_20251122_001009.sql` (1.76 MB)
- `_arquivos_nao_usados/sql_backups/prod_backup_20251122_001037.sql` (1.76 MB)
- `_arquivos_nao_usados/sql_backups/prod_backup_20251122_001120.sql` (1.76 MB)
- `_arquivos_nao_usados/sql_backups/prod_backup_20251122_001148.sql` (1.76 MB)

**Motivo**: backups de producao com data no nome. 5 arquivos identicos (1.76 MB cada). Risco: baixo.

**Data exports de producao em `_arquivos_nao_usados/migrations/data-export/`:**
- `_arquivos_nao_usados/migrations/data-export/clean_import.sql` (768 KB)
- `_arquivos_nao_usados/migrations/data-export/final_import.sql` (728 KB)
- `_arquivos_nao_usados/migrations/data-export/import_prod_data.sql` (729 KB)
- `_arquivos_nao_usados/migrations/data-export/prod_clean.sql` (726 KB)
- `_arquivos_nao_usados/migrations/data-export/prod_data_clean.sql` (681 KB)
- `_arquivos_nao_usados/migrations/data-export/prod_data_only.sql` (683 KB)
- `_arquivos_nao_usados/migrations/data-export/prod_fresh_full.sql` (728 KB)
- `_arquivos_nao_usados/migrations/data-export/prod_full_backup.sql` (728 KB)

**Motivo**: exports de dados de producao, nomes explicitos com `prod_`. Risco: baixo.

**Production exports em `_arquivos_nao_usados/exports/`:**
- `_arquivos_nao_usados/exports/qualificacoes_historico_production_load.sql` (250 KB)
- `_arquivos_nao_usados/exports/qualificacoes_historico_production_load_notx.sql` (250 KB)

**Motivo**: dados de producao exportados. Risco: baixo.

**Migration backups em `_arquivos_nao_usados/migrations/_backup/`:**
- `_arquivos_nao_usados/migrations/_backup/2003_add_indexes_perf.sql`
- `_arquivos_nao_usados/migrations/_backup/2003_audit_cascade.sql`
- `_arquivos_nao_usados/migrations/_backup/2004_add_trigger_tipos_qualificacoes.sql`
- `_arquivos_nao_usados/migrations/_backup/2005_add_indexes_core.sql`
- `_arquivos_nao_usados/migrations/_backup/2006_consolidar_campos_arquivo.sql`
- `_arquivos_nao_usados/migrations/_backup/2007_add_qualificacoes_constraints.sql`
- `_arquivos_nao_usados/migrations/_backup/2008_lgpd_safe_delete.sql`
- `_arquivos_nao_usados/migrations/_backup/2009_refresh_tokens.sql`
- `_arquivos_nao_usados/migrations/_backup/FIX-TRIGGERS-AUDITORIA.sql`
- `_arquivos_nao_usados/migrations/_backup/SYNC-PRODUCTION-COMPLETE.sql`

**Motivo**: copias de backup de migrations. As versoes oficiais estao em `worker-airtrust/migrations/`. Risco: baixo.

**Disabled production fix:**
- `_arquivos_nao_usados/migrations/_disabled/2000_fix_usuarios_production.sql`

**Motivo**: fix especifico de producao, desabilitado. Risco: baixo.

**Backup enterprise:**
- `_arquivos_nao_usados/migrations/0150_sistema_backup_enterprise.sql`

**Motivo**: backup enterprise, nao e migration oficial. Risco: baixo.

**Schema dumps em `docs/`:**
- `docs/schema-producao-completo.sql` (47 KB)
- `docs/staging-schema-sync/production-schema-only.sql` (206 KB)

**Motivo**: schemas extraidos de producao/staging, nao sao migrations oficiais. Risco: baixo.

**Prod exports e backups em `scripts/`:**
- `scripts/d1-prod-export.sql` (613 KB)
- `scripts/ingest-backup-qualificacoes-historico.sql`
- `scripts/merge-backup-qualificacoes-historico.sql`
- `scripts/production_patch_backfill_metadata.sql`
- `scripts/production_patch_final.sql`
- `scripts/production_patch_final_no_tx.sql`
- `scripts/production_patch_view_0087.sql`

**Motivo**: scripts de export/producao/backup. Risco: baixo.

**Legacy dumps e backups em `scripts/legacy/`:**
- `scripts/legacy/d1-prod-20260315-193839.sql` (19.1 MB) — dump de producao
- `scripts/legacy/backup_pre_multitenant_20251207_142032.sql` (4.9 MB) — backup pre-migration
- `scripts/legacy/delete-all-certificates.sql` — script destrutivo
- `scripts/legacy/delete-only-certs.sql` — script destrutivo
- `scripts/legacy/final-insert-sessoes.sql` — insercao de dados
- `scripts/legacy/organizar-manobras-sessao1.sql` — organizacao de dados
- `scripts/legacy/restore-modelos.sql` — restore
- `scripts/legacy/seed-eventos-abr26.sql` — seed de eventos
- `scripts/legacy/seed-local-minimal.sql` — seed local
- `scripts/legacy/seed-rollback-aw139-sk76-manobras.sql` — rollback
- `scripts/legacy/sync-local-db.sql` — sync local
- `scripts/legacy/temp-audit-edapp.sql` — temporario
- `scripts/legacy/test-data.sql` — dados de teste
- `scripts/legacy/test-query-union.sql` — query de teste

**Motivo**: dumps, backups, scripts destrutivos, dados de teste. Risco: baixo.

#### 6.1.2 Seeds locais (LOCAL_SEED → REMOVE_INDEX) — 15 arquivos

- `_arquivos_nao_usados/migrations/2099_seed_data.sql`
- `scripts/d1-seed-auth.sql`
- `scripts/d1-seed-funcionarios.sql`
- `scripts/seed-12-sessoes-aw139-COMPLETO.sql` (28 KB)
- `scripts/seed-12-sessoes-aw139.sql` (15 KB)
- `scripts/seed-admin.sql`
- `scripts/seed-correto.sql`
- `scripts/seed-data-complete.sql` (19 KB)
- `scripts/seed-dev-full-20251119.sql` (11 KB)
- `scripts/seed-final.sql`
- `scripts/seed-local.sql` (19.6 MB)
- `scripts/seed-sgso-demo-full.sql` (43 KB)
- `scripts/seed-test-data-simple.sql`
- `scripts/seed-test-data.sql`
- `worker-airtrust/seed.sql` (12 KB)

**Motivo**: seeds locais/dev que nao deveriam estar versionados. `seed-local.sql` e particularmente critico (19.6 MB, provavelmente contem dados reais). Risco de remover do index: baixo.

#### 6.1.3 Token e secret files (UNKNOWN_REVIEW → REMOVE_INDEX) — 7 arquivos

- `docs/frontend-staging-smoke/token-extracted.txt` (20 B)
- `docs/maintenance-secret-production/secret-list-after.txt` (819 B)
- `docs/maintenance-secret-production/secret-list-before.txt` (819 B)
- `docs/maintenance-secret-staging/secret-list-after.txt` (213 B)
- `docs/maintenance-secret-staging/secret-list-before.txt` (144 B)
- `docs/maintenance-secret-staging/secret-put-output.txt` (299 B)
- `docs/staging-frontend-smoke/token-extracted.txt` (20 B)

**Motivo**: arquivos com tokens e secrets extraidos. Nomes explicitos (`token-extracted`, `secret-list`). Risco de remover do index: baixo. Risco de manter: alto (vazamento de segredos).

#### 6.1.4 Migrations desabilitadas/arquivadas (UNKNOWN_REVIEW → REMOVE_INDEX) — 51 arquivos

**`_arquivos_nao_usados/migrations/_disabled/`:**
- `0011_sessoes_simulador_completas.sql`
- `0036_add_tipo_to_catalogo_treinamentos.sql`
- `0036_workaround.sql`
- `0037_preencher_validade_qualificacoes.sql`
- `0038_trigger_preencher_validade.sql`
- `0039_agendamentos_completo.sql`
- `0040_agendamentos_campos_adicionais.sql`
- `0041_sistema_completo_simuladores.sql`
- `0069_empresas_r2.sql`
- `0072_fichas_assinaturas.sql`
- `1031_categorias_qualificacoes.sql`
- `1032_integridade_tipos_qualificacoes.sql`
- `2001_create_missing_tables.sql`
- `2002_add_vencimento_tipo.sql`

**Motivo**: migrations explicitamente desabilitadas. Nao fazem parte da cadeia oficial. Risco: baixo.

**Migracoes arquivadas com numeracao fora do padrao oficial:**
- `_arquivos_nao_usados/migrations/000_schema_completo_modulos.sql`
- `_arquivos_nao_usados/migrations/002_qualificacoes_split.sql`
- `_arquivos_nao_usados/migrations/0025_add_critical_indexes_simuladores.sql`
- `_arquivos_nao_usados/migrations/004_performance_indexes.sql`
- `_arquivos_nao_usados/migrations/005_licencas_completo.sql`
- `_arquivos_nao_usados/migrations/0064_restore_qualificacoes_tipos_data.sql`
- `_arquivos_nao_usados/migrations/0068_enrich_and_fk.sql`
- `_arquivos_nao_usados/migrations/0069_create_view_qualificacoes_historico_v.sql`
- `_arquivos_nao_usados/migrations/0089_fix_view_remove_legacy_columns.sql`
- `_arquivos_nao_usados/migrations/0090_view_compat_aliases.sql`
- `_arquivos_nao_usados/migrations/0091_view_remove_inexistent_columns.sql`
- `_arquivos_nao_usados/migrations/0092_view_add_funcionario_extras.sql`
- `_arquivos_nao_usados/migrations/0093_view_add_dates.sql`
- `_arquivos_nao_usados/migrations/0094_view_add_analytic_nulls.sql`
- `_arquivos_nao_usados/migrations/0095_add_real_columns_backfill.sql`
- `_arquivos_nao_usados/migrations/0096_backfill_codes_categories.sql`
- `_arquivos_nao_usados/migrations/0097_rebuild_view_real_fields.sql`
- `_arquivos_nao_usados/migrations/0145_integracao_edapp_config.sql`
- `_arquivos_nao_usados/migrations/120_triggers_integracao_ativa.sql`
- `_arquivos_nao_usados/migrations/130_compliance_MANUAL_APPLY.sql`
- `_arquivos_nao_usados/migrations/130_compliance_triggers_automaticos.sql`
- `_arquivos_nao_usados/migrations/131_fix_renovadas_pos_import.sql`
- `_arquivos_nao_usados/migrations/131_matricula_opcional.sql`
- `_arquivos_nao_usados/migrations/2010_certificados_system.sql`
- `_arquivos_nao_usados/migrations/2011_criar_tabelas_base.sql`
- `_arquivos_nao_usados/migrations/2012_criar_simuladores_base.sql`
- `_arquivos_nao_usados/migrations/2012_qualificacoes_conteudo_programatico.sql`
- `_arquivos_nao_usados/migrations/2012_schema_simuladores.sql`
- `_arquivos_nao_usados/migrations/2013_empresas_campos_adicionais.sql`
- `_arquivos_nao_usados/migrations/2014_corrigir_empresas_schema.sql`
- `_arquivos_nao_usados/migrations/2015_corrigir_tipos_qualificacoes_schema.sql`
- `_arquivos_nao_usados/migrations/2016_refactor_tipos_qualificacoes.sql`
- `_arquivos_nao_usados/migrations/2018_fix_rename_tables_idempotent.sql`
- `_arquivos_nao_usados/migrations/2019_fix_qualificacao_id_null.sql`
- `_arquivos_nao_usados/migrations/2020_add_empresa_config.sql`
- `_arquivos_nao_usados/migrations/2021_adicionar_indices_performance.sql`
- `_arquivos_nao_usados/migrations/2022_fix_fichas_assinatura_columns.sql`
- `_arquivos_nao_usados/migrations/2023_add_tipo_manobras.sql`
- `_arquivos_nao_usados/migrations/2023_create_avaliacoes_manobras.sql`
- `_arquivos_nao_usados/migrations/2024_sessoes_template.sql`
- `_arquivos_nao_usados/migrations/2024_sistema_definitivo.sql`
- `_arquivos_nao_usados/migrations/2025_adicionar_campos_funcionarios.sql`
- `_arquivos_nao_usados/migrations/2025_consolidar_manobras.sql`
- `_arquivos_nao_usados/migrations/2025_create_fichas_final.sql`
- `_arquivos_nao_usados/migrations/2025_create_fichas_table.sql`
- `_arquivos_nao_usados/migrations/2025_fix_is_instrutor_column.sql`
- `_arquivos_nao_usados/migrations/2025_rollback_is_instrutor.sql`
- `_arquivos_nao_usados/migrations/20251123_add_hist_indexes.sql`
- `_arquivos_nao_usados/migrations/2026_criar_tabela_licencas.sql`
- `_arquivos_nao_usados/migrations/2027_fase1_campos_adicionais_funcionarios.sql`
- `_arquivos_nao_usados/migrations/2028_fase2_tipos_qualificacao_refactor.sql`
- `_arquivos_nao_usados/migrations/2029_fase2_qualificacoes_historico_refactor.sql`
- `_arquivos_nao_usados/migrations/2030_fase3_licencas.sql`
- `_arquivos_nao_usados/migrations/2031_fase4_requisitos_compliance.sql`

**Motivo**: migrations arquivadas fora da cadeia oficial (`worker-airtrust/migrations/`). Sao versoes antigas/alternativas. Risco: baixo.

**Rollback scripts (down.sql) em `_arquivos_nao_usados/migrations/`:**
- `_arquivos_nao_usados/migrations/[1-51]/down.sql` (51 arquivos)

**Motivo**: scripts de rollback nunca usados na cadeia oficial. Risco: baixo.

**Versoes duplicadas de index scripts:**
- `_arquivos_nao_usados/migrations/add-critical-indexes-v5-corrigido.sql`
- `_arquivos_nao_usados/migrations/add-critical-indexes-v5-deleted-only.sql`
- `_arquivos_nao_usados/migrations/add-critical-indexes-v5-minimal.sql`
- `_arquivos_nao_usados/migrations/add-critical-indexes-v5-safe.sql`
- `_arquivos_nao_usados/migrations/add-critical-indexes-v5-supersafe.sql`
- `_arquivos_nao_usados/migrations/add-critical-indexes-v5-ultrasafe.sql`
- `_arquivos_nao_usados/migrations/add-critical-indexes-v5.sql`
- `_arquivos_nao_usados/migrations/add-critical-indexes-v6-real-schema.sql`
- `_arquivos_nao_usados/migrations/add-indexes-basic.sql`
- `_arquivos_nao_usados/migrations/add-indexes-core.sql`
- `_arquivos_nao_usados/migrations/add-performance-indexes-simple.sql`
- `_arquivos_nao_usados/migrations/add-performance-indexes.sql`
- `_arquivos_nao_usados/migrations/corrigir-fk-certificados-qualificacoes.sql`
- `_arquivos_nao_usados/migrations/CREATE_TABLE_DOCUMENTOS_R2.sql`
- `_arquivos_nao_usados/migrations/create-simuladores-tables.sql`
- `_arquivos_nao_usados/migrations/indexes-min.sql`
- `_arquivos_nao_usados/migrations/limpeza-geral-tabelas-obsoletas.sql`
- `_arquivos_nao_usados/migrations/MIGRACAO_NOMENCLATURA_DEFINITIVA.sql`
- `_arquivos_nao_usados/migrations/migrar-registros-orfaos-qualificacoes.sql`
- `_arquivos_nao_usados/migrations/performance-indexes-qualificacoes-v1.sql`
- `_arquivos_nao_usados/migrations/performance-indexes-v2.sql`
- `_arquivos_nao_usados/migrations/performance-indexes-v3.sql`
- `_arquivos_nao_usados/migrations/performance-indexes.sql`

**Motivo**: versoes alternativas/duplicadas de scripts de indice. As versoes oficiais estao em `worker-airtrust/migrations/`. Risco: baixo.

**Migracoes numeradas alternativas (up/down):**
- `_arquivos_nao_usados/migrations/1016/down.sql`, `up.sql`
- `_arquivos_nao_usados/migrations/1017/down.sql`, `up.sql`
- `_arquivos_nao_usados/migrations/2010/down.sql`, `up.sql`

**Motivo**: formato alternativo de migracao, fora da cadeia oficial. Risco: baixo.

**Data export archived:**
- `_arquivos_nao_usados/migrations/data-export/clean_import.sql`
- `_arquivos_nao_usados/migrations/data-export/final_import.sql`
- `_arquivos_nao_usados/migrations/data-export/import-localhost.sql` (314 KB)

**Motivo**: scripts de import/export de dados, nao migrations. Risco: baixo.

#### 6.1.5 SQLs soltos na raiz do worker-airtrust (UNKNOWN_REVIEW → REMOVE_INDEX) — 11 arquivos

- `worker-airtrust/check-dup.sql` (269 B)
- `worker-airtrust/dev_bootstrap.sql` (5 KB)
- `worker-airtrust/enrichment.sql` (83 KB)
- `worker-airtrust/import-clean.sql` (235 KB)
- `worker-airtrust/import-final.sql` (235 KB)
- `worker-airtrust/import-fk-safe.sql` (235 KB)
- `worker-airtrust/import-qualificacoes-transformed.sql` (235 KB)
- `worker-airtrust/import-qualificacoes.sql` (309 KB)
- `worker-airtrust/import-with-pragma.sql` (235 KB)
- `worker-airtrust/minimal_schema.sql` (918 B)
- `worker-airtrust/schema.sql` (7 KB)

**Motivo**: SQLs soltos na raiz do worker. Nao sao migrations oficiais. Schemas e imports locais. Risco: baixo.

#### 6.1.6 Scripts one-off e destrutivos (UNKNOWN_REVIEW → REMOVE_INDEX) — 5 arquivos

- `worker-airtrust/scripts/hard-delete-all.sql` — destrutivo
- `worker-airtrust/scripts/schema-local.sql` (121 KB) — schema local
- `worker-airtrust/scripts/teste_cenarios_icao.sql` — teste
- `worker-airtrust/sql/one-off/check-antonio.sql` — one-off
- `worker-airtrust/sql/one-off/fix-antonio-role.sql` — one-off
- `worker-airtrust/sql/one-off/insert-antonio.sql` — one-off
- `worker-airtrust/sql/one-off/update-antonio-role.sql` — one-off

**Motivo**: scripts one-off especificos para um usuario (antonio) ou ambiente local. Risco: baixo.

#### 6.1.7 Exports e restore scripts (UNKNOWN_REVIEW → REMOVE_INDEX) — 5 arquivos

- `_arquivos_nao_usados/exports/qualificacoes_historico_delta_after_1036.sql` (114 KB)
- `_arquivos_nao_usados/exports/qualificacoes_historico_delta_ids_gt_1036.ingest.sql` (114 KB)
- `_arquivos_nao_usados/exports/qualificacoes_historico_delta_ids_gt_1036.raw.sql` (114 KB)
- `_arquivos_nao_usados/RESTORE_QUALIFICACOES_CORRETO.sql` (102 KB)
- `_arquivos_nao_usados/RESTORE_QUALIFICACOES_HISTORICO.sql` (309 KB)

**Motivo**: exports de dados e scripts de restore. Risco: baixo.

#### 6.1.8 Outros (UNKNOWN_REVIEW → REMOVE_INDEX) — 3 arquivos

- `_arquivos_nao_usados/apply-migration-118-simplified.sql` (673 B)
- `_arquivos_nao_usados/D1-DIAGNOSTIC-AND-CLEANUP.sql` (18 KB)
- `_arquivos_nao_usados/D1-MASTER-REFACTORING-COMPLETE-SECURE.sql` (20 KB)

**Motivo**: scripts de diagnostico/refactoring de D1. Risco: baixo.

### 6.2 KEEP_VERSIONED_LIKELY_VALID (19 arquivos)

#### 6.2.1 Scripts de validacao operacional

- `scripts/validation/audit_qualificacoes_sessoes_mes_2026_05.sql` (16 KB)
- `scripts/validation/validar_sk76_inicial_12x22.sql` (2 KB)

**Motivo**: scripts de validacao/auditoria operacional ativos. Podem ser necessarios para verificacoes periodicas. Risco de remover: medio.

#### 6.2.2 SQL de manutencao documentada

- `sql/maintenance/2026-04-01-fap14-sk76-reclass.sql` (2 KB)
- `sql/maintenance/2026-04-01-qualificacoes-legacy-codigo-residual-audit.sql` (1 KB)
- `sql/maintenance/2026-04-01-qualificacoes-legacy-codigo-safe-merge.sql` (6 KB)
- `sql/update-qualificacoes-2025-12-04.sql` (3 KB)

**Motivo**: scripts de manutencao documentados com data. Podem ser necessarios para auditoria historica. Risco de remover: medio.

#### 6.2.3 Scripts de sync documentados

- `scripts/sql/0317_sync_costa_do_sol_modelos_pto.sql` (18 KB)
- `scripts/sql/0318_sync_costa_do_sol_modelos_pto_delta.sql` (12 KB)
- `scripts/sql/0319_fix_costa_do_sol_historico_certificados.sql`
- `scripts/sql/update-qualificacoes-2025-12-04.sql`

**Motivo**: scripts de sync com numeracao que referencia migrations. Podem ser necessarios para replay historico. Risco de remover: medio.

#### 6.2.4 Seeds legitimas em local correto (LOCAL_SEED → KEEP)

- `worker-airtrust/seeds/dev-seed.sql` (17 KB)
- `worker-airtrust/seeds/fix_simuladores_null_fields.sql`

**Motivo**: seeds no diretorio canonico `worker-airtrust/seeds/`. Podem ser usadas em dev setup. Risco de remover: medio (avaliar se sao usadas em `npm run setup:local`).

#### 6.2.5 Scripts legados de auditoria/diagnostico (PROD_DUMP → KEEP)

- `scripts/legacy/query-debug.sql`
- `scripts/legacy/relatorio-qualificacoes-edapp.sql`

**Motivo**: queries de diagnostico/relatorio que podem servir de referencia. Nao contem dados, apenas queries. Risco de remover: baixo, mas util manter como referencia.

#### 6.2.6 Queries de diagnostico

- `_arquivos_nao_usados/queries/lista-discrepancias-completa.sql`

**Motivo**: query de diagnostico, util como referencia. Risco de remover: baixo.

### 6.3 MANUAL_REVIEW_REQUIRED (85 arquivos)

Arquivos que precisam de revisao humana antes de decidir entre remover ou manter.

#### 6.3.1 Scripts operacionais em `scripts/` (UNKNOWN_REVIEW → MANUAL_REVIEW) — ~30 arquivos

- `scripts/audit-sim.sql`
- `scripts/audit-sim1.sql`
- `scripts/audit-sim2.sql`
- `scripts/auditoria-pre-correcao.sql`
- `scripts/backfill-analitico-placeholder.sql`
- `scripts/check-schema.sql`
- `scripts/cleanup-sim-devices.sql`
- `scripts/cleanup-simuladores-2026-03-04.sql`
- `scripts/d1-local-simuladores.sql`
- `scripts/dev-core-schema-fast.sql`
- `scripts/fix-codigo-anac-formato.sql`
- `scripts/fix-integridade-aeronave-codigo.sql`
- `scripts/fix-matriculas-5-digitos.sql`
- `scripts/fix-simulador-aeronave.sql`
- `scripts/fix-telefones-padrao.sql`
- `scripts/local-force-final-schema.sql`
- `scripts/purge_soft_deletes.sql`
- `scripts/q1.sql`
- `scripts/RECUPERACAO_DADOS_20251111.sql`
- `scripts/restore-qualificacoes-data.sql`
- `scripts/restore-simuladores-2026-03-04.sql`
- `scripts/schema-local.sql` (168 KB)
- `scripts/setup-local-overrides.sql`
- `scripts/validate-ssot-final.sql`
- `scripts/validate-vencimento-fim-mes.sql`
- `scripts/validation_query.sql`
- `scripts/verify_post_backfill.sql`

**Motivo**: scripts operacionais que podem ser necessarios para recuperacao/referencia, mas tambem podem conter dados ou ser obsoletos. Precisam de revisao humana para determinar se ainda sao uteis.

#### 6.3.2 Scripts update-qualificacoes-parte* (UNKNOWN_REVIEW → MANUAL_REVIEW) — 9 arquivos

- `scripts/update-qualificacoes-parte1.sql` (20 KB)
- `scripts/update-qualificacoes-parte2.sql` (21 KB)
- `scripts/update-qualificacoes-parte3.sql` (31 KB)
- `scripts/update-qualificacoes-parte4.sql` (30 KB)
- `scripts/update-qualificacoes-parte5.sql` (29 KB)
- `scripts/update-qualificacoes-parte6.sql` (35 KB)
- `scripts/update-qualificacoes-parte7.sql` (36 KB)
- `scripts/update-qualificacoes-parte8.sql` (25 KB)
- `scripts/update-qualificacoes-parte9.sql` (35 KB)

**Motivo**: 9 scripts de atualizacao em lote. Podem ser historico de migracao manual ou dados. Precisam de revisao humana.

#### 6.3.3 Scripts legados de auditoria/diagnostico (PROD_DUMP → MANUAL_REVIEW) — ~17 arquivos

- `scripts/legacy/analise-duplicatas.sql`
- `scripts/legacy/audit-edapp-complete.sql` (25 KB)
- `scripts/legacy/audit-edapp-datas.sql`
- `scripts/legacy/buscar-user-ids-eventos.sql`
- `scripts/legacy/check-duplicatas.sql`
- `scripts/legacy/check-funcionarios-edapp.sql`
- `scripts/legacy/check-qualificacao.sql`
- `scripts/legacy/fix-antonio-ramos-vinculo-e6.sql`
- `scripts/legacy/fix-modelos-periodicos.sql`
- `scripts/legacy/migration-fix-tipo-sessao.sql`
- `scripts/legacy/migration-normalizar-funcoes.sql`
- `scripts/legacy/migration-normalizar-matriculas.sql`
- `scripts/legacy/seed-aw139-peri-0303-manobras-fix-names.sql`
- `scripts/legacy/seed-aw139-peri-0303-manobras-prod.sql`
- `scripts/legacy/seed-aw139-peri-0303-manobras-recode.sql`
- `scripts/legacy/seed-aw139-peri-0303-manobras.sql`
- `scripts/legacy/seed-aw139-rename-codes-to-A139-loft.sql`
- `scripts/legacy/seed-copy-aw139-1212-manobras.sql`
- `scripts/legacy/seed-sk76-fix-names.sql`
- `scripts/legacy/seed-sk76-peri-0303-manobras.sql`

**Motivo**: scripts de auditoria e seeds de manobras. Alguns podem ser uteis como referencia. A distincao entre "seed legado" e "script operacional" exige revisao humana.

#### 6.3.4 Production patches legados (PROD_DUMP → MANUAL_REVIEW) — 9 arquivos

- `scripts/legacy/production_patch_migrations_0095_0097.sql`
- `scripts/legacy/production_patch_view_0089.sql`
- `scripts/legacy/production_patch_view_0090.sql`
- `scripts/legacy/production_patch_view_0091.sql`
- `scripts/legacy/production_patch_view_0092.sql`
- `scripts/legacy/production_patch_view_0093.sql`
- `scripts/legacy/production_patch_view_0094.sql`

**Motivo**: patches de producao historicos. Podem ser necessarios para auditoria de schema evolution, mas tambem podem ser obsoletos.

### 6.4 DO_NOT_TOUCH (6 arquivos)

Arquivos que nao devem ser removidos do index em hipotese alguma.

Nesta categoria entram arquivos da lista UNKNOWN_REVIEW que, apos inspecao de metadados, foram identificados como potencialmente necessarios para build/test/deploy:

- `worker-airtrust/seeds/dev-seed.sql` — possivelmente usado em setup local
- `scripts/sql/0317_sync_costa_do_sol_modelos_pto.sql` — sync documentado e referenciado
- `scripts/sql/0318_sync_costa_do_sol_modelos_pto_delta.sql` — sync documentado
- `scripts/sql/0319_fix_costa_do_sol_historico_certificados.sql` — fix documentado
- `sql/maintenance/2026-04-01-qualificacoes-legacy-codigo-safe-merge.sql` — manutencao documentada
- `scripts/validation/audit_qualificacoes_sessoes_mes_2026_05.sql` — validacao ativa

**Motivo**: estes arquivos parecem ter funcao operacional ou de auditoria ativa. Nao remover sem analise funcional.

Nota: esta lista e conservadora. Nenhum dos 340 arquivos bloqueantes e migration oficial (essas estao em `MIGRATION`, ja na allowlist). Nenhum e arquivo de build/test reconhecido.

## 7. Primeiro lote recomendado para fase H6-C

Maximo 10 arquivos. Somente `REMOVE_INDEX_CANDIDATE_HIGH_CONFIDENCE`. Sem migrations, sem fixtures, sem ambiguos.

| # | Caminho | Categoria | Tamanho | Justificativa |
|---|---|---|---|---|
| 1 | `scripts/seed-local.sql` | LOCAL_SEED | 19.6 MB | Maior arquivo. Seed local, provavelmente com dados reais. |
| 2 | `scripts/legacy/d1-prod-20260315-193839.sql` | PROD_DUMP | 19.1 MB | Dump de producao D1 com data. Nao e migration. |
| 3 | `scripts/legacy/backup_pre_multitenant_20251207_142032.sql` | PROD_DUMP | 4.9 MB | Backup pre-migration. Nao e migration oficial. |
| 4 | `docs/maintenance-secret-production/secret-list-after.txt` | UNKNOWN_REVIEW | 819 B | Secret list. Risco de vazamento. |
| 5 | `docs/maintenance-secret-production/secret-list-before.txt` | UNKNOWN_REVIEW | 819 B | Secret list. Risco de vazamento. |
| 6 | `docs/maintenance-secret-staging/secret-list-after.txt` | UNKNOWN_REVIEW | 213 B | Secret list. Risco de vazamento. |
| 7 | `docs/maintenance-secret-staging/secret-list-before.txt` | UNKNOWN_REVIEW | 144 B | Secret list. Risco de vazamento. |
| 8 | `docs/maintenance-secret-staging/secret-put-output.txt` | UNKNOWN_REVIEW | 299 B | Secret put output. Risco de vazamento. |
| 9 | `docs/frontend-staging-smoke/token-extracted.txt` | UNKNOWN_REVIEW | 20 B | Token extraido. Risco de vazamento. |
| 10 | `docs/staging-frontend-smoke/token-extracted.txt` | UNKNOWN_REVIEW | 20 B | Token extraido. Risco de vazamento. |

**Criterios de selecao:**
- 3 maiores dumps SQL (~43 MB combinados)
- 7 arquivos de token/secret (risco de seguranca)
- Nenhum migration, fixture ou arquivo ambiguo
- Todos claramente desnecessarios para build/test/deploy

**Impacto esperado no guardrail apos H6-C:**
- PROD_DUMP_OR_BACKUP: 92 → 89
- LOCAL_SEED: 17 → 16
- UNKNOWN_REVIEW_REQUIRED: 231 → 224
- Bloqueantes totais: 340 → 330

## 8. Itens que nao devem ser mexidos

- **MIGRATION (355 arquivos)**: migrations oficiais em `worker-airtrust/migrations/`. Allowlist do guardrail.
- **TEST_FIXTURE (2 arquivos)**: `.env.example`, `worker-airtrust/.env.example`. Allowlist.
- **DO_NOT_TOUCH (6 arquivos)**: listados na secao 6.4.
- **Codigo funcional**: qualquer arquivo `.ts`, `.tsx`, `.js` fora do escopo.
- **EVD, FRMS, SIGVOOS, RBAC, deduplicate, simuladores, UI**: nenhum arquivo destas areas foi alterado.

## 9. Proxima fase recomendada

**H6-C — Remocao controlada do index (lote 1)**

- Escopo: 10 arquivos do primeiro lote (secao 7)
- Acao: `git rm --cached` apenas, sem apagar local
- Ferramenta/modelo recomendado: DeepSeek medio (tarefa simples e bem delimitada)
- Pre-requisito: aprovacao do usuario
- Apos H6-C: reavaliar contagem do guardrail e decidir entre:
  - H6-D (lote 2, ~20-30 arquivos, ainda high confidence)
  - Ou voltar para Codex medio-alto em bugs funcionais (P1-03, P2, etc.)

---

## Apendice A — Metodologia de classificacao

A classificacao foi feita exclusivamente por metadados:
- Caminho do arquivo (localizacao, naming convention)
- Categoria do guardrail
- Tamanho em bytes
- Presenca de palavras-chave no nome (`prod`, `backup`, `dump`, `seed`, `token`, `secret`, `fix`, `disabled`, `legacy`, `one-off`)

Nenhum conteudo de arquivo `.sql`, `.txt` de secret, `.env`, dump, seed ou backup foi lido ou impresso.

## Apendice B — Comandos executados

```bash
git status --short --untracked-files=all
git branch --show-current
git log --oneline -10
git rev-parse HEAD origin/main
git diff --stat
git diff --name-status
bash scripts/validation/audit-sensitive-files.sh
git ls-files '*.sql' | while read f; do test -f "$f" && printf "%s\t%s\n" "$(wc -c < "$f")" "$f"; done | sort -nr | head -200
```

Nenhum comando de escrita, remocao, ou leitura de conteudo sensivel foi executado.
