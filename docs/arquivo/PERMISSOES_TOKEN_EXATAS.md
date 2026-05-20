# 🔑 Permissões Exatas Necessárias para o Token

## ⚠️ IMPORTANTE: O Token Anterior Não Tem Permissões Suficientes

O token `ocM4I449CPCcEDM6fH62AUvIY4QjmtW8MDKhAvIu` funciona para D1 mas **NÃO funciona para deploy de Workers**.

---

## ✅ Criar NOVO Token com TODAS as Permissões

### Passos:

1. Abra: https://dash.cloudflare.com/profile/api-tokens
2. Clique em **"Create Token"**
3. Selecione **"Custom Token"**
4. **COPIE EXATAMENTE ESTAS PERMISSÕES:**

```
✅ Account - D1 - Edit
✅ Account - D1 - Read
✅ Account - Cloudflare Workers Scripts - Edit
✅ Account - Cloudflare Workers Scripts - Read
✅ Account - Cloudflare Workers KV - Write
✅ Account - Cloudflare Workers KV - Read
✅ Account - Cloudflare Workers R2 Storage - Edit
✅ Account - Cloudflare Workers R2 Storage - Read
✅ Account - Cloudflare Workers Tail - Read
✅ Account - Account Settings - Read
✅ Account - User - Read
✅ Account - Memberships - Read
```

### Account Resources:

✅ Filipe.daumas@icloud.com's Account

### Zone Resources:

✅ All zones

### TTL:

90 days

---

## Depois de Criar

Cole o novo token aqui:

```bash
export CLOUDFLARE_API_TOKEN="SEU_TOKEN_AQUI"
cd '/workspaces/airtrust v1'

# Teste:
npx wrangler whoami

# Deploy:
npx wrangler deploy --env=""

# Teste API:
curl https://airtrust-worker.airtrust.workers.dev/api/health
curl "https://airtrust-worker.airtrust.workers.dev/api/historico?limit=5"
```

---

**Pronto! Crie o novo token com essas permissões exatas.** ✅
