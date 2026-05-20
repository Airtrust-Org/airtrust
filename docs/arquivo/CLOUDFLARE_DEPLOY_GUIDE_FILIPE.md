# 🚀 AirTrust Worker V2 - Deploy Cloudflare (Seu Account)

**Usuário**: Filipe.daumas@icloud.com  
**Account ID**: 0199d03e-fe13-77d7-a6e7-7d94d446894b  
**Data**: 14 de Novembro de 2025

---

## ✅ Verificação Pré-Deploy

### Seu Dashboard Cloudflare Mostra:

- ✅ Account ativo (Filipe.daumas@icloud.com)
- ✅ Workers & Pages já criado
- ✅ D1 SQL database disponível
- ✅ airtrust-v2 worker já existe
- ✅ airtrust-db (D1) já existe
- ⚠️ "Latest build failed" - vamos corrigir isso

---

## 🎯 Roteiro de Deploy em 5 Passos

### **PASSO 1: Verificar Credenciais Cloudflare**

```bash
cd "/workspaces/airtrust v1"

# Verificar se está autenticado
wrangler whoami

# Resposta esperada: deve mostrar seu email e account ID
# Se NÃO estiver autenticado:
wrangler login
```

### **PASSO 2: Verificar/Atualizar wrangler-v2.toml com Account ID**

```bash
# Abrir o arquivo
cat wrangler-v2.toml | head -30
```

**Procure por:**

```toml
account_id = "0199d03e-fe13-77d7-a6e7-7d94d446894b"  # ← Seu Account ID
name = "airtrust-worker-v2"
```

Se não tiver `account_id`, adicione:

```toml
account_id = "0199d03e-fe13-77d7-a6e7-7d94d446894b"
```

### **PASSO 3: Criar/Verificar D1 Databases**

```bash
# Listar databases D1 existentes
wrangler d1 list

# Se NÃO tiver airtrust-db-staging, criar:
wrangler d1 create airtrust-db-staging

# Copiar o ID que será exibido e guardar:
# Database ID: xxxxx-xxxxx-xxxxx-xxxxx-xxxxx
```

### **PASSO 4: Aplicar Migrations**

```bash
# Aplicar migrations no staging
wrangler d1 migrations apply airtrust-db-staging --env staging

# Se tiver sucesso, aparecerá:
# ✅ Migrated airtrust-db-staging (...)
```

### **PASSO 5: Fazer Deploy**

```bash
# Deploy para Staging (primeiro!)
wrangler deploy --config wrangler-v2.toml --env staging

# Resposta esperada:
# ✨ Build successful! Deployed to airtrust-worker-v2-staging.seu-account.workers.dev
```

---

## 🔑 Configurar JWT_SECRET (Obrigatório)

```bash
# Gerar uma chave segura (mínimo 32 caracteres)
# Opção 1: Usar uma string segura
JWT_SECRET="airtrust-secret-key-min-32-chars-12345678"

# Opção 2: Gerar aleatória (macOS/Linux)
openssl rand -hex 32

# Configurar no Cloudflare (staging)
wrangler secret put JWT_SECRET --env staging
# Cole o valor quando solicitado

# Configurar em produção (DIFERENTE do staging!)
wrangler secret put JWT_SECRET --env production
```

---

## 📊 Seu Cloudflare - Estrutura Atual

```
Sua Conta: Filipe.daumas@icloud.com
├─ Account ID: 0199d03e-fe13-77d7-a6e7-7d94d446894b
│
├─ Workers & Pages
│  ├─ airtrust-v2 ← Seu worker atual (pode estar desatualizado)
│  └─ airtrust-worker-v2 ← Novo (que vamos fazer deploy)
│
├─ D1 Databases
│  ├─ airtrust-db ← Banco atual
│  ├─ airtrust-db-staging ← (vamos criar se não tiver)
│  └─ airtrust-db-production ← (criar após staging OK)
│
└─ Settings
   └─ Workers Plans (verificar limite de requisições)
```

---

## 🟢 Deploy Completo (Passo a Passo)

### **Step 1: Login Cloudflare**

