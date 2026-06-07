# AIRTRUST — Plano de Otimização de Queries e Índices (READ-ONLY)

- **Data:** 2026-06-07 · **Modelo:** Opus 4.8 · **Produção:** `airtrust-db` (somente SELECT)

> **Nenhum índice criado/removido nesta fase.** Recomendações são plano posterior, aditivo, com benchmark antes/depois.

## 1. Panorama
- **773 índices** no banco (alto). Maior ofensor: `simulador_agendamentos` com **23 índices definidos** (24 no total contando PK), com **redundância evidente**.

## 2. Índices REDUNDANTES (candidatos a remoção — confirmar com `EXPLAIN QUERY PLAN`)

### simulador_agendamentos (redundância grave)
| Coluna(s) | Índices duplicados | Manter |
|---|---|---|
| funcionario_id | `idx_agendamentos_funcionario_id`, `idx_agend_func_id_v5` | 1 |
| simulador_id | `idx_agendamentos_simulador_id`, `idx_agend_sim_id_v5` | 1 |
| deleted_at | `idx_agendamentos_deleted_at`, `idx_agend_deleted_v5`, `idx_agendamentos_deleted` | 1 |
| data | `idx_agendamentos_data`, `idx_agend_data_v5`, `idx_simulador_agendamentos_data` | 1 |
| status | `idx_agendamentos_status`, `idx_agend_status_v5` | 1 |
| (data,simulador_id)/(simulador_id,data) | `idx_agendamentos_data_simulador`, `idx_simulador_agendamentos_simulador_data` | 1 (escolher ordem por uso) |

→ Remoção potencial de **~8–9 índices** em uma tabela de 99 linhas. (Tabela pequena: o ganho é em escrita/manutenção/bloat e clareza, não em leitura.)

### frms_jornada
| Coluna(s) | Duplicados | Manter |
|---|---|---|
| (tripulante_id, data) | `idx_frms_jornada_trip_data`, `idx_frms_jornada_trip_data_uq` | 1 (se `_uq` é UNIQUE, manter o UNIQUE e remover o simples) |

### qualificacoes_historico
- `idx_qualificacoes_historico_empresa_id` (empresa_id) é **prefixo** de `idx_qualificacoes_historico_empresa_funcionario` (empresa_id, funcionario_id) e `idx_qualificacoes_historico_empresa_deleted` (empresa_id, deleted_at) → o índice de coluna única é redundante para buscas por `empresa_id` (mas pode ser mantido se houver scans por empresa_id puro). Revisar com plano de query.

## 3. Índices possivelmente AUSENTES (validar necessidade)

| Tabela | Query crítica | Índice atual | Recomendado | Ganho esperado |
|---|---|---|---|---|
| qualificacoes_historico | leitura por `funcionario_id` (JOIN funcionário) | coberto por `idx_..._unique_active(funcionario_id,...)` | OK | — |
| funcionarios | `empresa_id` + `deleted_at` | `idx_funcionarios_empresa`, `idx_..._empresa_ativo` | considerar `(empresa_id, deleted_at)` se filtros usam deleted_at | baixo (64 linhas) |
| escala_eventos | projeção mensal por data+escala | `idx_escala_eventos_datas`, `idx_..._tipo(escala_id,tipo_evento)` | possível `(escala_id, data_inicio)` | médio (2.290 linhas lidas) |
| documentos/pasta_virtual | leitura por funcionário+empresa | já há `(funcionario_id, tipo)` e `empresa_id` | OK | — |

## 4. Padrões de query a corrigir (do código)
- **Divergência de escopo:** leitura por `f.empresa_id` (JOIN) vs gravação por `qualificacoes_historico.empresa_id (DEFAULT 1)`. Padronizar (ver plano de saneamento).
- **`GET /api/qualificacoes` (index.ts:530)** lista `qualificacoes_tipos` **sem `empresa_id`** → vazamento + scan global. Adicionar filtro de tenant.
- **Múltiplas fontes na grade mensal:** consolidar projeções (escala+simulador+treinamento+externos) para reduzir round-trips e N+1 (profiler primeiro).

## 5. Anti-padrões a buscar na próxima fase (com EXPLAIN)
- `LIKE '%...'` (a migração 0391 usa `NOT LIKE '%FIRA_HISTORICO%'` — full scan, mas é write pontual).
- Funções sobre colunas indexadas (`strftime` sobre `data`/`created_at`).
- `MAX(id)` sem tenant.
- Subqueries correlacionadas em listagens.

## 6. Protocolo
1. `EXPLAIN QUERY PLAN` em cada query núcleo (read-only) para confirmar uso/desuso de índice.
2. Migration **aditiva** separada por lote, com benchmark `meta.duration`/`rows_read` antes/depois.
3. Remoções de índice redundante só após confirmar que nenhuma query depende delas.
