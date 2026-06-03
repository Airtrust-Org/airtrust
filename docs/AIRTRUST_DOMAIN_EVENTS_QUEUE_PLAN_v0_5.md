# AirTrust Domain Events → Cloudflare Queues Migration Plan v0.5

**Date:** 2026-06-02
**Sprint:** J — Supabase Preparation
**Status:** Plano criado, sem implementação. Implementação planejada para Sprint L+.

---

## 1. Estado atual

### Arquitetura

O sistema atual usa a tabela D1 `domain_events` como fila de mensagens:

```
┌──────────┐    publishDomainEvent()    ┌───────────────┐
│  Route   │ ─────────────────────────> │  domain_events │
│ Handler  │    INSERT INTO              │  (D1 table)    │
└──────────┘                             └───────┬───────┘
                                                 │
                    ┌────────────────────────────┼────────────────────────────┐
                    │ polling (middleware)        │ polling (cron)             │
                    ▼                             ▼                            │
           ┌────────────────┐          ┌──────────────────────┐              │
           │ domainEvent    │          │ scheduled-handler.ts │              │
           │ Processor      │          │ (lines 890-930)       │              │
           │ Middleware     │          │ every cron tick       │              │
           └───────┬────────┘          └──────────┬───────────┘              │
                   │                              │                           │
                   ▼                              ▼                           │
           ┌──────────────────────────────────────────────────┐              │
           │         processarEventosParaModulo()              │              │
           │  7 module handlers (escalas, frms, hospedagem,   │              │
           │  simuladores, qualificacoes, pasta_virtual,      │              │
           │  compliance)                                      │              │
           └──────────────────────────────────────────────────┘              │
```

### Números

| Métrica | Valor |
|---|---|
| Tipos de evento | 34 |
| Módulos consumidores | 7 |
| Arquivos que publicam eventos | 15+ |
| Consumo: middleware (real-time) | Após cada POST/PUT/DELETE |
| Consumo: cron (catch-up) | A cada 10 minutos |
| Retenção de eventos | 30 dias (filtro na query) |
| Idempotência | Não implementada |
| Retry em falha | Não — falha é registrada e evento é marcado como processado |
| Dead-letter queue | Não existe |

---

## 2. Onde eventos são emitidos

| Publicador | Eventos | Consumidores |
|---|---|---|
| `qualificacoes/historico-helpers.ts` | CMA_CRIADO, CMA_RENOVADO, CMA_REVOGADO, HABILITACAO_* | escalas, compliance |
| `cron/alertasDiarios.ts` | CMA_VENCENDO_30D, CMA_VENCENDO_7D, CMA_VENCIDO, SIMULADOR_PENDENTE_VENCENDO | escalas, compliance |
| `routes/frms.ts` | FRMS_AVALIACAO_CRIADA, FRMS_STATUS_* | escalas, compliance |
| `routes/simuladores-sessoes.ts` | SIMULADOR_AGENDADO, SIMULADOR_REALIZADO, SIMULADOR_CANCELADO | pasta_virtual, compliance |
| `routes/funcionarios.ts` | FUNCIONARIO_CRIADO, FUNCIONARIO_ATUALIZADO, FUNCIONARIO_INATIVADO, FUNCIONARIO_REATIVADO | escalas, simuladores, hospedagem, compliance |
| `routes/escalas-tripulacoes.ts` | TRIPULANTE_ALOCADO, TRIPULANTE_REMOVIDO, TRIPULANTE_ALTERADO | frms, hospedagem, compliance |
| `routes/escalas-status.ts` | ESCALA_PUBLICADA, ESCALA_ARQUIVADA | pasta_virtual, compliance |
| `routes/pasta-virtual.ts` | DOCUMENTO_ENVIADO, DOCUMENTO_EXCLUIDO, DOCUMENTO_CMA_DETECTADO | qualificacoes, compliance |

---

## 3. Riscos do modelo atual

