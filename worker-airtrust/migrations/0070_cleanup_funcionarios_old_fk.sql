-- MIGRATION 0070: Limpeza de referências legado a funcionarios_old
-- Data: 2025-11-22
-- Objetivo: Remover FKs que apontam para funcionarios_old (inexistente) e recriá-las apontando para funcionarios.
-- Tabelas afetadas: usuarios, sessoes_treinamento, solicitacoes_lgpd
-- Estratégia: recriar cada tabela mantendo dados, ajustando somente a FK.

PRAGMA foreign_keys=OFF;

-- 1. usuarios
CREATE TABLE IF NOT EXISTS usuarios_new AS SELECT * FROM usuarios;
DROP TABLE usuarios;
CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nome TEXT NOT NULL,
  perfil TEXT DEFAULT 'USUARIO' CHECK(perfil IN ('ADMIN', 'COMPLIANCE', 'GESTOR', 'USUARIO')),
  funcionario_id INTEGER,
  deleted_at INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  active INTEGER DEFAULT 1,
  last_login TEXT,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);
INSERT INTO usuarios SELECT * FROM usuarios_new;
DROP TABLE usuarios_new;

-- 2. sessoes_treinamento
CREATE TABLE IF NOT EXISTS sessoes_treinamento_new AS SELECT * FROM sessoes_treinamento;
DROP TABLE sessoes_treinamento;
CREATE TABLE sessoes_treinamento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  treinamento_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  data_inicio TEXT NOT NULL,
  data_conclusao TEXT,
  status TEXT CHECK(status IN ('AGENDADO','EM_ANDAMENTO','CONCLUIDO','CANCELADO')) DEFAULT 'AGENDADO',
  nota_final REAL,
  aprovado INTEGER,
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (treinamento_id) REFERENCES treinamentos(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);
INSERT INTO sessoes_treinamento SELECT * FROM sessoes_treinamento_new;
DROP TABLE sessoes_treinamento_new;

-- 3. solicitacoes_lgpd
CREATE TABLE IF NOT EXISTS solicitacoes_lgpd_new AS SELECT * FROM solicitacoes_lgpd;
DROP TABLE solicitacoes_lgpd;
CREATE TABLE solicitacoes_lgpd (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('confirmacao_dados','acesso_dados','correcao_dados','anonimizacao','eliminacao','portabilidade','informacao_compartilhamento','revogacao_consentimento')),
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK(status IN ('PENDENTE','EM_ANDAMENTO','CONCLUIDA','REJEITADA')),
  descricao TEXT,
  data_solicitacao TEXT DEFAULT (datetime('now')),
  data_conclusao TEXT,
  responsavel_id INTEGER,
  observacoes TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);
INSERT INTO solicitacoes_lgpd SELECT * FROM solicitacoes_lgpd_new;
DROP TABLE solicitacoes_lgpd_new;

PRAGMA foreign_keys=ON;

SELECT 'Migration 0070 cleanup funcionarios_old FK concluída' AS message;