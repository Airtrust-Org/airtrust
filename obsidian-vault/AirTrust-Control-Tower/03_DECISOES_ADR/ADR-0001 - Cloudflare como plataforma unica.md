---
status: decidido
tipo: adr
fonte_canonica: repo
ultimo_sha_verificado: ""
risco: baixo
decisao_id: "ADR-0001"
data_decisao: "2025-11-03"
ultima_revisao: "2026-07-05"
tags:
  - adr
  - decisao
  - arquitetura
---

# ADR-0001: Cloudflare Workers + D1 + R2 como plataforma única

## Status
decidido

## Contexto
O AirTrust precisava de uma plataforma serverless que eliminasse a necessidade de gerenciar servidores, com banco de dados relacional, storage de objetos e capacidade de edge computing para uma aplicação SaaS multi-tenant de aviação.

## Decisão
Usar exclusivamente o ecossistema Cloudflare: Workers (compute), D1 (SQLite), R2 (storage), Pages (frontend hosting), Workers AI (LLM) e Browser Rendering (PDFs).

## Alternativas consideradas
| Alternativa | Prós | Contras | Por que rejeitada |
|---|---|---|---|
| AWS (Lambda + RDS + S3) | Maturidade, ecossistema vasto | Complexidade operacional, egress fees, cold starts | Muita infra para gerenciar |
| VPS tradicional (Node + PostgreSQL) | Controle total | Escalabilidade manual, single point of failure | Não escala automaticamente |
| Supabase | PostgreSQL managed, APIs auto | Migração complexa, vendor lock-in diferente | Avaliado mas mantido Cloudflare |

## Consequências
### Positivas
- Zero gerenciamento de servidores
- Escalabilidade automática global (330+ datacenters)
- Sem egress fees no R2
- TLS/DDoS/WAF gerenciados pela plataforma

### Negativas (dívida técnica aceita)
- D1 é SQLite (sem PostgreSQL features: sem CTE recursivo limitado, sem stored procedures)
- Limite de 30s CPU por request — exportações pesadas precisam de streaming
- D1 storage limitado a 2 GB — requer monitoramento
- Workers AI rate limit (300 req/min free)
- Vendor lock-in na Cloudflare

## Arquivos afetados
- `worker-airtrust/wrangler.toml`
- `worker-airtrust/src/index.ts`
- Todo o backend

## Migrations associadas
- 378+ migrations em D1

## Referências
- [[Mapa - Arquitetura Geral]]
- [[Mapa - Stack Tecnologico]]
