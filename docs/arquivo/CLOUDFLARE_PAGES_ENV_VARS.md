# 🔧 Cloudflare Pages - Variáveis de Ambiente

## ⚠️ PROBLEMA IDENTIFICADO

O frontend em produção está carregando variáveis de ambiente antigas configuradas no **Cloudflare Pages Dashboard**, que sobrescrevem o `.env.production` do código.

**Logs mostram:**

```
VITE_API_URL: https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2
```

**Deveria ser:**

```
VITE_API_URL: https://airtrust.airtrust.workers.dev/api
```

---

## ✅ SOLUÇÃO: Configurar ENV VARS no Cloudflare Pages

### 1️⃣ Acessar Dashboard do Cloudflare Pages

```
https://dash.cloudflare.com/
→ Workers & Pages
→ airtrust (projeto)
→ Settings
→ Environment variables
```

### 2️⃣ Configurar Variáveis de PRODUCTION

**Deletar variáveis antigas** (se existirem):

- ❌ VITE_API_URL com valor antigo
- ❌ Qualquer referência a `0199d03e-...`
- ❌ Qualquer referência a `/api/v2`

**Adicionar variáveis CORRETAS:**

| Variable Name                 | Value                                       | Environment |
| ----------------------------- | ------------------------------------------- | ----------- |
| `VITE_API_URL`                | `https://airtrust.airtrust.workers.dev/api` | Production  |
| `VITE_DEFAULT_LOGIN_EMAIL`    | `admin@airtrust.com.br`                     | Production  |
| `VITE_DEFAULT_LOGIN_PASSWORD` | `Airtrust@2025`                             | Production  |
| `VITE_AUTH_ENABLED`           | `true`                                      | Production  |
| `VITE_ENABLE_DEBUG`           | `false`                                     | Production  |
| `VITE_ENABLE_ANALYTICS`       | `true`                                      | Production  |

### 3️⃣ Configurar Variáveis de PREVIEW (opcional)

| Variable Name                 | Value                                       | Environment |
| ----------------------------- | ------------------------------------------- | ----------- |
| `VITE_API_URL`                | `https://airtrust.airtrust.workers.dev/api` | Preview     |
| `VITE_DEFAULT_LOGIN_EMAIL`    | `admin@airtrust.com.br`                     | Preview     |
| `VITE_DEFAULT_LOGIN_PASSWORD` | `admin123`                                  | Preview     |
| `VITE_AUTH_ENABLED`           | `true`                                      | Preview     |

---

## 🔄 REBUILD E REDEPLOY AUTOMÁTICO

Depois de configurar as variáveis no dashboard, execute:

```bash
cd "/Users/filipedaumas/Documents/airtrust v1"

# Build com variáveis corretas
npm run build

# Deploy
npx wrangler pages deploy dist --project-name=airtrust --branch=production
```

---

## 📊 VALIDAÇÃO

Após o deploy, abra o frontend e verifique no console do navegador:

```javascript
// Deve aparecer:
🔍 [API Config] VITE_API_URL: https://airtrust.airtrust.workers.dev/api
🔍 [API Config] API_BASE_URL (final): https://airtrust.airtrust.workers.dev/api
```

**URLs de requisição devem ser:**

```
✅ https://airtrust.airtrust.workers.dev/api/funcionarios
✅ https://airtrust.airtrust.workers.dev/api/qualificacoes/historico
✅ https://airtrust.airtrust.workers.dev/api/simuladores

❌ NÃO pode ter /api/v2/api/...
❌ NÃO pode ter 0199d03e-fe13-77d7-a6e7-7d94d446894b
```

---

## 🔐 CORS - Já Configurado ✅

O worker já está configurado para aceitar origens corretas:

**wrangler.toml - Production:**

```toml
[env.production.vars]
CORS_ORIGINS = "https://production.airtrust.pages.dev,https://airtrust.pages.dev"
```

**Middleware CORS** (`worker-airtrust/src/middleware/cors.ts`):

- ✅ Aceita localhost (dev)
- ✅ Aceita production.airtrust.pages.dev
- ✅ Aceita airtrust.pages.dev
- ✅ Headers corretos: Authorization, Content-Type

---

## 🎯 RESUMO DA CORREÇÃO

| Item            | Antes ❌                           | Depois ✅                       |
| --------------- | ---------------------------------- | ------------------------------- |
| **Worker URL**  | `0199d03e-...airtrust.workers.dev` | `airtrust.airtrust.workers.dev` |
| **API Path**    | `/api/v2/api/funcionarios`         | `/api/funcionarios`             |
| **CORS Origin** | Bloqueado                          | Permitido                       |
| **Build**       | Variáveis antigas                  | Variáveis corretas              |

---

## 📝 IMPORTANTE

**Cloudflare Pages Environment Variables têm prioridade sobre `.env` files!**

Por isso, mesmo com `.env.production` correto no código, se o dashboard do Cloudflare Pages tiver variáveis antigas, elas serão usadas no build.

**Sempre configure no dashboard OU remova todas as variáveis do dashboard para usar apenas as do código.**
