---
status: ativo
tipo: contexto
fonte_canonica: repo
ultimo_sha_verificado: ""
risco: critico   # se ignorado, causa vazamento de dados entre tenants
ultima_revisao: "2026-07-05"
tags:
  - contexto
  - rbac
  - multitenant
  - seguranca
  - risco/critico
---

# Contexto: Segurança, RBAC e Multi-Tenant

> ⚠️ **BLOCO DE CONTEXTO OBRIGATÓRIO** — Todo agente de IA que for alterar código backend DEVE ler este bloco antes de começar.

## Regra #1: Isolamento multi-tenant

**Toda query que toca dados de tenant DEVE ter `WHERE empresa_id = ?`** (ou JOIN equivalente).

Usar `c.get('empresaId')` do contexto Hono — NUNCA hardcodar `empresa_id = 1`.

Pular esta regra = vazamento de dados entre empresas. **RISCO CRÍTICO.**

## Regra #2: Auth e middlewares

- `auth` + `tenantMiddleware` aplicados globalmente em `index.ts`
- Rotas públicas explicitamente whitelisted em `isPublicPath`
- `requireRole('admin')` para rotas admin-only
- Roles: `admin > manager > instructor > editor > student > viewer`

## Regra #3: JWT

- Access token: 1h, header `Authorization: Bearer <token>`
- Refresh token: opaque 64-char hex, 7 dias
- Token blocklist para invalidação imediata
- Frontend: `fetchWithAuth()` injeta token + auto-refresh em 401

## Regra #4: Resposta de API

```json
{ "success": true, "data": [...] }
{ "success": false, "error": "mensagem" }
```

## Regra #5: Soft delete e auditoria

- Sempre soft delete (nunca `DELETE` hard)
- Toda mutação registra auditoria com `dados_anteriores` e `dados_novos`

## O que NUNCA fazer

- ❌ Query sem `WHERE empresa_id = ?`
- ❌ Hardcodar `empresa_id = 1`
- ❌ Criar rota sem proteção auth (a menos que explicitamente pública)
- ❌ Usar `DELETE` em vez de soft delete
- ❌ Pular registro de auditoria em mutações
- ❌ Expor secrets, tokens, ou dados de usuários
