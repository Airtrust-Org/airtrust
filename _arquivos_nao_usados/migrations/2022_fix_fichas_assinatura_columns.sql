-- Migration: Fix missing signature columns in fichas/sessoes_simulador
-- Date: 2025-11-05
-- Purpose: Add missing columns for digital signatures in fichas (sessoes_simulador) table
-- Tables: sessoes_simulador (main ficha table)

-- Add signature columns if they don't exist
ALTER TABLE sessoes_simulador ADD COLUMN assinatura_instrutor_data TEXT DEFAULT NULL;
ALTER TABLE sessoes_simulador ADD COLUMN assinatura_instrutor_hash TEXT DEFAULT NULL;
ALTER TABLE sessoes_simulador ADD COLUMN assinatura_instrutor_protocolo TEXT DEFAULT NULL;
ALTER TABLE sessoes_simulador ADD COLUMN assinatura_instrutor_ip TEXT DEFAULT NULL;

ALTER TABLE sessoes_simulador ADD COLUMN assinatura_tripulante_data TEXT DEFAULT NULL;
ALTER TABLE sessoes_simulador ADD COLUMN assinatura_tripulante_hash TEXT DEFAULT NULL;
ALTER TABLE sessoes_simulador ADD COLUMN assinatura_tripulante_protocolo TEXT DEFAULT NULL;
ALTER TABLE sessoes_simulador ADD COLUMN assinatura_tripulante_ip TEXT DEFAULT NULL;

ALTER TABLE sessoes_simulador ADD COLUMN assinatura_checador_data TEXT DEFAULT NULL;
ALTER TABLE sessoes_simulador ADD COLUMN assinatura_checador_hash TEXT DEFAULT NULL;
ALTER TABLE sessoes_simulador ADD COLUMN assinatura_checador_protocolo TEXT DEFAULT NULL;
ALTER TABLE sessoes_simulador ADD COLUMN assinatura_checador_ip TEXT DEFAULT NULL;

-- Create indices for signature tracking
CREATE INDEX IF NOT EXISTS idx_sessoes_assinatura_instrutor ON sessoes_simulador(assinatura_instrutor_data);
CREATE INDEX IF NOT EXISTS idx_sessoes_assinatura_tripulante ON sessoes_simulador(assinatura_tripulante_data);
CREATE INDEX IF NOT EXISTS idx_sessoes_assinatura_checador ON sessoes_simulador(assinatura_checador_data);

