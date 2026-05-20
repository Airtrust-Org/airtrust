-- Migration 2016: Refatorar tipos_qualificacoes com dados fixos
PRAGMA foreign_keys = OFF;
ALTER TABLE tipos_qualificacoes ADD COLUMN codigo TEXT;
ALTER TABLE tipos_qualificacoes ADD COLUMN categoria TEXT DEFAULT 'Nenhuma';
ALTER TABLE tipos_qualificacoes ADD COLUMN carga_horaria REAL DEFAULT 8.0;
ALTER TABLE tipos_qualificacoes ADD COLUMN conteudo_programatico TEXT;
ALTER TABLE tipos_qualificacoes ADD COLUMN validade_meses INTEGER DEFAULT 12;
ALTER TABLE tipos_qualificacoes ADD COLUMN tipo_vencimento TEXT DEFAULT 'Dia Exato';
ALTER TABLE qualificacoes ADD COLUMN tipo_qualificacao_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_tipos_codigo ON tipos_qualificacoes(codigo);
CREATE INDEX IF NOT EXISTS idx_qual_tipo_fk ON qualificacoes(tipo_qualificacao_id);
PRAGMA foreign_keys = ON;
SELECT 'Migration 2016 ok - tipos refatorados com dados fixos' as status;
