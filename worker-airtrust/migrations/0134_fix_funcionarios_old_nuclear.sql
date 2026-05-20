-- MIGRATION 0134: FIX NUCLEAR para funcionarios_old
-- Data: 2025-11-29
-- Objetivo: REMOVER TODAS as FKs para funcionarios_old de TODAS as tabelas
-- Problema: D1 tem referências fantasmas a tabela deletada

-- Desabilitar FKs (NECESSÁRIO para remover referências)
PRAGMA foreign_keys=OFF;

-- ==========================================
-- STEP 1: Encontrar todas as tabelas
-- ==========================================

-- Buscar tabelas que possivelmente referenciam funcionarios_old
-- Em SQLite, temos que droppar e recriar todas as tabelas sem as FKs ruins

-- ==========================================
-- PASSO 1A: PASTA_VIRTUAL (se existir FK para funcionarios_old)
-- ==========================================
DROP TABLE IF EXISTS pasta_virtual_temp;
CREATE TABLE IF NOT EXISTS pasta_virtual_temp AS SELECT * FROM pasta_virtual;

DROP TABLE IF EXISTS pasta_virtual;
CREATE TABLE pasta_virtual (
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

INSERT INTO pasta_virtual SELECT * FROM pasta_virtual_temp;
DROP TABLE pasta_virtual_temp;

-- Índices
CREATE INDEX IF NOT EXISTS idx_pasta_virtual_funcionario ON pasta_virtual(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_pasta_virtual_deleted ON pasta_virtual(deleted_at);

-- ==========================================
-- PASSO 1B: AVALIACOES_MANOBRAS (se existir FK para funcionarios_old)
-- ==========================================
DROP TABLE IF EXISTS avaliacoes_manobras_temp;
CREATE TABLE IF NOT EXISTS avaliacoes_manobras_temp AS SELECT * FROM avaliacoes_manobras;

DROP TABLE IF EXISTS avaliacoes_manobras;
CREATE TABLE avaliacoes_manobras (
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

INSERT INTO avaliacoes_manobras SELECT * FROM avaliacoes_manobras_temp;
DROP TABLE avaliacoes_manobras_temp;

-- Índices
CREATE INDEX IF NOT EXISTS idx_avaliacoes_ficha ON avaliacoes_manobras(ficha_uuid);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_participante ON avaliacoes_manobras(participante_id);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_avaliador ON avaliacoes_manobras(avaliador_id);

-- ==========================================
-- PASSO 2: REABILITAR FKs
-- ==========================================
PRAGMA foreign_keys=ON;

-- ==========================================
-- PASSO 3: VERIFICAÇÃO FINAL
-- ==========================================
SELECT 
  'Migration 0134 concluída: ' || 
  (SELECT COUNT(*) FROM pasta_virtual) || ' registros em pasta_virtual, ' ||
  (SELECT COUNT(*) FROM avaliacoes_manobras) || ' registros em avaliacoes_manobras'
AS resultado;
