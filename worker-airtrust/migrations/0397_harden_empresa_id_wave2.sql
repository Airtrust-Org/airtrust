-- Wave 2: harden empresa_id on qualificacoes_historico, fichas_sessao, certificados
-- Scope:
--   1. qualificacoes_historico -> remove DEFAULT 1, enforce NOT NULL with deterministic backfill
--   2. fichas_sessao          -> enforce NOT NULL with deterministic backfill
--   3. certificados           -> add empresa_id NOT NULL with deterministic backfill
-- Risk: ALTO — table rebuilds with PRAGMA foreign_keys = OFF
-- Preconditions:
--   - Full production backup confirmed
--   - Apply only together with runtime that writes empresa_id explicitly on fichas_sessao
-- Safety model:
--   - If any row cannot resolve empresa_id deterministically, INSERT into *_new fails via NOT NULL

PRAGMA foreign_keys = OFF;

-- ===========================================================================
-- 1. qualificacoes_historico
-- Deterministic resolution order:
--   funcionario.empresa_id
--   -> simulador_agendamentos.empresa_id
--   -> qualificacoes_tipos.empresa_id
--   -> existing qh.empresa_id when already explicit and != 1
-- Any unresolved row must fail the migration instead of silently keeping DEFAULT 1.
-- ===========================================================================

DROP TRIGGER IF EXISTS trg_apply_reclassification;
DROP VIEW IF EXISTS fichas_simulador;
DROP VIEW IF EXISTS qualificacoes_historico_v;
DROP VIEW IF EXISTS vw_tripulante_operacional;

CREATE TABLE qualificacoes_historico_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER,
  qualificacao_id INTEGER,
  tipo_codigo TEXT,
  codigo TEXT,
  categoria TEXT,
  validade TEXT,
  numero_certificado TEXT,
  observacoes TEXT,
  arquivo_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  data_conclusao TEXT,
  validade_meses INTEGER,
  instrutor TEXT,
  nota REAL,
  carga_horaria REAL,
  data_vencimento TEXT,
  renovada INTEGER DEFAULT 0,
  certificado_arquivo_id INTEGER,
  funcionario_cpf TEXT,
  qualificacao_codigo TEXT,
  empresa_id INTEGER NOT NULL,
  status TEXT,
  tipo_check_id INTEGER,
  sessao_id INTEGER,
  tipo TEXT,
  data_confirmacao TEXT,
  confirmada_por INTEGER,
  tipo_treinamento TEXT CHECK(tipo_treinamento IN ('INICIAL', 'RECORRENTE', 'SEMESTRAL', 'UPGRADE', 'ESPECIFICO')),
  renovacao_de INTEGER DEFAULT NULL,
  lms_matricula_id INTEGER REFERENCES lms_matriculas(id),
  origem_tipo TEXT CHECK(origem_tipo IS NULL OR origem_tipo IN ('LMS', 'PRESENCIAL', 'SIMULADOR', 'IMPORTADO_EDAPP', 'MANUAL')),
  lms_matricula_ciclo_id INTEGER REFERENCES lms_matricula_ciclos(id)
);

