# 🔧 SOLUÇÃO: CACHE CLOUDFLARE - URL FIXA

**Data**: 18/11/2025  
**Problema**: Cache do Cloudflare Pages atrapalhando deploys  
**Solução**: Headers de cache + Custom Domain

---

## ❌ NÃO FAZER

### **Recriar Workers/Pages?**

**NÃO!** Isso iria:

- ❌ Perder histórico de deploys
- ❌ Precisar reconfigurar DNS
- ❌ Perder métricas e logs
- ❌ Não resolver o problema (cache continuaria)

---

## ✅ SOLUÇÃO CORRETA

### **1. Custom Domain (URL Fixa)**

Configurar domínio próprio no Cloudflare Pages:

```
app.airtrust.com.br  →  production.airtrust.pages.dev
```

**Vantagens**:

- ✅ URL fixa e profissional
- ✅ Controle total de cache
- ✅ HTTPS automático
- ✅ Sem mudança de URL entre deploys

**Como fazer**:

1. Cloudflare Dashboard → Pages → airtrust-production
2. Custom domains → Add custom domain
3. Adicionar: `app.airtrust.com.br` (ou subdomínio que preferir)
4. Cloudflare cria DNS record automaticamente

---

### **2. Headers de Cache no Worker**

Adicionar headers corretos para evitar cache agressivo:

```typescript
// worker-airtrust/src/middleware/cache.ts
export function cacheControl(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    await next();

    // Se for HTML (SPA), nunca cachear
    if (c.res.headers.get('Content-Type')?.includes('text/html')) {
      c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      c.header('Pragma', 'no-cache');
      c.header('Expires', '0');
    }

    // Se for JSON (API), cachear por 5 minutos
    else if (c.res.headers.get('Content-Type')?.includes('application/json')) {
      c.header('Cache-Control', 'public, max-age=300, s-maxage=300');
    }

    // Se for asset estático (JS/CSS), cachear por 1 ano
    else if (c.req.path.match(/\.(js|css|png|jpg|svg|woff2)$/)) {
      c.header('Cache-Control', 'public, max-age=31536000, immutable');
    }
  };
}
```

---

### **3. Purge Cache Automático no Deploy**

Adicionar script no `package.json`:

```json
{
  "scripts": {
    "deploy": "npm run build && npm run deploy:worker && npm run deploy:pages",
    "deploy:pages": "npx wrangler pages deploy dist --project-name=airtrust-production",
    "deploy:worker": "cd worker-airtrust && npx wrangler deploy",
    "cache:purge": "npx wrangler pages deployment tail airtrust-production --format json | jq -r '.url' | xargs -I {} curl -X POST 'https://api.cloudflare.com/client/v4/zones/YOUR_ZONE_ID/purge_cache' -H 'Authorization: Bearer YOUR_API_TOKEN' -d '{\"purge_everything\":true}'"
  }
}
```

---

### **4. Configuração no \_headers (Pages)**

Criar arquivo `public/_headers`:

```
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/*.html
  Cache-Control: no-cache, no-store, must-revalidate
  Pragma: no-cache
  Expires: 0

/*.js
  Cache-Control: public, max-age=31536000, immutable

/*.css
  Cache-Control: public, max-age=31536000, immutable

/api/*
  Cache-Control: public, max-age=300, s-maxage=300
```

---

## 🚀 IMPLEMENTAÇÃO

### **Passo 1: Criar Middleware de Cache**

```bash
# Criar arquivo
touch worker-airtrust/src/middleware/cache.ts

# Registrar no index.ts
# app.use('*', cacheControl());
```

### **Passo 2: Criar \_headers no Frontend**

```bash
# Criar arquivo
touch public/_headers

# Adicionar configurações acima
```

### **Passo 3: Configurar Custom Domain**

```
Cloudflare Dashboard
→ Pages
→ airtrust-production
→ Custom domains
→ Add: app.airtrust.com.br
```

### **Passo 4: Deploy com Purge**

```bash
# Deploy completo
npm run build
npx wrangler pages deploy dist --project-name=airtrust-production

# Purge cache manual (se necessário)
# Via Cloudflare Dashboard → Caching → Purge Everything
```

---

## 📊 COMPARAÇÃO

### **Opção 1: Recriar Workers/Pages ❌**

- Tempo: 2-3 horas
- Risco: Alto (perder configurações)
- Resolve cache: Não (problema continua)
- Custo: Possível duplicação de recursos

### **Opção 2: Headers + Custom Domain ✅**

- Tempo: 15-30 minutos
- Risco: Baixo (apenas configuração)
- Resolve cache: Sim (controle total)
- Custo: Zero (recursos já existentes)

---

## ✅ RECOMENDAÇÃO FINAL

1. **Criar middleware de cache** (5 min)
2. **Criar arquivo `_headers`** (5 min)
3. **Configurar custom domain** (10 min)
4. **Deploy com headers corretos** (10 min)

**Total**: ~30 minutos vs 2-3 horas de recriar tudo

---

**Status**: Aguardando aprovação para implementar
