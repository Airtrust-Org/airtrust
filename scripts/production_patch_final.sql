-- production_patch_final.sql
-- Idempotent patch para alinhar produção ao estado final (migrations 0071-0085)
-- NÃO usa mecanismo de migrations para evitar cadeia antiga quebrada.
-- Executar via: wrangler d1 execute airtrust-db --remote --env production --command "$(cat scripts/production_patch_final.sql)"

BEGIN TRANSACTION;

-- VIEW PRINCIPAL ENRIQUECIDA
DROP VIEW IF EXISTS qualificacoes_historico_v;
CREATE VIEW qualificacoes_historico_v AS
SELECT
  qh.id,
  qh.funcionario_id,
  qh.qualificacao_id,
  qh.data_conclusao,
  qh.data_vencimento,
  qh.data_vencimento AS data_validade,
  qh.validade_meses,
  qh.numero_certificado,
  qh.observacoes AS historico_observacoes,
  qh.arquivo_url,
  qh.instrutor,
  qh.local AS local_treinamento,
  qh.modalidade,
  qh.nota,
  qh.carga_horaria,
  qh.created_at,
  qh.updated_at,
  CASE
    WHEN qh.data_vencimento IS NULL AND qh.validade_meses IS NULL THEN 'INDETERMINADA'
    WHEN DATE(qh.data_vencimento) < DATE('now') THEN 'VENCIDA'
    WHEN DATE(qh.data_vencimento) BETWEEN DATE('now') AND DATE('now', '+30 days') THEN 'PROXIMA_VENCIMENTO'
    WHEN DATE(qh.data_vencimento) BETWEEN DATE('now', '+31 days') AND DATE('now', '+60 days') THEN 'ATENCAO'
    ELSE 'VALIDA'
  END AS status_qualificacao,
  CASE
    WHEN qh.data_vencimento IS NULL THEN NULL
    ELSE CAST((julianday(qh.data_vencimento) - julianday('now')) AS INTEGER)
  END AS dias_ate_vencimento,
  f.nome AS funcionario_nome,
  f.nome_guerra AS funcionario_nome_guerra,
  f.email AS funcionario_email,
  f.matricula AS funcionario_matricula,
  f.cpf AS funcionario_cpf,
  f.cargo AS funcionario_cargo,
  f.funcao AS funcionario_funcao,
  f.setor AS funcionario_setor,
  f.departamento AS funcionario_departamento,
  f.base AS funcionario_base,
  f.aeronave AS funcionario_aeronave,
  f.escala AS funcionario_escala,
  f.status AS funcionario_status,
  f.ativo AS funcionario_ativo,
  f.is_instrutor AS funcionario_is_instrutor,
  f.is_checador AS funcionario_is_checador,
  f.codigo_anac AS funcionario_codigo_anac,
  f.nivel_icao AS funcionario_nivel_icao,
  f.validade_icao AS funcionario_validade_icao,
  f.cma AS funcionario_cma,
  f.validade_cma AS funcionario_validade_cma,
  f.aso AS funcionario_aso,
  f.validade_aso AS funcionario_validade_aso,
  f.telefone AS funcionario_telefone,
  f.telefone_emergencia AS funcionario_telefone_emergencia,
  f.foto_url AS funcionario_foto_url,
  f.data_admissao AS funcionario_data_admissao,
  f.rg AS funcionario_rg,
  f.data_nascimento AS funcionario_data_nascimento,
  f.sexo AS funcionario_sexo,
  f.nacionalidade AS funcionario_nacionalidade,
  f.cep AS funcionario_cep,
  f.logradouro AS funcionario_logradouro,
  f.numero AS funcionario_numero,
  f.complemento AS funcionario_complemento,
  f.bairro AS funcionario_bairro,
  f.cidade AS funcionario_cidade,
  f.estado AS funcionario_estado,
  f.sispat AS funcionario_sispat,
  f.prestserv AS funcionario_prestserv,
  f.contato_emergencia_nome AS funcionario_contato_emergencia,
  f.observacoes AS funcionario_observacoes,
  qt.codigo AS qualificacao_codigo,
  qt.nome AS qualificacao_nome,
  qt.descricao AS qualificacao_descricao,
  qt.categoria AS qualificacao_categoria,
  qt.validade_meses AS qualificacao_validade_meses,
  qt.requer_renovacao AS qualificacao_requer_renovacao,
  qt.obrigatoria_para_cargo AS qualificacao_obrigatoria_para_cargo,
  qt.pre_requisitos AS qualificacao_pre_requisitos,
  qt.cor_status AS qualificacao_cor_status,
  qt.icone AS qualificacao_icone,
  qt.ordem_exibicao AS qualificacao_ordem_exibicao
