-- ============================================================
-- Migration 0218: FRMS — Corrigir CHECK constraints em frms_jornada
--
-- PROBLEMA:
--   Migration 0212 criou frms_jornada com CHECK desatualizado:
--     status: ('ES','FR','FE','STANDBY_BASE','STANDBY_CASA','TRAINING','POSITIONING')
--     origem: ('MANUAL','APUS','SIMULADOR')
--
--   O sistema evoluiu para usar:
--     status: ('ES','TS','TV','EX','RE','SA','FE','FR','FS','AM','DM','OT')
--     origem: ('MANUAL','APUS','SIMULADOR','FIRA')
--
--   Resultado: qualquer INSERT com status TS/TV/EX/RE/SA/FS/AM/DM/OT
--   ou origem FIRA falha com SQLITE constraint violation — bloqueando
--   toda importação FIRA e registros manuais com esses status.
--
-- SOLUÇÃO:
--   Recriar frms_jornada com os CHECK corretos.
--   Mapear status antigos para novos:
--     STANDBY_BASE → RE
--     STANDBY_CASA → RE
--     TRAINING     → TS
--     POSITIONING  → ES
-- ============================================================

PRAGMA foreign_keys = OFF;

-- ─── 1. Criar nova tabela com CHECK corretos ───────────────
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
                                'MANUAL','APUS','SIMULADOR','FIRA'
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

-- ─── 2. Copiar dados, mapeando status antigos ─────────────
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
  id, tripulante_id, data,
  CASE status
    WHEN 'STANDBY_BASE' THEN 'RE'
    WHEN 'STANDBY_CASA' THEN 'RE'
    WHEN 'TRAINING'     THEN 'TS'
    WHEN 'POSITIONING'  THEN 'ES'
    ELSE status
  END,
  hora_apresentacao, hora_termino, duracao_jornada_minutos,
  horas_voo_minutos, hora_primeiro_acionamento, hora_primeira_decolagem,
  hora_ultimo_pouso, hora_corte_motor,
  repouso_plataforma_inicio, repouso_plataforma_fim, repouso_plataforma_valido,
  observacao, registrado_por,
  CASE WHEN origem = 'FIRA' THEN 'FIRA' ELSE COALESCE(origem, 'MANUAL') END,
  created_at, updated_at, deleted_at,
  COALESCE(tipo_base, 'HOME'),
  COALESCE(tripulacao_aumentada, 0),
  classe_cabine,
  COALESCE(aclimatado, 1),
  local_base
FROM frms_jornada;

-- ─── 3. Remover tabela antiga ─────────────────────────────
DROP TABLE frms_jornada;

-- ─── 4. Renomear nova ─────────────────────────────────────
ALTER TABLE frms_jornada_new RENAME TO frms_jornada;

-- ─── 5. Recriar índices ───────────────────────────────────
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

PRAGMA foreign_keys = ON;
