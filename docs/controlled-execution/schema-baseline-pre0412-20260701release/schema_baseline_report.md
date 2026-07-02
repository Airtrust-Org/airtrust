# Schema Baseline Report

- Source: `production sqlite_master read-only query`
- Database: `airtrust-db`
- Database ID: `7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae`
- Mode: `audit+sql`
- Final status: `PASS`
- Total objects read: 1014
- Canonical objects: 957
- Suspicious objects: 32
- Excluded objects: 57
- Blocking findings: 0

## Guarantees

- Read-only inventory of `sqlite_master` objects only.
- No data rows exported.
- `d1_migrations`, `_cf_%`, `sqlite_%`, backup/tmp/legacy/old residuals excluded by policy.
- Pre-0412 guard enforced: `qualificacoes_formatos` and 0412 columns cause failure.
- Top-level `INSERT`, `UPDATE`, `DELETE`, `REPLACE`, `UPSERT`, and `DROP` statements outside triggers are forbidden.
- Valid FK clauses such as `ON UPDATE CASCADE` and `ON DELETE CASCADE` remain allowed DDL.
- Trigger-local DML is inventoried and reported, not auto-failed.
- `schema_baseline_pre0412.sql` is written only when `status = PASS` and `--write-sql` is explicitly requested.

## Classification Model

- `canonical`: objects included in baseline output.
- `excluded`: objects omitted from baseline output.
- `suspicious`: risk dimension recorded for review; inspect `finalDecision` on each suspicious object.

## Trigger DML Inventory

- `trg_alertas_reforco_updated_at`
- `trg_apply_reclassification`
- `trg_calc_vencimento_insert`
- `trg_edapp_config_updated`
- `trg_funcionarios_setor_required_insert`
- `trg_funcionarios_setor_required_update`
- `trg_integracoes_edapp_cursos_updated_at`
- `trg_integracoes_edapp_eventos_updated_at`
- `trg_integracoes_edapp_usuarios_updated_at`
- `trg_lms_cursos_updated_at`
- `trg_lms_h5p_conteudos_updated_at`
- `trg_lms_historico_importado_updated_at`
- `trg_lms_matriculas_updated_at`
- `trg_lms_progresso_scorm_updated_at`
- `trg_qualificacoes_historico_set_tipo`
- `trg_qualificacoes_historico_update_tipo`
- `trg_qualificacoes_tipos_update`
- `trg_tipo_update_auditoria`
- `trg_treinamentos_dias_updated_at`
- `trg_treinamentos_instrutores_updated_at`
- `trg_treinamentos_presencas_updated_at`
- `trigger_modelos_sessao_manobras_updated_at`
- `update_credenciais_updated_at`
- `update_papeis_updated_at`

## Blocking Findings

- None

## Artifacts

- `all_objects.json`
- `canonical_objects.json`
- `suspicious_objects.json`
- `excluded_objects.json`
- `dependency_edges.json`
- `blocked_dependencies.json`
- `schema_baseline_manifest.json`
- `schema_baseline_report.md`
- `schema_baseline_pre0412.sql`
- SQL SHA256: `ae6fc54a77096c4e104ad6068db415030ad54e4052be5b9e0b54a2295a13c38a`
