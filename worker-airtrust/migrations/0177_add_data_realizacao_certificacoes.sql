-- ============================================
-- Migration: Add data_realizacao fields to funcionarios table
-- Description: Adds completion date fields for ICAO, CMA, and ASO certifications
--              to enable automatic expiration calculation
-- Date: 2025-11-13
-- ============================================

-- Add data_realizacao fields for certifications
ALTER TABLE funcionarios ADD COLUMN data_realizacao_icao TEXT;
ALTER TABLE funcionarios ADD COLUMN data_realizacao_cma TEXT;
ALTER TABLE funcionarios ADD COLUMN data_realizacao_aso TEXT;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_funcionarios_data_realizacao_icao ON funcionarios(data_realizacao_icao);
CREATE INDEX IF NOT EXISTS idx_funcionarios_data_realizacao_cma ON funcionarios(data_realizacao_cma);
CREATE INDEX IF NOT EXISTS idx_funcionarios_data_realizacao_aso ON funcionarios(data_realizacao_aso);
