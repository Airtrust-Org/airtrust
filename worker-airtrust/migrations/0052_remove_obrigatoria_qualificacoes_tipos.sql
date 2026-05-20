-- ============================================================
-- MIGRATION 0052: Remover campo 'obrigatoria' de qualificacoes_tipos
-- Data: 2025-11-21
-- Observação: A coluna 'obrigatoria' era derivada de 'ativo' em selects. 
-- Esta migration simplifica o schema mantendo apenas campos essenciais.
-- ============================================================

-- Recriar tabela sem campo 'obrigatoria' (idempotente; copia subset de colunas existentes)
-- Dropar views dependentes para evitar erros de resolução durante recriação da tabela
DROP VIEW IF EXISTS qualificacoes_historico_v;
DROP VIEW IF EXISTS qualificacoes_historico_integrado;
DROP TABLE IF EXISTS qualificacoes_tipos_new;
CREATE TABLE IF NOT EXISTS qualificacoes_tipos_new (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  codigo TEXT NOT NULL,
  categoria TEXT NOT NULL,
  validade_meses INTEGER,
  descricao TEXT,
  ativo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- Copiar dados das colunas se tabela antiga existir
INSERT INTO qualificacoes_tipos_new (id, nome, codigo, categoria, validade_meses, descricao, ativo, created_at, updated_at, deleted_at)
SELECT 
  id,
  nome,
  -- Normalizar códigos duplicados adicionando sufixo incremental
  codigo || CASE 
              WHEN (SELECT COUNT(*) FROM qualificacoes_tipos q2 WHERE q2.codigo = qualificacoes_tipos.codigo AND q2.id < qualificacoes_tipos.id) > 0 
              THEN '-' || (SELECT COUNT(*) FROM qualificacoes_tipos q3 WHERE q3.codigo = qualificacoes_tipos.codigo AND q3.id <= qualificacoes_tipos.id) - 1
              ELSE ''
            END AS codigo,
  categoria,
  validade_meses,
  descricao,
  ativo,
  created_at,
  updated_at,
  deleted_at
FROM qualificacoes_tipos;

-- Substituir tabela antiga
DROP TABLE qualificacoes_tipos;
ALTER TABLE qualificacoes_tipos_new RENAME TO qualificacoes_tipos;

-- Índices
CREATE INDEX IF NOT EXISTS idx_qt_codigo ON qualificacoes_tipos(codigo);
CREATE INDEX IF NOT EXISTS idx_qt_categoria ON qualificacoes_tipos(categoria);
CREATE INDEX IF NOT EXISTS idx_qt_deleted_at ON qualificacoes_tipos(deleted_at);

-- Trigger de updated_at
DROP TRIGGER IF EXISTS update_qt_timestamp;
CREATE TRIGGER update_qt_timestamp 
AFTER UPDATE ON qualificacoes_tipos
FOR EACH ROW
BEGIN
  UPDATE qualificacoes_tipos SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Auditoria rápida
SELECT 'qualificacoes_tipos' AS tabela, COUNT(*) AS total_registros FROM qualificacoes_tipos WHERE deleted_at IS NULL;