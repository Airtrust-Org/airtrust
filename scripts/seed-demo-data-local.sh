#!/bin/bash
set -euo pipefail

# Script para seed de dados de demonstração no D1 local
# Popula tabelas mínimas com alguns registros para dev/demo

WORKER_DIR="$(cd "$(dirname "$0")/.." && pwd)/worker-airtrust"
LOCAL_DB="DB"

cd "$WORKER_DIR"

echo "🌱 Seed de dados de demonstração - D1 Local"

# Garantir tabelas mínimas
echo "📋 Criando schemas mínimos..."
npx wrangler d1 execute "$LOCAL_DB" --local --command "CREATE TABLE IF NOT EXISTS funcionarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  matricula TEXT UNIQUE,
  email TEXT,
  cargo TEXT,
  deleted_at TEXT
)" >/dev/null

npx wrangler d1 execute "$LOCAL_DB" --local --command "CREATE TABLE IF NOT EXISTS qualificacoes_tipos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  codigo TEXT UNIQUE,
  categoria TEXT,
  descricao TEXT,
  deleted_at TEXT
)" >/dev/null

npx wrangler d1 execute "$LOCAL_DB" --local --command "CREATE TABLE IF NOT EXISTS qualificacoes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER,
  qualificacao_id INTEGER,
  categoria TEXT,
  validade TEXT,
  codigo TEXT,
  numero_certificado TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
)" >/dev/null

npx wrangler d1 execute "$LOCAL_DB" --local --command "CREATE TABLE IF NOT EXISTS certificados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER,
  qualificacao_id INTEGER,
  numero_certificado TEXT UNIQUE,
  data_emissao TEXT,
  data_vencimento TEXT,
  arquivo_url TEXT,
  arquivo_nome TEXT,
  arquivo_tamanho INTEGER,
  arquivo_hash TEXT,
  tipo TEXT DEFAULT 'demo',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
)" >/dev/null

npx wrangler d1 execute "$LOCAL_DB" --local --command "CREATE TABLE IF NOT EXISTS qualificacoes_categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  codigo TEXT NOT NULL UNIQUE,
  descricao TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  cor TEXT DEFAULT '#6B7280',
  ativo INTEGER DEFAULT 1
)" >/dev/null

# Limpar dados antigos
echo "🧹 Limpando dados anteriores..."
npx wrangler d1 execute "$LOCAL_DB" --local --command "DELETE FROM funcionarios WHERE deleted_at IS NULL" >/dev/null || true
npx wrangler d1 execute "$LOCAL_DB" --local --command "DELETE FROM qualificacoes_tipos WHERE deleted_at IS NULL" >/dev/null || true
npx wrangler d1 execute "$LOCAL_DB" --local --command "DELETE FROM qualificacoes_historico WHERE deleted_at IS NULL" >/dev/null || true
npx wrangler d1 execute "$LOCAL_DB" --local --command "DELETE FROM certificados WHERE deleted_at IS NULL" >/dev/null || true
npx wrangler d1 execute "$LOCAL_DB" --local --command "DELETE FROM qualificacoes_categorias WHERE deleted_at IS NULL" >/dev/null || true

# Seed funcionarios
echo "👥 Inserindo funcionarios..."
npx wrangler d1 execute "$LOCAL_DB" --local --command "INSERT INTO funcionarios (nome, matricula, email, cargo) VALUES
  ('Eduardo Luiz Brandão Ribeiro', 'EDU001', 'eduardo@airtrust.com', 'Piloto'),
  ('João Silva Santos', 'JOA001', 'joao@airtrust.com', 'Instrutor'),
  ('Maria Oliveira Costa', 'MAR001', 'maria@airtrust.com', 'Piloto'),
  ('Carlos Ferreira Martins', 'CAR001', 'carlos@airtrust.com', 'Técnico')" >/dev/null

# Seed categorias
echo "🏷️  Inserindo categorias..."
npx wrangler d1 execute "$LOCAL_DB" --local --command "INSERT INTO qualificacoes_categorias (nome, codigo, descricao, cor, ativo) VALUES
  ('Certificado', 'CERT', 'Certificado de habilitação', '#3B82F6', 1),
  ('Renovação', 'RENOV', 'Renovação de certificado', '#10B981', 1),
  ('Treinamento', 'TRAIN', 'Treinamento operacional', '#F59E0B', 1),
  ('Simulador', 'SIM', 'Treinamento em simulador', '#8B5CF6', 1)" >/dev/null

