-- ========================================
-- MIGRATION 131: FIX RENOVADAS PÓS-IMPORTAÇÃO
-- Identifica e marca automaticamente qualificações renovadas
-- Data: 28/11/2025
-- ========================================

-- Criar tabela temporária com registros ordenados
CREATE TEMP TABLE IF NOT EXISTS historico_ordenado AS
SELECT 
  h.id,
  h.funcionario_cpf,
  h.qualificacao_codigo,
  h.data_conclusao,
  h.data_vencimento,
  h.status,
  h.renovacao_de,
  -- Buscar o ID do registro ANTERIOR (mesma qualificação do mesmo funcionário)
  LAG(h.id) OVER (
    PARTITION BY h.funcionario_cpf, h.qualificacao_codigo 
    ORDER BY h.data_conclusao ASC
  ) AS id_registro_anterior,
  -- Data de conclusão do registro anterior
  LAG(h.data_conclusao) OVER (
    PARTITION BY h.funcionario_cpf, h.qualificacao_codigo 
    ORDER BY h.data_conclusao ASC
  ) AS data_anterior
FROM qualificacoes_historico h
WHERE h.deleted_at IS NULL
ORDER BY h.funcionario_cpf, h.qualificacao_codigo, h.data_conclusao;

-- Atualizar registros que são RENOVAÇÕES
-- Critério: Se existe registro anterior do mesmo funcionário/tipo, é renovação
UPDATE qualificacoes_historico
SET 
  renovacao_de = (
    SELECT id_registro_anterior 
    FROM historico_ordenado 
    WHERE historico_ordenado.id = qualificacoes_historico.id
  ),
  updated_at = datetime('now')
WHERE id IN (
  SELECT id 
  FROM historico_ordenado 
  WHERE id_registro_anterior IS NOT NULL
)
AND deleted_at IS NULL;

-- Marcar registros ANTIGOS como 'renovada'
-- Critério: Se existe outro registro mais novo que aponta para ele
UPDATE qualificacoes_historico
SET 
  status = 'renovada',
  updated_at = datetime('now')
WHERE id IN (
  SELECT DISTINCT renovacao_de 
  FROM qualificacoes_historico 
  WHERE renovacao_de IS NOT NULL 
    AND deleted_at IS NULL
)
AND deleted_at IS NULL
AND status != 'renovada';

-- Limpar tabela temporária
DROP TABLE IF EXISTS historico_ordenado;

-- Verificação
SELECT 'Fix renovadas aplicado com sucesso' AS status;

SELECT 
  COUNT(*) AS total_renovadas,
  COUNT(DISTINCT funcionario_cpf) AS funcionarios_com_renovacao
FROM qualificacoes_historico
WHERE status = 'renovada' AND deleted_at IS NULL;

SELECT 
  COUNT(*) AS total_com_vinculo,
  COUNT(DISTINCT funcionario_cpf) AS funcionarios_vinculados
FROM qualificacoes_historico
WHERE renovacao_de IS NOT NULL AND deleted_at IS NULL;
