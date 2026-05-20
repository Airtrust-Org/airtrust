-- 0346_lms_matricula_ciclos_ssot.sql
-- Materializa o histórico de ciclos do LMS sem perder a matrícula operacional atual.
-- Também conecta os históricos importados do EdApp ao mesmo domínio rastreável.

CREATE TABLE IF NOT EXISTS lms_matricula_ciclos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  matricula_id INTEGER REFERENCES lms_matriculas(id),
  historico_importado_id INTEGER REFERENCES lms_historico_importado(id),
  curso_id INTEGER,
  funcionario_id INTEGER,
  numero_ciclo INTEGER NOT NULL DEFAULT 1,
  origem TEXT NOT NULL DEFAULT 'LMS'
    CHECK (origem IN ('LMS', 'MANUAL', 'AUTO_RENOVACAO', 'IMPORTADO_EDAPP')),
  status TEXT NOT NULL DEFAULT 'NAO_INICIADO'
    CHECK (status IN ('NAO_INICIADO', 'EM_ANDAMENTO', 'CONCLUIDO', 'REPROVADO', 'CANCELADO', 'PENDENTE_VINCULO')),
  ciclo_atual INTEGER NOT NULL DEFAULT 1,
  observacoes TEXT,
  data_matricula TEXT,
  data_inicio TEXT,
  data_conclusao TEXT,
  data_expiracao TEXT,
  progresso_pct INTEGER NOT NULL DEFAULT 0,
  score_final REAL,
  tentativas INTEGER NOT NULL DEFAULT 0,
  qualificacao_historico_id INTEGER REFERENCES qualificacoes_historico(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (matricula_id IS NOT NULL OR historico_importado_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_lms_matricula_ciclos_matricula
  ON lms_matricula_ciclos(matricula_id, numero_ciclo)
  WHERE matricula_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lms_matricula_ciclos_funcionario
  ON lms_matricula_ciclos(empresa_id, funcionario_id, curso_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lms_matricula_ciclos_ativo_unico
  ON lms_matricula_ciclos(matricula_id)
  WHERE matricula_id IS NOT NULL AND ciclo_atual = 1 AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lms_matricula_ciclos_legado_unico
  ON lms_matricula_ciclos(historico_importado_id)
  WHERE historico_importado_id IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE qualificacoes_historico
ADD COLUMN lms_matricula_ciclo_id INTEGER REFERENCES lms_matricula_ciclos(id);

ALTER TABLE lms_historico_importado
ADD COLUMN lms_matricula_ciclo_id INTEGER REFERENCES lms_matricula_ciclos(id);

CREATE INDEX IF NOT EXISTS idx_qual_historico_lms_matricula_ciclo
  ON qualificacoes_historico(lms_matricula_ciclo_id)
  WHERE lms_matricula_ciclo_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lms_historico_importado_ciclo
  ON lms_historico_importado(lms_matricula_ciclo_id)
  WHERE lms_matricula_ciclo_id IS NOT NULL AND deleted_at IS NULL;

INSERT INTO lms_matricula_ciclos (
  empresa_id,
  matricula_id,
  historico_importado_id,
  curso_id,
  funcionario_id,
  numero_ciclo,
  origem,
  status,
  ciclo_atual,
  observacoes,
  data_matricula,
  data_inicio,
  data_conclusao,
  data_expiracao,
  progresso_pct,
  score_final,
  tentativas,
  qualificacao_historico_id,
  created_at,
  updated_at,
  deleted_at
)
SELECT
  m.empresa_id,
  m.id,
  NULL,
  m.curso_id,
  m.funcionario_id,
  1,
  'LMS',
  COALESCE(NULLIF(TRIM(m.status), ''), 'NAO_INICIADO'),
  CASE WHEN m.deleted_at IS NULL THEN 1 ELSE 0 END,
  m.observacoes,
  m.data_matricula,
  m.data_inicio,
  m.data_conclusao,
  m.data_expiracao,
  COALESCE(m.progresso_pct, 0),
  m.score_final,
  COALESCE(m.tentativas, 0),
  m.qualificacao_historico_id,
  COALESCE(m.created_at, datetime('now')),
  COALESCE(m.updated_at, datetime('now')),
  m.deleted_at
FROM lms_matriculas m
WHERE NOT EXISTS (
  SELECT 1
  FROM lms_matricula_ciclos c
  WHERE c.matricula_id = m.id
    AND c.deleted_at IS NULL
);

INSERT INTO lms_matricula_ciclos (
  empresa_id,
  matricula_id,
  historico_importado_id,
  curso_id,
  funcionario_id,
  numero_ciclo,
  origem,
  status,
  ciclo_atual,
  observacoes,
  data_matricula,
  data_inicio,
  data_conclusao,
  data_expiracao,
  progresso_pct,
  score_final,
  tentativas,
  qualificacao_historico_id,
  created_at,
  updated_at,
  deleted_at
)
SELECT
  h.empresa_id,
  NULL,
  h.id,
  h.curso_id,
  h.funcionario_id,
  1,
  'IMPORTADO_EDAPP',
  COALESCE(NULLIF(TRIM(h.status), ''), 'CONCLUIDO'),
  0,
  'Histórico legado importado do EdApp',
  COALESCE(h.data_conclusao, h.completed_at, h.created_at),
  NULL,
  COALESCE(h.data_conclusao, h.completed_at),
  NULL,
  COALESCE(h.progresso_pct, 100),
  h.score_final,
  1,
  h.qualificacao_historico_id,
  COALESCE(h.created_at, datetime('now')),
  COALESCE(h.updated_at, datetime('now')),
  h.deleted_at
FROM lms_historico_importado h
WHERE h.deleted_at IS NULL
  AND h.funcionario_id IS NOT NULL
  AND h.curso_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM lms_matricula_ciclos c
    WHERE c.historico_importado_id = h.id
      AND c.deleted_at IS NULL
  );

UPDATE qualificacoes_historico
SET lms_matricula_ciclo_id = (
  SELECT c.id
  FROM lms_matricula_ciclos c
  WHERE c.qualificacao_historico_id = qualificacoes_historico.id
    AND c.deleted_at IS NULL
  ORDER BY c.ciclo_atual DESC, c.id DESC
  LIMIT 1
)
WHERE lms_matricula_ciclo_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM lms_matricula_ciclos c
    WHERE c.qualificacao_historico_id = qualificacoes_historico.id
      AND c.deleted_at IS NULL
  );

UPDATE lms_historico_importado
SET lms_matricula_ciclo_id = (
  SELECT c.id
  FROM lms_matricula_ciclos c
  WHERE c.historico_importado_id = lms_historico_importado.id
    AND c.deleted_at IS NULL
  LIMIT 1
)
WHERE lms_matricula_ciclo_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM lms_matricula_ciclos c
    WHERE c.historico_importado_id = lms_historico_importado.id
      AND c.deleted_at IS NULL
  );