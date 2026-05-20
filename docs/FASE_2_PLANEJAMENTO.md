# 🚀 FASE 2: BACKEND OPTIMIZATION & SECURITY (12-16h)

**Data Início**: 11 de Novembro de 2025  
**Status**: 🟡 IN PROGRESS  
**Objetivo**: Corrigir 4 queries restantes + CSRF + Rate Limiting

---

## 📋 TAREFAS DA FASE 2

### ✅ Fase 2.1: Corrigir 4 Queries Finais (4h)

| Query                          | Arquivo   | Linha   | Tipo                  | Status      |
| ------------------------------ | --------- | ------- | --------------------- | ----------- |
| 1. export-data (funcionarios)  | system.ts | 387     | SELECT \* (sem LIMIT) | ⏳ Corrigir |
| 2. export-data (treinamentos)  | system.ts | 390     | SELECT \* (sem LIMIT) | ⏳ Corrigir |
| 3. export-data (certificações) | system.ts | 398-407 | JOIN sem LIMIT        | ⏳ Corrigir |
| 4. export-data (arquivos)      | system.ts | 409-420 | LEFT JOIN sem LIMIT   | ⏳ Corrigir |

**Estratégia**: Adicionar LIMIT com paginação + soft-delete

### ⏳ Fase 2.2: CSRF Protection (4h)

- Criar middleware CSRF em `src/worker/middleware/csrf.ts`
- Integrar em rotas POST/PUT/DELETE
- Frontend: adicionar X-CSRF-Token header

### ⏳ Fase 2.3: Rate Limiting (4h)

- Criar middleware Rate Limit em `src/worker/middleware/rate-limit.ts`
- 5 req/min em /login (anti brute-force)
- 100 req/min em rotas gerais

---

## 🎯 RESULTADO ESPERADO

- ✅ Queries sem LIMIT: 4 → 0 (100% resolvido)
- ✅ CSRF Protection: Implementado
- ✅ Rate Limiting: Implementado
- ✅ Build: Passa sem erros
- ✅ Deploy: Sucesso

---

**Próximo**: Executar Fase 2.1 (correção de queries)
