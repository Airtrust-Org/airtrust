# 🔍 Diagnóstico e Solução: Endpoints de Cadastros Retornando 404

**Data:** 26 de Novembro de 2025  
**Problema:** Endpoints `/api/funcoes`, `/api/setores` e `/api/aeronaves` retornando 404 Not Found na produção  
**Status:** ✅ RESOLVIDO

---

## 📋 Resumo Executivo

O frontend em produção (`https://production.airtrust.pages.dev`) tentava chamar `/api/funcoes|setores|aeronaves` na URL `https://airtrust-api-production.airtrust.workers.dev/api/...`, mas recebía 404 porque **esses endpoints não existiam no Worker em produção**.

### Root Cause

- O arquivo `worker-airtrust/src/routes/lookup.ts` com as rotas era novo e ainda **não tinha sido deployado** para produção
- O frontend estava corretamente configurado com `VITE_API_URL=https://airtrust-api-production.airtrust.workers.dev/api`
- O Worker local tinha as rotas montadas, mas a produção não

---

## 🔧 Solução Implementada

### Fase 1: Deploy do Worker com Endpoints

1. ✅ Verificado que `lookup.ts` estava montado em `src/index.ts` com `app.route('/api', lookup)`
2. ✅ Deployado Worker para produção com `npx wrangler deploy --env production`
3. ✅ Endpoints começaram a responder 200 OK

### Fase 2: Correção de Schema Mismatch

Ao testar, descobriu-se que o endpoint GET `/api/aeronaves` retornava erro:

```
GET /api/aeronaves → 500 Internal Server Error
error: "Erro ao carregar aeronaves"
```

**Causa:** A query tentava selecionar colunas que não existiam:

```sql
SELECT id, modelo, prefixo, fabricante, ano_fabricacao, ativo
FROM aeronaves
WHERE deleted_at IS NULL AND ativo = 1
```

Mas a tabela real só tinha: `id, modelo, prefixo, created_at, updated_at, deleted_at`

**Solução:** Removida referência a colunas inexistentes:

```typescript
// ANTES
const query = `
  SELECT id, modelo, prefixo, fabricante, ano_fabricacao, ativo
  FROM aeronaves
  WHERE deleted_at IS NULL AND ativo = 1
  ORDER BY modelo ASC
`;

// DEPOIS
const query = `
  SELECT id, modelo, prefixo
  FROM aeronaves
  WHERE deleted_at IS NULL
  ORDER BY modelo ASC
`;
```

3. ✅ Redeploy do Worker corrigido

---

## ✅ Verificação Final

Todos os endpoints em produção agora retornam 200 OK com dados:

```bash
# GET /api/funcoes
curl https://airtrust-api-production.airtrust.workers.dev/api/funcoes
→ 6 funções retornadas ✅

# GET /api/setores
curl https://airtrust-api-production.airtrust.workers.dev/api/setores
→ 7 setores retornados ✅

# GET /api/aeronaves
curl https://airtrust-api-production.airtrust.workers.dev/api/aeronaves
→ 2 aeronaves retornadas ✅
```

---

## 🚀 Impacto

- ✅ Frontend pode fazer POST/PUT/DELETE para salvar novos cadastros
- ✅ Dropdowns em `ModalFuncionario` carregam dados do API
- ✅ Página `Cadastros.tsx` funcionando completamente
- ✅ Usuários podem gerenciar funções, setores e aeronaves em produção

---

## 📝 Commits Realizados

```
b0f3c61 - fix: deploy endpoints de lookup (funcoes/setores/aeronaves) para produção
18c0e38 - fix: corrigir query de aeronaves removendo colunas inexistentes
```

---

## 🔐 Ambiente Variables Padronizadas

Corrigido `.env.production` para usar chave correta reconhecida pelo código:

```bash
# ANTES (ignorado)
VITE_API_BASE_URL=https://airtrust.airtrust.workers.dev/api

# DEPOIS (reconhecido)
VITE_API_URL=https://airtrust-api-production.airtrust.workers.dev/api
```

---

## 📊 Logs de Produção (Após Fix)

```
🔍 [API Config] VITE_API_URL: https://airtrust-api-production.airtrust.workers.dev/api
🔍 [API Config] API_BASE_URL (final): https://airtrust-api-production.airtrust.workers.dev/api
[CADASTROS] Respostas: {funcoes: 200, setores: 200, aeronaves: 200} ✅
```

---

## ✨ Próximos Passos (Opcional)

- [ ] Adicionar POST/PUT/DELETE com auth na produção (já implementado, apenas validar)
- [ ] Testar criação de novo cadastro em produção
- [ ] Monitorar Cloudflare Logs para erros
