-- Migration 0394: tenant scope catálogos F5
-- Escopo:
--   - manobras
--   - manobras_categorias
--   - habilitacoes
--   - qualificacoes_categorias
--   - modelos_aeronave
--
-- Decisão operacional:
--   - os dados legados atuais pertencem ao tenant Costa do Sol (empresa_id = 6)
--   - manter soft-delete reutilizável via índices UNIQUE parciais por empresa
--   - D1 não permite desarmar foreign key enforcement em migrations; usar defer_foreign_keys
--   - existem fichas assinadas apontando para manobras já removidas; preservar integridade
--     referencial com placeholders soft-deleted antes do rebuild da tabela pai

PRAGMA defer_foreign_keys = on;

-- ============================================================================
-- MANOBRAS
-- ============================================================================

INSERT INTO manobras (
  id,
  codigo,
  nome,
  categoria,
  descricao,
  nivel_dificuldade,
  tempo_estimado,
  pontuacao_minima,
  created_at,
  updated_at,
  deleted_at,
  tipo_sessao,
  tipo_aeronave,
  ordem
)
SELECT
  orphan.manobra_id,
  'LEGACY-ORPHAN-' || orphan.manobra_id,
  'Manobra legada orfa #' || orphan.manobra_id,
  'LEGADO',
  'Placeholder tecnico criado pela migration 0394 para preservar fichas assinadas com referencia historica.',
  NULL,
  NULL,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  'TREINAMENTO',
  'AW139',
  9999
FROM (
  SELECT DISTINCT f.manobra_id
  FROM ficha_manobras_avaliacao f
  LEFT JOIN manobras m ON m.id = f.manobra_id
  WHERE m.id IS NULL

  UNION

  SELECT DISTINCT h.manobra_id
  FROM fichas_manobras_historico h
  LEFT JOIN manobras m ON m.id = h.manobra_id
  WHERE m.id IS NULL

  UNION

  SELECT DISTINCT msm.manobra_id
  FROM modelos_sessao_manobras msm
  LEFT JOIN manobras m ON m.id = msm.manobra_id
  WHERE m.id IS NULL
) AS orphan
WHERE orphan.manobra_id IS NOT NULL;

CREATE TABLE manobras__tenant_0394 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  categoria TEXT,
  descricao TEXT,
  nivel_dificuldade INTEGER,
  tempo_estimado INTEGER,
  pontuacao_minima REAL,
  created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  deleted_at TEXT DEFAULT NULL,
  tipo_sessao TEXT DEFAULT 'TREINAMENTO',
  tipo_aeronave TEXT DEFAULT 'AW139',
  ordem INTEGER DEFAULT 1,
  empresa_id INTEGER REFERENCES empresas(id)
);

INSERT INTO manobras__tenant_0394 (
  id,
  codigo,
  nome,
  categoria,
  descricao,
  nivel_dificuldade,
  tempo_estimado,
  pontuacao_minima,
  created_at,
  updated_at,
  deleted_at,
  tipo_sessao,
  tipo_aeronave,
  ordem,
  empresa_id
)
SELECT
  id,
  codigo,
  nome,
  categoria,
  descricao,
  nivel_dificuldade,
  tempo_estimado,
  pontuacao_minima,
  created_at,
  updated_at,
  deleted_at,
  tipo_sessao,
  tipo_aeronave,
  ordem,
  6
FROM manobras;

DROP TABLE manobras;
ALTER TABLE manobras__tenant_0394 RENAME TO manobras;

CREATE INDEX IF NOT EXISTS idx_manobras_empresa_deleted ON manobras(empresa_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_manobras_empresa_tipo_sessao_aeronave
  ON manobras(empresa_id, tipo_sessao, tipo_aeronave);
CREATE INDEX IF NOT EXISTS idx_manobras_empresa_categoria ON manobras(empresa_id, categoria);
CREATE INDEX IF NOT EXISTS idx_manobras_empresa_ordem ON manobras(empresa_id, ordem);
CREATE INDEX IF NOT EXISTS idx_manobras_codigo ON manobras(codigo);
CREATE INDEX IF NOT EXISTS idx_manobras_categoria ON manobras(categoria);
CREATE INDEX IF NOT EXISTS idx_manobras_deleted ON manobras(deleted_at);
CREATE INDEX IF NOT EXISTS idx_manobras_tipo_sessao ON manobras(tipo_sessao);
CREATE INDEX IF NOT EXISTS idx_manobras_tipo_aeronave ON manobras(tipo_aeronave);
CREATE INDEX IF NOT EXISTS idx_manobras_ordem ON manobras(ordem);
CREATE INDEX IF NOT EXISTS idx_manobras_tipo_sessao_aeronave
  ON manobras(tipo_sessao, tipo_aeronave)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_manobras_empresa_codigo_active
  ON manobras(empresa_id, codigo)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- MANOBRAS CATEGORIAS
-- ============================================================================

CREATE TABLE manobras_categorias__tenant_0394 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  cor TEXT,
  icone TEXT,
  ordem INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME,
  empresa_id INTEGER REFERENCES empresas(id)
);

INSERT INTO manobras_categorias__tenant_0394 (
  id,
  codigo,
  nome,
  descricao,
  cor,
  icone,
  ordem,
  ativo,
  created_at,
  updated_at,
  deleted_at,
  empresa_id
)
SELECT
  id,
  codigo,
  nome,
  descricao,
  cor,
  icone,
  ordem,
  ativo,
  created_at,
  updated_at,
  deleted_at,
  6
