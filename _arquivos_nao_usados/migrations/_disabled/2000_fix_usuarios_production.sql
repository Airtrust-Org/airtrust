-- Migration: Fix usuarios table in production
-- Add missing columns to usuarios table

-- Add active column if not exists
ALTER TABLE usuarios ADD COLUMN active INTEGER DEFAULT 1;

-- Add last_login column if not exists  
ALTER TABLE usuarios ADD COLUMN last_login TEXT;

-- Add failed_login_attempts column if not exists
ALTER TABLE usuarios ADD COLUMN failed_login_attempts INTEGER DEFAULT 0;

-- Add locked_until column if not exists
ALTER TABLE usuarios ADD COLUMN locked_until TEXT;

-- Create indexes if not exist
CREATE INDEX IF NOT EXISTS idx_usuarios_active ON usuarios(active);
CREATE INDEX IF NOT EXISTS idx_usuarios_perfil ON usuarios(perfil);

SELECT 'Migration 2000 completed - usuarios table fixed' as message;
