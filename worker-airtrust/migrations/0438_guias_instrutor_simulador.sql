-- Migration: Biblioteca de Guias do Instrutor de Simulador (HTML + PDF versionados)
-- Created: 2026-07-20
-- Description: Cria simuladores_guias_instrutor (documento lógico com HTML de consulta
--   + PDF canônico versionados) e simuladores_modelos_sessao_guias (vínculo explícito
--   e revisável entre guia e modelo de sessão). Aditiva, reversível, sem DEFAULT 1.
--   Não é módulo LMS: não possui matrícula, progresso, conclusão nem certificado.

CREATE TABLE IF NOT EXISTS simuladores_guias_instrutor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,

  modelo_aeronave_id INTEGER NOT NULL,
  programa TEXT NOT NULL CHECK(programa IN ('INICIAL', 'PERIODICO', 'SEMESTRAL', 'CHECK')),
  ciclo INTEGER,
  sessao_numero INTEGER,
  sessao_total INTEGER,

  codigo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  versao TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'RASCUNHO'
    CHECK(status IN ('RASCUNHO', 'VALIDACAO', 'ATIVO', 'INATIVO', 'SUBSTITUIDO')),

  html_r2_key TEXT,
  html_nome TEXT,
  html_mime_type TEXT,
  html_tamanho_bytes INTEGER,
  html_sha256 TEXT,
  html_status_validacao TEXT NOT NULL DEFAULT 'NAO_DISPONIVEL'
    CHECK(html_status_validacao IN ('PENDENTE', 'VALIDO', 'REJEITADO', 'NAO_DISPONIVEL')),

  pdf_r2_key TEXT,
  pdf_nome TEXT,
  pdf_mime_type TEXT,
  pdf_tamanho_bytes INTEGER,
  pdf_sha256 TEXT,

  substituido_por_id INTEGER REFERENCES simuladores_guias_instrutor(id),

  publicado_em TEXT,
  created_by INTEGER NOT NULL,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,

  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  FOREIGN KEY (modelo_aeronave_id) REFERENCES modelos_aeronave(id)
);

CREATE INDEX IF NOT EXISTS idx_guias_instrutor_empresa
  ON simuladores_guias_instrutor(empresa_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_guias_instrutor_empresa_status
  ON simuladores_guias_instrutor(empresa_id, status, deleted_at);

CREATE INDEX IF NOT EXISTS idx_guias_instrutor_codigo
  ON simuladores_guias_instrutor(empresa_id, codigo, deleted_at);

CREATE INDEX IF NOT EXISTS idx_guias_instrutor_aeronave_programa
  ON simuladores_guias_instrutor(empresa_id, modelo_aeronave_id, programa, deleted_at);

-- Garante no máximo uma versão ATIVA por combinação canônica (empresa + aeronave +
-- programa + ciclo + sessão + código). SQLite trata NULL como distinto em índices
-- únicos parciais, então ciclo/sessao_numero NULL não colidem entre si — aceitável,
-- pois nesses casos o código isoladamente já é a chave prática (ex: SK76-P-CHECK).
CREATE UNIQUE INDEX IF NOT EXISTS uq_guias_instrutor_ativo_por_combinacao
  ON simuladores_guias_instrutor(
    empresa_id, modelo_aeronave_id, programa, ciclo, sessao_numero, codigo
  )
  WHERE status = 'ATIVO' AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS simuladores_modelos_sessao_guias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,

  modelo_sessao_id INTEGER NOT NULL REFERENCES modelos_sessao(id),
  guia_id INTEGER NOT NULL REFERENCES simuladores_guias_instrutor(id) ON DELETE CASCADE,

  principal INTEGER NOT NULL DEFAULT 1,
  ordem INTEGER NOT NULL DEFAULT 1,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,

  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_modelos_sessao_guias_empresa
  ON simuladores_modelos_sessao_guias(empresa_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_modelos_sessao_guias_modelo
  ON simuladores_modelos_sessao_guias(empresa_id, modelo_sessao_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_modelos_sessao_guias_guia
  ON simuladores_modelos_sessao_guias(empresa_id, guia_id, deleted_at);

-- Evita vínculo duplicado do mesmo guia ao mesmo modelo de sessão.
CREATE UNIQUE INDEX IF NOT EXISTS uq_modelos_sessao_guias_par
  ON simuladores_modelos_sessao_guias(modelo_sessao_id, guia_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS simuladores_guias_instrutor_auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  guia_id INTEGER NOT NULL REFERENCES simuladores_guias_instrutor(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL,
  acao TEXT NOT NULL,
  valores_anteriores TEXT,
  valores_novos TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_guias_instrutor_auditoria_empresa
  ON simuladores_guias_instrutor_auditoria(empresa_id, guia_id);