FROM manobras_categorias;

DROP TABLE manobras_categorias;
ALTER TABLE manobras_categorias__tenant_0394 RENAME TO manobras_categorias;

CREATE INDEX IF NOT EXISTS idx_manobras_categorias_empresa_deleted
  ON manobras_categorias(empresa_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_manobras_categorias_empresa_ordem
  ON manobras_categorias(empresa_id, ordem);
CREATE INDEX IF NOT EXISTS idx_manobras_categorias_nome ON manobras_categorias(nome);
CREATE UNIQUE INDEX IF NOT EXISTS ux_manobras_categorias_empresa_codigo_active
  ON manobras_categorias(empresa_id, codigo)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- HABILITACOES
-- ============================================================================

ALTER TABLE habilitacoes ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);

UPDATE habilitacoes
SET empresa_id = 6
WHERE empresa_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_habilitacoes_empresa_deleted ON habilitacoes(empresa_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_habilitacoes_renovada ON habilitacoes(eh_renovada);
CREATE INDEX IF NOT EXISTS idx_habilitacoes_anterior ON habilitacoes(habilitacao_anterior_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_habilitacoes_empresa_nome_active
  ON habilitacoes(empresa_id, nome)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- QUALIFICACOES CATEGORIAS
-- ============================================================================

CREATE TABLE qualificacoes_categorias__tenant_0394 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  codigo TEXT NOT NULL,
  descricao TEXT,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME,
  cor TEXT DEFAULT '#6B7280',
  ativo INTEGER DEFAULT 1,
  empresa_id INTEGER REFERENCES empresas(id)
);

INSERT INTO qualificacoes_categorias__tenant_0394 (
  id,
  nome,
  codigo,
  descricao,
  created_at,
  updated_at,
  deleted_at,
  cor,
  ativo,
  empresa_id
)
SELECT
  id,
  nome,
  codigo,
  descricao,
  created_at,
  updated_at,
  deleted_at,
  cor,
  ativo,
  6
FROM qualificacoes_categorias;

DROP TABLE qualificacoes_categorias;
ALTER TABLE qualificacoes_categorias__tenant_0394 RENAME TO qualificacoes_categorias;

CREATE INDEX IF NOT EXISTS idx_categorias_qualificacoes_empresa_deleted
  ON qualificacoes_categorias(empresa_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_categorias_qualificacoes_empresa_nome
  ON qualificacoes_categorias(empresa_id, nome);
CREATE INDEX IF NOT EXISTS idx_categorias_qualificacoes_codigo
  ON qualificacoes_categorias(codigo);
CREATE INDEX IF NOT EXISTS idx_categorias_codigo
  ON qualificacoes_categorias(codigo)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_qualificacoes_categorias_empresa_codigo_active
  ON qualificacoes_categorias(empresa_id, codigo)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- MODELOS AERONAVE
-- ============================================================================

CREATE TABLE modelos_aeronave__tenant_0394 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  fabricante TEXT,
  tipo TEXT,
  categoria TEXT,
  descricao TEXT,
  ativo INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  empresa_id INTEGER REFERENCES empresas(id),
  modelo TEXT NOT NULL
);

INSERT INTO modelos_aeronave__tenant_0394 (
  id,
  codigo,
  nome,
  fabricante,
  tipo,
  categoria,
  descricao,
  ativo,
  created_at,
  updated_at,
  deleted_at,
  empresa_id,
  modelo
)
SELECT
  id,
  COALESCE(NULLIF(TRIM(codigo), ''), NULLIF(TRIM(modelo), ''), NULLIF(TRIM(nome), ''), 'MODELO-' || id),
  COALESCE(NULLIF(TRIM(nome), ''), NULLIF(TRIM(modelo), ''), NULLIF(TRIM(codigo), ''), 'MODELO-' || id),
  fabricante,
  tipo,
  categoria,
  descricao,
  ativo,
  created_at,
  updated_at,
  deleted_at,
  CASE
    WHEN empresa_id IS NULL OR empresa_id = 1 THEN 6
    ELSE empresa_id
  END,
  COALESCE(NULLIF(TRIM(modelo), ''), NULLIF(TRIM(codigo), ''), NULLIF(TRIM(nome), ''), 'MODELO-' || id)
FROM modelos_aeronave;

DROP TABLE modelos_aeronave;
ALTER TABLE modelos_aeronave__tenant_0394 RENAME TO modelos_aeronave;

CREATE INDEX IF NOT EXISTS idx_modelos_aeronave_empresa ON modelos_aeronave(empresa_id);
CREATE INDEX IF NOT EXISTS idx_modelos_aeronave_empresa_deleted
  ON modelos_aeronave(empresa_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_modelos_aeronave_modelo ON modelos_aeronave(modelo);
CREATE INDEX IF NOT EXISTS idx_modelos_aeronave_codigo ON modelos_aeronave(codigo);
CREATE INDEX IF NOT EXISTS idx_modelos_aeronave_nome ON modelos_aeronave(nome);
CREATE INDEX IF NOT EXISTS idx_modelos_aeronave_ativo ON modelos_aeronave(ativo);
CREATE UNIQUE INDEX IF NOT EXISTS ux_modelos_aeronave_empresa_modelo_active
  ON modelos_aeronave(empresa_id, modelo)
  WHERE deleted_at IS NULL;

PRAGMA defer_foreign_keys = off;