| Risco | Severidade | Descrição |
|---|---|---|
| Perda de eventos | Alta | Se `waitUntil` falhar (worker timeout/eviction), eventos publicados durante a request são perdidos |
| Polling ineficiente | Média | Cada request POST/PUT/DELETE faz SELECT em domain_events, mesmo sem eventos pendentes |
| Latência de processamento | Média | Eventos entre módulos podem levar até 10 minutos (cron catch-up) |
| Sem retry | Alta | Evento que falha é marcado como processado e nunca é retentado |
| D1 como fila | Alta | D1 não foi projetado para workloads de fila. Row lock implícito. Sem garantia de entrega. |
| Sem observabilidade | Média | Não há métricas de taxa de eventos, latência de processamento, ou fila acumulada |
| Acúmulo de eventos | Baixa | Eventos são soft-deleted (nunca removidos fisicamente). Crescimento linear com o uso. |

---

## 4. Proposta com Cloudflare Queues

### Arquitetura alvo

```
┌──────────┐   publishDomainEvent()   ┌──────────────┐   send()   ┌─────────────────┐
│  Route   │ ────────────────────────>│ domain_events │ ─────────> │ Cloudflare      │
│ Handler  │   INSERT INTO (dual)     │ (D1, legacy) │            │ Queues          │
└──────────┘                          └──────────────┘            │ domain-events   │
                                                                  └────────┬────────┘
                                                                           │
                                                                           │ push
                                                                           ▼
                                                                  ┌─────────────────┐
                                                                  │ Queue Consumer  │
                                                                  │ (Worker handler) │
                                                                  └────────┬────────┘
                                                                           │
                                                                           ▼
                                                                  ┌─────────────────┐
                                                                  │ processar       │
                                                                  │ EventosPara     │
                                                                  │ Modulo()        │
                                                                  └────────┬────────┘
                                                                           │
                                                                  ┌────────┴────────┐
                                                                  │ Success → ACK    │
                                                                  │ Failure → Retry  │
                                                                  │ Exhaust → DLQ    │
                                                                  └─────────────────┘
```

### Novos bindings em wrangler.toml

```toml
[[queues.producers]]
  binding = "DOMAIN_EVENTS_QUEUE"
  queue = "domain-events-main"

[[queues.consumers]]
  queue = "domain-events-main"
  max_retries = 3
  max_concurrency = 5
  retry_delay = 60

[[queues]]
  queue = "domain-events-dlq"
  delivery_delay = 0
```

---

## 5. Eventos candidatos por tier

### Tier 1 — Migrar primeiro (alto volume, fire-and-forget)

| Evento | Volume | Consumidores | Risco |
|---|---|---|---|
| TRIPULANTE_ALOCADO | Alto | frms, hospedagem, compliance | Baixo |
| TRIPULANTE_REMOVIDO | Alto | frms, hospedagem, compliance | Baixo |
| TRIPULANTE_ALTERADO | Alto | frms, compliance | Baixo |
| FUNCIONARIO_INATIVADO | Médio | escalas, simuladores, hospedagem, compliance | Baixo |
| ESCALA_PUBLICADA | Baixo | pasta_virtual, compliance | Baixo |
| SIMULADOR_REALIZADO | Médio | pasta_virtual, compliance | Baixo |

### Tier 2 — Migrar depois (importante, menor volume)

| Evento | Volume | Consumidores |
|---|---|---|
| CMA_CRIADO, CMA_RENOVADO, CMA_REVOGADO | Médio | escalas, compliance |
| FRMS_STATUS_CRITICO, FRMS_STATUS_NORMAL, FRMS_STATUS_NORMALIZADO | Baixo | escalas |
| DOCUMENTO_CMA_DETECTADO | Baixo | qualificacoes |
| SIMULADOR_AGENDADO, SIMULADOR_CANCELADO | Médio | compliance |
| FUNCIONARIO_CRIADO, FUNCIONARIO_ATUALIZADO, FUNCIONARIO_REATIVADO | Baixo | compliance |