INSERT INTO qualificacoes_historico_new (
  id,
  funcionario_id,
  qualificacao_id,
  tipo_codigo,
  codigo,
  categoria,
  validade,
  numero_certificado,
  observacoes,
  arquivo_url,
  created_at,
  updated_at,
  deleted_at,
  data_conclusao,
  validade_meses,
  instrutor,
  nota,
  carga_horaria,
  data_vencimento,
  renovada,
  certificado_arquivo_id,
  funcionario_cpf,
  qualificacao_codigo,
  empresa_id,
  status,
  tipo_check_id,
  sessao_id,
  tipo,
  data_confirmacao,
  confirmada_por,
  tipo_treinamento,
  renovacao_de,
  lms_matricula_id,
  origem_tipo,
  lms_matricula_ciclo_id
)
SELECT
  qh.id,
  qh.funcionario_id,
  qh.qualificacao_id,
  qh.tipo_codigo,
  qh.codigo,
  qh.categoria,
  qh.validade,
  qh.numero_certificado,
  qh.observacoes,
  qh.arquivo_url,
  qh.created_at,
  qh.updated_at,
  qh.deleted_at,
  qh.data_conclusao,
  qh.validade_meses,
  qh.instrutor,
  qh.nota,
  qh.carga_horaria,
  qh.data_vencimento,
  qh.renovada,
  qh.certificado_arquivo_id,
  qh.funcionario_cpf,
  qh.qualificacao_codigo,
  CASE
    WHEN qh_func.empresa_id IS NOT NULL THEN qh_func.empresa_id
    WHEN qh_sessao.empresa_id IS NOT NULL THEN qh_sessao.empresa_id
    WHEN qh_tipo.empresa_id IS NOT NULL THEN qh_tipo.empresa_id
    WHEN qh.empresa_id IS NOT NULL AND qh.empresa_id <> 1 THEN qh.empresa_id
    ELSE NULL
  END AS empresa_id,
  qh.status,
  qh.tipo_check_id,
  qh.sessao_id,
  qh.tipo,
  qh.data_confirmacao,
  qh.confirmada_por,
  qh.tipo_treinamento,
  qh.renovacao_de,
  qh.lms_matricula_id,
  qh.origem_tipo,
  qh.lms_matricula_ciclo_id
FROM qualificacoes_historico qh
LEFT JOIN funcionarios qh_func
  ON qh_func.id = qh.funcionario_id
 AND qh_func.deleted_at IS NULL
LEFT JOIN simulador_agendamentos qh_sessao
  ON qh_sessao.id = qh.sessao_id
 AND qh_sessao.deleted_at IS NULL
LEFT JOIN qualificacoes_tipos qh_tipo
  ON qh_tipo.id = qh.qualificacao_id
 AND qh_tipo.deleted_at IS NULL;

DROP TABLE qualificacoes_historico;
ALTER TABLE qualificacoes_historico_new RENAME TO qualificacoes_historico;

