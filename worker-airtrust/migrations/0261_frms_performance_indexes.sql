-- Migration 0261: FRMS performance indexes
-- Part of FASE 4 performance work
-- Adds the composite (tripulante_id, nivel) index on frms_alerta
-- that was missing and enables efficient queries filtering by both columns.
-- Other composite indexes (rolling, jornada) already exist.

-- Already exists separately: idx_frms_alerta_trip (tripulante_id only)
-- This composite index supersedes it for queries filtering tripulante+nivel
CREATE INDEX IF NOT EXISTS idx_frms_alerta_trip_nivel
  ON frms_alerta(tripulante_id, nivel)
  WHERE deleted_at IS NULL;