# Seed tipos de qualificações
echo "📚 Inserindo tipos de qualificacoes..."
npx wrangler d1 execute "$LOCAL_DB" --local --command "INSERT INTO qualificacoes_tipos (nome, codigo, categoria, descricao) VALUES
  ('Piloto Comercial - Asa Fixa', 'CPL-FW', 'CERT', 'Comercial asa fixa'),
  ('Piloto Comercial - Helicóptero', 'CPL-HLI', 'CERT', 'Comercial helicóptero'),
  ('Instrumento - Asa Fixa', 'IR-FW', 'CERT', 'Habilitação de instrumento'),
  ('Multimotores - Asa Fixa', 'ME-FW', 'CERT', 'Habilitação multimotores'),
  ('MCC - Crew Resource Management', 'MCC-CRM', 'TRAIN', 'Treinamento CRM'),
  ('UPRT - Upset Recovery', 'UPRT', 'TRAIN', 'Treinamento de recuperação de atitude'),
  ('Segurança em Voo - Teórico', 'SAF-TEO', 'TRAIN', 'Teórico segurança'),
  ('Proficiência Anual', 'PROF-ANUAL', 'RENOV', 'Teste de proficiência anual')" >/dev/null

# Seed historico + certificados
echo "📜 Inserindo histórico e certificados..."
npx wrangler d1 execute "$LOCAL_DB" --local --command "INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, categoria, validade, codigo, numero_certificado) VALUES
  (1, 1, 'CERT', '2026-07-31', 'CPL-FW', 'CERT-001-2024'),
  (1, 3, 'CERT', '2025-12-15', 'IR-FW', 'CERT-002-2024'),
  (1, 4, 'CERT', '2026-03-20', 'ME-FW', 'CERT-003-2024'),
  (2, 1, 'CERT', '2025-11-30', 'CPL-FW', 'CERT-004-2024'),
  (2, 5, 'TRAIN', '2026-01-10', 'MCC-CRM', 'TRAIN-001-2024'),
  (3, 2, 'CERT', '2026-09-15', 'CPL-HLI', 'CERT-005-2024'),
  (3, 5, 'TRAIN', '2025-12-20', 'MCC-CRM', 'TRAIN-002-2024'),
  (4, 1, 'CERT', '2024-10-25', 'CPL-FW', 'CERT-006-2024')" >/dev/null

npx wrangler d1 execute "$LOCAL_DB" --local --command "INSERT INTO certificados (funcionario_id, qualificacao_id, numero_certificado, data_emissao, data_vencimento, arquivo_nome, tipo) VALUES
  (1, 1, 'CERT-001-2024', '2023-07-31', '2026-07-31', 'CPL-Brandao.pdf', 'demo'),
  (1, 3, 'CERT-002-2024', '2022-12-15', '2025-12-15', 'IR-Brandao.pdf', 'demo'),
  (1, 4, 'CERT-003-2024', '2024-03-20', '2026-03-20', 'ME-Brandao.pdf', 'demo'),
  (2, 1, 'CERT-004-2024', '2024-11-30', '2025-11-30', 'CPL-Silva.pdf', 'demo'),
  (2, 5, 'TRAIN-001-2024', '2025-01-10', '2026-01-10', 'MCC-Silva.pdf', 'demo'),
  (3, 2, 'CERT-005-2024', '2023-09-15', '2026-09-15', 'CPL-HLI-Costa.pdf', 'demo'),
  (3, 5, 'TRAIN-002-2024', '2024-12-20', '2025-12-20', 'MCC-Costa.pdf', 'demo'),
  (4, 1, 'CERT-006-2024', '2021-10-25', '2024-10-25', 'CPL-Ferreira.pdf', 'demo')" >/dev/null

# Estatísticas
echo ""
echo "📊 Estatísticas inseridas:"
npx wrangler d1 execute "$LOCAL_DB" --local --json --command "SELECT 
  (SELECT COUNT(*) FROM funcionarios WHERE deleted_at IS NULL) as funcionarios,
  (SELECT COUNT(*) FROM qualificacoes_tipos WHERE deleted_at IS NULL) as tipos,
  (SELECT COUNT(*) FROM qualificacoes_historico WHERE deleted_at IS NULL) as historico,
  (SELECT COUNT(*) FROM certificados WHERE deleted_at IS NULL) as certificados" | jq '.results[0] | to_entries[] | "\(.key): \(.value)"' | tr -d '"'

echo ""
echo "✅ Seed concluído!"
echo "🌐 Visite http://localhost:3000/qualificacoes para ver os dados"
