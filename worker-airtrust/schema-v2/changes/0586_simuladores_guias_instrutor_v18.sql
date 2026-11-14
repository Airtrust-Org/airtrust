-- 0586: Expansao aditiva dos guias do instrutor para suporte integral ao PTO Rev.10 V18.
-- Cria tabelas _v2 com programa ampliado (10 programas, incluindo TRANSICAO, REQUALIFICACAO,
-- RECENTE, NOTURNO, INSTRUTOR, EXAMINADOR), modelo_aeronave_id anulavel para guias funcionais
-- (INSTRUTOR/EXAMINADOR) e metadados de rastreabilidade tecnica, copiando integralmente com
-- preservacao de IDs os registros existentes nas tabelas originais (mantidas intactas como arquivo).
-- Proibido DROP TABLE ou ALTER TABLE RENAME TO (ver build-reviewed-schema-apply.mjs).

CREATE TABLE IF NOT EXISTS simuladores_guias_instrutor_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  modelo_aeronave_id INTEGER,
  programa TEXT NOT NULL CHECK(programa IN (
    'INICIAL',
    'TRANSICAO',
    'PERIODICO',
    'SEMESTRAL',
    'REQUALIFICACAO',
    'RECENTE',
    'NOTURNO',
    'CHECK',
    'INSTRUTOR',
    'EXAMINADOR'
  )),
  ciclo INTEGER,
  sessao_numero INTEGER,
  sessao_total INTEGER,
  codigo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  versao TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RASCUNHO' CHECK(status IN ('RASCUNHO', 'VALIDACAO', 'ATIVO', 'INATIVO', 'SUBSTITUIDO')),
  html_r2_key TEXT,
  html_nome TEXT,
  html_mime_type TEXT,
  html_tamanho_bytes INTEGER,
  html_sha256 TEXT,
  html_status_validacao TEXT NOT NULL DEFAULT 'NAO_DISPONIVEL' CHECK(html_status_validacao IN ('PENDENTE', 'VALIDO', 'REJEITADO', 'NAO_DISPONIVEL')),
  pdf_r2_key TEXT,
  pdf_nome TEXT,
  pdf_mime_type TEXT,
  pdf_tamanho_bytes INTEGER,
  pdf_sha256 TEXT,
  substituido_por_id INTEGER REFERENCES simuladores_guias_instrutor_v2(id),
  versao_curriculo TEXT,
  revisor_tecnico TEXT,
  revisao_tecnica_data TEXT,
  documento_referencia TEXT,
  publicado_em TEXT,
  created_by INTEGER NOT NULL,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK(programa IN ('INSTRUTOR', 'EXAMINADOR') OR modelo_aeronave_id IS NOT NULL),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  FOREIGN KEY (modelo_aeronave_id) REFERENCES modelos_aeronave(id)
);

