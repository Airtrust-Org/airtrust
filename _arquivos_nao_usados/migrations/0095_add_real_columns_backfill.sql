-- Migration 0095: Adiciona colunas físicas e realiza backfill inicial
-- Novas colunas: data_conclusao, data_validade, nota (REAL), instrutor (TEXT), local (TEXT), modalidade (TEXT), carga_horaria (INTEGER)
-- Estratégia backfill:
--  - data_conclusao: usar created_at (primeiro registro temporal disponível)
--  - data_validade: se campo `validade` numérico (meses) -> created_at + meses; se ISO date (YYYY-MM-DD) -> usar diretamente; caso contrário NULL
--  - demais campos permanecem NULL para preenchimento futuro

ALTER TABLE qualificacoes_historico ADD COLUMN data_conclusao TEXT;
ALTER TABLE qualificacoes_historico ADD COLUMN data_validade TEXT;
ALTER TABLE qualificacoes_historico ADD COLUMN nota REAL;
ALTER TABLE qualificacoes_historico ADD COLUMN instrutor TEXT;
ALTER TABLE qualificacoes_historico ADD COLUMN local TEXT;
ALTER TABLE qualificacoes_historico ADD COLUMN modalidade TEXT;
ALTER TABLE qualificacoes_historico ADD COLUMN carga_horaria INTEGER;

-- Backfill data_conclusao
UPDATE qualificacoes_historico
SET data_conclusao = created_at
WHERE data_conclusao IS NULL;

-- Backfill data_validade
UPDATE qualificacoes_historico
SET data_validade = CASE
  WHEN validade GLOB '[0-9]*' AND validade <> '' THEN DATE(created_at, '+' || validade || ' months')
  WHEN validade LIKE '____-__-__' THEN validade
  ELSE NULL
END
WHERE data_validade IS NULL;

-- Index auxiliar para futuras consultas (validade)
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_data_validade ON qualificacoes_historico(data_validade) WHERE deleted_at IS NULL;
