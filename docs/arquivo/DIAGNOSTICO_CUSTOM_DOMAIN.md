# 🔧 DIAGNÓSTICO: CUSTOM DOMAIN AIRTRUST

## 📋 SITUAÇÃO ATUAL

### Worker Info:
- **Worker Name (ID):** `0199d03e-fe13-77d7-a6e7-7d94d446894b`
- **Account:** Filipe.daumas@icloud.com's Account
- **Account ID:** 4dca4e5fddc6a351651dd224f456586f

### URL Atual (Automática):
```
https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev
```

### URL Desejada (Custom Domain):
```
https://airtrust.system.workers.dev
```

---

## 🎯 PROBLEMA

O custom domain `airtrust.system.workers.dev` **NÃO está configurado** na rota do worker.

**Causa:** Falta configuração de rota (route binding) no Cloudflare Workers.

---

## ✅ SOLUÇÃO

### OPÇÃO 1: VIA CLI (WRANGLER)

#### Passo 1: Adicionar Rota para Custom Domain
```bash
# Verificar rotas atuais
wrangler triggers

# Adicionar nova rota
wrangler triggers update --routes airtrust.system.workers.dev/* 0199d03e-fe13-77d7-a6e7-7d94d446894b
```

#### Passo 2: Verificar Rotas
```bash
wrangler triggers
```

#### Passo 3: Testar URLs
```bash
# URL Automática (já funciona)
curl https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/sistema/health

# URL Custom (deve funcionar após configuração)
curl https://airtrust.system.workers.dev/api/v2/sistema/health
```

---

### OPÇÃO 2: VIA DASHBOARD CLOUDFLARE (RECOMENDADO)

1. Acesse: **https://dash.cloudflare.com**

2. Vá para: **Workers & Pages** → **0199d03e-fe13-77d7-a6e7-7d94d446894b**

3. Abra: **Settings** → **Routes** ou **Triggers** (dependendo da versão)

4. Clique: **Add Route** ou **Add Custom Domain**

5. Preencha:
   - **Route:** `airtrust.system.workers.dev/*`
   - **Script:** `0199d03e-fe13-77d7-a6e7-7d94d446894b`
   - **Zone:** Selecione seu domínio (se aplicável)

6. Clique: **Save**

7. Aguarde: 30-60 segundos para propagação

---

## 🔍 VERIFICAÇÃO

### Testar URLs após Configuração:

```bash
# 1. Teste simples (health check)
curl https://airtrust.system.workers.dev/api/v2/sistema/health

# 2. Teste com dados
curl https://airtrust.system.workers.dev/api/v2/manobras

# 3. Verificar ambas funcionam
echo "=== URL Automática ==="
curl https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/sistema/health

echo ""
echo "=== URL Custom ==="
curl https://airtrust.system.workers.dev/api/v2/sistema/health
```

### Se ambas retornam JSON com status "HEALTHY":
✅ **Configuração bem-sucedida!**

---

## 📝 PRÓXIMAS AÇÕES

### 1. Atualizar Frontend `.env.production`
```env
# Antes
VITE_API_URL=https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api

# Depois
VITE_API_URL=https://airtrust.system.workers.dev/api
```

### 2. Re-build e Re-deploy
```bash
npm run build
wrangler deploy
```

### 3. Limpar Cache
- Navegador: `Ctrl+Shift+R` (Windows) ou `Cmd+Shift+R` (Mac)
- CloudFlare: Dashboard → Purge Cache

---

## 🆘 TROUBLESHOOTING

### Se `airtrust.system.workers.dev` retorna 404:

**Opção A:** Sistema.workers.dev não é seu domínio
```bash
# Solução: Use a URL automática permanentemente
# No .env.production:
VITE_API_URL=https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api
```

**Opção B:** Rota não foi configurada
```bash
# Verificar rotas configuradas
wrangler triggers

# Se não aparecer airtrust.system.workers.dev:
# Ir ao Dashboard e adicionar manualmente
```

**Opção C:** Cache CloudFlare
```bash
# Purgar cache do domínio
# No Dashboard: Workers & Pages → seu worker → Settings → Purge Cache
```

---

## 📊 RESUMO DAS URLs

| URL | Status | Usar Em |
|-----|--------|---------|
| `https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev` | ✅ Funciona | Fallback / Backup |
| `https://airtrust.system.workers.dev` | ⏳ Após config | Produção (Ideal) |

---

## 🎯 PRÓXIMO PASSO

Execute um dos comandos acima e envie:
1. Output completo do teste das URLs
2. Screenshot do Dashboard mostrando as rotas configuradas
3. Confirmação de qual URL usar no frontend

Então farei a configuração final! 🚀
