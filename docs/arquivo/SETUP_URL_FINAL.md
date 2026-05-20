# 🚀 CONFIGURAÇÃO: CUSTOM DOMAIN AIRTRUST

## 📋 RESUMO DA SITUAÇÃO

```
✅ Worker Status: Deployado e Funcionando
✅ URL Automática: https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev
❌ URL Custom: airtrust.system.workers.dev (NÃO CONFIGURADA)

Worker ID: 0199d03e-fe13-77d7-a6e7-7d94d446894b
Account ID: 4dca4e5fddc6a351651dd224f456586f
Account: Filipe.daumas@icloud.com
```

---

## 🎯 SOLUÇÃO RECOMENDADA

### **A: USAR URL AUTOMÁTICA (FUNCIONA AGORA)** ✅ MAIS RÁPIDO

```bash
# 1. Atualizar .env.production
cat > .env.production << 'EOF'
VITE_API_URL=https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api
EOF

# 2. Re-build
npm run build

# 3. Deploy
wrangler deploy

# 4. Testar
# Abrir: https://airtrust.pages.dev
# F12 → Network → Ver requisições para a URL acima
```

**Vantagem:** ✅ Funciona imediatamente  
**Desvantagem:** ❌ URL é muito longa (hash)

---

### **B: USAR URL CUSTOM (MELHOR)** ⏳ REQUER CONFIG

#### Passo 1: Ir ao Dashboard Cloudflare

1. Acesse: https://dash.cloudflare.com

2. Vá para: **Workers & Pages** → **0199d03e-fe13-77d7-a6e7-7d94d446894b**

3. Clique em: **Settings** (engrenagem) ou **Triggers** (depende da versão)

4. Procure por: **Routes**, **Custom Domains**, ou **Deployment Routes**

#### Passo 2: Adicionar Rota

- **Route Pattern:** `airtrust.system.workers.dev/*`
- **Script:** `0199d03e-fe13-77d7-a6e7-7d94d446894b`
- Clique: **Save** ou **Add**

#### Passo 3: Aguardar Propagação

DNS propagation: 30-60 segundos

#### Passo 4: Atualizar Frontend

```bash
# 1. Atualizar .env.production
cat > .env.production << 'EOF'
VITE_API_URL=https://airtrust.system.workers.dev/api
EOF

# 2. Re-build
npm run build

# 3. Deploy
wrangler deploy

# 4. Testar
# Abrir: https://airtrust.pages.dev
# F12 → Network → Ver requisições para https://airtrust.system.workers.dev/api
```

---

## ✅ VERIFICAÇÃO RÁPIDA

```bash
# Testar se ambas URLs funcionam
echo "=== URL Automática ==="
curl https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/sistema/health | jq .

echo ""
echo "=== URL Custom ==="
curl https://airtrust.system.workers.dev/api/v2/sistema/health | jq .
```

Se ambas retornam `"status": "HEALTHY"` → ✅ Tudo OK!

---

## 📝 QUICK START (OPÇÃO A - MAIS RÁPIDO)

```bash
# Execute tudo de uma vez
cat > .env.production << 'EOF'
VITE_API_URL=https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api
EOF

npm run build && wrangler deploy

# Aguarde ~1 minuto e abra:
# https://airtrust.pages.dev
```

---

## 🔗 LINKS ÚTEIS

| Recurso              | Link                                                                     |
| -------------------- | ------------------------------------------------------------------------ |
| **Dashboard**        | https://dash.cloudflare.com                                              |
| **Worker**           | https://dash.cloudflare.com/workers/0199d03e-fe13-77d7-a6e7-7d94d446894b |
| **Pages**            | https://dash.cloudflare.com/pages                                        |
| **URL Automática**   | https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev        |
| **URL Custom**       | https://airtrust.system.workers.dev                                      |
| **Frontend (Pages)** | https://airtrust.pages.dev                                               |

---

## 🆘 TROUBLESHOOTING

### ❌ Frontend chama URL errada

**Problema:** Console mostra erro de CORS ou 404

**Solução:**

```bash
# 1. Verificar .env.production
cat .env.production

# 2. Verificar se URL está correta
grep VITE_API_URL .env.production

# 3. Re-build com cache limpo
rm -rf dist && npm run build

# 4. Re-deploy
wrangler deploy

# 5. Limpar cache navegador: Ctrl+Shift+R (Mac: Cmd+Shift+R)
```

### ❌ Custom domain retorna 404

**Problema:** https://airtrust.system.workers.dev/api/v2/sistema/health retorna 404

**Solução:**

```bash
# 1. Verifique no Dashboard se rota foi adicionada
# Workers & Pages → Settings → Routes

# 2. Se não está lá, adicione manualmente:
# Route: airtrust.system.workers.dev/*
# Worker: 0199d03e-fe13-77d7-a6e7-7d94d446894b

# 3. Teste novamente após ~1 minuto
```

### ❌ CORS Error ao chamar API

**Problema:** Console: "Access-Control-Allow-Origin not allowed"

**Solução:** Verificar header CORS no worker

```bash
# Backend em: src/worker/index.ts
# Verificar se tem CORS header:
# response.headers.set('Access-Control-Allow-Origin', '*');
```

---

## 🎯 RECOMENDAÇÃO FINAL

**Para hoje:**

1. ✅ Use a URL Automática (mais rápido)
2. ✅ Atualizar `.env.production`
3. ✅ Re-build e deploy
4. ✅ Testar no navegador

**Para depois:**

- Configurar custom domain no Dashboard para URL mais limpa

---

## 📊 STATUS ATUAL

```json
{
  "worker_id": "0199d03e-fe13-77d7-a6e7-7d94d446894b",
  "url_automatica": "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev",
  "url_custom": "https://airtrust.system.workers.dev",
  "backend_status": "✅ HEALTHY",
  "database": "✅ Connected",
  "data_recovered": "✅ 76 manobras, 12 simuladores, 20 qualificações",
  "frontend_pages": "https://airtrust.pages.dev",
  "next_step": "Atualizar .env.production e re-deploy"
}
```

---

## 🚀 EXECUTE AGORA (OPÇÃO RÁPIDA)

```bash
cd /Users/filipedaumas/Documents/airtrust\ v1

# Passo 1: Configurar URL
cat > .env.production << 'EOF'
VITE_API_URL=https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api
EOF

# Passo 2: Build
npm run build

# Passo 3: Deploy
wrangler deploy

# Passo 4: Testar
echo "Aplicação será disponibilizada em: https://airtrust.pages.dev"
```

**Pronto! 🎉**