CREATE INDEX idx_qh_renovacao_de ON qualificacoes_historico(renovacao_de) WHERE renovacao_de IS NOT NULL;
CREATE INDEX idx_qual_historico_lms_matricula
  ON qualificacoes_historico(lms_matricula_id)
  WHERE lms_matricula_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_qual_historico_lms_matricula_ciclo
  ON qualificacoes_historico(lms_matricula_ciclo_id)
  WHERE lms_matricula_ciclo_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_qual_historico_origem_tipo
  ON qualificacoes_historico(origem_tipo, empresa_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_hist_data_conclusao ON qualificacoes_historico(data_conclusao) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_hist_data_vencimento ON qualificacoes_historico(data_vencimento) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_historico_empresa_deleted
  ON qualificacoes_historico (empresa_id, deleted_at);
CREATE INDEX idx_qualificacoes_historico_empresa_funcionario ON qualificacoes_historico (empresa_id, funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_historico_empresa_id ON qualificacoes_historico (empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_historico_sessao ON qualificacoes_historico(sessao_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_historico_status ON qualificacoes_historico(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_historico_tipo ON qualificacoes_historico(tipo);
CREATE UNIQUE INDEX idx_qualificacoes_historico_unique_active ON qualificacoes_historico(funcionario_id, qualificacao_codigo, data_conclusao) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_calc_vencimento_insert
AFTER INSERT ON qualificacoes_historico
FOR EACH ROW
WHEN NEW.validade_meses IS NOT NULL
  AND NEW.validade_meses > 0
  AND NEW.data_conclusao IS NOT NULL
  AND NEW.data_vencimento IS NULL
BEGIN
  UPDATE qualificacoes_historico
    SET data_vencimento = date(NEW.data_conclusao, '+' || NEW.validade_meses || ' months')
    WHERE id = NEW.id;
END;

CREATE TRIGGER trg_qualificacoes_historico_set_tipo
AFTER INSERT ON qualificacoes_historico
WHEN NEW.tipo IS NULL AND NEW.qualificacao_id IS NOT NULL
BEGIN
  UPDATE qualificacoes_historico
  SET tipo = (
    SELECT nome FROM qualificacoes_tipos
    WHERE id = NEW.qualificacao_id
    LIMIT 1
  )
  WHERE id = NEW.id;
END;

CREATE TRIGGER trg_qualificacoes_historico_update_tipo
AFTER UPDATE OF qualificacao_id ON qualificacoes_historico
WHEN NEW.qualificacao_id IS NOT NULL
  AND (OLD.qualificacao_id IS NULL OR OLD.qualificacao_id != NEW.qualificacao_id)
BEGIN
  UPDATE qualificacoes_historico
  SET tipo = (
    SELECT nome FROM qualificacoes_tipos
    WHERE id = NEW.qualificacao_id
    LIMIT 1
  )
  WHERE id = NEW.id;
END;

CREATE VIEW qualificacoes_historico_v AS
SELECT
  qh.id,
  qh.funcionario_id,
  qh.qualificacao_id,
  qh.data_conclusao,
  qh.data_vencimento,
  qh.numero_certificado,
  qh.arquivo_url AS certificado_url,
  qh.nota,
  qh.instrutor,
  qh.observacoes,
  COALESCE(qt.nome, qh.tipo_codigo, qh.codigo) AS qualificacao_nome,
  COALESCE(qt.codigo, qh.codigo) AS qualificacao_codigo,
  COALESCE(qt.categoria, qh.categoria) AS qualificacao_categoria,
  qt.validade AS qualificacao_validade_meses,
  f.nome AS funcionario_nome,
  f.matricula AS funcionario_matricula,
  f.cargo AS funcionario_cargo,
  f.email AS funcionario_email,
  f.codigo_anac AS funcionario_codigo_anac,
  CASE
    WHEN qh.data_vencimento IS NULL THEN 'INDETERMINADA'
    WHEN julianday(qh.data_vencimento) < julianday('now') THEN 'VENCIDA'
    WHEN julianday(qh.data_vencimento) - julianday('now') <= 30 THEN 'PROXIMA_VENCIMENTO'
    WHEN julianday(qh.data_vencimento) - julianday('now') <= 90 THEN 'ATENCAO'
    ELSE 'VALIDA'
  END AS status,
  CAST(julianday(qh.data_vencimento) - julianday('now') AS INTEGER) AS dias_ate_vencimento,
  qh.created_at,
  qh.updated_at,
  qh.deleted_at
FROM qualificacoes_historico qh
LEFT JOIN qualificacoes_tipos qt ON CAST(qt.id AS TEXT) = CAST(qh.qualificacao_id AS TEXT) AND qt.deleted_at IS NULL
LEFT JOIN funcionarios f ON CAST(f.id AS TEXT) = CAST(qh.funcionario_id AS TEXT) AND f.deleted_at IS NULL
WHERE qh.deleted_at IS NULL;

CREATE VIEW vw_tripulante_operacional AS
SELECT
  f.id AS funcionario_id,
  f.nome,
  COALESCE(NULLIF(TRIM(f.guerra), ''), NULL) AS nome_guerra,
  COALESCE(NULLIF(TRIM(f.matricula), ''), CAST(f.id AS TEXT)) AS matricula,
  f.empresa_id,
  COALESCE(NULLIF(TRIM(f.funcao), ''), NULLIF(TRIM(f.cargo), ''), 'tripulante') AS role,
  COALESCE(f.modelo_aeronave_id, '') AS modelo_aeronave_id,
  COALESCE(f.aeronave, '') AS aeronave_legacy,
  CASE WHEN EXISTS (
    SELECT 1 FROM qualificacoes_historico qh
    LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
    WHERE qh.funcionario_id = f.id AND qh.deleted_at IS NULL
      AND COALESCE(qh.status, 'CONCLUIDA') != 'CANCELADA'
      AND UPPER(COALESCE(qh.qualificacao_codigo, qt.codigo, '')) = 'CMA'
      AND COALESCE(qh.data_vencimento, date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses, qt.validade, 12) || ' months')) >= date('now')
  ) THEN 1 ELSE 0 END AS cma_valido,
  CAST((JULIANDAY((
    SELECT MAX(COALESCE(qh2.data_vencimento, date(qh2.data_conclusao, '+' || COALESCE(qh2.validade_meses, qt2.validade, 12) || ' months')))
    FROM qualificacoes_historico qh2
    LEFT JOIN qualificacoes_tipos qt2 ON qt2.id = qh2.qualificacao_id AND qt2.deleted_at IS NULL
    WHERE qh2.funcionario_id = f.id AND qh2.deleted_at IS NULL
      AND COALESCE(qh2.status, 'CONCLUIDA') != 'CANCELADA'
      AND UPPER(COALESCE(qh2.qualificacao_codigo, qt2.codigo, '')) = 'CMA'
  )) - JULIANDAY('now')) AS INTEGER) AS cma_dias_restantes,
  (SELECT MAX(COALESCE(qh3.data_vencimento, date(qh3.data_conclusao, '+' || COALESCE(qh3.validade_meses, qt3.validade, 12) || ' months')))
    FROM qualificacoes_historico qh3
    LEFT JOIN qualificacoes_tipos qt3 ON qt3.id = qh3.qualificacao_id AND qt3.deleted_at IS NULL
    WHERE qh3.funcionario_id = f.id AND qh3.deleted_at IS NULL
      AND COALESCE(qh3.status, 'CONCLUIDA') != 'CANCELADA'
      AND UPPER(COALESCE(qh3.qualificacao_codigo, qt3.codigo, '')) = 'CMA'
  ) AS cma_validade_fim,
  (WITH base AS (
    SELECT
      COALESCE(SUM(CASE WHEN date(data) >= date('now', '-7 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_7,
      COALESCE(SUM(CASE WHEN date(data) >= date('now', '-28 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_28,
      COUNT(DISTINCT CASE WHEN date(data) >= date('now', '-28 days') THEN date(data) END) AS dias_28
    FROM frms_jornada WHERE tripulante_id = f.id AND deleted_at IS NULL
  ) SELECT MIN(100, ROUND((minutos_7 / 60.0) * 2.5 + (minutos_28 / 60.0) * 0.8 + dias_28 * 1.1)) FROM base) AS frms_score,
  CASE
    WHEN EXISTS (SELECT 1 FROM frms_alerta fa WHERE fa.tripulante_id = f.id AND fa.deleted_at IS NULL AND COALESCE(fa.resolvido, 0) = 0 AND fa.nivel IN ('CRITICO', 'VIOLACAO')) THEN 'critico'
    WHEN (WITH base AS (
      SELECT
        COALESCE(SUM(CASE WHEN date(data) >= date('now', '-7 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_7,
        COALESCE(SUM(CASE WHEN date(data) >= date('now', '-28 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_28,
        COUNT(DISTINCT CASE WHEN date(data) >= date('now', '-28 days') THEN date(data) END) AS dias_28
      FROM frms_jornada WHERE tripulante_id = f.id AND deleted_at IS NULL
    ) SELECT MIN(100, ROUND((minutos_7 / 60.0) * 2.5 + (minutos_28 / 60.0) * 0.8 + dias_28 * 1.1)) FROM base) >= 45 THEN 'atencao'
    ELSE 'ok'
  END AS frms_status,
  (SELECT MAX(created_at) FROM frms_jornada fj WHERE fj.tripulante_id = f.id AND fj.deleted_at IS NULL) AS frms_avaliacao_data,
  (SELECT COUNT(*) FROM sessoes_participantes sp JOIN simulador_agendamentos sa ON sa.id = sp.sessao_id
    WHERE sp.funcionario_id = f.id AND sp.deleted_at IS NULL AND sa.deleted_at IS NULL
      AND UPPER(COALESCE(sa.status, 'AGENDADA')) NOT IN ('CONCLUIDA', 'CANCELADA') AND date(sa.data) >= date('now')
  ) AS simuladores_pendentes,
  (SELECT MIN(sa2.data) FROM sessoes_participantes sp2 JOIN simulador_agendamentos sa2 ON sa2.id = sp2.sessao_id
    WHERE sp2.funcionario_id = f.id AND sp2.deleted_at IS NULL AND sa2.deleted_at IS NULL
      AND UPPER(COALESCE(sa2.status, 'AGENDADA')) NOT IN ('CONCLUIDA', 'CANCELADA') AND date(sa2.data) >= date('now')
  ) AS proximo_simulador_data,
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM qualificacoes_historico qh4
      LEFT JOIN qualificacoes_tipos qt4 ON qt4.id = qh4.qualificacao_id AND qt4.deleted_at IS NULL
      WHERE qh4.funcionario_id = f.id AND qh4.deleted_at IS NULL AND COALESCE(qh4.status, 'CONCLUIDA') != 'CANCELADA'
        AND UPPER(COALESCE(qh4.qualificacao_codigo, qt4.codigo, '')) = 'CMA'
        AND COALESCE(qh4.data_vencimento, date(qh4.data_conclusao, '+' || COALESCE(qh4.validade_meses, qt4.validade, 12) || ' months')) >= date('now')
    ) THEN 'BLOQUEADO_CMA'
    WHEN EXISTS (SELECT 1 FROM frms_alerta fa2 WHERE fa2.tripulante_id = f.id AND fa2.deleted_at IS NULL AND COALESCE(fa2.resolvido, 0) = 0 AND fa2.nivel IN ('CRITICO', 'VIOLACAO')) THEN 'BLOQUEADO_FRMS'
    WHEN CAST((JULIANDAY((
      SELECT MAX(COALESCE(qh5.data_vencimento, date(qh5.data_conclusao, '+' || COALESCE(qh5.validade_meses, qt5.validade, 12) || ' months')))
      FROM qualificacoes_historico qh5
      LEFT JOIN qualificacoes_tipos qt5 ON qt5.id = qh5.qualificacao_id AND qt5.deleted_at IS NULL
      WHERE qh5.funcionario_id = f.id AND qh5.deleted_at IS NULL AND COALESCE(qh5.status, 'CONCLUIDA') != 'CANCELADA'
        AND UPPER(COALESCE(qh5.qualificacao_codigo, qt5.codigo, '')) = 'CMA'
    )) - JULIANDAY('now')) AS INTEGER) <= 30 THEN 'ATENCAO_CMA'
    WHEN EXISTS (SELECT 1 FROM frms_alerta fa3 WHERE fa3.tripulante_id = f.id AND fa3.deleted_at IS NULL AND COALESCE(fa3.resolvido, 0) = 0 AND fa3.nivel = 'ATENCAO') THEN 'ATENCAO_FRMS'
    ELSE 'APTO'
  END AS status_operacional
FROM funcionarios f
WHERE f.deleted_at IS NULL AND COALESCE(f.ativo, 1) = 1;

CREATE TRIGGER trg_apply_reclassification
AFTER UPDATE ON qualificacoes_historico_reclass_queue
WHEN NEW.status = 'APPLIED' AND NEW.target_tipo_id IS NOT NULL
BEGIN
  UPDATE qualificacoes_historico
  SET qualificacao_id = NEW.target_tipo_id,
      codigo = (SELECT codigo FROM qualificacoes_tipos WHERE id = NEW.target_tipo_id),
      tipo_codigo = (SELECT codigo FROM qualificacoes_tipos WHERE id = NEW.target_tipo_id),
      categoria = (SELECT categoria FROM qualificacoes_tipos WHERE id = NEW.target_tipo_id),
      updated_at = datetime('now')
  WHERE id = NEW.historico_id;
  INSERT INTO _data_recovery_log(etapa, detalhes)
  VALUES ('APPLY_RECLASS', 'historico_id=' || NEW.historico_id || ' -> tipo_id=' || NEW.target_tipo_id);
END;

-- ===========================================================================
-- 2. fichas_sessao
-- Deterministic resolution order:
--   simulador_agendamentos.empresa_id
--   -> aluno.empresa_id
--   -> instrutor.empresa_id
--   -> existing fs.empresa_id when already present
-- ===========================================================================

CREATE TABLE fichas_sessao_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  agendamento_slot_id INTEGER,
  colaborador_id_aluno INTEGER NOT NULL,
  funcao_na_sessao TEXT DEFAULT 'PF',
  template_id INTEGER,
  instrutor_id INTEGER NOT NULL,
  instrutor_codigo_anac TEXT,
  carga_horaria_total DECIMAL(4,2) DEFAULT 2.0,
  carga_horaria_pf DECIMAL(4,2),
  carga_horaria_pm DECIMAL(4,2),
  tempo_acumulado DECIMAL(5,2) DEFAULT 0,
  status TEXT DEFAULT 'PENDENTE',
  resultado_final TEXT DEFAULT 'PENDENTE',
  nota_final REAL,
  nota_minima REAL,
  aprovado BOOLEAN DEFAULT 0,
  aluno_nome_validado TEXT,
  aluno_matricula_validado TEXT,
  observacoes TEXT,
  feedback_instrutor TEXT,
  pontos_fortes TEXT,
  pontos_melhoria TEXT,
  assinado BOOLEAN DEFAULT 0,
  data_assinatura DATETIME,
  hash_assinatura TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  observacoes_gerais TEXT,
  assinatura_instrutor_completa INTEGER DEFAULT 0,
  assinatura_aluno_completa INTEGER DEFAULT 0,
  data_conclusao TEXT,
  pdf_url TEXT,
  empresa_id INTEGER NOT NULL,
  assinatura_instrutor INTEGER DEFAULT 0,
  assinatura_instrutor_data DATETIME,
  assinatura_instrutor_usuario_id INTEGER,
  assinatura_tripulante INTEGER DEFAULT 0,
  assinatura_tripulante_data DATETIME,
  assinatura_tripulante_usuario_id INTEGER,
  tipo_sessao TEXT,
  tipo_aeronave TEXT,
  data_sessao TEXT,
  assinatura_aluno_ip TEXT,
  assinatura_aluno_timestamp TEXT,
  assinatura_instrutor_ip TEXT,
  assinatura_instrutor_timestamp TEXT,
  arquivado INTEGER DEFAULT 0,
  caminho_arquivo TEXT,
  data_arquivamento TEXT,
  assinatura_aluno_imagem TEXT,
  assinatura_instrutor_imagem TEXT
);

INSERT INTO fichas_sessao_new (
  id,
  uuid,
  agendamento_slot_id,
  colaborador_id_aluno,
  funcao_na_sessao,
  template_id,
  instrutor_id,
  instrutor_codigo_anac,
  carga_horaria_total,
  carga_horaria_pf,
  carga_horaria_pm,
  tempo_acumulado,
  status,
  resultado_final,
  nota_final,
  nota_minima,
  aprovado,
  aluno_nome_validado,
  aluno_matricula_validado,
  observacoes,
  feedback_instrutor,
  pontos_fortes,
  pontos_melhoria,
  assinado,
  data_assinatura,
  hash_assinatura,
  created_at,
  updated_at,
  deleted_at,
  observacoes_gerais,
  assinatura_instrutor_completa,
  assinatura_aluno_completa,
  data_conclusao,
  pdf_url,
  empresa_id,
  assinatura_instrutor,
  assinatura_instrutor_data,
  assinatura_instrutor_usuario_id,
  assinatura_tripulante,
  assinatura_tripulante_data,
  assinatura_tripulante_usuario_id,
  tipo_sessao,
  tipo_aeronave,
  data_sessao,
  assinatura_aluno_ip,
  assinatura_aluno_timestamp,
  assinatura_instrutor_ip,
  assinatura_instrutor_timestamp,
  arquivado,
  caminho_arquivo,
  data_arquivamento,
  assinatura_aluno_imagem,
  assinatura_instrutor_imagem
)
SELECT
  fs.id,
  fs.uuid,
  fs.agendamento_slot_id,
  fs.colaborador_id_aluno,
  fs.funcao_na_sessao,
  fs.template_id,
  fs.instrutor_id,
  fs.instrutor_codigo_anac,
  fs.carga_horaria_total,
  fs.carga_horaria_pf,
  fs.carga_horaria_pm,
  fs.tempo_acumulado,
  fs.status,
  fs.resultado_final,
  fs.nota_final,
  fs.nota_minima,
  fs.aprovado,
  fs.aluno_nome_validado,
  fs.aluno_matricula_validado,
  fs.observacoes,
  fs.feedback_instrutor,
  fs.pontos_fortes,
  fs.pontos_melhoria,
  fs.assinado,
  fs.data_assinatura,
  fs.hash_assinatura,
  fs.created_at,
  fs.updated_at,
  fs.deleted_at,
  fs.observacoes_gerais,
  fs.assinatura_instrutor_completa,
  fs.assinatura_aluno_completa,
  fs.data_conclusao,
  fs.pdf_url,
  CASE
    WHEN fs_slot.empresa_id IS NOT NULL THEN fs_slot.empresa_id
    WHEN fs_aluno.empresa_id IS NOT NULL THEN fs_aluno.empresa_id
    WHEN fs_instrutor.empresa_id IS NOT NULL THEN fs_instrutor.empresa_id
    WHEN fs.empresa_id IS NOT NULL THEN fs.empresa_id
    ELSE NULL
  END AS empresa_id,
  fs.assinatura_instrutor,
  fs.assinatura_instrutor_data,
  fs.assinatura_instrutor_usuario_id,
  fs.assinatura_tripulante,
  fs.assinatura_tripulante_data,
  fs.assinatura_tripulante_usuario_id,
  fs.tipo_sessao,
  fs.tipo_aeronave,
  fs.data_sessao,
  fs.assinatura_aluno_ip,
  fs.assinatura_aluno_timestamp,
  fs.assinatura_instrutor_ip,
  fs.assinatura_instrutor_timestamp,
  fs.arquivado,
  fs.caminho_arquivo,
  fs.data_arquivamento,
  fs.assinatura_aluno_imagem,
  fs.assinatura_instrutor_imagem
FROM fichas_sessao fs
LEFT JOIN simulador_agendamentos fs_slot
  ON fs_slot.id = fs.agendamento_slot_id
 AND fs_slot.deleted_at IS NULL
LEFT JOIN funcionarios fs_aluno
  ON fs_aluno.id = fs.colaborador_id_aluno
 AND fs_aluno.deleted_at IS NULL
LEFT JOIN funcionarios fs_instrutor
  ON fs_instrutor.id = fs.instrutor_id
 AND fs_instrutor.deleted_at IS NULL;

DROP TABLE fichas_sessao;
ALTER TABLE fichas_sessao_new RENAME TO fichas_sessao;

CREATE INDEX idx_fichas_agendamento ON fichas_sessao(agendamento_slot_id);
CREATE INDEX idx_fichas_aluno ON fichas_sessao(colaborador_id_aluno);
CREATE INDEX idx_fichas_assinatura_instrutor ON fichas_sessao(assinatura_instrutor);
CREATE INDEX idx_fichas_assinatura_tripulante ON fichas_sessao(assinatura_tripulante);
CREATE INDEX idx_fichas_instrutor ON fichas_sessao(instrutor_id);
CREATE INDEX idx_fichas_sessao_agendamento ON fichas_sessao(agendamento_slot_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_fichas_sessao_aluno ON fichas_sessao(colaborador_id_aluno) WHERE deleted_at IS NULL;
CREATE INDEX idx_fichas_sessao_arquivado ON fichas_sessao(arquivado);
CREATE INDEX idx_fichas_sessao_data_sessao ON fichas_sessao(data_sessao);
CREATE INDEX idx_fichas_sessao_deleted ON fichas_sessao(deleted_at);
CREATE INDEX idx_fichas_sessao_empresa ON fichas_sessao(empresa_id);
CREATE INDEX idx_fichas_sessao_empresa_id ON fichas_sessao(empresa_id);
CREATE INDEX idx_fichas_sessao_instrutor ON fichas_sessao(instrutor_id);
CREATE INDEX idx_fichas_sessao_pdf_url ON fichas_sessao(pdf_url);
CREATE INDEX idx_fichas_sessao_resultado ON fichas_sessao(resultado_final) WHERE deleted_at IS NULL;
CREATE INDEX idx_fichas_sessao_status ON fichas_sessao(status);
CREATE INDEX idx_fichas_sessao_tipo ON fichas_sessao(tipo_sessao);

CREATE VIEW fichas_simulador AS
SELECT f.id, f.agendamento_slot_id AS sessao_id, f.colaborador_id_aluno AS funcionario_id,
  f.instrutor_id, a.data AS data_sessao, f.status, f.observacoes,
  f.created_at, f.updated_at, f.deleted_at
FROM fichas_sessao f
LEFT JOIN simulador_agendamentos a ON f.agendamento_slot_id = a.id;

-- ===========================================================================
-- 3. certificados
-- Deterministic resolution:
--   funcionarios.empresa_id
-- Any orphan certificado without funcionario resolvable must fail the migration.
-- ===========================================================================

CREATE TABLE certificados_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  habilitacao_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  qualificacao_id INTEGER NOT NULL,
  arquivo_url TEXT NOT NULL,
  arquivo_nome TEXT NOT NULL,
  arquivo_tamanho INTEGER,
  arquivo_hash TEXT,
  numero_certificado TEXT UNIQUE NOT NULL,
  tipo TEXT DEFAULT 'upload',
  data_emissao DATE,
  data_vencimento DATE,
  empresa_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME
);

INSERT INTO certificados_new (
  id,
  habilitacao_id,
  funcionario_id,
  qualificacao_id,
  arquivo_url,
  arquivo_nome,
  arquivo_tamanho,
  arquivo_hash,
  numero_certificado,
  tipo,
  data_emissao,
  data_vencimento,
  empresa_id,
  created_at,
  updated_at,
  deleted_at
)
SELECT
  cert.id,
  cert.habilitacao_id,
  cert.funcionario_id,
  cert.qualificacao_id,
  cert.arquivo_url,
  cert.arquivo_nome,
  cert.arquivo_tamanho,
  cert.arquivo_hash,
  cert.numero_certificado,
  cert.tipo,
  cert.data_emissao,
  cert.data_vencimento,
  cert_func.empresa_id,
  cert.created_at,
  cert.updated_at,
  cert.deleted_at
FROM certificados cert
LEFT JOIN funcionarios cert_func
  ON cert_func.id = cert.funcionario_id
 AND cert_func.deleted_at IS NULL;

DROP TABLE certificados;
ALTER TABLE certificados_new RENAME TO certificados;

CREATE INDEX idx_cert_deleted_v6 ON certificados(deleted_at);
CREATE INDEX idx_cert_func_id_v6 ON certificados(funcionario_id);
CREATE INDEX idx_cert_hab_id_v6 ON certificados(habilitacao_id);
CREATE INDEX idx_cert_qual_id_v6 ON certificados(qualificacao_id);
CREATE INDEX idx_certificados_deleted_at
ON certificados(deleted_at);
CREATE INDEX idx_certificados_funcionario_id
ON certificados(funcionario_id);
CREATE INDEX idx_certificados_habilitacao_id
ON certificados(habilitacao_id);
CREATE INDEX idx_certificados_qualificacao ON certificados(qualificacao_id, funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_certificados_qualificacao_id
ON certificados(qualificacao_id);
CREATE INDEX idx_certificados_empresa_id
ON certificados(empresa_id) WHERE deleted_at IS NULL;

-- ===========================================================================
-- Final validation
-- ===========================================================================

PRAGMA foreign_key_check;
PRAGMA foreign_keys = ON;
