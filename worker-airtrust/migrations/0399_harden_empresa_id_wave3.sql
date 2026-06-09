-- Wave 3: harden empresa_id on medium-risk tenant tables with deterministic backfill
-- Included tables:
--   1. documentos
--   2. pasta_virtual
--   3. tipos_sessao
--   4. setores
--   5. funcoes
--   6. arquivos
-- Excluded from this wave:
--   - qualificacoes_tipos: 5 soft-deleted empresa_id=1 rows remain without deterministic tenant lineage
--     in production, so the table stays outside this batch by design.
-- Safety model:
--   - Any unresolved empresa_id must fail the INSERT into *_new via NOT NULL.
--   - tipos_sessao duplicates from tenant fallback are canonicalized during copy before unique
--     constraints are reintroduced per tenant.

PRAGMA foreign_keys = OFF;

-- ===========================================================================
-- 1. documentos
-- Deterministic resolution:
--   funcionario.empresa_id (including soft-deleted funcionarios)
--   -> existing documentos.empresa_id when already explicit and != 1
-- ===========================================================================

CREATE TABLE documentos_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  funcionario_id INTEGER NOT NULL,
  nome_arquivo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  tamanho INTEGER NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  descricao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT DEFAULT NULL,
  empresa_id INTEGER NOT NULL,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

INSERT INTO documentos_new (
  id,
  uuid,
  funcionario_id,
  nome_arquivo,
  tipo,
  tamanho,
  r2_key,
  descricao,
  created_at,
  updated_at,
  deleted_at,
  empresa_id
)
SELECT
  d.id,
  d.uuid,
  d.funcionario_id,
  d.nome_arquivo,
  d.tipo,
  d.tamanho,
  d.r2_key,
  d.descricao,
  d.created_at,
  d.updated_at,
  d.deleted_at,
  CASE
    WHEN f.empresa_id IS NOT NULL THEN f.empresa_id
    WHEN d.empresa_id IS NOT NULL AND d.empresa_id <> 1 THEN d.empresa_id
    ELSE NULL
  END AS empresa_id
FROM documentos d
LEFT JOIN funcionarios f
  ON f.id = d.funcionario_id;

DROP TABLE documentos;
ALTER TABLE documentos_new RENAME TO documentos;

CREATE INDEX idx_documentos_deleted
  ON documentos(deleted_at);
CREATE INDEX idx_documentos_empresa
  ON documentos(empresa_id);
CREATE INDEX idx_documentos_funcionario
  ON documentos(funcionario_id);
CREATE INDEX idx_documentos_funcionario_tipo
  ON documentos(funcionario_id, tipo)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_documentos_tipo
  ON documentos(tipo)
  WHERE deleted_at IS NULL;

-- ===========================================================================
-- 2. pasta_virtual
-- Deterministic resolution:
--   funcionario.empresa_id (including soft-deleted funcionarios)
--   -> existing pasta_virtual.empresa_id when already explicit and != 1
-- ===========================================================================

CREATE TABLE pasta_virtual_new (
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
  empresa_id INTEGER NOT NULL,
  FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE
);

INSERT INTO pasta_virtual_new (
  id,
  funcionario_id,
  tipo_documento,
  categoria,
  caminho_arquivo,
  arquivourl,
  nome_arquivo,
  nomeoriginal,
  arquivo_tamanho,
  tamanho,
  dataupload,
  created_at,
  updated_at,
  uploadedby,
  certificacao_id,
  descricao,
  deleted_at,
  empresa_id
)
SELECT
  pv.id,
  pv.funcionario_id,
  pv.tipo_documento,
  pv.categoria,
  pv.caminho_arquivo,
  pv.arquivourl,
  pv.nome_arquivo,
  pv.nomeoriginal,
  pv.arquivo_tamanho,
  pv.tamanho,
  pv.dataupload,
  pv.created_at,
  pv.updated_at,
  pv.uploadedby,
  pv.certificacao_id,
  pv.descricao,
  pv.deleted_at,
  CASE
    WHEN f.empresa_id IS NOT NULL THEN f.empresa_id
    WHEN pv.empresa_id IS NOT NULL AND pv.empresa_id <> 1 THEN pv.empresa_id
    ELSE NULL
  END AS empresa_id
FROM pasta_virtual pv
LEFT JOIN funcionarios f
  ON f.id = pv.funcionario_id;

DROP TABLE pasta_virtual;
ALTER TABLE pasta_virtual_new RENAME TO pasta_virtual;

CREATE INDEX idx_pasta_virtual_deleted
  ON pasta_virtual(deleted_at);
CREATE INDEX idx_pasta_virtual_empresa
  ON pasta_virtual(empresa_id);
