-- 0075_add_enrichment_columns_qualificacoes_historico.sql
-- Adiciona colunas enriquecidas ao histórico para dados dinâmicos e reativos
-- Novas colunas:
--   data_conclusao      (DATA da conclusão efetiva)
--   data_vencimento     (DATA calculada de vencimento; substitui uso ambíguo de 'validade')
--   validade_meses      (INTEGER meses de validade quando apenas duração era conhecida)
--   instrutor           (TEXT nome do instrutor)
--   local               (TEXT local de realização)
--   modalidade          (TEXT modalidade do treinamento/qualificação)
--   nota                (REAL nota final)
--   carga_horaria       (INTEGER horas totais)
-- Estratégia:
--   - Manter coluna antiga 'validade' para compatibilidade temporária
--   - Popular data_vencimento derivado quando validade for numérica (<=48)
--   - Popular data_conclusao = created_at quando ausente

ALTER TABLE qualificacoes_historico ADD COLUMN data_conclusao TEXT;
ALTER TABLE qualificacoes_historico ADD COLUMN data_vencimento TEXT;
ALTER TABLE qualificacoes_historico ADD COLUMN validade_meses INTEGER;
ALTER TABLE qualificacoes_historico ADD COLUMN instrutor TEXT;
ALTER TABLE qualificacoes_historico ADD COLUMN local TEXT;
ALTER TABLE qualificacoes_historico ADD COLUMN modalidade TEXT;
ALTER TABLE qualificacoes_historico ADD COLUMN nota REAL;
ALTER TABLE qualificacoes_historico ADD COLUMN carga_horaria INTEGER;

-- Preenchimento inicial derivado
UPDATE qualificacoes_historico
SET 
  validade_meses = CASE 
    WHEN TRIM(validade) GLOB '[0-9]*' AND CAST(validade AS INTEGER) BETWEEN 1 AND 60 THEN CAST(validade AS INTEGER)
    ELSE NULL END,
  data_conclusao = COALESCE(data_conclusao, created_at),
  data_vencimento = CASE 
    WHEN TRIM(validade) GLOB '[0-9]*' AND CAST(validade AS INTEGER) BETWEEN 1 AND 60 THEN DATE(created_at, '+' || CAST(validade AS INTEGER) || ' months')
    WHEN LENGTH(validade) >= 10 AND SUBSTR(validade,5,1)='-' THEN validade -- já parece ISO
    ELSE NULL END;

-- Índices auxiliares para consultas de status
CREATE INDEX IF NOT EXISTS idx_qualificacoes_hist_data_vencimento ON qualificacoes_historico(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_hist_data_conclusao ON qualificacoes_historico(data_conclusao);
