-- ============================================================
-- Migration 0351: FRMS — permitir origem SIGVOOS em frms_jornada
--
-- PROBLEMA:
--   O código atual do sync SIGVOOS tenta relabelar jornadas importadas
--   como origem = 'SIGVOOS', mas o schema legado da tabela ainda aceita
--   apenas ('MANUAL','APUS','SIMULADOR','FIRA').
--
-- SOLUÇÃO:
--   Recriar frms_jornada preservando o schema atual e ampliando o CHECK
--   de origem para incluir 'SIGVOOS'.
-- ============================================================

PRAGMA foreign_keys = OFF;

DROP VIEW IF EXISTS vw_tripulante_operacional;

CREATE TABLE IF NOT EXISTS frms_jornada_new (
  id                          TEXT PRIMARY KEY,
  tripulante_id               INTEGER NOT NULL REFERENCES funcionarios(id),
  data                        TEXT NOT NULL,
  status                      TEXT NOT NULL CHECK(status IN (
                                'ES','TS','TV','EX','RE','SA',
                                'FE','FR','FS','AM','DM','OT'
                              )),
  hora_apresentacao           TEXT,
  hora_termino                TEXT,
  duracao_jornada_minutos     INTEGER,
  horas_voo_minutos           INTEGER,
  hora_primeiro_acionamento   TEXT,
  hora_primeira_decolagem     TEXT,
  hora_ultimo_pouso           TEXT,
  hora_corte_motor            TEXT,
  repouso_plataforma_inicio   TEXT,
  repouso_plataforma_fim      TEXT,
  repouso_plataforma_valido   INTEGER DEFAULT 0,
  observacao                  TEXT,
  registrado_por              TEXT NOT NULL,
  origem                      TEXT DEFAULT 'MANUAL' CHECK(origem IN (
                                'MANUAL','APUS','SIMULADOR','FIRA','SIGVOOS'
                              )),
  created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at                  TEXT,
  tipo_base                   TEXT DEFAULT 'HOME' CHECK(tipo_base IN ('HOME','AWAY')),
  tripulacao_aumentada        INTEGER DEFAULT 0,
  classe_cabine               TEXT DEFAULT NULL CHECK(classe_cabine IN ('ECONOMY','BUSINESS',NULL)),
  aclimatado                  INTEGER DEFAULT 1,
  local_base                  TEXT DEFAULT NULL
);

INSERT INTO frms_jornada_new (
  id, tripulante_id, data, status,
  hora_apresentacao, hora_termino, duracao_jornada_minutos,
  horas_voo_minutos, hora_primeiro_acionamento, hora_primeira_decolagem,
  hora_ultimo_pouso, hora_corte_motor,
  repouso_plataforma_inicio, repouso_plataforma_fim, repouso_plataforma_valido,
  observacao, registrado_por, origem,
  created_at, updated_at, deleted_at,
  tipo_base, tripulacao_aumentada, classe_cabine, aclimatado, local_base
)
SELECT
  id, tripulante_id, data, status,
  hora_apresentacao, hora_termino, duracao_jornada_minutos,
  horas_voo_minutos, hora_primeiro_acionamento, hora_primeira_decolagem,
  hora_ultimo_pouso, hora_corte_motor,
  repouso_plataforma_inicio, repouso_plataforma_fim, repouso_plataforma_valido,
  observacao, registrado_por,
  CASE
    WHEN origem IN ('MANUAL','APUS','SIMULADOR','FIRA','SIGVOOS') THEN origem
    ELSE COALESCE(origem, 'MANUAL')
  END,
  created_at, updated_at, deleted_at,
  COALESCE(tipo_base, 'HOME'),
  COALESCE(tripulacao_aumentada, 0),
  classe_cabine,
  COALESCE(aclimatado, 1),
  local_base
FROM frms_jornada;

DROP TABLE frms_jornada;

ALTER TABLE frms_jornada_new RENAME TO frms_jornada;

CREATE INDEX IF NOT EXISTS idx_frms_jornada_tripulante
  ON frms_jornada(tripulante_id);
CREATE INDEX IF NOT EXISTS idx_frms_jornada_data
  ON frms_jornada(data);
CREATE INDEX IF NOT EXISTS idx_frms_jornada_trip_data
  ON frms_jornada(tripulante_id, data);
CREATE INDEX IF NOT EXISTS idx_frms_jornada_deleted
  ON frms_jornada(deleted_at);
CREATE INDEX IF NOT EXISTS idx_frms_jornada_status
  ON frms_jornada(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_frms_jornada_trip_data_uq
  ON frms_jornada(tripulante_id, data) WHERE deleted_at IS NULL;

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

PRAGMA foreign_keys = ON;