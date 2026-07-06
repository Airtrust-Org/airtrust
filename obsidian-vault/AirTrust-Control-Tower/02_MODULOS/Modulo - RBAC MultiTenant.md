---
status: ativo
tipo: contexto-modulo
fonte_canonica: repo
ultimo_sha_verificado: ""
risco: medio
modulo: "RBAC MultiTenant"
ultima_revisao: "2026-07-05"
nao_assumir_sem_verificar_codigo: true
tags:
  - modulo
  - rbac
  - multitenant
  - risco/critico
---

# RBAC & Multi-Tenant

## Função do módulo
Autenticação JWT, controle de acesso baseado em roles, isolamento multi-tenant e segurança de API. **Módulo transversal — afeta TODOS os outros módulos.**

## Arquivos principais
| Arquivo | Função |
|---|---|
| `routes/auth.ts` | Login, logout, refresh, reset de senha, convites |
| `routes/admin-usuarios.ts` | Gestão de usuários |
| `routes/admin-perfis.ts` | Perfis e roles |
| `routes/empresas.ts` | CRUD de empresas |
| `routes/empresas-usuarios.ts` | Vínculo usuário-empresa |
| `worker-airtrust/src/index.ts` | Middlewares globais: auth, tenantMiddleware, CORS, CSP |

## Roles
```
admin > manager > instructor > editor > student > viewer
```

## JWT
- **Access Token**: 1h, `Authorization: Bearer <token>`
- **Refresh Token**: 64-char hex, 7 dias
- **Token Blocklist**: `token_blocklist` para invalidação
- **Convites**: UUID SHA-256, `convites_usuarios`
- **Reset Senha**: UUID SHA-256, 60min, `password_reset_tokens`

## Middlewares globais (ordem)
1. `X-AirTrust-Version` header
2. `requestIdMiddleware` → X-Request-ID
3. `noCacheMiddleware` (dev + rotas críticas)
4. OPTIONS catch-all (preflight CORS)
5. `cors()` → `resolveAllowedOrigin()`
6. `cacheControl()`
7. Security Headers (CSP, X-Frame-Options, HSTS)
8. Multi-tenant guard: `isPublicPath?` → skip | else → `auth()` → `tenantMiddleware()`

## Resolução de empresa (login)
1. `usuarios_empresas` com `is_primary = 1`
2. Join `usuarios` → `funcionarios` → `empresa_id`
3. Platform admin fallback
4. Se apenas 1 empresa ativa → usa essa
5. Email domain match com `empresas.dominio`
6. Erro: `USER_WITHOUT_EMPRESA`

## Regras de negócio críticas
1. **TODA query com dados de tenant DEVE ter `WHERE empresa_id = ?`**
2. Usar `c.get('empresaId')` — NUNCA hardcodar
3. `requireRole()` middleware para rotas restritas
4. Soft delete em TODAS as tabelas
5. Auditoria em TODA mutação

## Riscos conhecidos
| Risco | Severidade | Status |
|---|---|---|
| Vazamento cross-tenant se query sem `empresa_id` | 🔴 CRÍTICO | Monitoramento contínuo |
| Hardcoded `empresa_id = 1` encontrado em hardening waves | 🟠 ALTO | 4 waves de fix aplicadas |
| Proxy dev apontando para produção | 🔴 CRÍTICO | Cautela extrema |

## O que agentes de IA NUNCA devem fazer
- [ ] Criar query sem `WHERE empresa_id = ?`
- [ ] Hardcodar `empresa_id = 1`
- [ ] Usar `DELETE` em vez de soft delete
- [ ] Criar rota pública sem revisão de segurança
- [ ] Pular `requireRole()` em rota sensível
- [ ] Expor tokens, secrets ou dados de autenticação
