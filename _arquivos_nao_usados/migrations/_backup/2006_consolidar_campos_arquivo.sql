-- ════════════════════════════════════════════════════════════════
-- MIGRATION: Consolidar campos de arquivo em qualificacoes
-- Data: 01/11/2025
-- Descrição: Unificar certificado_url e arquivo_url em um único campo
-- ════════════════════════════════════════════════════════════════

-- PARTE 1: Consolidar dados existentes
-- Prioridade: arquivo_url > certificado_url
UPDATE qualificacoes 
SET arquivo_url = COALESCE(arquivo_url, certificado_url)
WHERE deleted_at IS NULL 
  AND (arquivo_url IS NULL OR arquivo_url = '')
  AND certificado_url IS NOT NULL 
  AND certificado_url != '';

-- PARTE 2: Adicionar coluna arquivo_nome se não existir
-- Esta coluna armazena o nome original do arquivo
CREATE TABLE IF NOT EXISTS qualificacoes_temp AS 
SELECT 
  id,
  funcionario_id,
  tipo,
  codigo,
  nome,
  data_conclusao,
  data_vencimento,
  resultado,
  nota_final,
  instrutor,
  local,
  observacoes,
  arquivo_url,
  COALESCE(
    CASE 
      WHEN arquivo_url IS NOT NULL THEN 
        CASE 
          WHEN arquivo_url LIKE '%/%' THEN substr(arquivo_url, instr(arquivo_url, '/') + 1)
          ELSE arquivo_url
        END
      ELSE NULL
    END,
    'certificado.pdf'
  ) as arquivo_nome,
  status,
  renovada_by,
  created_at,
  updated_at,
  deleted_at,
  is_renovada,
  descricao,
  categoria,
  periodicidade_meses,
  nota_minima,
  carga_horaria,
  ativo,
  checador
FROM qualificacoes;

-- PARTE 3: Limpar certificado_url (será removido em migration futura)
-- Por enquanto, apenas marcar como deprecated
UPDATE qualificacoes 
SET certificado_url = NULL 
WHERE deleted_at IS NULL 
  AND arquivo_url IS NOT NULL;

-- PARTE 4: Criar índice para arquivo_url
CREATE INDEX IF NOT EXISTS idx_qualificacoes_arquivo_url 
ON qualificacoes(arquivo_url) 
WHERE arquivo_url IS NOT NULL AND deleted_at IS NULL;

-- PARTE 5: Relatório de consolidação
SELECT 
  'CONSOLIDACAO_ARQUIVOS' as relatorio,
  COUNT(*) as total_qualificacoes,
  SUM(CASE WHEN arquivo_url IS NOT NULL THEN 1 ELSE 0 END) as com_arquivo,
  SUM(CASE WHEN certificado_url IS NOT NULL THEN 1 ELSE 0 END) as com_certificado_deprecated,
  SUM(CASE WHEN arquivo_url IS NULL AND certificado_url IS NULL THEN 1 ELSE 0 END) as sem_arquivo
FROM qualificacoes
WHERE deleted_at IS NULL;
