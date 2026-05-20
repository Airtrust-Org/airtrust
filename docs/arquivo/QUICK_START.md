# 🚀 AIRTRUST - GUIA RÁPIDO INÍCIO (11/11/2025)

## ⚡ START AGORA

### Para Desenvolvedores

```bash
# 1. Clone/Navigate
cd /Users/filipedaumas/Documents/airtrust\ v1

# 2. Desenvolvimento Local
npm run dev:all         # Frontend + Backend

# 3. Frontend estará em:
# http://localhost:3000

# 4. Backend estará em:
# http://localhost:8787

# 5. Testar API Local
curl http://localhost:8787/api/v2/sistema/health
```

### Para Produção

```bash
# 1. Build
npm run build

# 2. Deploy
wrangler deploy

# 3. Acessar
# Frontend: https://airtrust.pages.dev
# Backend: https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api
```

---

## 📊 SISTEMA STATUS

| Componente   | Status       | URL                                                               |
| ------------ | ------------ | ----------------------------------------------------------------- |
| **Backend**  | ✅ HEALTHY   | https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev |
| **Frontend** | ✅ DEPLOYED  | https://airtrust.pages.dev                                        |
| **Database** | ✅ CONNECTED | D1 Remote (7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae)                  |
| **Data**     | ✅ RECOVERED | 76 manobras, 12 simuladores, 20 qualificações                     |

---

## 🎯 DADOS RECUPERADOS

```json
{
  "manobras": 76,
  "simuladores": 12,
  "qualificacoes": 20,
  "tipos_sessao": 4,
  "categorias": 5,
  "funcionarios": 77+,
  "database_size": "4.45 MB"
}
```

---

## 📝 CONFIGURAÇÃO

### `.env.production` (Frontend API)

```env
VITE_API_URL=https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api
```

### `wrangler.json` (Worker Config)

```json
{
  "name": "0199d03e-fe13-77d7-a6e7-7d94d446894b",
  "d1_databases": [{ "database_name": "airtrust-db" }],
  "r2_buckets": [{ "bucket_name": "airtrust-storage" }]
}
```

---

## 🔧 TROUBLESHOOTING

### ❌ Frontend mostra erro de CORS

**Solução:**

```bash
# 1. Limpar cache: Cmd+Shift+R
# 2. Verificar .env.production
cat .env.production

# 3. Re-build se alterou URL
npm run build

# 4. Re-deploy
wrangler deploy

# 5. Aguardar 1 minuto
```

### ❌ API retorna 404

**Solução:**

```bash
# 1. Testar health check
curl https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/sistema/health

# 2. Se retornar JSON = OK
# 3. Se retornar HTML = check logs
wrangler tail 0199d03e-fe13-77d7-a6e7-7d94d446894b
```

### ❌ Database não conecta

**Solução:**

```bash
# 1. Verificar binding no wrangler.json
grep -A 3 "d1_databases" wrangler.json

# 2. Verificar database existe
wrangler d1 info airtrust-db

# 3. Testar query simples
wrangler d1 execute airtrust-db --remote --command="SELECT 1"
```

---

## 📚 DOCUMENTAÇÃO

- **Setup Custom Domain:** `DIAGNOSTICO_CUSTOM_DOMAIN.md`
- **URL Configuration:** `SETUP_URL_FINAL.md`
- **Data Recovery:** `RECUPERACAO_DADOS_20251111.sql`
- **Full Report:** `FINAL_SETUP_REPORT.md`

---

## 🚀 CI/CD COMMANDS

```bash
# Build only
npm run build

# Build + Deploy
npm run deploy

# Build clean
npm run build:clean

# Test
npm run test
npm run test:coverage
```

---

## 📊 API ENDPOINTS

```
Base: https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api

Core:
  GET  /v2/sistema/health              - Health check
  GET  /v2/sistema/info                - System info
  GET  /v2/manobras                    - List maneuvers
  GET  /v2/simuladores                 - List simulators
  GET  /v2/qualificacoes               - List qualifications
  GET  /v2/funcionarios                - List employees
  GET  /v2/tipos-sessao                - Session types
```

---

## 🎯 CHECKLISTS

### Pre-Deploy

- [ ] npm run build (0 errors)
- [ ] .env.production atualizado
- [ ] Dados no D1 verificados
- [ ] Health check OK

### Post-Deploy

- [ ] Frontend carrega
- [ ] API responde
- [ ] Dados aparecem na UI
- [ ] Sem erros no console (F12)

### Production Check

- [ ] URL customizada funciona (opcional)
- [ ] Logs sem errors (wrangler tail)
- [ ] Performance OK (< 500ms)
- [ ] Database query < 100ms

---

## 🔐 Security Notes

- ✅ JWT_SECRET configurado
- ✅ CORS headers OK
- ✅ D1 Database remote-only
- ✅ R2 Bucket private (airtrust-storage)
- ✅ Environment variables seguras

---

## 📞 Support

**Problema?** Execute diagnostics:

```bash
# Full diagnostics
npm run build
curl https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/sistema/health | jq .
wrangler tail 0199d03e-fe13-77d7-a6e7-7d94d446894b

# Log isso e compartilhe em issue
```

---

## 🎉 QUICK REFERENCE

| Tarefa    | Comando                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------- |
| Start Dev | `npm run dev:all`                                                                              |
| Build     | `npm run build`                                                                                |
| Deploy    | `wrangler deploy`                                                                              |
| Health    | `curl https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/sistema/health` |
| Logs      | `wrangler tail 0199d03e-fe13-77d7-a6e7-7d94d446894b`                                           |
| Database  | `wrangler d1 execute airtrust-db --remote --command="SELECT 1"`                                |

---

**Última Atualização:** 11 de Novembro de 2025  
**Status:** ✅ PRONTO PARA PRODUÇÃO  
**Versão:** 1.0.0
