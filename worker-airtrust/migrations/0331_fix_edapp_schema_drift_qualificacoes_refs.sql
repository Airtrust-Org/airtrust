-- 0331_fix_edapp_schema_drift_qualificacoes_refs.sql
-- Rebuilds stale schema objects that still reference qualificacoes_historico_old.
-- This drift blocks the EdApp analytics reconciliation path in production.

DROP VIEW IF EXISTS notificacoes_nao_lidas;
DROP VIEW IF EXISTS vw_tripulante_operacional;
DROP VIEW IF EXISTS qualificacoes_historico_v;
DROP TRIGGER IF EXISTS trg_apply_reclassification;

ALTER TABLE notificacoes_log RENAME TO notificacoes_log_old_0331;

CREATE TABLE notificacoes_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_id INTEGER REFERENCES notificacoes_config(id),
  qualificacao_historico_id INTEGER REFERENCES qualificacoes_historico(id),
  funcionario_cpf VARCHAR(11),
  tipo VARCHAR(50),
  destinatario TEXT,
  assunto TEXT,
  corpo TEXT,
  status VARCHAR(20),
  erro_mensagem TEXT,
  enviado_em TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO notificacoes_log (
  id,
  config_id,
  qualificacao_historico_id,
  funcionario_cpf,
  tipo,
  destinatario,
  assunto,
  corpo,
  status,
  erro_mensagem,
  enviado_em,
  created_at
)
SELECT
  id,
  config_id,
  qualificacao_historico_id,
  funcionario_cpf,
  tipo,
  destinatario,
  assunto,
  corpo,
  status,
  erro_mensagem,
  enviado_em,
  created_at
FROM notificacoes_log_old_0331;

DROP TABLE notificacoes_log_old_0331;

CREATE INDEX IF NOT EXISTS idx_notificacoes_log_status ON notificacoes_log(status);
CREATE INDEX IF NOT EXISTS idx_notificacoes_log_enviado_em ON notificacoes_log(enviado_em);
CREATE INDEX IF NOT EXISTS idx_notificacoes_log_funcionario_cpf ON notificacoes_log(funcionario_cpf);

ALTER TABLE qualificacoes_historico_reclass_queue RENAME TO qualificacoes_historico_reclass_queue_old_0331;

CREATE TABLE qualificacoes_historico_reclass_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  historico_id INTEGER NOT NULL,
  current_codigo TEXT,
  target_tipo_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(historico_id),
  FOREIGN KEY(historico_id) REFERENCES qualificacoes_historico(id) ON DELETE CASCADE
);

INSERT INTO qualificacoes_historico_reclass_queue (
  id,
  historico_id,
  current_codigo,
  target_tipo_id,
  status,
  reason,
  created_at,
  updated_at
)
SELECT
  id,
  historico_id,
  current_codigo,
  target_tipo_id,
  status,
  reason,
  created_at,
  updated_at
FROM qualificacoes_historico_reclass_queue_old_0331;

DROP TABLE qualificacoes_historico_reclass_queue_old_0331;

CREATE TRIGGER IF NOT EXISTS trg_apply_reclassification
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

ALTER TABLE notificacoes_sistema RENAME TO notificacoes_sistema_old_0331;

CREATE TABLE notificacoes_sistema (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  prioridade TEXT DEFAULT 'MEDIA',
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  dados TEXT,
  grupo TEXT,
  funcionario_id INTEGER,
  qualificacao_historico_id INTEGER,
  link TEXT,
  acao_primaria TEXT,
  lida INTEGER DEFAULT 0,
  lida_em TEXT,
  lida_por INTEGER,
  user_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (qualificacao_historico_id) REFERENCES qualificacoes_historico(id)
);

INSERT INTO notificacoes_sistema (
  id,
  tipo,
  prioridade,
  titulo,
  mensagem,
  dados,
  grupo,
  funcionario_id,
  qualificacao_historico_id,
  link,
  acao_primaria,
  lida,
  lida_em,
  lida_por,
  user_id,
  created_at,
  updated_at,
  deleted_at
)
SELECT
  id,
  tipo,
  prioridade,
  titulo,
  mensagem,
  dados,
  grupo,
  funcionario_id,
  qualificacao_historico_id,
  link,
  acao_primaria,
  lida,
  lida_em,
  lida_por,
  user_id,
  created_at,
  updated_at,
  deleted_at
FROM notificacoes_sistema_old_0331;

DROP TABLE notificacoes_sistema_old_0331;

