-- 0124_populate_qualificacao_id_null.sql
-- Popula qualificacao_id NULL em qualificacoes_historico usando qualificacao_codigo

-- CRÍTICO: LEFT JOIN com qualificacoes_tipos está retornando tipo_nome/tipo_codigo NULL
-- porque qualificacao_id está NULL apesar de qualificacao_codigo estar preenchido

UPDATE qualificacoes_historico
SET qualificacao_id = (
  SELECT id 
  FROM qualificacoes_tipos 
  WHERE codigo = qualificacoes_historico.qualificacao_codigo
  AND deleted_at IS NULL
  LIMIT 1
)
WHERE qualificacao_id IS NULL
AND qualificacao_codigo IS NOT NULL
AND deleted_at IS NULL;

-- Adicionar constraint NOT NULL após popular (evita dados órfãos no futuro)
-- Nota: SQLite não suporta ALTER COLUMN NOT NULL diretamente, 
-- mas podemos adicionar CHECK constraint como proteção

-- Adicionar index composto para performance do JOIN
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_fk_ids 
ON qualificacoes_historico(funcionario_id, qualificacao_id);

-- Verificar quantos registros ainda têm qualificacao_id NULL após update
-- (deve ser zero se todos os códigos forem válidos)
