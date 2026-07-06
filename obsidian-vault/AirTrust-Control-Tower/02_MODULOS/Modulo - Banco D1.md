---
status: ativo
tipo: contexto-modulo
fonte_canonica: repo
ultimo_sha_verificado: ""
risco: medio
modulo: "Banco D1"
ultima_revisao: "2026-07-05"
nao_assumir_sem_verificar_codigo: true
tags:
  - modulo
  - d1
  - banco
  - risco/medio
---

# Banco D1

## Função do módulo
Cloudflare D1: banco SQLite-compatível serverless. 378+ migrations sequenciais, raw SQL sem ORM, soft delete universal, auditoria em todas as mutações.

## Características
| Característica | Valor |
|---|---|
| Engine | SQLite (D1) |
| ORM | Nenhum — raw SQL via `c.env.DB.prepare()` |
| Migrations | 378+ sequenciais em `worker-airtrust/migrations/` |
| Numeração | `0001` a `0384+` |
| Soft delete | Todas as tabelas |
| Auditoria | `dados_anteriores` / `dados_novos` em mutações |

## Limitações
| Limite | Valor | Impacto |
|---|---|---|
| Row read/query | 25,000 | Paginação obrigatória |
| Storage/db | 2 GB (paid) | Monitorar crescimento |
| CPU time | 30s | Queries longas usam chunking |

## Convenções
- Tabelas: snake_case (`qualificacoes_tipos`, `frms_jornadas`)
- Colunas de tenant: `empresa_id` (sempre presente)
- Colunas de auditoria: `created_at`, `updated_at`, `deleted_at`
- Migrations: numeradas sequencialmente, nunca pular nem duplicar

## Comandos
```bash
# Local
wrangler d1 execute airtrust-db --local --file=migrations/XXXX.sql

# Remote (REQUER AUTORIZAÇÃO)
wrangler d1 execute airtrust-db --env production --remote --file=migrations/XXXX.sql
```

## Riscos conhecidos
| Risco | Severidade | Status |
|---|---|---|
| 30 migrations com números duplicados | 🟡 MÉDIO | Catalogado |
| D1 storage aproximando 2 GB | 🟡 MÉDIO | Monitorar |
| Queries sem `empresa_id` | 🔴 CRÍTICO | Auditoria contínua |

## O que agentes de IA NUNCA devem fazer
- [ ] Rodar migration em produção
- [ ] Criar migration sem `empresa_id` nas novas tabelas
- [ ] Usar `DELETE` em vez de soft delete
- [ ] Criar tabela sem colunas de auditoria
- [ ] Duplicar número de migration existente
