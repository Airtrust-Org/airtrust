-- =============================================================================
-- CORREÇÃO DE INTEGRIDADE: Normalização de aeronave_codigo
-- Data: 2025-12-05
-- =============================================================================

-- PROBLEMA:
-- Aeronaves agora usam codigo simples (AW139, SK76)
-- Mas modelos_sessao tem codigo_aeronave com valor antigo (AER1761266027229)

-- CORREÇÃO 1: Atualizar modelos_sessao para usar o codigo correto
UPDATE modelos_sessao 
SET codigo_aeronave = 'AW139'
WHERE tipo_aeronave = 'AW139'
  AND (codigo_aeronave IS NULL OR codigo_aeronave != 'AW139');

-- CORREÇÃO 2: Atualizar modelos_sessao SK76 (se existir)
UPDATE modelos_sessao 
SET codigo_aeronave = 'SK76'
WHERE tipo_aeronave = 'SK76'
  AND (codigo_aeronave IS NULL OR codigo_aeronave != 'SK76');

-- VERIFICAÇÃO
SELECT 
  codigo_aeronave,
  tipo_aeronave,
  COUNT(*) as qtd
FROM modelos_sessao
WHERE deleted_at IS NULL
GROUP BY codigo_aeronave, tipo_aeronave;
