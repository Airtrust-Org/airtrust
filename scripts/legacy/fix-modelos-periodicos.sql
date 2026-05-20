-- Fix: Atualizar codigo_aeronave nos modelos periódicos
UPDATE modelos_sessao 
SET codigo_aeronave = 'AW139'
WHERE tipo_sessao_id = 9  -- ID do tipo "RECURRENT/Periódico"
  AND tipo_aeronave = 'AW139'
  AND (codigo_aeronave IS NULL OR codigo_aeronave = '');

-- Verificação
SELECT 
  id,
  codigo,
  nome,
  tipo_aeronave,
  codigo_aeronave
FROM modelos_sessao
WHERE tipo_sessao_id = 9
  AND deleted_at IS NULL
ORDER BY codigo;