### Tier 3 — Migrar por último (puro audit log)

| Evento | Consumidores |
|---|---|
| DOCUMENTO_ENVIADO, DOCUMENTO_EXCLUIDO | compliance |
| HABILITACAO_ADICIONADA, HABILITACAO_REVOGADA | compliance |
| HOSPEDAGEM_RESERVADA, HOSPEDAGEM_CANCELADA | compliance |
| ESCALA_ARQUIVADA | compliance |

### NÃO migrar (eventos de cron)

Eventos publicados por `alertasDiarios.ts` (CMA_VENCENDO_*, SIMULADOR_PENDENTE_VENCENDO) são gerados no próprio cron e consumidos pelo mesmo cron. Migrar para Queue adicionaria latência sem benefício.

---

## 6. Idempotência

Cada evento deve ter `idempotency_key` (UUID v4) no payload. O consumidor verifica se já processou aquele key antes de executar o handler.

```typescript
// No consumer
const key = event.idempotency_key;
const alreadyProcessed = await db.prepare(
  'SELECT 1 FROM domain_events_processed WHERE idempotency_key = ?'
).bind(key).first();
if (alreadyProcessed) return; // ACK sem reprocessar
```

---

## 7. Retry e dead-letter

| Configuração | Valor |
|---|---|
| Max retries | 3 |
| Retry delay | 60s, 120s, 240s (exponencial) |
| DLQ | `domain-events-dlq` |
| Alerta em DLQ | Log estruturado + monitoramento |

Eventos que falham 3 vezes vão para a DLQ. Um dashboard ou alerta manual notifica o time de operações.

---

## 8. Observabilidade

| Métrica | Como medir |
|---|---|
| Eventos publicados/min | Counter no `publishDomainEvent()` |
| Eventos consumidos/min | Counter no consumer |
| Latência de processamento (p95) | Timer: publish → ACK |
| Retry rate | Counter de retries / total |
| DLQ depth | `queue.list()` periódico |
| Falhas por módulo | Agrupado por `evento.modulo` |

---

## 9. Rollout por fases

### Fase 0 — Setup (Sprint L)
- Adicionar `[[queues]]` em `wrangler.toml` (dev apenas)
- Adicionar type bindings em `Env`
- Criar consumer entry point
- **NÃO deployar em produção**

### Fase 1 — Dual-write Tier 1 (Sprint M)
- Modificar `publishDomainEvent()`: inserir em D1 + enviar para Queue
- Manter middleware + cron como consumidores primários
- Validar que mensagens chegam na Queue (modo shadow)
- **Sem consumer ativo ainda — apenas validação de producer**

### Fase 2 — Consumer Tier 1 (Sprint N)
- Ativar consumer para Tier 1 events
- Remover Tier 1 do escopo do middleware polling (flag por evento)
- Monitorar latência, retries, DLQ
- **D1 ainda é source of truth**

### Fase 3 — Migrar Tier 2 e 3 (Sprint O)
- Ativar consumer para todos os eventos
- Parar INSERT em D1 para eventos 100% migrados
- Remover middleware `domainEventProcessorMiddleware`
- Remover cron catch-up de events

### Fase 4 — Cleanup (Sprint P)
- Remover tabela `domain_events`
- Remover código de publicação/consumo legado
- Migrar `auditoria_avancada_v2` logging para dentro do consumer

---

## 10. Fora do escopo deste sprint (Sprint J)

- **NÃO** implementar Queue consumer
- **NÃO** alterar `wrangler.toml`
- **NÃO** modificar `publishDomainEvent()`
- **NÃO** adicionar bindings
- **NÃO** fazer deploy com Queues

---

## 11. Dependências

- Cloudflare Queues disponível no plano atual (Workers Paid)
- `wrangler.toml` precisa de update (requer deploy)
- Testes de integração com Queue local (`wrangler dev`)
