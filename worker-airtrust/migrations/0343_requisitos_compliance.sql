-- Migration: 0343_requisitos_compliance
-- Bloco 1.1: Cria tabela de requisitos de compliance por função
-- Esta tabela foi referenciada pelo código de compliance.ts mas nunca existiu em produção.
-- O motor de compliance retornava 'conforme' para todos os funcionários sem verificar nada real.

CREATE TABLE IF NOT EXISTS requisitos_compliance (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id  INTEGER NOT NULL,
  funcao      TEXT    NOT NULL, -- ex: 'Comandante', 'Copiloto', 'Comissário'
  tipo_recurso TEXT   NOT NULL  -- 'qualificacao' | 'licenca' | 'curso_lms'
    CHECK(tipo_recurso IN ('qualificacao', 'licenca', 'curso_lms')),
  referencia  TEXT    NOT NULL, -- qualificacao_codigo, licenca.tipo ou lms_curso_id (para curso_lms)
  descricao   TEXT,
  obrigatorio INTEGER DEFAULT 1 NOT NULL CHECK(obrigatorio IN (0, 1)),
  deleted_at  TEXT,
  created_at  TEXT    DEFAULT (datetime('now')),
  updated_at  TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_requisitos_compliance_empresa_funcao
  ON requisitos_compliance(empresa_id, funcao)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_requisitos_compliance_empresa_tipo
  ON requisitos_compliance(empresa_id, tipo_recurso, referencia)
  WHERE deleted_at IS NULL;