```bash
cd "/workspaces/airtrust v1"
wrangler login
# Browser abrirá, clique em "Authorize Wrangler"
# Volta para terminal com: ✅ Successfully logged in!
```

### **Step 2: Verificar Sua Conta**

```bash
wrangler whoami
# Output: Account Home URL: https://dash.cloudflare.com
#         Account ID: 0199d03e-fe13-77d7-a6e7-7d94d446894b
#         Email: Filipe.daumas@icloud.com
```

### **Step 3: Verificar/Atualizar wrangler-v2.toml**

```bash
# Verificar se tem account_id
grep "account_id" wrangler-v2.toml

# Se NÃO tiver, adicionar no início do arquivo (após linhas de comentário):
# account_id = "0199d03e-fe13-77d7-a6e7-7d94d446894b"
```

### **Step 4: Criar D1 Staging**

```bash
wrangler d1 create airtrust-db-staging

# Output será algo como:
# Creating database airtrust-db-staging in account Filipe...
# Database ID: 12345678-1234-1234-1234-123456789abc
#
# Add to wrangler-v2.toml:
# [[env.staging.d1_databases]]
# binding = "DB"
# database_name = "airtrust-db-staging"
# database_id = "12345678-1234-1234-1234-123456789abc"
```

**Copiar a linha e adicionar em wrangler-v2.toml na seção `[env.staging]`**

### **Step 5: Aplicar Migrations Staging**

```bash
wrangler d1 migrations apply airtrust-db-staging --env staging

# Output:
# Applying migration: migrations/001_initial_schema.sql
# Applying migration: migrations/002_qualificacoes_split.sql
# Applying migration: migrations/003_create_usuarios.sql
# ✅ All migrations applied!
```

### **Step 6: Configurar JWT_SECRET Staging**

```bash
wrangler secret put JWT_SECRET --env staging

# Após apertar ENTER, cola uma chave segura (exemplo):
# airtrust-dev-secret-key-min-32-characters-here-12345

# Confirma com ENTER e:
# ✅ Uploaded secret JWT_SECRET
```

### **Step 7: Deploy Staging**

```bash
wrangler deploy --config wrangler-v2.toml --env staging

# Output:
# Compiling Worker to WebAssembly...
# ✨ Build successful!
# Deployed airtrust-worker-v2-staging to:
# 🔓 https://airtrust-worker-v2-staging.0199d03e.workers.dev
```

**🎉 URL Staging: `https://airtrust-worker-v2-staging.0199d03e.workers.dev`**

### **Step 8: Testar Staging**

```bash
# Health check
curl https://airtrust-worker-v2-staging.0199d03e.workers.dev/api/health | jq .

# Deve retornar:
# {
#   "success": true,
#   "data": {
#     "status": "ok",
#     "environment": "staging"
#   }
# }
```

### **Step 9: Criar D1 Production**

```bash
wrangler d1 create airtrust-db-production

# Copiar o ID e adicionar em wrangler-v2.toml [env.production]
```

### **Step 10: Backup Production (Importante!)**

```bash
wrangler d1 export airtrust-db-production --output backup-airtrust-prod-20251114.sql

# Arquivo salvo localmente para recuperação se necessário
```

### **Step 11: Aplicar Migrations Production**

```bash
wrangler d1 migrations apply airtrust-db-production --env production
```

### **Step 12: Configurar JWT_SECRET Production**

```bash
wrangler secret put JWT_SECRET --env production

# Use uma chave DIFERENTE do staging (mais segura!)
```

### **Step 13: Deploy Production**

```bash
wrangler deploy --config wrangler-v2.toml --env production

# URL Production será exibida
```

### **Step 14: Testar Production**

```bash
curl https://airtrust-worker-v2.0199d03e.workers.dev/api/health | jq .
```

---

## 🤖 Usar Script Automático (Recomendado)

Se tudo estiver configurado corretamente, pode rodar:

```bash
cd "/workspaces/airtrust v1"

# Tornar script executável (se não estiver)
chmod +x deploy-worker-v2.sh

# Executar deploy completo
./deploy-worker-v2.sh both

# O script:
# 1. Verifica Wrangler
# 2. Verifica autenticação
# 3. Cria D1 staging + production
# 4. Aplica migrations
# 5. Configura JWT_SECRET
# 6. Faz deploy
# 7. Testa endpoints
# 8. Mostra URLs finais
```

