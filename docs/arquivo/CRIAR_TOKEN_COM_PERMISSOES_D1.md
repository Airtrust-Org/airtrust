# 🔑 Como Criar um Novo API Token com Permissões D1

## Seu Situation Atual

- ✅ Frontend deployado: `https://production.airtrust.pages.dev`
- ✅ Worker deployado: `https://airtrust-worker.airtrust.workers.dev`
- ❌ Token atual NÃO tem permissões D1 (erro 7403)
- ❌ Banco D1 não consegue ser acessado

## Solução: Criar Novo Token com Permissões D1

### Passo 1: Acesse o Cloudflare Dashboard

1. Abra: https://dash.cloudflare.com/
2. Faça login com: **filipe.daumas@icloud.com**

### Passo 2: Vá para API Tokens

1. Clique no seu perfil (canto superior direito)
2. Selecione **"My Profile"** ou **"Perfil"**
3. Na esquerda, clique em **"API Tokens"**

### Passo 3: Crie um Novo Token

1. Clique em **"Create Token"**
2. Selecione **"Custom Token"**
3. Configure assim:

**Nome do Token:**

```
airtrust-d1-worker-2025
```

**Permissões:**

- ✅ Account → D1 → Edit
- ✅ Account → Cloudflare Workers Scripts → Edit
- ✅ Account → Cloudflare Workers KV → Write
- ✅ Account → Cloudflare Workers R2 Storage → Edit
- ✅ Account → Cloudflare Workers Tail → Read

**Account Resources:**

- Selecione: **Filipe.daumas@icloud.com's Account**

**Zone Resources:**

- Selecione: **All zones**

**TTL (Time to Live):**

- 90 dias

### Passo 4: Copie o Token

1. Clique em **"Create Token"**
2. Copie o token gerado (começará com algo como `v1.0-...`)
3. **NÃO compartilhe esse token com ninguém**

### Passo 5: Use o Novo Token

Execute no terminal:

```bash
export CLOUDFLARE_API_TOKEN="SEU_NOVO_TOKEN_AQUI"
cd '/workspaces/airtrust v1'

# Teste o token
npx wrangler whoami

# Execute as migrations D1
npx wrangler d1 migrations apply airtrust-db --remote

# Deploy novamente
npx wrangler deploy --env=""
```

## ✅ Pronto!

Quando o novo token estiver funcionando:

1. O banco D1 será acessível
2. As migrations serão aplicadas
3. Os dados começarão a aparecer no frontend

---

**Precisa de ajuda? Me avise depois de criar o novo token!**
