# Instruções: Renomear Worker via Cloudflare Dashboard

## ⚠️ AÇÃO MANUAL NECESSÁRIA

Como o Cloudflare Wrangler CLI não suporta renomear workers, você precisa fazer isso via Dashboard:

## Passo a Passo

### 1. Acesse o Dashboard

```
https://dash.cloudflare.com/4dca4e5fddc6a351651dd224f456586f/workers-and-pages
```

### 2. Localize o Worker

- Procure por: **airtrust-worker**
- Status: Deployed (ativo)
- URL: https://airtrust-worker.airtrust.workers.dev

### 3. Renomear

1. Clique no worker **airtrust-worker**
2. Vá em **Settings** → **General**
3. Localize o campo **Name**
4. Altere para: **airtrust-worker-old**
5. Clique em **Save**

### 4. Verificar

- URL antiga: https://airtrust-worker.airtrust.workers.dev ❌ (não funcionará mais)
- URL nova: https://airtrust-worker-old.airtrust.workers.dev ✅

## Alternativa via API (se preferir)

Se quiser automatizar, posso criar um script que usa a API do Cloudflare:

```bash
# NUNCA commitar tokens reais — use variável de ambiente ou GitHub Secret
curl -X PATCH "https://api.cloudflare.com/client/v4/accounts/4dca4e5fddc6a351651dd224f456586f/workers/scripts/airtrust-worker" \
  -H "Authorization: Bearer <CLOUDFLARE_API_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{"name":"airtrust-worker-old"}'
```

## ⏭️ Próximo Passo

Depois que renomear, me avise para eu prosseguir com:

- ✅ Criar novo worker 'airtrust' (sem sufixos)
- ✅ Migrar todo o código backend
- ✅ Configurar bindings D1/R2
- ✅ Gerar relatório completo
