-- MIGRATION 0133: Correção definitiva de FKs para funcionarios_old
-- Data: 2025-11-29
-- Objetivo: Remover todas as referências a funcionarios_old (inexistente) e apontar para funcionarios
-- Tabelas afetadas: pasta_virtual, avaliacoes_manobras
-- Contexto: Erro "no such table: main.funcionarios_old" no upload de certificados

PRAGMA foreign_keys=OFF;

-- ==========================================
-- 1. PASTA_VIRTUAL
-- ==========================================
CREATE TABLE IF NOT EXISTS pasta_virtual_backup AS SELECT * FROM pasta_virtual;

DROP TABLE IF EXISTS pasta_virtual_new;
CREATE TABLE IF NOT EXISTS pasta_virtual_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  tipo_documento TEXT NOT NULL,
  categoria TEXT,
  caminho_arquivo TEXT,
  arquivourl TEXT,
  nome_arquivo TEXT,
  nomeoriginal TEXT,
  arquivo_tamanho INTEGER,
  tamanho INTEGER,
  dataupload TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  uploadedby INTEGER,
  certificacao_id INTEGER,
  descricao TEXT,
  deleted_at TEXT,
  FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE
);

INSERT INTO pasta_virtual_new 
SELECT * FROM pasta_virtual;

DROP TABLE pasta_virtual;
ALTER TABLE pasta_virtual_new RENAME TO pasta_virtual;

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_pasta_virtual_funcionario ON pasta_virtual(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_pasta_virtual_deleted ON pasta_virtual(deleted_at);

-- ==========================================
-- 2. AVALIACOES_MANOBRAS
-- ==========================================
CREATE TABLE IF NOT EXISTS avaliacoes_manobras_backup AS SELECT * FROM avaliacoes_manobras;

DROP TABLE IF EXISTS avaliacoes_manobras_new;
CREATE TABLE IF NOT EXISTS avaliacoes_manobras_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  ficha_uuid TEXT NOT NULL,
  participante_id INTEGER NOT NULL,
  manobra_id INTEGER NOT NULL,
  manobra_codigo TEXT NOT NULL,
  manobra_nome TEXT NOT NULL,
  nota_atual REAL NOT NULL CHECK(nota_atual >= 0 AND nota_atual <= 10),
  observacoes TEXT,
  avaliador_id INTEGER NOT NULL,
  data_avaliacao TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY (ficha_uuid) REFERENCES fichas_sessao(uuid) ON DELETE CASCADE,
  FOREIGN KEY (participante_id) REFERENCES funcionarios(id) ON DELETE CASCADE,
  FOREIGN KEY (manobra_id) REFERENCES manobras(id) ON DELETE CASCADE,
  FOREIGN KEY (avaliador_id) REFERENCES funcionarios(id) ON DELETE CASCADE
);

INSERT INTO avaliacoes_manobras_new 
SELECT * FROM avaliacoes_manobras;

DROP TABLE avaliacoes_manobras;
ALTER TABLE avaliacoes_manobras_new RENAME TO avaliacoes_manobras;

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_avaliacoes_ficha ON avaliacoes_manobras(ficha_uuid);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_participante ON avaliacoes_manobras(participante_id);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_avaliador ON avaliacoes_manobras(avaliador_id);

PRAGMA foreign_keys=ON;

-- Verificação
SELECT 
  'Migration 0133 concluída: ' || 
  (SELECT COUNT(*) FROM pasta_virtual) || ' registros em pasta_virtual, ' ||
  (SELECT COUNT(*) FROM avaliacoes_manobras) || ' registros em avaliacoes_manobras'
AS resultado;
