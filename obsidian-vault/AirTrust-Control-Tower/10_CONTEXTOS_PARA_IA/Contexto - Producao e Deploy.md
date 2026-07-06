---
status: ativo
tipo: contexto
fonte_canonica: repo
ultimo_sha_verificado: ""
risco: alto
ultima_revisao: "2026-07-05"
tags:
  - contexto
  - producao
  - risco/alto
---

# Contexto: Produção e Deploy

> **BLOCO DE CONTEXTO** — Use antes de qualquer tarefa que possa afetar produção.

## Regra #1: Produção é sagrada
- NUNCA faça deploy, migration em produção, ou altere secrets sem autorização EXPLÍCITA
- NUNCA execute `wrangler d1 execute --remote` sem autorização
- NUNCA aponte proxy dev para produção sem confirmação explícita

## Ambientes
| Ambiente | Worker | D1 | Uso |
|---|---|---|---|
| Local | `wrangler.dev.toml` | SQLite local | Desenvolvimento |
| Development | `airtrust-api-development` | `airtrust-db-dev` | Testes integrados |
| Staging | `airtrust-api-staging` | staging D1 | QA e validação |
| Production | `airtrust-api` | `airtrust-db` | **DADOS REAIS** |

## Pipeline de deploy
```
Pre-flight Checks → Build → Deploy Worker + Migrations → Deploy Pages → Validação
```

## O que requer autorização explícita
- `npm run deploy` (produção)
- `wrangler d1 execute --remote` (qualquer env)
- `wrangler deploy --env production`
- Alterar `wrangler.toml` de produção
- Alterar secrets em produção
- Rodar migration nova em staging/production

## O que NUNCA fazer
- Apontar `.env.local` para produção (`VITE_DEV_PROXY_TARGET=https://api.airtrust.online/api`)
- Rodar `wrangler d1 execute --remote` sem confirmação
- Fazer deploy sem `npm run lint` passar
- Deploy com TypeScript com erros não documentados

## Health checks pós-deploy
```bash
curl -fsSL https://airtrust-api-production.airtrust.workers.dev/api/health
curl -fsSL https://airtrust.online | head -200
```
