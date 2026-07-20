-- source_reference: feat/controle-voos-rdv-sigvoos-reinicio (RDV Piloto -> Coordenação workflow)
-- operational_decision: ROLLBACK_REFUSES_IF_ANY_WORKFLOW_DATA_EXISTS - ver guarda de segurança abaixo
-- dry_run_required: sim - validar em D1 local antes de qualquer uso
-- rollback_plan_required: este arquivo é o próprio rollback
--
-- ROLLBACK: 0438_controle_voos_rdv_coordenacao_workflow
--
-- Nome deliberadamente FORA da cadeia numérica de migrations (não começa com
-- dígitos) para nunca ser candidato a "duplicidade de prefixo" nem a ser
-- confundido com uma migration real aplicável em sequência. Aplicar somente
-- de forma manual e explícita, nunca via runner automático de migrations.
--
-- Reverte estritamente o que 0438 adicionou. Não toca em nenhuma tabela
-- pré-existente a 0438 além de remover as colunas que ela mesma acrescentou.
--
-- Pré-condição de segurança (fail-closed): recusa-se a prosseguir se
-- existir QUALQUER dado nas estruturas novas, incluindo:
--   - qualquer linha em cv_rdv_aprovacoes, cv_rdv_revisoes, cv_rdv_alertas
--     ou cv_voo_abastecimentos;
--   - qualquer cv_rdv_operacional com workflow_status <> 'rascunho';
--   - qualquer cv_rdv_operacional com versao <> 1;
--   - qualquer cv_rdv_operacional com algum dos campos novos
--     (enviado_por/enviado_em/revisao_iniciada_*/devolvido_*/
--     aprovado_coordenacao_*/finalizado_workflow_em/reaberto_*/
--     motivo_devolucao/motivo_cancelamento) preenchido.
-- Isso evita perda silenciosa de qualquer RDV que já tenha avançado no
-- fluxo, mesmo que ainda "pareça" um rascunho.
CREATE TABLE IF NOT EXISTS _rollback_0438_safety_guard (
  safe_to_rollback INTEGER NOT NULL CHECK (safe_to_rollback = 1)
);
INSERT INTO _rollback_0438_safety_guard (safe_to_rollback)
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM cv_rdv_aprovacoes LIMIT 1) THEN 0
  WHEN EXISTS (SELECT 1 FROM cv_rdv_revisoes LIMIT 1) THEN 0
  WHEN EXISTS (SELECT 1 FROM cv_rdv_alertas LIMIT 1) THEN 0
  WHEN EXISTS (SELECT 1 FROM cv_voo_abastecimentos LIMIT 1) THEN 0
  WHEN EXISTS (
    SELECT 1 FROM cv_rdv_operacional
    WHERE workflow_status <> 'rascunho'
       OR versao <> 1
       OR enviado_por IS NOT NULL
       OR enviado_em IS NOT NULL
       OR revisao_iniciada_por IS NOT NULL
       OR revisao_iniciada_em IS NOT NULL
       OR devolvido_por IS NOT NULL
       OR devolvido_em IS NOT NULL
       OR aprovado_coordenacao_por IS NOT NULL
       OR aprovado_coordenacao_em IS NOT NULL
       OR finalizado_workflow_em IS NOT NULL
       OR reaberto_por IS NOT NULL
       OR reaberto_em IS NOT NULL
       OR motivo_devolucao IS NOT NULL
       OR motivo_cancelamento IS NOT NULL
  ) THEN 0
  ELSE 1
END;
DROP TABLE IF EXISTS _rollback_0438_safety_guard;

DROP TRIGGER IF EXISTS trg_cv_voo_abastecimentos_keys_immutable;
DROP TRIGGER IF EXISTS trg_cv_voo_abastecimentos_etapa_insert;
DROP TRIGGER IF EXISTS trg_cv_voo_abastecimentos_voo_insert;
DROP TABLE IF EXISTS cv_voo_abastecimentos;

DROP TRIGGER IF EXISTS trg_cv_rdv_alertas_keys_immutable;
DROP TRIGGER IF EXISTS trg_cv_rdv_alertas_etapa_insert;
DROP TRIGGER IF EXISTS trg_cv_rdv_alertas_rdv_insert;
DROP TABLE IF EXISTS cv_rdv_alertas;

DROP TRIGGER IF EXISTS trg_cv_rdv_revisoes_no_update;
DROP TRIGGER IF EXISTS trg_cv_rdv_revisoes_rdv_insert;
DROP TABLE IF EXISTS cv_rdv_revisoes;

DROP TRIGGER IF EXISTS trg_cv_rdv_aprovacoes_no_update;
DROP TRIGGER IF EXISTS trg_cv_rdv_aprovacoes_rdv_insert;
DROP TABLE IF EXISTS cv_rdv_aprovacoes;

DROP TRIGGER IF EXISTS trg_cv_rdv_operacional_versao_update;
DROP TRIGGER IF EXISTS trg_cv_rdv_operacional_versao_insert;
DROP TRIGGER IF EXISTS trg_cv_rdv_operacional_workflow_status_update;
DROP TRIGGER IF EXISTS trg_cv_rdv_operacional_workflow_status_insert;

DROP INDEX IF EXISTS idx_cv_rdv_operacional_empresa_workflow_responsavel;
DROP INDEX IF EXISTS idx_cv_rdv_operacional_empresa_workflow_data;

ALTER TABLE cv_rdv_operacional DROP COLUMN motivo_cancelamento;
ALTER TABLE cv_rdv_operacional DROP COLUMN motivo_devolucao;
ALTER TABLE cv_rdv_operacional DROP COLUMN reaberto_em;
ALTER TABLE cv_rdv_operacional DROP COLUMN reaberto_por;
ALTER TABLE cv_rdv_operacional DROP COLUMN finalizado_workflow_em;
ALTER TABLE cv_rdv_operacional DROP COLUMN aprovado_coordenacao_em;
ALTER TABLE cv_rdv_operacional DROP COLUMN aprovado_coordenacao_por;
ALTER TABLE cv_rdv_operacional DROP COLUMN devolvido_em;
ALTER TABLE cv_rdv_operacional DROP COLUMN devolvido_por;
ALTER TABLE cv_rdv_operacional DROP COLUMN revisao_iniciada_em;
ALTER TABLE cv_rdv_operacional DROP COLUMN revisao_iniciada_por;
ALTER TABLE cv_rdv_operacional DROP COLUMN enviado_em;
ALTER TABLE cv_rdv_operacional DROP COLUMN enviado_por;
ALTER TABLE cv_rdv_operacional DROP COLUMN versao;
ALTER TABLE cv_rdv_operacional DROP COLUMN workflow_status;
