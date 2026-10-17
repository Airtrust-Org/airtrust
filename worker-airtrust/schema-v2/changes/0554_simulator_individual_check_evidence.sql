-- Schema V2 0554 — explicit per-ficha, per-employee simulator check evidence.
-- Additive schema only. No history backfill, no synthetic approval and no
-- changes to sessoes_checks_resultados (legacy session-wide outcomes).
-- Worker/Pages adoption must follow governed migration and independent tests.

CREATE TABLE IF NOT EXISTS sessoes_checks_resultados_individuais (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  sessao_check_id INTEGER NOT NULL,
  ficha_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  avaliador_funcionario_id INTEGER NOT NULL,
  aprovado INTEGER CHECK (aprovado IN (0, 1) OR aprovado IS NULL),
  estado TEXT NOT NULL DEFAULT 'RASCUNHO'
    CHECK (estado IN ('RASCUNHO', 'CONFIRMADO', 'ANULADO')),
  observacoes TEXT,
  origem TEXT NOT NULL DEFAULT 'FICHA_SIMULADOR_CHECK_INDIVIDUAL'
    CHECK (origem = 'FICHA_SIMULADOR_CHECK_INDIVIDUAL'),
  revisao_numero INTEGER NOT NULL DEFAULT 1 CHECK (revisao_numero >= 1),
  revisao_de_id INTEGER,
  registrado_em TEXT NOT NULL DEFAULT (datetime('now')),
  confirmado_em TEXT,
  confirmado_por_usuario_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (sessao_check_id) REFERENCES sessoes_checks(id),
  FOREIGN KEY (ficha_id) REFERENCES fichas_sessao(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (avaliador_funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (revisao_de_id) REFERENCES sessoes_checks_resultados_individuais(id),
  CHECK (estado <> 'CONFIRMADO' OR
         (aprovado IS NOT NULL AND confirmado_em IS NOT NULL AND
          confirmado_por_usuario_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_checks_individuais_ativos
  ON sessoes_checks_resultados_individuais(empresa_id, ficha_id, sessao_check_id)
  WHERE deleted_at IS NULL AND estado <> 'ANULADO';

CREATE INDEX IF NOT EXISTS idx_checks_individuais_funcionario
  ON sessoes_checks_resultados_individuais(empresa_id, funcionario_id, estado, deleted_at);

CREATE INDEX IF NOT EXISTS idx_checks_individuais_check
  ON sessoes_checks_resultados_individuais(empresa_id, sessao_check_id, estado, deleted_at);

-- A result must belong to the same tenant, session, fiche and employee.
-- Merely providing a valid ID for each table is not sufficient.
CREATE TRIGGER IF NOT EXISTS trg_checks_individuais_scope_insert
BEFORE INSERT ON sessoes_checks_resultados_individuais
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM fichas_sessao fs
      JOIN simulador_agendamentos sa
        ON sa.id = fs.agendamento_slot_id
       AND sa.empresa_id = fs.empresa_id
       AND sa.deleted_at IS NULL
      JOIN sessoes_checks sc
        ON sc.sessao_id = sa.id AND sc.deleted_at IS NULL
      JOIN funcionarios aluno
        ON aluno.id = fs.colaborador_id_aluno
       AND aluno.empresa_id = fs.empresa_id
       AND aluno.deleted_at IS NULL
      JOIN funcionarios avaliador
        ON avaliador.id = NEW.avaliador_funcionario_id
       AND avaliador.empresa_id = fs.empresa_id
       AND avaliador.deleted_at IS NULL
     WHERE fs.id = NEW.ficha_id
       AND fs.empresa_id = NEW.empresa_id
       AND fs.deleted_at IS NULL
       AND fs.colaborador_id_aluno = NEW.funcionario_id
       AND sc.id = NEW.sessao_check_id
       AND (avaliador.id = fs.instrutor_id OR avaliador.id = sa.examinador_id)
  ) THEN RAISE(ABORT, 'INDIVIDUAL_CHECK_SCOPE_INVALID') END;
END;

-- Prevent swapping a proven identity onto a different employee or check.
CREATE TRIGGER IF NOT EXISTS trg_checks_individuais_immutable_scope
BEFORE UPDATE OF empresa_id, ficha_id, sessao_check_id, funcionario_id,
                 avaliador_funcionario_id, origem
ON sessoes_checks_resultados_individuais
BEGIN
  SELECT RAISE(ABORT, 'INDIVIDUAL_CHECK_SCOPE_IMMUTABLE');
END;

-- Confirmed evidence requires an actual instructor-signed individual fiche;
-- a group/session approval can never stand in for the signature.
CREATE TRIGGER IF NOT EXISTS trg_checks_individuais_confirm_insert
BEFORE INSERT ON sessoes_checks_resultados_individuais
WHEN NEW.estado = 'CONFIRMADO'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM fichas_sessao fs
     WHERE fs.id = NEW.ficha_id AND fs.empresa_id = NEW.empresa_id
       AND fs.colaborador_id_aluno = NEW.funcionario_id
       AND fs.deleted_at IS NULL
       AND fs.assinatura_aluno_timestamp IS NOT NULL
       AND fs.assinatura_instrutor_timestamp IS NOT NULL
       AND fs.status IN ('APROVADO','NAO_APROVADO','CONCLUIDA')
       AND fs.aprovado IN (0, 1)
  ) THEN RAISE(ABORT, 'INDIVIDUAL_CHECK_FICHE_NOT_SIGNED') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_checks_individuais_confirm_update
BEFORE UPDATE OF estado ON sessoes_checks_resultados_individuais
WHEN NEW.estado = 'CONFIRMADO'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM fichas_sessao fs
     WHERE fs.id = NEW.ficha_id AND fs.empresa_id = NEW.empresa_id
       AND fs.colaborador_id_aluno = NEW.funcionario_id
       AND fs.deleted_at IS NULL
       AND fs.assinatura_aluno_timestamp IS NOT NULL
       AND fs.assinatura_instrutor_timestamp IS NOT NULL
       AND fs.status IN ('APROVADO','NAO_APROVADO','CONCLUIDA')
       AND fs.aprovado IN (0, 1)
  ) THEN RAISE(ABORT, 'INDIVIDUAL_CHECK_FICHE_NOT_SIGNED') END;
END;

-- Annulled records cannot be resurrected into approvals or reassigned.
-- A new independently signed fiche is required for a reevaluation.
CREATE TRIGGER IF NOT EXISTS trg_checks_individuais_annulled_immutable
BEFORE UPDATE ON sessoes_checks_resultados_individuais
WHEN OLD.estado = 'ANULADO'
BEGIN
  SELECT RAISE(ABORT, 'INDIVIDUAL_CHECK_ANNULLED_IMMUTABLE');
END;

-- Confirmed rows are immutable evidence. Re-evaluation requires a new fiche,
-- never rewriting the original approval, failure or signature provenance.
CREATE TRIGGER IF NOT EXISTS trg_checks_individuais_confirmed_immutable
BEFORE UPDATE ON sessoes_checks_resultados_individuais
WHEN OLD.estado = 'CONFIRMADO'
BEGIN
  SELECT RAISE(ABORT, 'INDIVIDUAL_CHECK_CONFIRMED_IMMUTABLE');
END;
