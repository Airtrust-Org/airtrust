-- Rollback/neutralization for migration 0457.
-- source_reference: worker-airtrust/migrations/0457_qualification_category_lms_contract.sql
-- operational_decision: neutralize canonical category guards without destructive table rebuild.
-- dry_run_required: yes; execute only after backup verification in an authorized environment.
-- rollback_plan_required: this file is the reviewed neutralization plan; physical column removal is separate.
-- Execute only through a governed recovery procedure after restoring a backup
-- or proving that the deployed runtime no longer requires the canonical
-- category guards. SQLite/D1 column removal requires a reviewed table rebuild;
-- this script safely neutralizes behavior without destructive schema surgery.

DROP TRIGGER IF EXISTS trg_qualification_category_code_immutable_0457;
DROP TRIGGER IF EXISTS trg_qualification_category_deactivation_guard_0457;
DROP TRIGGER IF EXISTS trg_qualification_type_category_fk_insert_0457;
DROP TRIGGER IF EXISTS trg_qualification_type_category_fk_update_0457;
DROP TRIGGER IF EXISTS trg_qualification_type_category_snapshot_insert_0457;
DROP TRIGGER IF EXISTS trg_qualification_type_category_snapshot_update_0457;
DROP TRIGGER IF EXISTS trg_qualification_history_category_fk_insert_0457;
DROP TRIGGER IF EXISTS trg_qualification_history_category_fk_update_0457;
DROP TRIGGER IF EXISTS trg_qualification_history_category_snapshot_insert_0457;
DROP TRIGGER IF EXISTS trg_qualification_history_category_snapshot_update_0457;
DROP TRIGGER IF EXISTS trg_lms_course_qualification_category_fk_insert_0457;
DROP TRIGGER IF EXISTS trg_lms_course_qualification_category_fk_update_0457;
DROP TRIGGER IF EXISTS trg_lms_course_qualification_category_snapshot_insert_0457;
DROP TRIGGER IF EXISTS trg_lms_course_qualification_category_snapshot_update_0457;

DROP INDEX IF EXISTS ux_qualificacoes_categorias_normalized_name_active;
DROP INDEX IF EXISTS ux_qualificacoes_categorias_normalized_code_active;
DROP INDEX IF EXISTS ux_qualificacoes_categorias_lms_integrada_active;
DROP INDEX IF EXISTS idx_qualificacoes_categorias_lms_integrada;

UPDATE qualificacoes_categorias
   SET lms_integrada = 0,
       updated_at = datetime('now')
 WHERE lms_integrada <> 0;
