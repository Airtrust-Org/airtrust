-- Migration: 0217_frms_importacao_fira.sql
-- Adiciona suporte à importação de FIRAs (Fichas Individuais do Aeronauta)

-- ─────────────────────────────────────────────────
-- 1) Coluna local_base em frms_jornada (ICAO do dia)
-- ─────────────────────────────────────────────────
ALTER TABLE frms_jornada ADD COLUMN local_base TEXT DEFAULT NULL;

-- ─────────────────────────────────────────────────
-- 2) Tabela de controle de importações FIRA
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS frms_importacao_fira (
  id                       TEXT PRIMARY KEY,
  tripulante_id            TEXT,
  canac                    TEXT NOT NULL,
  nome_fira                TEXT NOT NULL,
  ano                      INTEGER NOT NULL,
  mes                      INTEGER NOT NULL,
  arquivo_nome             TEXT NOT NULL,
  arquivo_r2_key           TEXT,
  status                   TEXT NOT NULL DEFAULT 'PENDENTE',
  -- PENDENTE | REVISAO | IMPORTADO | REJEITADO | ERRO
  total_dias_extraidos     INTEGER DEFAULT 0,
  total_dias_importados    INTEGER DEFAULT 0,
  total_dias_substituidos  INTEGER DEFAULT 0,
  total_dias_ignorados     INTEGER DEFAULT 0,
  total_dias_erro          INTEGER DEFAULT 0,
  erros_json               TEXT,
  revisado_por             TEXT,
  revisado_em              TEXT,
  importado_por            TEXT NOT NULL,
  importado_em             TEXT,
  observacao               TEXT,
  importacao_anterior_id   TEXT DEFAULT NULL,
  -- preview_json guarda o FiraImportacaoPreview completo para re-uso
  preview_json             TEXT,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL,
  deleted_at               TEXT
);

CREATE INDEX IF NOT EXISTS idx_fira_canac
  ON frms_importacao_fira(canac)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fira_tripulante
  ON frms_importacao_fira(tripulante_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fira_status
  ON frms_importacao_fira(status)
  WHERE deleted_at IS NULL;

-- Permite múltiplas importações do mesmo período (importações cumulativas)
CREATE INDEX IF NOT EXISTS idx_fira_periodo
  ON frms_importacao_fira(canac, ano, mes)
  WHERE deleted_at IS NULL;
