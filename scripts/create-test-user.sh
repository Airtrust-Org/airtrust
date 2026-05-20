#!/bin/bash

# Script para criar usuário de teste E2E no sistema
# Usa bcrypt para hash de senha

echo "🔐 Criando usuário de teste para E2E..."

# Gerar hash bcrypt da senha "TestE2E@2025!"
# Hash pré-calculado: $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGJad68LIZdnwyh0TC

cat << 'EOF' > /tmp/create_test_user.sql
-- Verificar se usuário já existe
SELECT CASE 
  WHEN EXISTS (SELECT 1 FROM usuarios WHERE email = 'test.e2e@airtrust.com')
  THEN 'Usuário já existe'
  ELSE 'Criando novo usuário...'
END as status;

-- Criar usuário de teste (apenas se não existir)
INSERT OR IGNORE INTO usuarios (
  id,
  email,
  password,
  nome,
  role,
  ativo,
  created_at,
  updated_at,
  deleted_at
) VALUES (
  'test-e2e-user-001',
  'test.e2e@airtrust.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGJad68LIZdnwyh0TC',
  'Test E2E User',
  'admin',
  1,
  datetime('now'),
  datetime('now'),
  NULL
);

-- Confirmar criação
SELECT 
  email,
  nome,
  role,
  ativo,
  created_at
FROM usuarios 
WHERE email = 'test.e2e@airtrust.com';
EOF

echo "📄 Script SQL criado em /tmp/create_test_user.sql"
echo ""
echo "Para executar, use um dos métodos:"
echo ""
echo "1️⃣ Via Cloudflare Dashboard:"
echo "   https://dash.cloudflare.com → Workers & Pages → airtrust-db → Console"
echo "   Cole o conteúdo de /tmp/create_test_user.sql"
echo ""
echo "2️⃣ Via Wrangler (local - dev):"
echo "   npx wrangler d1 execute airtrust-db --local --file=/tmp/create_test_user.sql"
echo ""
echo "3️⃣ Via Wrangler (remoto - produção):"
echo "   npx wrangler d1 execute airtrust-db --remote --file=/tmp/create_test_user.sql"
echo ""
echo "📝 Credenciais criadas:"
echo "   Email: test.e2e@airtrust.com"
echo "   Senha: TestE2E@2025!"
echo ""

cat /tmp/create_test_user.sql
