-- Migration 0159: Remover tipo_aeronave de modelos_sessao
-- Data: 2026-01-11
-- Objetivo: Eliminar redundância - usar apenas codigo_aeronave em modelos_sessao
-- Nota: tipo_aeronave é mantido em manobras, fichas_sessao e outras tabelas

BEGIN TRANSACTION;

-- 1. Criar tabela temporária com a nova estrutura (sem tipo_aeronave)
CREATE TABLE IF NOT EXISTS modelos_sessao_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  tipo_sessao_id INTEGER NOT NULL,
  codigo_aeronave TEXT NOT NULL,
  descricao TEXT,
  duracao_estimada INTEGER DEFAULT 120,
  gera_qualificacao BOOLEAN DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY(tipo_sessao_id) REFERENCES tipos_sessao(id),
  FOREIGN KEY(codigo_aeronave) REFERENCES aeronaves(codigo)
);

-- 2. Copiar dados da tabela antiga (sem tipo_aeronave)
INSERT INTO modelos_sessao_new 
  (id, codigo, nome, tipo_sessao_id, codigo_aeronave, descricao, duracao_estimada, gera_qualificacao, created_at, updated_at, deleted_at)
SELECT 
  id, codigo, nome, tipo_sessao_id, codigo_aeronave, descricao, duracao_estimada, gera_qualificacao, created_at, updated_at, deleted_at
FROM modelos_sessao;

-- 3. Remover tabela antiga
DROP TABLE modelos_sessao;

-- 4. Renomear nova tabela
ALTER TABLE modelos_sessao_new RENAME TO modelos_sessao;

-- 5. Recriar índices (sem tipo_aeronave)
CREATE INDEX IF NOT EXISTS idx_modelos_sessao_codigo ON modelos_sessao(codigo) 
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_modelos_sessao_tipo_sessao ON modelos_sessao(tipo_sessao_id) 
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_modelos_sessao_codigo_aeronave ON modelos_sessao(codigo_aeronave) 
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_modelos_sessao_deleted ON modelos_sessao(deleted_at);

-- 6. Auditoria
INSERT INTO auditoria_avancada_v2 (tabela, acao, registro_id, dados_novos, criada_em, usuario_origem)
VALUES ('modelos_sessao', 'SCHEMA_CHANGE', NULL, '{"evento": "Removido tipo_aeronave, mantendo apenas codigo_aeronave"}', datetime('now'), 'system');

COMMIT;
