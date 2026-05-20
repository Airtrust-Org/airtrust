# 🔥 PROBLEMA CRÍTICO RESOLVIDO: ASSETS Bloqueando `/api/*`

## 📌 Data: 14/11/2025 03:15 UTC

## 🐛 Sintoma

TODAS as rotas começando com `/api` travavam completamente (timeout), enquanto rotas sem este prefixo funcionavam perfeitamente.

Exemplos:

- ✅ `/test-funcionarios` → Funcionava (dados retornados)
- ❌ `/api/funcionarios` → Travava (timeout)
- ✅ `/ping` → Funcionava
- ❌ `/api/test` → Travava

## 🔍 Diagnóstico

Investigação sistemática eliminou TODAS as possíveis causas de código:

1. ❌ Middlewares globais (CORS, rate limit, CSRF, cache)
2. ❌ Código nas rotas `/api/*`
3. ❌ Queries D1
4. ❌ Função `fetch()` customizada no export default
5. ❌ Order de registro de rotas
6. ❌ Complexidade do código

### Teste definitivo:

Worker MÍNIMO com apenas Hono puro:

```typescript
import { Hono } from 'hono';
const app = new Hono();
app.get('/test', (c) => c.json({ message: 'OK' }));
app.get('/api/test', (c) => c.json({ message: 'OK' }));
export default app;
```

- **COM** ASSETS binding: `/api/test` travava
- **SEM** ASSETS binding: `/api/test` funcionava ✅

## 🎯 Causa Raiz

O **ASSETS binding** do Cloudflare Workers intercepta automaticamente TODAS as requisições, incluindo `/api/*`, para tentar servir assets estáticos.

Configuração problemática em `wrangler.json`:

```json
{
  "assets": {
    "directory": "./dist/client",
    "binding": "ASSETS"
  }
}
```

Mesmo sem middleware customizado servindo ASSETS no código, o **binding automático** do Cloudflare intercepta e trava em `/api/*`.

## ✅ Solução

Removido ASSETS binding do `wrangler.json`:

```diff
- "assets": {
-   "directory": "./dist/client",
-   "binding": "ASSETS"
- },
```

### Arquitetura Final:

1. **Worker** (`0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev`)

   - Serve APENAS a API (`/api/*`)
   - Acesso direto ao D1, R2, KV

2. **Pages** (separado)
   - Serve o frontend React (SPA)
   - Aponta para o worker via `VITE_API_URL`

## 🧪 Teste Final

```bash
curl "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/funcionarios?limit=2"
```

**Resultado**: ✅ Dados retornados em ~400ms

```json
{
  "success": true,
  "data": [...],
  "page": 1,
  "total": 24
}
```

## 📝 Lições Aprendidas

1. **ASSETS binding** do Cloudflare Workers é invasivo e intercepta TUDO
2. Separar frontend (Pages) e backend (Workers) é a arquitetura recomendada
3. Testar com worker MÍNIMO economiza horas de debug
4. O problema NÃO estava no código, mas na configuração do runtime

## 🚀 Próximos Passos

1. ✅ API funcionando perfeitamente
2. ⏳ Configurar Cloudflare Pages para servir frontend
3. ⏳ Configurar CORS no worker para aceitar requests do Pages
4. ⏳ Atualizar `VITE_API_URL` no Pages apontando para o worker

---

**Status**: ✅ RESOLVIDO  
**Uptime**: Worker respondendo normalmente  
**Performance**: ~400ms para queries D1
