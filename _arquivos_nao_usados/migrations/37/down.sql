
-- Reverter nova modelagem de controle individual
DROP INDEX IF EXISTS idx_sessoes_simulador_data;
DROP INDEX IF EXISTS idx_sessoes_simulador_uuid;
DROP INDEX IF EXISTS idx_manobras_individual;
DROP INDEX IF EXISTS idx_progresso_individual;
DROP INDEX IF EXISTS idx_sessao_participantes_colaborador;

DROP TABLE IF EXISTS manobras_executadas_individual;
DROP TABLE IF EXISTS progresso_treinamento_individual;
DROP TABLE IF EXISTS sessao_participantes;
DROP TABLE IF EXISTS sessoes_simulador;
