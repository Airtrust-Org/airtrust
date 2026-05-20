# 🔍 Como Encontrar Seu Global API Token

Se você usava Cloudflare antes via terminal/CLI, você pode ter um **Global API Token**.

## Onde Encontrar

1. Abra: https://dash.cloudflare.com/profile/api-tokens
2. Role para baixo até a seção: **"API Tokens"**
3. Procure por: **"Global API Token"** (geralmente tem um aviso amarelo: "⚠️ This API token has full account access")
4. Clique em **"View"** ou **"Use"**
5. Copie o token (começa com seu email, não com `v1.0-`)

## Se Encontrou o Global API Token

Execute:

```bash
cd '/workspaces/airtrust v1'

# Cole seu Global API Token aqui
export CLOUDFLARE_API_TOKEN="seu_global_token_aqui"

# Cole seu email aqui
export CLOUDFLARE_EMAIL="filipe.daumas@icloud.com"

# Teste:
npx wrangler whoami

# Deploy:
npx wrangler deploy --env=""
```

---

## Se NÃO Encontrou

Você vai precisar criar um novo token via Dashboard com as permissões:

1. Abra: https://dash.cloudflare.com/profile/api-tokens
2. Clique "Create Token"
3. Selecione "Custom Token"
4. Adicione TODAS estas permissões:
   - ✅ Account - D1 - Edit
   - ✅ Account - D1 - Read
   - ✅ Account - Cloudflare Workers Scripts - Edit
   - ✅ Account - Cloudflare Workers Scripts - Read
   - ✅ Account - Cloudflare Workers KV - Write
   - ✅ Account - Cloudflare Workers KV - Read
   - ✅ Account - Cloudflare Workers R2 Storage - Edit
   - ✅ Account - Cloudflare Workers R2 Storage - Read
   - ✅ Account - Cloudflare Workers Tail - Read
   - ✅ Account - Account Settings - Read
   - ✅ User - User Details - Read (necessário!)
   - ✅ Account - Memberships - Read (necessário!)

---

**Qual é o seu caso? Tem Global API Token ou vai criar novo?**
