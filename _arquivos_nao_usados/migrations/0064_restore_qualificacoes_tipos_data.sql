-- Migration 0064: Restaurar dados de qualificacoes_tipos com mapeamento de colunas
-- Data: 2025-11-25
-- Autor: Sistema
-- Descrição: Restaura os 88 registros do backup, mapeando validade_meses -> validade

BEGIN TRANSACTION;

-- Inserir dados do backup na tabela principal com mapeamento de colunas
INSERT INTO qualificacoes_tipos (
  id,
  tipo,
  codigo,
  nome,
  descricao,
  categoria,
  carga_horaria,
  validade,
  observacoes,
  ativo,
  created_at,
  updated_at,
  deleted_at
)
SELECT 
  id,
  NULL as tipo,  -- coluna tipo não existe no backup, será NULL
  codigo,
  nome,
  descricao,
  categoria,
  NULL as carga_horaria,  -- coluna carga_horaria não existe no backup
  validade_meses as validade,  -- MAPEAMENTO: validade_meses -> validade
  NULL as observacoes,  -- coluna observacoes não existe no backup
  ativo,
  created_at,
  updated_at,
  deleted_at
FROM _backup_qualificacoes_tipos
WHERE deleted_at IS NULL;  -- Apenas registros ativos

COMMIT;