CREATE INDEX idx_pasta_virtual_funcionario
  ON pasta_virtual(funcionario_id);

-- ===========================================================================
-- 3. tipos_sessao
-- Deterministic resolution order:
--   existing non-1 empresa_id
--   -> canonical tenant from sessions already using the same codigo
--   -> canonical tenant from another tipos_sessao row with the same codigo
--   -> tenant 6 for deleted, unused residuals in the now-single-tenant production catalog
--
-- Canonicalization:
--   Active fallback duplicates (INI / SEM) are soft-deleted during copy when a live canonical
--   row already exists for the same codigo in the resolved tenant.
-- ===========================================================================

CREATE TABLE tipos_sessao_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo INTEGER DEFAULT 1,
  ordem INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME,
  empresa_id INTEGER NOT NULL
);

INSERT INTO tipos_sessao_new (
  id,
  codigo,
  nome,
  descricao,
  ativo,
  ordem,
  created_at,
  updated_at,
  deleted_at,
  empresa_id
)
SELECT
  ts.id,
  ts.codigo,
  ts.nome,
  ts.descricao,
  ts.ativo,
  ts.ordem,
  ts.created_at,
  CASE
    WHEN ts.empresa_id = 1
      AND ts.deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM tipos_sessao canon
        WHERE canon.codigo = ts.codigo
          AND canon.id != ts.id
          AND canon.empresa_id = COALESCE(
            (SELECT sa.empresa_id
             FROM simulador_agendamentos sa
             WHERE sa.tipo_sessao = ts.codigo
               AND sa.deleted_at IS NULL
               AND sa.empresa_id IS NOT NULL
             ORDER BY sa.id DESC
             LIMIT 1),
            (SELECT canon2.empresa_id
             FROM tipos_sessao canon2
             WHERE canon2.codigo = ts.codigo
               AND canon2.id != ts.id
               AND canon2.empresa_id IS NOT NULL
               AND canon2.empresa_id <> 1
             ORDER BY CASE WHEN canon2.deleted_at IS NULL THEN 0 ELSE 1 END, canon2.id DESC
             LIMIT 1),
            6
          )
          AND canon.deleted_at IS NULL
      )
    THEN datetime('now')
    ELSE ts.updated_at
  END AS updated_at,
  CASE
    WHEN ts.empresa_id = 1
      AND ts.deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM tipos_sessao canon
        WHERE canon.codigo = ts.codigo
          AND canon.id != ts.id
          AND canon.empresa_id = COALESCE(
            (SELECT sa.empresa_id
             FROM simulador_agendamentos sa
             WHERE sa.tipo_sessao = ts.codigo
               AND sa.deleted_at IS NULL
               AND sa.empresa_id IS NOT NULL
             ORDER BY sa.id DESC
             LIMIT 1),
            (SELECT canon2.empresa_id
             FROM tipos_sessao canon2
             WHERE canon2.codigo = ts.codigo
               AND canon2.id != ts.id
               AND canon2.empresa_id IS NOT NULL
               AND canon2.empresa_id <> 1
             ORDER BY CASE WHEN canon2.deleted_at IS NULL THEN 0 ELSE 1 END, canon2.id DESC
             LIMIT 1),
            6
          )
          AND canon.deleted_at IS NULL
      )
    THEN datetime('now')
    ELSE ts.deleted_at
  END AS deleted_at,
  CASE
    WHEN ts.empresa_id IS NOT NULL AND ts.empresa_id <> 1 THEN ts.empresa_id
    WHEN EXISTS (
      SELECT 1
      FROM simulador_agendamentos sa
      WHERE sa.tipo_sessao = ts.codigo
        AND sa.deleted_at IS NULL
        AND sa.empresa_id IS NOT NULL
    ) THEN (
      SELECT sa.empresa_id
      FROM simulador_agendamentos sa
      WHERE sa.tipo_sessao = ts.codigo
        AND sa.deleted_at IS NULL
        AND sa.empresa_id IS NOT NULL
      ORDER BY sa.id DESC
      LIMIT 1
    )
    WHEN EXISTS (
      SELECT 1
      FROM tipos_sessao canon
      WHERE canon.codigo = ts.codigo
        AND canon.id != ts.id
        AND canon.empresa_id IS NOT NULL
        AND canon.empresa_id <> 1
    ) THEN (
      SELECT canon.empresa_id
      FROM tipos_sessao canon
      WHERE canon.codigo = ts.codigo
        AND canon.id != ts.id
        AND canon.empresa_id IS NOT NULL
        AND canon.empresa_id <> 1
      ORDER BY CASE WHEN canon.deleted_at IS NULL THEN 0 ELSE 1 END, canon.id DESC
      LIMIT 1
    )
    ELSE 6
  END AS empresa_id
