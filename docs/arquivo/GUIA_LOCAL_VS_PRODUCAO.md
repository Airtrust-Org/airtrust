# 🚀 GUIA: Como Conectar Local vs Produção

**Data:** 4 de Novembro de 2025

---

## 🔴 Problema Identificado

Você está tentando conectar em `http://localhost:8787` mas:

- ❌ Dev server **NÃO está rodando**
- ❌ Porta 8787 está **vazia**
- ✅ Produção está **online** (Version 8a4d0076)

---

## ✅ SOLUÇÃO: Duas Opções

### OPÇÃO 1: Usar Produção (Recomendado para Agora)

```
Frontend: Abra o arquivo local (dist/client/index.html)
ou use: npx http-server dist/client

API: https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev

✅ CORS: Já configurado
✅ Dados: Disponíveis em produção
✅ Health: 160ms latência
```

**Teste agora:**

```bash
curl https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/health | jq '.'
```

---

### OPÇÃO 2: Usar Dev Server Local (Para Desenvolvimento)

#### 2.1 Iniciar Dev Server

```bash
cd /Users/filipedaumas/Documents/airtrust

# Terminal 1: Backend (Wrangler)
npm run dev

# Esperar: ✓ Ready on http://localhost:8787

# Terminal 2: Frontend (Vite)
npm run dev:client

# Esperar: ✓ Network: http://localhost:5173
```

#### 2.2 Conectar Frontend Local

```
Frontend: http://localhost:5173
API: http://localhost:8787
CORS: ✅ Configurado para ambos
```

#### 2.3 Verificar Saúde

```bash
# Backend
curl http://localhost:8787/api/health | jq '.'

# Frontend
curl http://localhost:5173

# Se funcionar:
✅ GET http://localhost:8787/api/v2/habilitacoes retorna dados
✅ Sem erro 500
```

---

## 🎯 Por Que Erro 500?

```
Causa: Dev server não está rodando
Sintoma: GET http://localhost:8787/api/v2/habilitacoes → 500
Solução: Iniciar com npm run dev

ou

Usar produção que já está funcionando:
curl https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/habilitacoes
✅ Funciona!
```

---

## 📋 CHECKLIST DE DIAGNÓSTICO

### Se quer usar LOCAL:

- [ ] Terminal aberto em `/Users/filipedaumas/Documents/airtrust`
- [ ] `npm run dev` executado (Terminal 1)
- [ ] Aguardou "✓ Ready on http://localhost:8787"
- [ ] `npm run dev:client` executado (Terminal 2)
- [ ] Aguardou "✓ Network: http://localhost:5173"
- [ ] Frontend acesso: http://localhost:5173
- [ ] Tester: curl http://localhost:8787/api/health

### Se quer usar PRODUÇÃO:

- [ ] Frontend local ou via deploy
- [ ] Apontar API para: https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev
- [ ] Tester: curl https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/habilitacoes

---

## ✅ PRÓXIMO PASSO

**Recomendado: Use a versão deployada em produção agora**

```bash
# Teste a API em produção (já funciona)
curl https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/habilitacoes \
  -H "Content-Type: application/json" | jq '.data | length'

# Verá: Número de habilitações disponíveis
```

---

## 🚀 Scripts Úteis

```bash
# Dev local (ambos servidores)
npm run dev                 # Backend 8787
npm run dev:client          # Frontend 5173

# Ou em uma janela só
npm run dev & npm run dev:client

# Build e deploy
npm run build
npm run deploy

# Health check
curl http://localhost:8787/api/health      # Local
curl https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/health  # Prod
```

---

**Status:** 🟢 PRONTO  
**Recomendação:** Use PRODUÇÃO agora (já está 100% funcional)
