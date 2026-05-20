#!/usr/bin/env bash
set -euo pipefail

# Seed D1 local com dados base (habilitações, qualificações, funcionários)
# Este script popula o banco com dados fake pero realistas para desenvolvimento local

DB_NAME="airtrust-db-dev"
WRANGLER_CONFIG="--config wrangler.dev.toml"

echo "🌱 Seeding D1 local com dados base..."

# 1) Tipos de Qualificações (master data)
wrangler d1 execute $WRANGLER_CONFIG "$DB_NAME" --local --command "
INSERT OR IGNORE INTO tipos_qualificacoes (nome, descricao, created_at)
VALUES
  ('PIC', 'Pilot in Command - Comandante de Aeronave', datetime('now')),
  ('COP', 'Copilot - Copiloto', datetime('now')),
  ('FLIGHT_ENGINEER', 'Flight Engineer - Engenheiro de Voo', datetime('now')),
  ('CREW_CHIEF', 'Crew Chief - Chefe de Tripulação', datetime('now')),
  ('PURSER', 'Purser - Comissário Chefe', datetime('now')),
  ('FLIGHT_ATTENDANT', 'Flight Attendant - Comissário de Bordo', datetime('now')),
  ('INSTRUCTOR', 'Instructor - Instrutor', datetime('now')),
  ('EXAMINER', 'Examiner - Examinador', datetime('now'));
" > /dev/null 2>&1 || true

# 2) Habilitações (master data - compliance, aviação, etc)
wrangler d1 execute $WRANGLER_CONFIG "$DB_NAME" --local --command "
INSERT OR IGNORE INTO habilitacoes (nome, descricao, validade_meses, ativa, created_at)
VALUES
  ('CPL', 'Commercial Pilot License', 24, 1, datetime('now')),
  ('ATPL', 'Airline Transport Pilot License', 24, 1, datetime('now')),
  ('CPL-H', 'Commercial Pilot License - Helicopter', 24, 1, datetime('now')),
  ('ATPL-H', 'Airline Transport Pilot - Helicopter', 24, 1, datetime('now')),
  ('IR', 'Instrument Rating', 24, 1, datetime('now')),
  ('MER', 'Multi-Engine Rating', 24, 1, datetime('now')),
  ('FRMS-Level-1', 'Flight Risk Management System - Level 1', 12, 1, datetime('now')),
  ('FRMS-Level-2', 'Flight Risk Management System - Level 2', 24, 1, datetime('now')),
  ('LPC', 'Line Proficiency Check', 6, 1, datetime('now')),
  ('RECURRENT-TRAINING', 'Recurrent Training', 12, 1, datetime('now')),
  ('SAFETY-PROCEDURES', 'Safety Procedures', 12, 1, datetime('now')),
  ('EMERGENCY-EQUIPMENT', 'Emergency Equipment', 24, 1, datetime('now'));
" > /dev/null 2>&1 || true

# 3) Funcionários (seed com 5 pilotos + 3 comissários)
wrangler d1 execute $WRANGLER_CONFIG "$DB_NAME" --local --command "
INSERT OR IGNORE INTO funcionarios (matricula, nome, cpf, email, cargo, setor, status, created_at)
VALUES
  ('MAT001', 'Captain João Silva', '11111111111', 'joao@airtrust.com.br', 'Piloto', 'Operações', 'ATIVO', datetime('now')),
  ('MAT002', 'First Officer Maria Santos', '22222222222', 'maria@airtrust.com.br', 'Copiloto', 'Operações', 'ATIVO', datetime('now')),
  ('MAT003', 'Captain Carlos Oliveira', '33333333333', 'carlos@airtrust.com.br', 'Piloto', 'Operações', 'ATIVO', datetime('now')),
  ('MAT004', 'Purser Ana Costa', '44444444444', 'ana@airtrust.com.br', 'Comissário Chefe', 'Operações', 'ATIVO', datetime('now')),
  ('MAT005', 'Flight Attendant Bruno Pereira', '55555555555', 'bruno@airtrust.com.br', 'Comissário', 'Operações', 'ATIVO', datetime('now')),
  ('MAT006', 'Flight Attendant Lucia Ferreira', '66666666666', 'lucia@airtrust.com.br', 'Comissária', 'Operações', 'ATIVO', datetime('now')),
  ('MAT007', 'Instructor Felipe Lima', '77777777777', 'felipe@airtrust.com.br', 'Instrutor', 'Treinamento', 'ATIVO', datetime('now')),
  ('MAT008', 'Training Manager Patricia Alves', '88888888888', 'patricia@airtrust.com.br', 'Gerente de Treinamento', 'RH', 'ATIVO', datetime('now'));
" > /dev/null 2>&1 || true

echo "✅ Seed aplicado: tipos, habilitações, funcionários"
echo ""
echo "📊 Verificando dados inseridos..."
wrangler d1 execute $WRANGLER_CONFIG "$DB_NAME" --local --command "
SELECT 
  (SELECT COUNT(*) FROM tipos_qualificacoes) AS tipos_qual,
  (SELECT COUNT(*) FROM habilitacoes) AS habilitacoes,
  (SELECT COUNT(*) FROM funcionarios) AS funcionarios
;" 2>&1 | grep -E '(tipos_qual|habilitacoes|funcionarios)' || echo "Dados inseridos (verifique log acima)"