CREATE INDEX IF NOT EXISTS idx_guias_instrutor_v2_empresa
  ON simuladores_guias_instrutor_v2(empresa_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_guias_instrutor_v2_status
  ON simuladores_guias_instrutor_v2(empresa_id, status, deleted_at);
CREATE INDEX IF NOT EXISTS idx_guias_instrutor_v2_codigo
  ON simuladores_guias_instrutor_v2(empresa_id, codigo, deleted_at);
CREATE INDEX IF NOT EXISTS idx_guias_instrutor_v2_aeronave_programa
  ON simuladores_guias_instrutor_v2(empresa_id, modelo_aeronave_id, programa, deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_guias_instrutor_v2_ativo_por_combinacao
  ON simuladores_guias_instrutor_v2(
    empresa_id,
    COALESCE(modelo_aeronave_id, -1),
    programa,
    COALESCE(ciclo, 0),
    COALESCE(sessao_numero, 0),
    codigo
  )
  WHERE status = 'ATIVO' AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS simuladores_modelos_sessao_guias_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  modelo_sessao_id INTEGER NOT NULL,
  guia_id INTEGER NOT NULL REFERENCES simuladores_guias_instrutor_v2(id) ON DELETE CASCADE,
  principal INTEGER NOT NULL DEFAULT 1,
  ordem INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  FOREIGN KEY (modelo_sessao_id) REFERENCES modelos_sessao(id)
);

CREATE INDEX IF NOT EXISTS idx_modelos_sessao_guias_v2_empresa
  ON simuladores_modelos_sessao_guias_v2(empresa_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_modelos_sessao_guias_v2_modelo
  ON simuladores_modelos_sessao_guias_v2(empresa_id, modelo_sessao_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_modelos_sessao_guias_v2_guia
  ON simuladores_modelos_sessao_guias_v2(empresa_id, guia_id, deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_modelos_sessao_guias_v2_par
  ON simuladores_modelos_sessao_guias_v2(modelo_sessao_id, guia_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS simuladores_guias_instrutor_auditoria_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  guia_id INTEGER NOT NULL REFERENCES simuladores_guias_instrutor_v2(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL,
  acao TEXT NOT NULL,
  valores_anteriores TEXT,
  valores_novos TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_guias_instrutor_auditoria_v2_empresa
  ON simuladores_guias_instrutor_auditoria_v2(empresa_id, guia_id);

-- Cópia idempotente preservando os IDs existentes nas tabelas originais.
-- Copia primeiro com substituido_por_id NULL para evitar conflito de auto-FK entre IDs.
INSERT OR IGNORE INTO simuladores_guias_instrutor_v2 (
  id, empresa_id, modelo_aeronave_id, programa, ciclo, sessao_numero, sessao_total,
  codigo, titulo, descricao, versao, status,
  html_r2_key, html_nome, html_mime_type, html_tamanho_bytes, html_sha256, html_status_validacao,
  pdf_r2_key, pdf_nome, pdf_mime_type, pdf_tamanho_bytes, pdf_sha256,
  substituido_por_id, versao_curriculo, revisor_tecnico, revisao_tecnica_data, documento_referencia,
  publicado_em, created_by, updated_by, created_at, updated_at, deleted_at
)
SELECT
  id, empresa_id, modelo_aeronave_id, programa, ciclo, sessao_numero, sessao_total,
  codigo, titulo, descricao, versao, status,
  html_r2_key, html_nome, html_mime_type, html_tamanho_bytes, html_sha256, html_status_validacao,
  pdf_r2_key, pdf_nome, pdf_mime_type, pdf_tamanho_bytes, pdf_sha256,
  NULL, NULL, NULL, NULL, NULL,
  publicado_em, created_by, updated_by, created_at, updated_at, deleted_at
FROM simuladores_guias_instrutor
ORDER BY id;

UPDATE simuladores_guias_instrutor_v2
SET substituido_por_id = (
  SELECT src.substituido_por_id
  FROM simuladores_guias_instrutor src
  WHERE src.id = simuladores_guias_instrutor_v2.id
)
WHERE substituido_por_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM simuladores_guias_instrutor src
    WHERE src.id = simuladores_guias_instrutor_v2.id
      AND src.substituido_por_id IS NOT NULL
  );

INSERT OR IGNORE INTO simuladores_modelos_sessao_guias_v2 (
  id, empresa_id, modelo_sessao_id, guia_id, principal, ordem, created_at, updated_at, deleted_at
)
SELECT
  id, empresa_id, modelo_sessao_id, guia_id, principal, ordem, created_at, updated_at, deleted_at
FROM simuladores_modelos_sessao_guias
ORDER BY id;

INSERT OR IGNORE INTO simuladores_guias_instrutor_auditoria_v2 (
  id, empresa_id, guia_id, usuario_id, acao, valores_anteriores, valores_novos, created_at
)
SELECT
  id, empresa_id, guia_id, usuario_id, acao, valores_anteriores, valores_novos, created_at
FROM simuladores_guias_instrutor_auditoria
ORDER BY id;