FROM qualificacoes_historico qh
INNER JOIN funcionarios f ON qh.funcionario_id = f.id AND f.deleted_at IS NULL
INNER JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id AND qt.deleted_at IS NULL
WHERE qh.deleted_at IS NULL
ORDER BY qh.data_vencimento ASC;

-- VIEW ESTATÍSTICAS GLOBAL
DROP VIEW IF EXISTS qualificacoes_historico_stats_v;
CREATE VIEW qualificacoes_historico_stats_v AS
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN status_qualificacao = 'VALIDA' THEN 1 ELSE 0 END) as validas,
  SUM(CASE WHEN status_qualificacao = 'VENCIDA' THEN 1 ELSE 0 END) as vencidas,
  SUM(CASE WHEN status_qualificacao = 'PROXIMA_VENCIMENTO' THEN 1 ELSE 0 END) as vencendo,
  SUM(CASE WHEN status_qualificacao = 'ATENCAO' THEN 1 ELSE 0 END) as atencao,
  SUM(CASE WHEN status_qualificacao = 'INDETERMINADA' THEN 1 ELSE 0 END) as indeterminadas
FROM qualificacoes_historico_v;

-- VIEW RISCO
DROP VIEW IF EXISTS qualificacoes_historico_risco_v;
CREATE VIEW qualificacoes_historico_risco_v AS
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN status_qualificacao = 'VALIDA' THEN 1 ELSE 0 END) AS validas,
  SUM(CASE WHEN status_qualificacao = 'VENCIDA' THEN 1 ELSE 0 END) AS vencidas,
  SUM(CASE WHEN dias_ate_vencimento BETWEEN 0 AND 30 THEN 1 ELSE 0 END) AS faixa_0_30,
  SUM(CASE WHEN dias_ate_vencimento BETWEEN 31 AND 60 THEN 1 ELSE 0 END) AS faixa_31_60,
  SUM(CASE WHEN dias_ate_vencimento > 60 THEN 1 ELSE 0 END) AS faixa_60_plus,
  SUM(CASE WHEN status_qualificacao = 'INDETERMINADA' THEN 1 ELSE 0 END) AS indeterminadas
FROM qualificacoes_historico_v;

