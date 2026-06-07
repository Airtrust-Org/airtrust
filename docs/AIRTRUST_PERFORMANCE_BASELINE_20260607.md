# AIRTRUST — Baseline de Performance (READ-ONLY)

- **Data:** 2026-06-07 · **Modelo:** Opus 4.8 · **Produção:** `airtrust-db` (somente SELECT)

> **Escopo medido:** custo **server-side D1** (campo `meta.duration` / `rows_read` da API D1) das queries-núcleo. **Não medido nesta fase:** latência ponta-a-ponta de endpoints HTTP (p50/p95), payload e renders de frontend — exigem subir o worker/app, fora do escopo read-only. Protocolo de medição definido no §4. **Nenhum ganho é prometido sem medição** (§24 do briefing).

## 1. Baseline D1 (server-side, produção, real)

| Query núcleo | duration | rows_read | leitura |
|---|---:|---:|---|
| qualificacoes_historico e6 (JOIN funcionarios, ativos) | 1.0 ms | 966 | ACEITÁVEL |
| frms_jornada e6 (JOIN funcionarios, ativos) | 3.8 ms | 1.853 | ACEITÁVEL |
| escala_eventos e6 (JOIN escalas_mensais, ativos) | 14.5 ms | 2.290 | ACEITÁVEL (mais cara) |
| simulador_agendamentos e6 (ativos) | 2.3 ms | 94 | ACEITÁVEL |
| funcionarios e6 (ativos) | 0.2 ms | 64 | ACEITÁVEL |

**Conclusão:** a camada D1 **não é o gargalo** para o núcleo. Todas < 15 ms server-side. A lentidão percebida está, por eliminação, em:
- round-trips do worker (várias chamadas sequenciais por tela),
- payload e agregação no frontend,
- padrões N+1 (loops por participante/dia/sessão),
- cache/refetch incorretos (ver doc de cache).

## 2. Sinais estruturais de risco (do código e do schema)

| Sinal | Evidência | Severidade |
|---|---|---|
| Leitura crítica via JOIN funcionário | `qualificacoes/historico.ts`, `estatisticas.ts` usam `f.empresa_id=?` | MÉDIO (ok hoje, depende de índice em `qualificacoes_historico.funcionario_id`) |
| 773 índices no banco | `sqlite_master` | MÉDIO (custo de escrita/bloat) |
| `simulador_agendamentos` com 24 índices | `sqlite_master` | ALTO (redundância provável) |
| `escala_eventos` lê 2.290 linhas p/ projeção mensal | medição §1 | MÉDIO (cresce com histórico) |
| `frms_jornada` 5.210 linhas, 82% soft-deleted | inventário | MÉDIO (queries varrem lixo se sem índice em `deleted_at`) |
| Fan-out de fontes na grade mensal | commits `6d2193f`, `fb75103`, `879130b` (projeção de sessões+eventos externos) | ALTO (múltiplas fontes carregadas separadamente) |

## 3. N+1 e múltiplas fontes (a confirmar com tracing)

Candidatos por leitura de código (não confirmados por profiler):
- Grade mensal integrada: projeta escalas + simulador + treinamentos + eventos externos (várias queries/fontes) — risco de N+1 por dia/funcionário.
- Detalhe de sessão (modal): hidratação em fases (commits `808bb11`, `1546a48`) — verificar nº de chamadas.
- Dashboard de qualificações: estatísticas em múltiplas queries (`estatisticas.ts` tem 5 blocos `f.empresa_id=?`).

## 4. Protocolo de medição ponta-a-ponta (próxima fase)

Para cada endpoint do §13.1 do briefing, medir com worker rodando:
```
endpoint | tempo médio | p50 | p95 | payload (KB) | nº queries | rows | resultado
```
Endpoints alvo: Qualificações Histórico/Planejados, Planejados Calendário, Gestão de Simuladores, Lista/Detalhe de Sessão, Escala Mensal, Visão Integrada, EVD, FRMS, Dashboard.
Classificação (Cloudflare/D1): `CRÍTICO >5s · ALTO >2s · MÉDIO >1s · ACEITÁVEL <1s`.

Frontend: nº de requests por tela, renders, tempo até conteúdo, peso de bundle, virtualização de tabelas/calendários, filtros client-side sobre payloads grandes, refetch/staleTime.

## 5. Recomendações preliminares (sem medição confirmada)
1. Profilar a **grade mensal integrada** e **detalhe de sessão** primeiro (maior suspeita de N+1/multi-fonte).
2. Auditar redundância dos 24 índices de `simulador_agendamentos` (ver doc de índices) antes de adicionar qualquer índice.
3. Garantir filtro `deleted_at` coberto por índice nas tabelas de 82% soft-delete.