CREATE INDEX IF NOT EXISTS idx_notificacoes_lida ON notificacoes_sistema(lida, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notificacoes_tipo ON notificacoes_sistema(tipo, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notificacoes_grupo ON notificacoes_sistema(grupo);
CREATE INDEX IF NOT EXISTS idx_notificacoes_deleted ON notificacoes_sistema(deleted_at);
CREATE INDEX IF NOT EXISTS idx_notificacoes_user_id ON notificacoes_sistema(user_id, lida, created_at DESC);

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

CREATE VIEW notificacoes_nao_lidas AS
SELECT 
  n.*,
  f.nome as funcionario_nome,
  f.matricula as funcionario_matricula
FROM notificacoes_sistema n
LEFT JOIN funcionarios f ON f.id = n.funcionario_id
WHERE n.lida = 0 
  AND n.deleted_at IS NULL
ORDER BY 
  CASE n.prioridade
    WHEN 'URGENTE' THEN 1
    WHEN 'ALTA' THEN 2
    WHEN 'MEDIA' THEN 3
    WHEN 'BAIXA' THEN 4
    ELSE 5
  END,
  n.created_at DESC;

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
    SELECT 1
    FROM qualificacoes_historico qh
    LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
    WHERE qh.funcionario_id = f.id
      AND qh.deleted_at IS NULL
      AND COALESCE(qh.status, 'CONCLUIDA') != 'CANCELADA'
      AND UPPER(COALESCE(qh.qualificacao_codigo, qt.codigo, '')) = 'CMA'
      AND COALESCE(
        qh.data_vencimento,
        date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses, qt.validade, 12) || ' months')
      ) >= date('now')
  ) THEN 1 ELSE 0 END AS cma_valido,

  CAST((
    JULIANDAY((
      SELECT MAX(COALESCE(
        qh2.data_vencimento,
        date(qh2.data_conclusao, '+' || COALESCE(qh2.validade_meses, qt2.validade, 12) || ' months')
      ))
      FROM qualificacoes_historico qh2
      LEFT JOIN qualificacoes_tipos qt2 ON qt2.id = qh2.qualificacao_id AND qt2.deleted_at IS NULL
      WHERE qh2.funcionario_id = f.id
        AND qh2.deleted_at IS NULL
        AND COALESCE(qh2.status, 'CONCLUIDA') != 'CANCELADA'
        AND UPPER(COALESCE(qh2.qualificacao_codigo, qt2.codigo, '')) = 'CMA'
    )) - JULIANDAY('now')
  ) AS INTEGER) AS cma_dias_restantes,

  (
    SELECT MAX(COALESCE(
      qh3.data_vencimento,
      date(qh3.data_conclusao, '+' || COALESCE(qh3.validade_meses, qt3.validade, 12) || ' months')
    ))
    FROM qualificacoes_historico qh3
    LEFT JOIN qualificacoes_tipos qt3 ON qt3.id = qh3.qualificacao_id AND qt3.deleted_at IS NULL
    WHERE qh3.funcionario_id = f.id
      AND qh3.deleted_at IS NULL
      AND COALESCE(qh3.status, 'CONCLUIDA') != 'CANCELADA'
      AND UPPER(COALESCE(qh3.qualificacao_codigo, qt3.codigo, '')) = 'CMA'
  ) AS cma_validade_fim,

  (
    WITH base AS (
      SELECT
        COALESCE(SUM(CASE WHEN date(data) >= date('now', '-7 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_7,
        COALESCE(SUM(CASE WHEN date(data) >= date('now', '-28 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_28,
        COUNT(DISTINCT CASE WHEN date(data) >= date('now', '-28 days') THEN date(data) END) AS dias_28
      FROM frms_jornada
      WHERE tripulante_id = f.id
        AND deleted_at IS NULL
    )
    SELECT MIN(100, ROUND((minutos_7 / 60.0) * 2.5 + (minutos_28 / 60.0) * 0.8 + dias_28 * 1.1))
    FROM base
  ) AS frms_score,

  CASE
    WHEN EXISTS (
      SELECT 1
      FROM frms_alerta fa
      WHERE fa.tripulante_id = f.id
        AND fa.deleted_at IS NULL
        AND COALESCE(fa.resolvido, 0) = 0
        AND fa.nivel IN ('CRITICO', 'VIOLACAO')
    ) THEN 'critico'
    WHEN (
      WITH base AS (
        SELECT
          COALESCE(SUM(CASE WHEN date(data) >= date('now', '-7 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_7,
          COALESCE(SUM(CASE WHEN date(data) >= date('now', '-28 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_28,
          COUNT(DISTINCT CASE WHEN date(data) >= date('now', '-28 days') THEN date(data) END) AS dias_28
        FROM frms_jornada
        WHERE tripulante_id = f.id
          AND deleted_at IS NULL
      )
      SELECT MIN(100, ROUND((minutos_7 / 60.0) * 2.5 + (minutos_28 / 60.0) * 0.8 + dias_28 * 1.1))
      FROM base
    ) >= 45 THEN 'atencao'
    ELSE 'ok'
  END AS frms_status,

  (
    SELECT MAX(created_at)
    FROM frms_jornada fj
    WHERE fj.tripulante_id = f.id
      AND fj.deleted_at IS NULL
  ) AS frms_avaliacao_data,

  (
    SELECT COUNT(*)
    FROM sessoes_participantes sp
    JOIN simulador_agendamentos sa ON sa.id = sp.sessao_id
    WHERE sp.funcionario_id = f.id
      AND sp.deleted_at IS NULL
      AND sa.deleted_at IS NULL
      AND UPPER(COALESCE(sa.status, 'AGENDADA')) NOT IN ('CONCLUIDA', 'CANCELADA')
      AND date(sa.data) >= date('now')
  ) AS simuladores_pendentes,

  (
    SELECT MIN(sa2.data)
    FROM sessoes_participantes sp2
    JOIN simulador_agendamentos sa2 ON sa2.id = sp2.sessao_id
    WHERE sp2.funcionario_id = f.id
      AND sp2.deleted_at IS NULL
      AND sa2.deleted_at IS NULL
      AND UPPER(COALESCE(sa2.status, 'AGENDADA')) NOT IN ('CONCLUIDA', 'CANCELADA')
      AND date(sa2.data) >= date('now')
  ) AS proximo_simulador_data,

  CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM qualificacoes_historico qh4
      LEFT JOIN qualificacoes_tipos qt4 ON qt4.id = qh4.qualificacao_id AND qt4.deleted_at IS NULL
      WHERE qh4.funcionario_id = f.id
        AND qh4.deleted_at IS NULL
        AND COALESCE(qh4.status, 'CONCLUIDA') != 'CANCELADA'
        AND UPPER(COALESCE(qh4.qualificacao_codigo, qt4.codigo, '')) = 'CMA'
        AND COALESCE(
          qh4.data_vencimento,
          date(qh4.data_conclusao, '+' || COALESCE(qh4.validade_meses, qt4.validade, 12) || ' months')
        ) >= date('now')
    ) THEN 'BLOQUEADO_CMA'
    WHEN EXISTS (
      SELECT 1
      FROM frms_alerta fa2
      WHERE fa2.tripulante_id = f.id
        AND fa2.deleted_at IS NULL
        AND COALESCE(fa2.resolvido, 0) = 0
        AND fa2.nivel IN ('CRITICO', 'VIOLACAO')
    ) THEN 'BLOQUEADO_FRMS'
    WHEN CAST((
      JULIANDAY((
        SELECT MAX(COALESCE(
          qh5.data_vencimento,
          date(qh5.data_conclusao, '+' || COALESCE(qh5.validade_meses, qt5.validade, 12) || ' months')
        ))
        FROM qualificacoes_historico qh5
        LEFT JOIN qualificacoes_tipos qt5 ON qt5.id = qh5.qualificacao_id AND qt5.deleted_at IS NULL
        WHERE qh5.funcionario_id = f.id
          AND qh5.deleted_at IS NULL
          AND COALESCE(qh5.status, 'CONCLUIDA') != 'CANCELADA'
          AND UPPER(COALESCE(qh5.qualificacao_codigo, qt5.codigo, '')) = 'CMA'
      )) - JULIANDAY('now')
    ) AS INTEGER) <= 30 THEN 'ATENCAO_CMA'
    WHEN EXISTS (
      SELECT 1
      FROM frms_alerta fa3
      WHERE fa3.tripulante_id = f.id
        AND fa3.deleted_at IS NULL
        AND COALESCE(fa3.resolvido, 0) = 0
        AND fa3.nivel = 'ATENCAO'
    ) THEN 'ATENCAO_FRMS'
    ELSE 'APTO'
  END AS status_operacional
FROM funcionarios f
WHERE f.deleted_at IS NULL
  AND COALESCE(f.ativo, 1) = 1;