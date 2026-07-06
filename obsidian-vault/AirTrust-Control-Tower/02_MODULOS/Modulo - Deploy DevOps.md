---
status: ativo
tipo: contexto-modulo
fonte_canonica: repo
ultimo_sha_verificado: ""
risco: alto
modulo: "Deploy DevOps"
ultima_revisao: "2026-07-05"
nao_assumir_sem_verificar_codigo: true
tags:
  - modulo
  - deploy
  - risco/alto
---

# Deploy & DevOps

## Função do módulo
Pipeline de CI/CD, deploy do Worker + Pages, migrações D1, monitoramento, backup e rollback. **Ações em produção requerem autorização explícita.**

## Pipeline (4 estágios)
```
Pre-flight Checks → Build → Deploy Worker + Migrations → Deploy Pages → Validação
```

## Scripts principais
| Script | Função |
|---|---|
| `npm run deploy` | Deploy completo (build + worker + pages) |
| `npm run build` | Build de produção |
| `npm run deploy:pages` | Deploy do frontend (Pages) |
| `npm run deploy:worker:only` | Deploy do Worker |
| `npm run lint` | api-base + secrets + auth-boundaries |
| `npm run test:all` | Unit tests (frontend + worker) |
| `npm run test:e2e` | E2E Playwright |
| `npm run health` | Health check local |

## Comandos de desenvolvimento
| Comando | Função |
|---|---|
| `npm start` | Worker (:8787) + Frontend (:3000) |
| `npm run dev` | Apenas frontend |
| `npm run dev:worker:local` | Worker local |
| `npm run setup:local` | Inicializar D1 local |
| `npm run setup:local:reset` | Resetar D1 local |

## Ambientes
| Ambiente | Worker | D1 | Pages |
|---|---|---|---|
| Local | `wrangler.dev.toml` | SQLite local | Vite :3000 |
| Development | `airtrust-api-development` | `airtrust-db-dev` | — |
| Staging | `airtrust-api-staging` | staging D1 | — |
| Production | `airtrust-api` | `airtrust-db` (real) | `production` branch |

## Gate de migrações em produção
⚠️ **Dupla confirmação obrigatória.** Duas variáveis de ambiente com valores exatos devem estar presentes. Consulte `scripts/deploy-worker-only.sh` para os nomes e valores.

## Regras de negócio críticas
1. **NUNCA fazer deploy ou migration em produção sem autorização explícita**
2. Migrations são numeradas sequencialmente — nunca duplicar números
3. `npm run lint` deve passar antes de qualquer PR
4. Health check após cada deploy
5. Rollback possível via redeploy do worker (stateless)

## Riscos conhecidos
| Risco | Severidade | Status |
|---|---|---|
| Proxy dev apontar para produção via `.env.local` | 🔴 CRÍTICO | Cautela |
| 30 migrations com números duplicados | 🟡 MÉDIO | Catalogado |
| Deploy sem confirmação humana | 🔴 CRÍTICO | Processo definido |

## O que agentes de IA NUNCA devem fazer
- [ ] Executar deploy em produção
- [ ] Executar `wrangler d1 execute --remote`
- [ ] Rodar migrations em staging/production
- [ ] Alterar `wrangler.toml` de produção
- [ ] Modificar scripts de deploy (`scripts/deploy-*.sh`)
- [ ] Configurar `.env.local` para apontar para produção

## Runbooks
- [[Runbook - Deploy Seguro]]
- [[Runbook - Rollback de Emergência]]
