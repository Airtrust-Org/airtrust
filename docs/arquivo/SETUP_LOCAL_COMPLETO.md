# 🚀 AirTrust: Guia Local Development Setup

**Data:** 4 de Novembro de 2025  
**Status:** ✅ Pronto para Uso  
**Ambiente:** Localhost Development

---

## 📋 Visão Geral

Você agora tem um **ambiente local completo** com:

- ✅ **Backend:** Hono + Wrangler rodando em `localhost:8787`
- ✅ **Frontend:** React 19 + Vite em `localhost:3000` (pronto para iniciar)
- ✅ **Database:** D1 Local (SQLite)
- ✅ **Dados:** Sincronizados com produção

**Importante:** Você NÃO está mais trabalhando em produção! 🎉

---

## 🏁 Começar Agora (2 passos)

### Passo 1: Terminal 1 - Backend já está rodando

Backend está **já inicializado e rodando** em background:

```bash
# Se precisar reiniciar:
npm run restart:all

# Verificar saúde:
npm run health
```

### Passo 2: Terminal 2 - Iniciar Frontend

Abra um **novo terminal** e execute:

```bash
npm run dev
```

Acesse: **http://localhost:3000** ✨

---

## 🏗️ Arquitetura Local

```
Your Computer
├── Frontend (http://localhost:3000)
│   └── React 19 + Vite + Hot Reload ✨
├── Backend (http://localhost:8787)
│   └── Hono + TypeScript ⚡
└── Database (D1 Local)
    └── SQLite + Migrations 📊
```

---

## 📊 Dados Disponíveis

Seu banco local tem **acesso direto aos dados de produção**:

| Recurso       | Registros | API Endpoint            |
| ------------- | --------- | ----------------------- |
| Habilitações  | 916+      | `/api/v2/habilitacoes`  |
| Qualificações | 77+       | `/api/v2/qualificacoes` |
| Funcionários  | 24+       | `/api/v2/funcionarios`  |
| Certificados  | ∞         | `/api/v2/certificados`  |

Todos são **acesso em tempo real**, então qualquer mudança em produção aparece localmente instantaneamente.

---

## 🔧 Comandos Úteis

### Desenvolvimento

```bash
# Iniciar tudo
npm run dev:all

# Apenas Backend
npm run dev:worker

# Apenas Frontend
npm run dev

# Reiniciar tudo
npm run restart:all
```

### Monitoramento

```bash
# Health check
npm run health

# Ver logs de Wrangler
tail -f /tmp/wrangler-dev.log

# Validar sistema
npm run validate

# Teste de endpoints
npm run test:endpoints
```

### Build & Deploy

```bash
# Build local
npm run build

# Simular produção
npm run preview

# Deploy (quando pronto)
npm run deploy
```

---

## 📝 Estrutura de Pastas

```
src/
├── worker/                 # Backend (Hono)
│   ├── index.ts          # Entry point
│   ├── routes/           # API endpoints
│   ├── middleware/        # Middlewares
│   ├── services/         # Business logic
│   └── utils/            # Utilities
│
├── client/               # Frontend (React)
│   ├── App.tsx
│   ├── pages/
│   ├── components/
│   ├── hooks/
│   └── styles/
│
└── types/               # TypeScript types
```

---

## 🎯 Próximas Fases (Documentation Ready)

Seu sistema está **pronto para os próximos passos de otimização**:

### ✅ FASE 2A: Database Optimization

- **Status:** Documentação completa (405 linhas)
- **Alvo:** -50% latência via EXPLAIN QUERY PLAN
- **Referência:** `FASE2A_DATABASE_OPTIMIZATION.md`

### ✅ FASE 2B: Frontend Virtualization

- **Status:** Documentação completa (430 linhas)
- **Alvo:** -80% memory, +50% FPS via React Virtual
- **Referência:** `FASE2B_FRONTEND_VIRTUALIZATION.md`

### ✅ FASE 2C: Cache Strategy

- **Status:** Documentação completa (470 linhas)
- **Alvo:** -75% API calls via React Query + Edge Cache
- **Referência:** `FASE2C_CACHE_STRATEGY.md`

### ✅ FASE 3: UX Improvements

- **Status:** Documentação completa (651 linhas)
- **Alvo:** -75% crash rate via Error Boundaries
- **Referência:** `FASE3_UX_IMPROVEMENTS.md`

---

## 🔐 Segurança & Boas Práticas

### Variáveis de Ambiente

```bash
# .env.local (já criado automaticamente)
VITE_API_URL=http://localhost:8787
VITE_API_TIMEOUT=30000
VITE_DEBUG=true
```

### Dados Sensíveis

- ✅ Tokens JWT: Gerados localmente
- ✅ API Keys: Isoladas por ambiente
- ✅ Database: Soft delete sempre ativo

---

## 🐛 Troubleshooting

### Backend não inicia?

```bash
# Ver logs
tail -f /tmp/wrangler-dev.log

# Reiniciar
killall wrangler node
npm run dev:worker
```

### Frontend não conecta?

```bash
# Verificar CORS
curl http://localhost:8787/health

# Verificar .env.local
cat .env.local

# Limpar cache
npm run clean
npm run build
npm run dev
```

### Banco não responde?

```bash
# Reiniciar D1
npm run restart:all

# Validar
npm run db:status
```

---

## 📊 Status Atual

```
✅ Backend:    Rodando em localhost:8787
✅ Database:   D1 Local inicializado
✅ CORS:       Localhost permitido
✅ Migrations: Executadas automaticamente
✅ Frontend:   Pronto para iniciar

🚀 Sistema: 100% Pronto para Desenvolvimento
```

---

## 🎉 Pronto!

Você tem um **ambiente local completo e funcional**!

**Próximo passo:** Abra um novo terminal e execute:

```bash
npm run dev
```

E comece a desenvolver em `http://localhost:3000` 🚀

---

## 📞 Suporte

Se encontrar problemas:

1. Verifique logs: `tail -f /tmp/wrangler-dev.log`
2. Teste API: `npm run health`
3. Valide sistema: `npm run validate:full`
4. Reinicie tudo: `npm run restart:all`

---

**Status:** ✅ Setup Completo  
**Data:** 4 de Novembro de 2025  
**Versão:** 2.0.0-dev  
**Commit:** Automaticamente salvo
