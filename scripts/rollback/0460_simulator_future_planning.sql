-- Rollback 0460: remove simulator future-planning metadata.
-- Execute only when no planning data must be preserved.

DROP TRIGGER IF EXISTS trg_simulador_planejamento_auditoria_tenant_update;
DROP TRIGGER IF EXISTS trg_simulador_planejamento_auditoria_tenant_insert;
DROP INDEX IF EXISTS idx_simulador_planejamento_auditoria_treinamento;
DROP TABLE IF EXISTS simulador_planejamento_auditoria;
DROP INDEX IF EXISTS idx_treinamentos_planejamento_status;
DROP INDEX IF EXISTS idx_treinamentos_planejamento_chave_empresa;

ALTER TABLE treinamentos_planejados DROP COLUMN planejamento_recalculado_por;
ALTER TABLE treinamentos_planejados DROP COLUMN planejamento_recalculado_em;
ALTER TABLE treinamentos_planejados DROP COLUMN planejamento_snapshot_json;
ALTER TABLE treinamentos_planejados DROP COLUMN planejamento_conflitos_json;
ALTER TABLE treinamentos_planejados DROP COLUMN planejamento_modelo_aeronave;
ALTER TABLE treinamentos_planejados DROP COLUMN planejamento_janela_fim;
ALTER TABLE treinamentos_planejados DROP COLUMN planejamento_janela_inicio;
ALTER TABLE treinamentos_planejados DROP COLUMN planejamento_tipo_janela;
ALTER TABLE treinamentos_planejados DROP COLUMN planejamento_politica_janela;
ALTER TABLE treinamentos_planejados DROP COLUMN planejamento_quinzena_numero;
ALTER TABLE treinamentos_planejados DROP COLUMN planejamento_margem_dias;
ALTER TABLE treinamentos_planejados DROP COLUMN planejamento_vencimento_referencia;
ALTER TABLE treinamentos_planejados DROP COLUMN planejamento_editado_manualmente;
ALTER TABLE treinamentos_planejados DROP COLUMN planejamento_chave;
ALTER TABLE treinamentos_planejados DROP COLUMN planejamento_origem;
ALTER TABLE treinamentos_planejados DROP COLUMN planejamento_status;
