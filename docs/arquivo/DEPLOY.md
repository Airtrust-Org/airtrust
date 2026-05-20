# 🚀 Guia de Deploy - AirTrust v2

## ✅ Checklist Pré-Deploy

### 1. Configuração do Ambiente

- [ ] `wrangler.json` tem configuração de `assets`
- [ ] `wrangler.json` tem binding `ASSETS`
- [ ] `wrangler.json` tem configuração de `d1_databases`
- [ ] Variáveis de ambiente configuradas

### 2. Código

- [ ] **ZERO URLs hardcoded** (`localhost:8787`)
- [ ] Todas as URLs usam `window.location.origin`
- [ ] Build sem erros TypeScript
- [ ] Testes passando

### 3. Worker

- [ ] SPA fallback implementado em `src/worker/routes/index.ts`
- [ ] Rota raiz (`/`) serve `index.html`
- [ ] CORS configurado com URL da produção
- [ ] Headers no-cache configurados

### 4. Frontend

- [ ] Build gerado em `dist/client`
- [ ] `index.html` existe
- [ ] Assets com hash nos nomes

---

## 🔧 Scripts Disponíveis

### Validação Pré-Deploy
```bash
npm run validate
# ou
./scripts/validate-deployment.sh
```

### Corrigir URLs Automaticamente
```bash
./scripts/fix-urls.sh
```

### Build e Deploy
```bash
npm run build
npm run deploy
```

---

## 🚨 Problemas Comuns

### 1. Tela preta com JSON
**Causa:** Rota raiz retornando JSON ao invés de HTML  
**Solução:** Remover `worker.get('/')` de `src/worker/index.ts`

### 2. 404 em todas as rotas
**Causa:** Assets não configurados  
**Solução:** Adicionar `assets` ao `wrangler.json`

### 3. Failed to fetch
**Causa:** URLs hardcoded para localhost  
**Solução:** Executar `./scripts/fix-urls.sh`

### 4. CORS error
**Causa:** URL da produção não está na lista  
**Solução:** Adicionar URL em `src/worker/routes/index.ts`

### 5. Cache persistente
**Solução:**
- Ctrl+Shift+Delete (limpar cache)
- Modo incógnito
- Hard refresh: Ctrl+Shift+R

---

## 📋 Configuração do wrangler.json

```json
{
  "name": "seu-worker-id",
  "main": "./src/worker/index.ts",
  "compatibility_date": "2025-06-17",
  "assets": {
    "directory": "./dist/client",
    "binding": "ASSETS"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "airtrust-db",
      "database_id": "seu-database-id",
      "preview_database_id": "local"
    }
  ]
}
```

---

## 🎯 SPA Fallback Correto

Em `src/worker/routes/index.ts`:

```typescript
// Rota raiz serve index.html
app.get('/', async (c) => {
  const asset = await c.env.ASSETS.fetch(new URL('/index.html', c.req.url));
  return new Response(asset.body, {
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    }
  });
});

// 404 handler com SPA fallback
app.notFound(async (c) => {
  const path = c.req.path;
  
  // API routes retornam JSON 404
  if (path.startsWith('/api/')) {
    return c.json({ error: 'Not found' }, 404);
  }
  
  // Outras rotas servem index.html (React Router)
  const asset = await c.env.ASSETS.fetch(new URL('/index.html', c.req.url));
  return new Response(asset.body, {
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-store'
    }
  });
});
```

---

## 🔄 Processo de Deploy

1. **Validar código:**
   ```bash
   npm run validate
   ```

2. **Corrigir problemas** (se houver)

3. **Build:**
   ```bash
   npm run build
   ```

4. **Deploy:**
   ```bash
   npm run deploy
   ```

5. **Testar em produção:**
   - Abrir modo incógnito
   - Acessar URL
   - Testar importações
   - Verificar console

---

## 📊 Validação Pós-Deploy

```bash
# Testar health check
curl https://seu-worker.workers.dev/health

# Testar frontend (deve retornar HTML)
curl -I https://seu-worker.workers.dev/

# Testar API (deve retornar JSON)
curl https://seu-worker.workers.dev/api/health
```

---

## 🆘 Rollback

Se algo der errado:

```bash
# Ver deploys anteriores
wrangler deployments list

# Fazer rollback
wrangler rollback [deployment-id]
```

---

## 📝 Notas Importantes

1. **NUNCA** faça deploy sem validar
2. **SEMPRE** teste em modo incógnito
3. **NUNCA** use URLs hardcoded
4. **SEMPRE** use `window.location.origin`
5. **VERIFIQUE** o wrangler.json antes de cada deploy
