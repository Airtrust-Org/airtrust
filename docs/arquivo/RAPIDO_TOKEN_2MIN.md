# ⚡ SOLUÇÃO RÁPIDA - Criar Token em 2 Minutos

## 🎯 O Que Fazer

### 1️⃣ Abra Este Link no Navegador

```
https://dash.cloudflare.com/profile/api-tokens
```

### 2️⃣ Clique em "Create Token" → "Custom Token"

### 3️⃣ Preencha Assim:

**Token Name:**

```
airtrust-workers-d1-final
```

**Permissions (copie e marque):**

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
```

**Account Resources:**
Selecione: `Filipe.daumas@icloud.com's Account`

**Zone Resources:**
Selecione: `All zones`

**TTL:**
90 days

### 4️⃣ Clique em "Create Token"

### 5️⃣ COPIE O TOKEN (aparece uma vez só!)

### 6️⃣ Cole Aqui No Terminal:

```bash
cd '/workspaces/airtrust v1'
export CLOUDFLARE_API_TOKEN="COLE_O_TOKEN_AQUI"
npx wrangler deploy --env=""
```

---

## ✅ Resultado Esperado

Quando terminar:

- API estará deployada
- Dados aparecerão no frontend
- Sistema 100% funcional

**URL:** https://production.airtrust.pages.dev

---

**Mais fácil? Confira o arquivo: `PERMISSOES_TOKEN_EXATAS.md`**
