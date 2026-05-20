-- Migration 0224: Adicionar empresa_id a simulador_agendamentos
-- Fix auditoria H-1: sem empresa_id → qualquer empresa via lista sessões

-- Adicionar coluna (DEFAULT NULL para não quebrar rows existentes)
ALTER TABLE simulador_agendamentos ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);

-- Backfill: empresa_id vem do instrutor da sessão
UPDATE simulador_agendamentos
SET empresa_id = (
  SELECT f.empresa_id
  FROM funcionarios f
  WHERE f.id = simulador_agendamentos.instrutor_id
    AND f.empresa_id IS NOT NULL
  LIMIT 1
)
WHERE empresa_id IS NULL;

-- Fallback: registros sem instrutor ou instrutor sem empresa ficam com a empresa padrão (id mínimo da tabela empresas)
UPDATE simulador_agendamentos
SET empresa_id = (SELECT MIN(id) FROM empresas WHERE deleted_at IS NULL LIMIT 1)
WHERE empresa_id IS NULL;

-- Índice para performance
CREATE INDEX IF NOT EXISTS idx_simulador_agendamentos_empresa ON simulador_agendamentos(empresa_id);
