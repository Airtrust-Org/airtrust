# 🚀 GUIA DE DEPLOY MANUAL - FASE 15

**Data**: 15 de Novembro de 2025  
**Ambiente**: Production  
**D1 Prod ID**: `7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae`

---

## ⚠️ PRÉ-REQUISITOS

- ✅ Wrangler CLI instalado (`npm install -g wrangler`)
- ✅ Autenticado no Cloudflare (`wrangler login`)
- ✅ Acesso ao worker "airtrust" e D1 produção
- ✅ JWT_SECRET em mãos

---

## 📋 PASSO A PASSO

### 1️⃣ Backup D1 Produção

```bash
cd /workspaces/airtrust\ v1/worker-airtrust

# Criar diretório de backups
mkdir -p ../backups

# Exportar D1
npx wrangler d1 export 7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae \
  --output=../backups/d1-prod-backup-$(date +%Y%m%d-%H%M%S).sql \
  --remote

# Verificar backup criado
ls -lh ../backups/
```

✅ **Checkpoint**: Backup criado com sucesso

---

### 2️⃣ Aplicar Migrations (SEM SEEDS)

```bash
cd /workspaces/airtrust\ v1/worker-airtrust

# Migration 0001 - Schema Base
npx wrangler d1 execute 7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae \
  --remote \
  --file=migrations/0001-initial-schema.sql

# Migration 0003 - Tabela Usuários
npx wrangler d1 execute 7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae \
  --remote \
  --file=migrations/0003-create-usuarios-table.sql

# Migration 0005 - Índices de Performance
npx wrangler d1 execute 7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae \
  --remote \
  --file=migrations/0005-performance-indexes.sql
```

✅ **Checkpoint**: 3 migrations aplicadas (0001, 0003, 0005)

---

### 3️⃣ Configurar JWT_SECRET

```bash
cd /workspaces/airtrust\ v1/worker-airtrust

# Adicionar secret (será solicitado interativamente)
npx wrangler secret put JWT_SECRET --env production
# Cole o JWT_SECRET quando solicitado
```

✅ **Checkpoint**: JWT_SECRET configurado

---

### 4️⃣ Build Worker

```bash
cd /workspaces/airtrust\ v1/worker-airtrust

# Instalar dependências (se necessário)
npm install

# Build TypeScript
npm run build
```

✅ **Checkpoint**: Build completo sem erros

---

### 5️⃣ Deploy Worker

```bash
cd /workspaces/airtrust\ v1/worker-airtrust

# Deploy para produção
npm run deploy
# OU
npx wrangler deploy --env production
```

✅ **Checkpoint**: Worker deployado em production

---

### 6️⃣ Build Frontend

```bash
cd /workspaces/airtrust\ v1

# Build do React + Vite
npm run build

# Verificar dist/ criado
ls -lh dist/
```

✅ **Checkpoint**: Frontend buildado (dist/ criado)

---

### 7️⃣ Deploy Frontend

```bash
cd /workspaces/airtrust\ v1

# Deploy para Cloudflare Pages
npx wrangler pages deploy dist \
  --project-name=airtrust \
  --branch=production
```

✅ **Checkpoint**: Frontend deployado em Pages

---

### 8️⃣ Testes de Fumaça

**Obter URL do worker** (exemplo: `https://airtrust.wdmg94.workers.dev`)

```bash
# Health Check
curl https://airtrust.wdmg94.workers.dev/health

# Funcionários (top 5)
curl "https://airtrust.wdmg94.workers.dev/api/funcionarios?limit=5" | jq

# Qualificações (top 5)
curl "https://airtrust.wdmg94.workers.dev/api/qualificacoes?limit=5" | jq

# Simuladores
curl "https://airtrust.wdmg94.workers.dev/api/simuladores" | jq
```

✅ **Checkpoint**: Todos endpoints retornam 200 OK

---

### 9️⃣ Monitoramento Inicial (5 minutos)

```bash
cd /workspaces/airtrust\ v1/worker-airtrust

# Abrir logs em tempo real
npx wrangler tail --env production

# Observar por 5 minutos:
# - ❌ Erros 500
# - ❌ Timeouts
# - ✅ Latência < 500ms
# - ✅ Queries rodando OK
```

✅ **Checkpoint**: Logs sem erros críticos

---

## 🔄 PLANO DE ROLLBACK (SE NECESSÁRIO)

### Opção 1: Rollback Completo

```bash
# 1. Restaurar D1
cd /workspaces/airtrust\ v1/worker-airtrust
npx wrangler d1 import 7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae \
  --remote \
  --file=../backups/d1-prod-backup-TIMESTAMP.sql

# 2. Rollback Worker
npx wrangler rollback --env production

# 3. Rollback Frontend
npx wrangler pages deployment list airtrust --env production
npx wrangler pages deployment rollback <deployment-id>
```

### Opção 2: Rollback Apenas D1

```bash
cd /workspaces/airtrust\ v1/worker-airtrust
npx wrangler d1 import 7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae \
  --remote \
  --file=../backups/d1-prod-backup-TIMESTAMP.sql
```

### Opção 3: Rollback Apenas Worker

```bash
cd /workspaces/airtrust\ v1/worker-airtrust
npx wrangler rollback --env production
```

---

## ✅ CHECKLIST FINAL

Após completar todos os passos:

- [ ] Backup D1 criado
- [ ] 3 migrations aplicadas (0001, 0003, 0005)
- [ ] JWT_SECRET configurado
- [ ] Worker deployado em production
- [ ] Frontend buildado
- [ ] Frontend deployado em Pages
- [ ] Health check retorna 200 OK
- [ ] Funcionários endpoint retorna dados
- [ ] Qualificações endpoint retorna dados
- [ ] Simuladores endpoint retorna dados
- [ ] Logs monitorados por 5 minutos sem erros críticos

---

## 📊 MÉTRICAS ESPERADAS

| Métrica | Valor Esperado |
|---------|----------------|
| Latência Média | < 500ms |
| Erros 5xx | 0 |
| Taxa de Sucesso | > 99% |
| Funcionários | 147 registros |
| Qualificações | 523 registros |
| Simuladores | 3 registros |

---

## 🎯 PRÓXIMOS PASSOS

Após deploy bem-sucedido:

1. ✅ Atualizar `FASE15-RELATORIO-DEPLOY-PRODUCAO.md` com resultados
2. ✅ Monitorar logs nas próximas 24h
3. ✅ Validar manualmente todas as telas principais
4. ✅ Criar FASE 16 - Monitoramento Pós-Deploy

---

## ⚠️ TROUBLESHOOTING

### Erro: "unauthorized"
```bash
wrangler login
```

### Erro: "database locked"
```bash
# Aguardar 1 minuto e tentar novamente
```

### Erro: "migration already applied"
```bash
# Ignorar - migration já estava aplicada
```

### Erro: "secret not found"
```bash
# Re-adicionar JWT_SECRET
npx wrangler secret put JWT_SECRET --env production
```

---

**Tempo Estimado Total**: ~20-30 minutos

**Criado por**: GitHub Copilot  
**Data**: 15/11/2025  
**Status**: Pronto para execução
