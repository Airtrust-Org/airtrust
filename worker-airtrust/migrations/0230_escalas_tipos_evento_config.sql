-- Migration: 0230_escalas_tipos_evento_config
-- Persiste personalizações de tipos de evento no D1 (multi-tenant, substituí localStorage)
-- Data: 2026-03-05

CREATE TABLE IF NOT EXISTS escalas_tipos_evento_config (
  id        TEXT    PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  codigo    TEXT    NOT NULL,        -- 'voo', 'simulador', 'medico', etc.
  label     TEXT    NOT NULL,        -- nome exibido ao usuário
  cor       TEXT    NOT NULL,        -- hex ex: '#0EA5E9'
  icone     TEXT,                    -- nome material-symbol ou emoji
  ativo     INTEGER NOT NULL DEFAULT 1,
  ordem     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  UNIQUE(empresa_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_tipos_evento_config_empresa
  ON escalas_tipos_evento_config(empresa_id)
  WHERE deleted_at IS NULL;

-- Seed inicial para empresas já existentes (todos ativos por padrão)
INSERT OR IGNORE INTO escalas_tipos_evento_config
  (id, empresa_id, codigo, label, cor, icone, ativo, ordem)
SELECT lower(hex(randomblob(16))), e.id, v.codigo, v.label, v.cor, v.icone, 1, v.ordem
FROM empresas e
CROSS JOIN (
  SELECT 'VOO' AS codigo, 'Voo Operacional' AS label, '#0EA5E9' AS cor, 'flight' AS icone, 1 AS ordem
  UNION ALL SELECT 'VIM', 'Viagem', '#3B82F6', 'local_taxi', 2
  UNION ALL SELECT 'TSO', 'Treinamento Solo', '#8B5CF6', 'school', 3
  UNION ALL SELECT 'SIM', 'Treinamento Simulador', '#6366F1', 'precision_manufacturing', 4
  UNION ALL SELECT 'MED', 'Exame Médico', '#EF4444', 'medical_services', 5
  UNION ALL SELECT 'CHK', 'Cheque', '#F59E0B', 'fact_check', 6
  UNION ALL SELECT 'REA', 'Reaquisição', '#10B981', 'refresh', 7
  UNION ALL SELECT 'TRB', 'Trabalho Administrativo', '#6B7280', 'work', 8
  UNION ALL SELECT 'FOL', 'Folga', '#22C55E', 'weekend', 9
  UNION ALL SELECT 'SMH', 'Standby', '#A855F7', 'hourglass_empty', 10
  UNION ALL SELECT 'FER', 'Férias', '#14B8A6', 'beach_access', 11
  UNION ALL SELECT 'LIC', 'Licença', '#64748B', 'event_busy', 12
) v;
