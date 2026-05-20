
-- REVERTER SCHEMA COMPLETO DO MÓDULO SIMULADORES

-- Remover índices
DROP INDEX IF EXISTS idx_simulador_fichas_uuid;
DROP INDEX IF EXISTS idx_simulador_sessoes_uuid;
DROP INDEX IF EXISTS idx_simulador_slots_simulador;
DROP INDEX IF EXISTS idx_template_manobras_template;
DROP INDEX IF EXISTS idx_simulador_manobras_codigo;
DROP INDEX IF EXISTS idx_simulador_templates_codigo;

-- Remover tabelas novas
DROP TABLE IF EXISTS ficha_manobras_v2;
DROP TABLE IF EXISTS simulador_fichas_v2;
DROP TABLE IF EXISTS sessao_participantes_v2;
DROP TABLE IF EXISTS simulador_sessoes_v2;
DROP TABLE IF EXISTS simulador_slots;
DROP TABLE IF EXISTS simulador_ciclos;
DROP TABLE IF EXISTS template_manobras;
DROP TABLE IF EXISTS simulador_manobras;
DROP TABLE IF EXISTS simulador_templates;

-- Reverter alterações na tabela simuladores
ALTER TABLE simuladores DROP COLUMN configuracao_tecnica;
ALTER TABLE simuladores DROP COLUMN modelo;
ALTER TABLE simuladores DROP COLUMN fabricante;
