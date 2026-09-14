-- 0491_training_compliance_requirements.sql
-- Canonical training-compliance requirement matrix.
-- Additive only: preserves matriz_treinamento_funcao as legacy evidence and backfills active rules.

CREATE TABLE IF NOT EXISTS treinamento_requisitos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  qualificacao_tipo_id INTEGER NOT NULL,
  escopo TEXT NOT NULL DEFAULT 'FUNCAO'
    CHECK (escopo IN ('EMPRESA', 'SETOR', 'FUNCAO', 'SETOR_FUNCAO', 'FUNCIONARIO')),
  setor_id INTEGER,
  funcao_id INTEGER,
  funcionario_id INTEGER,
  obrigatoriedade TEXT NOT NULL DEFAULT 'OBRIGATORIA'
    CHECK (obrigatoriedade IN ('OBRIGATORIA', 'RECOMENDADA', 'NAO_APLICA')),
  nivel_requerido INTEGER,
  critico_operacional INTEGER NOT NULL DEFAULT 0 CHECK (critico_operacional IN (0, 1)),
  origem TEXT NOT NULL DEFAULT 'REGULATORIO'
    CHECK (origem IN ('REGULATORIO', 'PTO', 'MANUAL', 'SGSO', 'RH', 'CLIENTE', 'EMPRESA', 'OUTRO')),
  referencia_normativa TEXT,
  observacoes TEXT,
  vigencia_inicio TEXT,
  vigencia_fim TEXT,
  prazo_inicial_dias INTEGER CHECK (prazo_inicial_dias IS NULL OR prazo_inicial_dias >= 0),
  auto_matricular_ead INTEGER NOT NULL DEFAULT 0 CHECK (auto_matricular_ead IN (0, 1)),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (qualificacao_tipo_id) REFERENCES qualificacoes_tipos(id),
  FOREIGN KEY (setor_id) REFERENCES setores(id),
  FOREIGN KEY (funcao_id) REFERENCES funcoes(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  CHECK (
    (escopo = 'EMPRESA' AND setor_id IS NULL AND funcao_id IS NULL AND funcionario_id IS NULL) OR
    (escopo = 'SETOR' AND setor_id IS NOT NULL AND funcao_id IS NULL AND funcionario_id IS NULL) OR
    (escopo = 'FUNCAO' AND setor_id IS NULL AND funcao_id IS NOT NULL AND funcionario_id IS NULL) OR
    (escopo = 'SETOR_FUNCAO' AND setor_id IS NOT NULL AND funcao_id IS NOT NULL AND funcionario_id IS NULL) OR
    (escopo = 'FUNCIONARIO' AND setor_id IS NULL AND funcao_id IS NULL AND funcionario_id IS NOT NULL)
  ),
  CHECK (vigencia_fim IS NULL OR vigencia_inicio IS NULL OR date(vigencia_fim) >= date(vigencia_inicio))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_treinamento_requisitos_unique_active
  ON treinamento_requisitos (
    empresa_id,
    qualificacao_tipo_id,
    escopo,
    COALESCE(setor_id, 0),
    COALESCE(funcao_id, 0),
    COALESCE(funcionario_id, 0)
  )
  WHERE ativo = 1 AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_treinamento_requisitos_empresa_escopo
  ON treinamento_requisitos (empresa_id, escopo, setor_id, funcao_id, funcionario_id)
  WHERE ativo = 1 AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_treinamento_requisitos_empresa_tipo
  ON treinamento_requisitos (empresa_id, qualificacao_tipo_id)
  WHERE ativo = 1 AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_treinamento_requisitos_vigencia
  ON treinamento_requisitos (empresa_id, vigencia_inicio, vigencia_fim)
  WHERE ativo = 1 AND deleted_at IS NULL;

CREATE TRIGGER IF NOT EXISTS trg_treinamento_requisitos_tenant_insert
BEFORE INSERT ON treinamento_requisitos
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM qualificacoes_tipos qt WHERE qt.id = NEW.qualificacao_tipo_id AND qt.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'treinamento_requisitos: qualificacao fora do tenant') END;
  SELECT CASE WHEN NEW.setor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM setores s WHERE s.id = NEW.setor_id AND s.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'treinamento_requisitos: setor fora do tenant') END;
  SELECT CASE WHEN NEW.funcao_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM funcoes f WHERE f.id = NEW.funcao_id AND f.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'treinamento_requisitos: funcao fora do tenant') END;
  SELECT CASE WHEN NEW.funcionario_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM funcionarios f WHERE f.id = NEW.funcionario_id AND f.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'treinamento_requisitos: funcionario fora do tenant') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_treinamento_requisitos_tenant_update
BEFORE UPDATE OF empresa_id, qualificacao_tipo_id, setor_id, funcao_id, funcionario_id ON treinamento_requisitos
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM qualificacoes_tipos qt WHERE qt.id = NEW.qualificacao_tipo_id AND qt.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'treinamento_requisitos: qualificacao fora do tenant') END;
  SELECT CASE WHEN NEW.setor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM setores s WHERE s.id = NEW.setor_id AND s.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'treinamento_requisitos: setor fora do tenant') END;
  SELECT CASE WHEN NEW.funcao_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM funcoes f WHERE f.id = NEW.funcao_id AND f.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'treinamento_requisitos: funcao fora do tenant') END;
  SELECT CASE WHEN NEW.funcionario_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM funcionarios f WHERE f.id = NEW.funcionario_id AND f.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'treinamento_requisitos: funcionario fora do tenant') END;
END;

INSERT OR IGNORE INTO treinamento_requisitos (
  empresa_id,
  qualificacao_tipo_id,
  escopo,
  funcao_id,
  obrigatoriedade,
  nivel_requerido,
  critico_operacional,
  origem,
  observacoes,
  ativo,
  created_at,
  updated_at
)
SELECT
  empresa_id,
  qualificacao_tipo_id,
  'FUNCAO',
  funcao_id,
  obrigatoriedade,
  nivel_requerido,
  critico_operacional,
  CASE
    WHEN origem IN ('REGULATORIO', 'SGSO', 'RH', 'CLIENTE', 'OUTRO') THEN origem
    ELSE 'OUTRO'
  END,
  observacoes,
  ativo,
  created_at,
  updated_at
FROM matriz_treinamento_funcao
WHERE deleted_at IS NULL
  AND ativo = 1;
