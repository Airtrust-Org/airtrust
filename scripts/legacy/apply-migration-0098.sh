#!/bin/bash
# Script para aplicar migration 0098 manualmente via D1 HTTP API
# Uso: ./apply-migration-0098.sh

DATABASE_ID="4c88cfbd-a341-484a-b77a-7e99f74cfab6"
ACCOUNT_ID="seu-account-id-aqui"

echo "🚀 Aplicando Migration 0098: Sistema de Checks com Examinadores"
echo ""

# Executar cada comando SQL individualmente
echo "1. Adicionando campo is_examinador em funcionarios..."
npx wrangler d1 execute airtrust-db --env production --command="ALTER TABLE funcionarios ADD COLUMN is_examinador INTEGER NOT NULL DEFAULT 0;"

echo "2. Adicionando campos examinador_id e is_check em simulador_agendamentos..."
npx wrangler d1 execute airtrust-db --env production --command="ALTER TABLE simulador_agendamentos ADD COLUMN examinador_id INTEGER NULL;"
npx wrangler d1 execute airtrust-db --env production --command="ALTER TABLE simulador_agendamentos ADD COLUMN is_check INTEGER NOT NULL DEFAULT 0;"

echo "3. Criando tabela tipos_check..."
npx wrangler d1 execute airtrust-db --env production --command="CREATE TABLE IF NOT EXISTS tipos_check (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL UNIQUE, nome TEXT NOT NULL, descricao TEXT, qualificacao_tipo_id INTEGER NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT);"

echo "4. Criando tabela sessoes_checks..."
npx wrangler d1 execute airtrust-db --env production --command="CREATE TABLE IF NOT EXISTS sessoes_checks (id INTEGER PRIMARY KEY AUTOINCREMENT, sessao_id INTEGER NOT NULL, tipo_check_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT);"

echo "5. Criando tabela sessoes_checks_resultados..."
npx wrangler d1 execute airtrust-db --env production --command="CREATE TABLE IF NOT EXISTS sessoes_checks_resultados (id INTEGER PRIMARY KEY AUTOINCREMENT, sessao_check_id INTEGER NOT NULL, aprovado INTEGER NOT NULL DEFAULT 0, observacoes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT);"

echo "6. Adicionando campos em qualificacoes_historico..."
npx wrangler d1 execute airtrust-db --env production --command="ALTER TABLE qualificacoes_historico ADD COLUMN tipo_check_id INTEGER NULL;"
npx wrangler d1 execute airtrust-db --env production --command="ALTER TABLE qualificacoes_historico ADD COLUMN sessao_id INTEGER NULL;"

echo "7. Criando índices..."
npx wrangler d1 execute airtrust-db --env production --command="CREATE INDEX IF NOT EXISTS idx_funcionarios_examinador ON funcionarios(is_examinador, deleted_at);"
npx wrangler d1 execute airtrust-db --env production --command="CREATE INDEX IF NOT EXISTS idx_sessoes_examinador ON simulador_agendamentos(examinador_id, is_check, deleted_at);"
npx wrangler d1 execute airtrust-db --env production --command="CREATE INDEX IF NOT EXISTS idx_tipos_check_deleted ON tipos_check(deleted_at);"
npx wrangler d1 execute airtrust-db --env production --command="CREATE INDEX IF NOT EXISTS idx_sessoes_checks_sessao ON sessoes_checks(sessao_id, deleted_at);"
npx wrangler d1 execute airtrust-db --env production --command="CREATE INDEX IF NOT EXISTS idx_sessoes_checks_tipo ON sessoes_checks(tipo_check_id, deleted_at);"
npx wrangler d1 execute airtrust-db --env production --command="CREATE INDEX IF NOT EXISTS idx_checks_resultados ON sessoes_checks_resultados(sessao_check_id, deleted_at);"
npx wrangler d1 execute airtrust-db --env production --command="CREATE INDEX IF NOT EXISTS idx_qualificacoes_check ON qualificacoes_historico(tipo_check_id, sessao_id);"

echo ""
echo "✅ Migration 0098 aplicada com sucesso!"
echo ""
echo "Próximos passos:"
echo "1. Inserir tipos de check de exemplo via interface ou SQL"
echo "2. Marcar funcionários como examinadores na interface"
echo "3. Testar criação de sessão com examinador e checks"