-- TABELA LATÊNCIA BRUTA
CREATE TABLE IF NOT EXISTS api_latency_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route TEXT NOT NULL,
  method TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  snapshot_date TEXT NOT NULL DEFAULT (date('now')),
  captured_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_api_latency_route_date ON api_latency_samples(route, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_api_latency_method_date ON api_latency_samples(method, snapshot_date);

-- TABELA LATÊNCIA DIÁRIA
CREATE TABLE IF NOT EXISTS api_latency_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  route TEXT NOT NULL,
  method TEXT NOT NULL,
  calls INTEGER NOT NULL,
  avg_ms REAL NOT NULL,
  p95_ms REAL NOT NULL,
  p99_ms REAL NOT NULL,
  max_ms INTEGER NOT NULL,
  generated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_api_latency_daily_day_route_method ON api_latency_daily(day, route, method);

-- UNIFICAÇÃO STATS DIÁRIA (se ainda schema legacy)
-- Detecta ausência de coluna snapshot_date
CREATE TEMP TABLE IF NOT EXISTS __qh_stats_cols AS SELECT name FROM pragma_table_info('qualificacoes_historico_stats_daily');
INSERT OR IGNORE INTO __qh_stats_cols(name) VALUES(''); -- garantia
-- Se snapshot_date não existe, recriar
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM __qh_stats_cols WHERE name = 'snapshot_date') THEN (
  SELECT 1 FROM (
    SELECT
      -- recriação
      (SELECT 1 FROM (
        CREATE TABLE IF NOT EXISTS qualificacoes_historico_stats_daily_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          snapshot_date TEXT NOT NULL,
          day TEXT NOT NULL,
          scope_hash TEXT NOT NULL DEFAULT 'GLOBAL',
          total INTEGER NOT NULL DEFAULT 0,
          validas INTEGER NOT NULL DEFAULT 0,
          vencendo INTEGER NOT NULL DEFAULT 0,
          vencidas INTEGER NOT NULL DEFAULT 0,
          renovadas INTEGER NOT NULL DEFAULT 0,
          indeterminadas INTEGER NOT NULL DEFAULT 0,
          generated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      )
    )
  )
END;

-- Copiar dados se tabela new criada
INSERT INTO qualificacoes_historico_stats_daily_new (snapshot_date, day, scope_hash, total, validas, vencendo, vencidas, renovadas, indeterminadas, generated_at)
SELECT
  COALESCE(snapshot_date, day, date('now')) AS snapshot_date,
  COALESCE(day, snapshot_date, date('now')) AS day,
  COALESCE(scope_hash, 'GLOBAL') AS scope_hash,
  COALESCE(total, 0) AS total,
  COALESCE(validas, 0) AS validas,
  COALESCE(vencendo, 0) AS vencendo,
  COALESCE(vencidas, 0) AS vencidas,
  COALESCE(renovadas, 0) AS renovadas,
  COALESCE(indeterminadas, 0) AS indeterminadas,
  COALESCE(generated_at, datetime('now')) AS generated_at
FROM qualificacoes_historico_stats_daily
WHERE EXISTS (SELECT 1 FROM pragma_table_info('qualificacoes_historico_stats_daily') WHERE name='day');

-- Swap se tabela nova criada
DROP TABLE IF EXISTS qualificacoes_historico_stats_daily;
ALTER TABLE qualificacoes_historico_stats_daily_new RENAME TO qualificacoes_historico_stats_daily;
CREATE INDEX IF NOT EXISTS idx_qh_stats_daily_snapshot ON qualificacoes_historico_stats_daily(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_qh_stats_daily_day_scope ON qualificacoes_historico_stats_daily(day, scope_hash);
DROP TABLE IF EXISTS __qh_stats_cols;

-- TRIGGERS (idempotentes)
CREATE TRIGGER IF NOT EXISTS trg_qh_set_data_vencimento
AFTER INSERT ON qualificacoes_historico
FOR EACH ROW
WHEN NEW.validade_meses IS NOT NULL AND NEW.data_vencimento IS NULL
BEGIN
  UPDATE qualificacoes_historico
  SET data_vencimento = DATE(NEW.created_at, '+' || NEW.validade_meses || ' months')
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_qh_validate_nota
BEFORE INSERT ON qualificacoes_historico
FOR EACH ROW
WHEN NEW.nota IS NOT NULL AND (NEW.nota < 0 OR NEW.nota > 100)
BEGIN
  SELECT RAISE(ABORT, 'Nota fora do intervalo 0-100');
END;

CREATE TRIGGER IF NOT EXISTS trg_qh_validate_carga_horaria
BEFORE INSERT ON qualificacoes_historico
FOR EACH ROW
WHEN NEW.carga_horaria IS NOT NULL AND NEW.carga_horaria < 0
BEGIN
  SELECT RAISE(ABORT, 'Carga horaria negativa não permitida');
END;

COMMIT;
-- FIM PATCH
