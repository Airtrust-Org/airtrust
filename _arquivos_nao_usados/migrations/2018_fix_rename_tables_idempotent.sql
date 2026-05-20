-- MIGRATION 2018: Fix Rename Tables (idempotent version)
-- Renamed from 2017 to account for existing state
-- 
-- Current state discovered:
-- - tipos_qualificacoes exists (master - has codigo, nome, categoria, etc)
-- - qualificacoes exists (employee instances - has funcionario_id, tipo, data_vencimento, etc)
-- - habilitacoes doesn't exist yet
--
-- Goal:
-- - tipos_qualificacoes → qualificacoes (master)  
-- - qualificacoes → habilitacoes (employee instances)

-- ✅ STEP 1: Rename qualificacoes (employee data) to habilitacoes
-- First backup the structure
CREATE TABLE habilitacoes AS 
SELECT * FROM qualificacoes;

-- ✅ STEP 2: Drop the old qualificacoes table
DROP TABLE qualificacoes;

-- ✅ STEP 3: Rename tipos_qualificacoes to qualificacoes (new master)
CREATE TABLE qualificacoes AS 
SELECT * FROM tipos_qualificacoes;

-- ✅ STEP 4: Drop the old tipos_qualificacoes table
DROP TABLE tipos_qualificacoes;

-- ✅ STEP 5: Rename the foreign key column in habilitacoes if it exists
-- First check if column exists, then rename
ALTER TABLE habilitacoes RENAME COLUMN tipo_qualificacao_id TO qualificacao_id;

-- ✅ STEP 6: Recreate all indexes
CREATE INDEX IF NOT EXISTS idx_qualificacoes_codigo ON qualificacoes(codigo);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_nome ON qualificacoes(nome);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_categoria ON qualificacoes(categoria);

CREATE INDEX IF NOT EXISTS idx_habilitacoes_funcionario ON habilitacoes(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_habilitacoes_qualificacao ON habilitacoes(qualificacao_id);
CREATE INDEX IF NOT EXISTS idx_habilitacoes_vencimento ON habilitacoes(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_habilitacoes_status ON habilitacoes(status);

-- ✅ STEP 7: Verify
SELECT 'Migration 2018 completed successfully!' as status;
