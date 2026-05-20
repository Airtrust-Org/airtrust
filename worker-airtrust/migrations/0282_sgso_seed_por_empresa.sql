-- ============================================================
-- Migration: 0282_sgso_seed_por_empresa.sql
-- Modulo: SGSO Next-Gen - Seed por empresa
-- Descricao: Clona perfis globais de matriz/FRAT para empresas ativas
--            e replica SPIs default para tenants sem configuracao.
-- Autor: AirTrust Engineering
-- Data: 2026-03-15
-- Dependencias: 0273, 0274, 0281
-- ============================================================

-- Perfis de matriz de risco para cada empresa ativa
INSERT OR IGNORE INTO sgso_matriz_risco_perfis
  (empresa_id, codigo, nome, descricao, tamanho, ativo, padrao, elevar_fadiga, exigir_aprovacao_alto, exigir_aprovacao_critico, created_at, updated_at)
SELECT e.id,
       p.codigo,
       p.nome,
       p.descricao,
       p.tamanho,
       p.ativo,
       p.padrao,
       p.elevar_fadiga,
       p.exigir_aprovacao_alto,
       p.exigir_aprovacao_critico,
       datetime('now'),
       datetime('now')
FROM empresas e
JOIN sgso_matriz_risco_perfis p ON p.empresa_id = 0 AND p.ativo = 1
WHERE e.ativo = 1 AND e.deleted_at IS NULL;

INSERT OR IGNORE INTO sgso_matriz_risco_celulas
  (perfil_id, codigo_probabilidade, ordem_probabilidade, severidade, score, nivel_risco, token_cor, prazo_resposta_horas, exige_aprovacao, created_at)
SELECT destino.id,
       origem.codigo_probabilidade,
       origem.ordem_probabilidade,
       origem.severidade,
       origem.score,
       origem.nivel_risco,
       origem.token_cor,
       origem.prazo_resposta_horas,
       origem.exige_aprovacao,
       datetime('now')
FROM sgso_matriz_risco_perfis template
JOIN sgso_matriz_risco_celulas origem ON origem.perfil_id = template.id
JOIN sgso_matriz_risco_perfis destino ON destino.codigo = template.codigo AND destino.empresa_id > 0
WHERE template.empresa_id = 0;

-- Modelos FRAT por empresa ativa
INSERT OR IGNORE INTO sgso_frat_modelos
  (empresa_id, codigo, nome, descricao, categoria_operacao, ativo, exige_aprovacao_risco_alto, exige_aprovacao_risco_critico, created_at, updated_at)
SELECT e.id,
       m.codigo,
       m.nome,
       m.descricao,
       m.categoria_operacao,
       m.ativo,
       m.exige_aprovacao_risco_alto,
       m.exige_aprovacao_risco_critico,
       datetime('now'),
       datetime('now')
FROM empresas e
JOIN sgso_frat_modelos m ON m.empresa_id = 0 AND m.ativo = 1
WHERE e.ativo = 1 AND e.deleted_at IS NULL;

INSERT OR IGNORE INTO sgso_frat_fatores
  (modelo_id, empresa_id, codigo, categoria, pergunta, tipo_resposta, peso_base, ordem_exibicao, opcoes_json, regra_score_json, ativo, created_at, updated_at)
SELECT destino.id,
       destino.empresa_id,
       origem.codigo,
       origem.categoria,
       origem.pergunta,
       origem.tipo_resposta,
       origem.peso_base,
       origem.ordem_exibicao,
       origem.opcoes_json,
       origem.regra_score_json,
       origem.ativo,
       datetime('now'),
       datetime('now')
FROM sgso_frat_modelos template
JOIN sgso_frat_fatores origem ON origem.modelo_id = template.id
JOIN sgso_frat_modelos destino ON destino.codigo = template.codigo AND destino.empresa_id > 0
WHERE template.empresa_id = 0;

-- SPI defaults por empresa (usa empresa 6 como baseline, se existir)
INSERT OR IGNORE INTO sgso_spi_config
  (empresa_id, codigo, nome, descricao, unidade, meta_valor, meta_operador, alerta_valor, alerta_operador, ativo, created_at, updated_at)
SELECT e.id,
       s.codigo,
       s.nome,
       s.descricao,
       s.unidade,
       s.meta_valor,
       s.meta_operador,
       s.alerta_valor,
       s.alerta_operador,
       s.ativo,
       datetime('now'),
       datetime('now')
FROM empresas e
JOIN sgso_spi_config s ON s.empresa_id = 6 AND s.ativo = 1
WHERE e.ativo = 1 AND e.deleted_at IS NULL;