FROM tipos_sessao ts;

DROP TABLE tipos_sessao;
ALTER TABLE tipos_sessao_new RENAME TO tipos_sessao;

CREATE UNIQUE INDEX idx_tipos_sessao_codigo
  ON tipos_sessao(empresa_id, codigo)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_tipos_sessao_deleted_at
  ON tipos_sessao(deleted_at);
CREATE INDEX idx_tipos_sessao_empresa
  ON tipos_sessao(empresa_id);

-- ===========================================================================
-- 4. funcoes
-- empresa_id already populated in production (companies 6 and 7 only).
-- Rebuild removes DEFAULT 1, enforces NOT NULL, and makes active codigo unique per tenant.
-- ===========================================================================

CREATE TABLE funcoes_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT,
  ativo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  empresa_id INTEGER NOT NULL
);

INSERT INTO funcoes_new (
  id,
  codigo,
  nome,
  descricao,
  categoria,
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
  categoria,
  ativo,
  created_at,
  updated_at,
  deleted_at,
  CASE
    WHEN empresa_id IS NOT NULL AND empresa_id <> 1 THEN empresa_id
    ELSE NULL
  END
FROM funcoes;

DROP TABLE funcoes;
ALTER TABLE funcoes_new RENAME TO funcoes;

CREATE INDEX idx_funcoes_ativo
  ON funcoes(ativo)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_funcoes_codigo
  ON funcoes(empresa_id, codigo)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_funcoes_deleted_at
  ON funcoes(deleted_at);
CREATE INDEX idx_funcoes_empresa
  ON funcoes(empresa_id);

-- ===========================================================================
-- 5. setores
-- empresa_id already populated in production (companies 6 and 7 only).
-- Rebuild removes DEFAULT 1, enforces NOT NULL, and makes active codigo unique per tenant.
-- ===========================================================================

DROP VIEW IF EXISTS vw_setores_gestores_ativo;

CREATE TABLE setores_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  responsavel TEXT,
  ativo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  empresa_id INTEGER NOT NULL
);

INSERT INTO setores_new (
  id,
  codigo,
  nome,
  descricao,
  responsavel,
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
  responsavel,
  ativo,
  created_at,
  updated_at,
  deleted_at,
  CASE
    WHEN empresa_id IS NOT NULL AND empresa_id <> 1 THEN empresa_id
    ELSE NULL
  END
FROM setores;

DROP TABLE setores;
ALTER TABLE setores_new RENAME TO setores;

CREATE INDEX idx_setores_ativo
  ON setores(ativo)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_setores_codigo
  ON setores(empresa_id, codigo)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_setores_empresa
  ON setores(empresa_id);

CREATE VIEW vw_setores_gestores_ativo AS
SELECT
  sg.id,
  sg.setor_id,
  sg.gestor_id,
  sg.empresa_id,
  sg.role,
  s.nome as setor_nome,
  s.codigo as setor_codigo,
  g.nome as gestor_nome,
  g.email as gestor_email,
  g.cargo as gestor_cargo,
  sg.created_at
FROM setores_gestores sg
INNER JOIN setores s ON s.id = sg.setor_id
INNER JOIN notificacoes_convocacao_cc_gestores g ON g.id = sg.gestor_id
WHERE sg.deleted_at IS NULL
  AND sg.ativo = 1
  AND s.deleted_at IS NULL
  AND s.ativo = 1
  AND g.deleted_at IS NULL
  AND g.ativo = 1;

-- ===========================================================================
-- 6. arquivos
-- Table is empty in production; rebuild applies canonical tenant-safe schema only.
-- ===========================================================================

CREATE TABLE arquivos_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  nome_original TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  categoria TEXT DEFAULT 'geral',
  tamanho INTEGER,
  tipo TEXT,
  url_r2 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  deleted_at TEXT,
  empresa_id INTEGER NOT NULL,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

INSERT INTO arquivos_new (
  id,
  funcionario_id,
  nome_original,
  nome_arquivo,
  categoria,
  tamanho,
  tipo,
  url_r2,
  created_at,
  updated_at,
  deleted_at,
  empresa_id
)
SELECT
  id,
  funcionario_id,
  nome_original,
  nome_arquivo,
  categoria,
  tamanho,
  tipo,
  url_r2,
  created_at,
  updated_at,
  deleted_at,
  CASE
    WHEN empresa_id IS NOT NULL AND empresa_id <> 1 THEN empresa_id
    ELSE NULL
  END
FROM arquivos;

DROP TABLE arquivos;
ALTER TABLE arquivos_new RENAME TO arquivos;

CREATE INDEX idx_arquivos_empresa
  ON arquivos(empresa_id);

PRAGMA foreign_key_check;
PRAGMA foreign_keys = ON;
