-- Auditoria critica: hardening de schema/indices para FRMS/LMS/SIGVOOS

-- Garantir tabelas base usadas por auth/rate-limit
CREATE TABLE IF NOT EXISTS token_blocklist (
  jti TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rate_limit_store (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at TEXT NOT NULL
);

-- FRMS jornada: colunas exigidas pela auditoria
ALTER TABLE frms_jornada ADD COLUMN empresa_id INTEGER;
ALTER TABLE frms_jornada ADD COLUMN fator_basica_pct REAL DEFAULT 0;
ALTER TABLE frms_jornada ADD COLUMN fator_apresentacao_pct REAL DEFAULT 0;
ALTER TABLE frms_jornada ADD COLUMN fator_repouso_pct REAL DEFAULT 0;
ALTER TABLE frms_jornada ADD COLUMN horas_voo_noturno_min INTEGER DEFAULT 0;
ALTER TABLE frms_jornada ADD COLUMN horas_voo_ifr_min INTEGER DEFAULT 0;
ALTER TABLE frms_jornada ADD COLUMN fonte_resolucao TEXT;

-- Backfill empresa_id via funcionarios quando possivel
UPDATE frms_jornada
SET empresa_id = (
  SELECT f.empresa_id
  FROM funcionarios f
  WHERE f.id = frms_jornada.tripulante_id
)
WHERE empresa_id IS NULL;

-- SIGVOOS config: coluna pedida pela auditoria
ALTER TABLE integracoes_sigvoos_config ADD COLUMN notificar_falha_email TEXT;

-- Rate limit store: coluna para indice de janela
ALTER TABLE rate_limit_store ADD COLUMN window_start TEXT DEFAULT (datetime('now'));

-- Indices criticos
CREATE INDEX IF NOT EXISTS idx_frms_jornada_empresa_deleted ON frms_jornada(empresa_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_frms_jornada_empresa_data ON frms_jornada(empresa_id, data);
CREATE INDEX IF NOT EXISTS idx_lms_matriculas_empresa_deleted ON lms_matriculas(empresa_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_lms_cursos_empresa_deleted ON lms_cursos(empresa_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_empresa_deleted ON qualificacoes_historico(empresa_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_token_blocklist_jti ON token_blocklist(jti);
CREATE INDEX IF NOT EXISTS idx_rate_limit_store_key_window_start ON rate_limit_store(key, window_start);
