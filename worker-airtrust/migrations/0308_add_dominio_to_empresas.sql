-- Migration 0308: Add email domain field to empresas for auto-company detection at login
ALTER TABLE empresas ADD COLUMN dominio TEXT;
