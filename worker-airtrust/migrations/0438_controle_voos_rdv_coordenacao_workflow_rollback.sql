-- source_reference: feat/controle-voos-rdv-sigvoos-reinicio (RDV Piloto -> Coordenação workflow)
-- operational_decision: ROLLBACK_REFUSES_IF_ANY_RDV_LEFT_RASCUNHO - ver guarda de segurança abaixo
-- dry_run_required: sim - validar em D1 local antes de qualquer uso
-- rollback_plan_required: este arquivo é o próprio rollback
--
-- ROLLBACK: 0438_controle_voos_rdv_coordenacao_workflow
--
-- Reverte estritamente o que 0438 adicionou. Não toca em nenhuma tabela
-- pré-existente a 0438 além de remover as colunas que ela mesma acrescentou.
--
-- Pré-condição de segurança: recusa-se a prosseguir se existir qualquer RDV
-- cujo workflow já avançou além de 'rascunho' (dado que seria perdido).
CREATE TABLE IF NOT EXISTS _rollback_0438_safety_guard (
  safe_to_rollback INTEGER NOT NULL CHECK (safe_to_rollback = 1)
);
INSERT INTO _rollback_0438_safety_guard (safe_to_rollback)
SELECT CASE
  WHEN EXISTS (
    SELECT 1 FROM cv_rdv_operacional WHERE workflow_status <> 'rascunho'
  ) THEN 0
  ELSE 1
END;
DROP TABLE IF EXISTS _rollback_0438_safety_guard;

DROP TRIGGER IF EXISTS trg_cv_voo_abastecimentos_etapa_insert;
DROP TRIGGER IF EXISTS trg_cv_voo_abastecimentos_voo_update;
DROP TRIGGER IF EXISTS trg_cv_voo_abastecimentos_voo_insert;
DROP TABLE IF EXISTS cv_voo_abastecimentos;

DROP TRIGGER IF EXISTS trg_cv_rdv_alertas_rdv_insert;
DROP TABLE IF EXISTS cv_rdv_alertas;

DROP TRIGGER IF EXISTS trg_cv_rdv_revisoes_rdv_insert;
DROP TABLE IF EXISTS cv_rdv_revisoes;

DROP TRIGGER IF EXISTS trg_cv_rdv_aprovacoes_rdv_insert;
DROP TABLE IF EXISTS cv_rdv_aprovacoes;

DROP INDEX IF EXISTS idx_cv_rdv_operacional_empresa_workflow_responsavel;
DROP INDEX IF EXISTS idx_cv_rdv_operacional_empresa_workflow_data;

ALTER TABLE cv_rdv_operacional DROP COLUMN motivo_cancelamento;
ALTER TABLE cv_rdv_operacional DROP COLUMN motivo_devolucao;
ALTER TABLE cv_rdv_operacional DROP COLUMN reaberto_em;
ALTER TABLE cv_rdv_operacional DROP COLUMN reaberto_por;
ALTER TABLE cv_rdv_operacional DROP COLUMN finalizado_workflow_em;
ALTER TABLE cv_rdv_operacional DROP COLUMN aprovado_coordenacao_em;
ALTER TABLE cv_rdv_operacional DROP COLUMN aprovado_coordenacao_por;
ALTER TABLE cv_rdv_operacional DROP COLUMN revisao_iniciada_em;
ALTER TABLE cv_rdv_operacional DROP COLUMN revisao_iniciada_por;
ALTER TABLE cv_rdv_operacional DROP COLUMN enviado_em;
ALTER TABLE cv_rdv_operacional DROP COLUMN enviado_por;
ALTER TABLE cv_rdv_operacional DROP COLUMN versao;
ALTER TABLE cv_rdv_operacional DROP COLUMN workflow_status;
