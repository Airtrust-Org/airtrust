-- Migration: 0340_perfis_permissoes.sql
-- Tabela de configuração de permissões por perfil por empresa

CREATE TABLE IF NOT EXISTS perfis_permissoes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  empresa_id INTEGER NOT NULL,
  perfil TEXT NOT NULL CHECK(perfil IN ('GESTOR','INSTRUTOR','ALUNO')),
  modulo TEXT NOT NULL,
  acao TEXT NOT NULL,
  permitido INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(empresa_id, perfil, modulo, acao),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE INDEX IF NOT EXISTS idx_perfis_permissoes_empresa_perfil
  ON perfis_permissoes(empresa_id, perfil);
