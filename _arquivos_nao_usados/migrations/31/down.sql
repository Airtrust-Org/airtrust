
-- Remove índices
DROP INDEX IF EXISTS idx_notificacoes_lida;
DROP INDEX IF EXISTS idx_notificacoes_destinatario;
DROP INDEX IF EXISTS idx_auditoria_ficha;
DROP INDEX IF EXISTS idx_sessoes_template_codigo;
DROP INDEX IF EXISTS idx_manobras_ativo;
DROP INDEX IF EXISTS idx_manobras_codigo;
DROP INDEX IF EXISTS idx_simuladores_status;
DROP INDEX IF EXISTS idx_simuladores_codigo;

-- Remove tabelas na ordem reversa (respeitando dependências lógicas)
DROP TABLE IF EXISTS notificacoes_simulador;
DROP TABLE IF EXISTS auditoria_simulador;
DROP TABLE IF EXISTS sessoes_template_manobras;
DROP TABLE IF EXISTS sessoes_template;
DROP TABLE IF EXISTS manobras_catalogo_ciclos;
DROP TABLE IF EXISTS ciclos;
DROP TABLE IF EXISTS manobras_catalogo;
DROP TABLE IF EXISTS simuladores;
