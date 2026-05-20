-- Migration 0248: Add periodo field to escalas_mensais
-- Stores which fortnight period the escala covers
-- Values: 'primeira' | 'segunda' | 'personalizada'

ALTER TABLE escalas_mensais ADD COLUMN periodo TEXT
  CHECK(periodo IN ('primeira', 'segunda', 'personalizada'))
  DEFAULT 'personalizada';
