---
status: ativo
tipo: mapa
fonte_canonica: repo
ultimo_sha_verificado: ""
risco: baixo
ultima_revisao: "2026-07-05"
tags:
  - mapa
  - arquitetura
---

# Mapa: Arquitetura Geral

> Fonte canônica: `ARCHITECTURE_OVERVIEW.md` (HEAD: `5be104893`)

## Topologia Cloudflare (6 produtos)

| Produto | Função | Escala |
|---|---|---|
| **Workers** | Backend API serverless (Hono v4 + TS) | 126+ rotas ativas |
| **D1** | SQLite-compatível relacional | 378+ migrations |
| **R2** | Object storage (SCORM, H5P, PDFs, backups) | Bucket: `airtrust-files` |
| **Pages** | Hospedagem SPA + deploy automático | Branch: `production` |
| **Workers AI** | LLM inference (Llama 3.1 8B) | Modelo: `@cf/meta/llama-3.1-8b-instruct` |
| **Browser Rendering** | Geração server-side de PDFs | API: `cloudflare/browser-rendering` |

## Dois runtimes, mesmo repo

| Camada | Tech | Entry Point |
|---|---|---|
| Frontend SPA | React 19, React Router v7, Vite 6 | `src/react-app/main.tsx` |
| Backend API | Cloudflare Workers, Hono v4 | `worker-airtrust/src/index.ts` |

## Fluxo de request autenticado

```
Browser → Service Worker (bypass API) → Cloudflare Edge (TLS/WAF)
→ Worker (Hono middlewares: CORS, CSP, auth, tenant, rate-limit)
→ D1 (com empresa_id) / R2
→ Response: { success, data/error }
```

## Limitações críticas

| Limite | Valor | Impacto |
|---|---|---|
| CPU time/request | 30s | Exportações usam streaming |
| D1 row read/query | 25,000 | Paginação obrigatória, limit=200 max |
| D1 storage/db | 2 GB | Monitoramento ativo |
| Workers AI req/min | 300 (free) | Cache de respostas do assistente |

## Ambientes

| Ambiente | Worker | D1 |
|---|---|---|
| Local | wrangler.dev.toml | SQLite local |
| Development | `airtrust-api-development` | `airtrust-db-dev` |
| Staging | `airtrust-api-staging` | staging D1 |
| Production | `airtrust-api` | `airtrust-db` |

## Links
- [[Mapa - Stack Tecnológico]]
- [[Modulo - Deploy DevOps]]
- [[Modulo - Banco D1]]
- [[Contexto - Seguranca RBAC MultiTenant]]