---

## 📡 URLs Finais (Após Deploy)

```
🟢 STAGING:
   Base: https://airtrust-worker-v2-staging.0199d03e.workers.dev
   API:  https://airtrust-worker-v2-staging.0199d03e.workers.dev/api

🔵 PRODUCTION:
   Base: https://airtrust-worker-v2.0199d03e.workers.dev
   API:  https://airtrust-worker-v2.0199d03e.workers.dev/api

📊 Dashboard:
   https://dash.cloudflare.com/0199d03e-fe13-77d7-a6e7-7d94d446894b/workers-and-pages
```

---

## 🧪 Testar Endpoints (Após Deploy)

### Health Check (sem auth)

```bash
curl https://airtrust-worker-v2-staging.0199d03e.workers.dev/api/health
```

### Criar Funcionário (sem auth, ainda desabilitada)

```bash
curl -X POST https://airtrust-worker-v2-staging.0199d03e.workers.dev/api/funcionarios \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Filipe Daumas",
    "cpf": "12345678901",
    "email": "filipe@airtrust.com.br",
    "funcao": "Piloto",
    "cargo": "Capitão"
  }' | jq .
```

### Listar Funcionários

```bash
curl https://airtrust-worker-v2-staging.0199d03e.workers.dev/api/funcionarios | jq .
```

---

## 🔐 Ativar Autenticação (Quando Pronto)

Por enquanto está **desabilitada**. Para ativar depois:

1. Descomentar imports em `src/worker-v2/index.ts`
2. Aplicar auth middleware
3. Redeploy

Ver `DEPLOYMENT_WORKER_V2_GUIDE.md` para instruções completas.

---

## ⚙️ Monitorar Deploy no Dashboard

Depois de fazer deploy, pode acompanhar em:

1. Ir para: https://dash.cloudflare.com/
2. Login com: Filipe.daumas@icloud.com
3. Selecionar: Workers & Pages → airtrust-worker-v2
4. Ver:
   - **Overview**: Status do worker
   - **Deployments**: Histórico de deploys
   - **Metrics**: Requisições, latência, erros
   - **Logs**: Errors e warnings em tempo real

---

## 🚨 Troubleshooting

### "Failed to login"

```bash
# Solução: Fazer login novamente
wrangler login
```

### "Account ID not found"

```bash
# Adicionar ao wrangler-v2.toml:
account_id = "0199d03e-fe13-77d7-a6e7-7d94d446894b"
```

### "D1 database not found"

```bash
# Verificar ID do banco
wrangler d1 list

# Ou criar novo
wrangler d1 create airtrust-db-staging
```

### "JWT_SECRET not configured"

```bash
# Configurar secret
wrangler secret put JWT_SECRET --env staging
```

### "Build failed"

```bash
# Verificar erros TypeScript
npm run build

# Se houver erros, corrigi-los e tentar deploy novamente
```

---

## ✅ Checklist Final

- [ ] Autenticado no Cloudflare (`wrangler whoami`)
- [ ] Account ID correto em wrangler-v2.toml
- [ ] D1 Staging criado e ID atualizado
- [ ] D1 Production criado e ID atualizado
- [ ] Migrations aplicadas (staging + production)
- [ ] JWT_SECRET configurado (staging + production)
- [ ] Deploy staging bem-sucedido
- [ ] Deploy production bem-sucedido
- [ ] Health check funcionando em ambas URLs
- [ ] URLs anotadas e compartilhadas com team

---

## 🎉 Próximas Ações

1. **Imediato**: Executar script deploy ou comandos acima
2. **Hoje**: Testar endpoints básicos (health, criar funcionário)
3. **Amanhã**: Habilitar autenticação JWT
4. **Semana que vem**: Setup CI/CD GitHub Actions

---

**Seu Account**: Filipe.daumas@icloud.com  
**Account ID**: 0199d03e-fe13-77d7-a6e7-7d94d446894b  
**Criado em**: 14 de Novembro de 2025  
**Status**: 🟢 Pronto para deploy
