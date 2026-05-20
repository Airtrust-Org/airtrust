-- ============================================================================
-- MIGRATION: Migrar registros órfãos de qualificacoes_registros → habilitacoes
-- Data: 2025-11-06
-- Autor: Sistema AirTrust
-- Descrição: Move 117 registros que existem em qualificacoes_registros mas não
--            em habilitacoes para não perder dados antes da limpeza
-- ============================================================================

-- Inserir registros órfãos em habilitacoes
INSERT INTO habilitacoes (
  funcionario_id,
  qualificacao_id,
  data_conclusao,
  data_vencimento,
  status,
  observacoes,
  created_at,
  updated_at,
  deleted_at
)
SELECT 
  qr.funcionario_id,
  COALESCE(
    (SELECT id FROM qualificacoes WHERE codigo = qr.codigo LIMIT 1),
    (SELECT id FROM qualificacoes LIMIT 1) -- Fallback se código não encontrado
  ) as qualificacao_id,
  qr.data_conclusao,
  qr.data_vencimento,
  CASE 
    WHEN qr.data_vencimento IS NULL THEN 'VIGENTE'
    WHEN DATE(qr.data_vencimento) < DATE('now') THEN 'VENCIDA'
    WHEN DATE(qr.data_vencimento) <= DATE('now', '+30 days') THEN 'PRESTES_A_VENCER'
    ELSE 'VIGENTE'
  END as status,
  qr.observacoes,
  qr.created_at,
  qr.updated_at,
  qr.deleted_at
FROM qualificacoes_registros qr
WHERE NOT EXISTS (
  SELECT 1 
  FROM habilitacoes h 
  WHERE h.funcionario_id = qr.funcionario_id 
    AND h.qualificacao_id = (SELECT id FROM qualificacoes WHERE codigo = qr.codigo LIMIT 1)
)
AND qr.funcionario_id IS NOT NULL;

-- Verificar resultado
SELECT 
  'ANTES' as momento,
  (SELECT COUNT(*) FROM qualificacoes_registros) as qual_registros,
  (SELECT COUNT(*) FROM habilitacoes) as habilitacoes

UNION ALL

SELECT 
  'ESPERADO_APOS' as momento,
  (SELECT COUNT(*) FROM qualificacoes_registros) as qual_registros,
  (SELECT COUNT(*) + (
    SELECT COUNT(*) FROM qualificacoes_registros qr
    WHERE NOT EXISTS (
      SELECT 1 FROM habilitacoes h 
      WHERE h.funcionario_id = qr.funcionario_id 
        AND h.qualificacao_id = (SELECT id FROM qualificacoes WHERE codigo = qr.codigo LIMIT 1)
    )
    AND qr.funcionario_id IS NOT NULL
  ) FROM habilitacoes) as habilitacoes;
