-- ============================================================
-- Migration 0352: SIGVOOS x FRMS definitivo
--
-- - tabela de mapeamento manual dedicada
-- - fila de jornadas pendentes nao mapeadas
-- - colunas de enriquecimento em frms_jornada
-- ============================================================

CREATE TABLE IF NOT EXISTS sigvoos_mapeamento_manual (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER,
  nome_sigvoos TEXT NOT NULL,
  inscricao_sigvoos TEXT,
  canac_sigvoos TEXT,
  funcionario_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

CREATE INDEX IF NOT EXISTS idx_sigvoos_mapeamento_manual_empresa_nome
  ON sigvoos_mapeamento_manual(empresa_id, nome_sigvoos);
CREATE INDEX IF NOT EXISTS idx_sigvoos_mapeamento_manual_empresa_inscricao
  ON sigvoos_mapeamento_manual(empresa_id, inscricao_sigvoos);
CREATE INDEX IF NOT EXISTS idx_sigvoos_mapeamento_manual_empresa_canac
  ON sigvoos_mapeamento_manual(empresa_id, canac_sigvoos);

CREATE TABLE IF NOT EXISTS frms_jornada_pendente (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER,
  importacao_id TEXT,
  nome_sigvoos TEXT NOT NULL,
  identificador_sigvoos TEXT,
  canac_sigvoos TEXT,
  competencia TEXT NOT NULL,
  jornadas INTEGER NOT NULL DEFAULT 0,
  motivo TEXT NOT NULL,
  payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK(status IN ('PENDENTE', 'RESOLVIDO')),
  resolved_funcionario_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (resolved_funcionario_id) REFERENCES funcionarios(id)
);

CREATE INDEX IF NOT EXISTS idx_frms_jornada_pendente_empresa_status
  ON frms_jornada_pendente(empresa_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_frms_jornada_pendente_importacao
  ON frms_jornada_pendente(importacao_id);

ALTER TABLE frms_jornada ADD COLUMN matricula_aeronave TEXT;
ALTER TABLE frms_jornada ADD COLUMN tempo_noturno_str TEXT;
ALTER TABLE frms_jornada ADD COLUMN tempo_ifr_str TEXT;
ALTER TABLE frms_jornada ADD COLUMN fonte_resolucao_sigvoos TEXT;

CREATE INDEX IF NOT EXISTS idx_frms_jornada_fonte_resolucao_sigvoos
  ON frms_jornada(fonte_resolucao_sigvoos);
