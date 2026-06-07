# AIRTRUST — Plano de Execução do Saneamento (PROPOSTA, NÃO EXECUTAR)

- **Data:** 2026-06-07 · **Modelo:** Opus 4.8
- Este documento **especifica** lotes, dry-runs e rollbacks. **Nada aqui foi executado.** Requer autorização explícita por lote.

## Pré-condição GLOBAL inegociável (LOTE -1: corrigir causa raiz)
Sem isto, qualquer backfill é revertido pelo uso normal.
- **Código:** em todos os INSERT/UPSERT de tabelas tenant-scoped, gravar `empresa_id = empresaId` explícito. Alvo confirmado: `worker-airtrust/src/routes/qualificacoes/historico-write.ts:366` (e o segundo INSERT ~694).
- **Schema (avaliar):** remover `DEFAULT 1` de `funcionarios.empresa_id`, `qualificacoes_historico.empresa_id` (e auditar as 126 tabelas) ou trocar para `NOT NULL` sem default.
- **Rota:** `GET /api/qualificacoes` (`index.ts:530`) — adicionar filtro de tenant em `qualificacoes_tipos`.
- **Teste:** criar qualificação/renovação na e6 → conferir `empresa_id=6` gravado.

---

## LOTE 0 — Proteção
- Backup completo do D1 (export remoto) + snapshot de contagens (`output/audit-20260607/raw/inventory_all.json` como baseline).
- Hash/contagem por tabela antes de cada lote.
- Toda alteração precede de **dry-run** que gera o relatório §23 do briefing.
- **Rollback:** restore por backup + scripts inversos por lote.

---

## LOTE 1 — Tenant incorreto (confiança ALTA) — e1 → e6
Somente registros com FK comprovando funcionário/tripulante e6.

| Passo | Tabela | Critério (dry-run conta antes) | Linhas |
|---|---|---|---:|
| 1.1 | qualificacoes_historico | `empresa_id=1 AND funcionario_id IN (SELECT id FROM funcionarios WHERE empresa_id=6)` | 361 |
| 1.2 | documentos | idem (via funcionario_id) | 70 |
| 1.3 | pasta_virtual | idem | 70 |
| 1.4 | qualificacoes_tipos | apenas códigos **usados** por qual_historico de funcionários e6 | ~7 |

- **Dry-run:** `SELECT` que produz o relatório (table, record_id, tenant_before=1, tenant_after=6, classification, confidence, evidence, relations_count, action='UPDATE empresa_id', rollback_action='UPDATE empresa_id=1 WHERE id IN (...)').
- **Aplicação (futura):** `UPDATE ... SET empresa_id=6 WHERE id IN (<lista do dry-run>)` — **lista fixa de IDs**, nunca predicado aberto.
- **Reconciliação:** recontar e1/e6; confirmar UI Qualificações (Total/Renovadas/Planejadas) e contadores.
- **Rollback:** UPDATE inverso pela lista de IDs salva.
- **Risco:** BAIXO-MÉDIO (FK forte; cuidar de colisão com `idx_qualificacoes_historico_unique_active`).

---

## LOTE 2 — Tenant NULL → e6 (confiança ALTA)
| Tabela | Critério | Linhas |
|---|---|---:|
| frms_jornada | `empresa_id IS NULL AND tripulante_id IN (SELECT id FROM funcionarios WHERE empresa_id=6)` | 2.378 |

- **Atenção:** 1.711 dos 2.378 são soft-deleted — taguear tenant **não** os reativa (mantém `deleted_at`). Decidir se taguear apenas ativos (667) ou todos (recomendado: todos, preservando `deleted_at`).
- Dry-run/rollback análogos ao Lote 1. **Risco:** BAIXO (não muda visibilidade; só corrige tenant).

---

## LOTE 3 — Duplicidades
- **Nenhuma duplicidade operacional ativa** (CPF/prefixo/email/nome=0). 
- Tratar apenas as 139 sobreposições funcionário+código entre e1 e e6 **após** o Lote 1 (quando tudo estiver em e6): validar cadeias de renovação (`renovacao_de`) e o índice `unique_active`. **Sem merge automático.** Risco: MÉDIO.

---

## LOTE 4 — Órfãos
| Item | Ação proposta |
|---|---|
| sessoes_participantes (323, `sessoes` vazia) | confirmar nenhuma rota ativa consome → **arquivar** (export) e remover; ou manter como legado inerte |
| qualificacoes_historico órfão (1, soft-deleted) | manter (já inerte) ou arquivar |

Risco: BAIXO (legado). Confirmar via grep de uso antes de remover.

---

## LOTE 5 — Registros de teste
- empresa 7 (teste isolado), empresas 2–5 (soft-deleted), tipos `ZZ-RESTORE`.
- **Nunca apagar sem backup.** Ação: desativar/arquivar. **Não migrar** para e6. Risco: BAIXO.

---

## LOTE 6 — Índices e performance
- Remover índices redundantes de `simulador_agendamentos` (~8–9 duplicados) e `frms_jornada` (1 dup) — **após** `EXPLAIN QUERY PLAN` confirmar não-uso.
- Migrations **aditivas** só após benchmark `meta.duration`/`rows_read` antes/depois.
- Profilar grade mensal integrada e detalhe de sessão (N+1) antes de mexer. Risco: MÉDIO (índices afetam plano de query).

---

## LOTE 7 — Limpeza técnica
- DROP de tabelas backup/legado vazias (qualificacoes_tipos_old, legacy_*, funcionarios_tmp) e, após export, das populadas (_backup_qh_tmp 525, bkp_*_20260325, qualificacoes_tipos_backup_20251128).
- Padronizar contratos de tenant (leitura/gravação), remover fallbacks `[]`/`0` que mascaram erro.
- Reconciliar rastro de migração 0391 (ver doc FIRA).
- Alinhar `CACHE_VERSION` do SW e `queryKey` com tenant. Risco: BAIXO-MÉDIO.

---

## Ordem segura recomendada
```
LOTE -1 (causa raiz no código)  ← OBRIGATÓRIO PRIMEIRO
   → LOTE 0 (backup)
   → LOTE 2 (NULL→6, mais simples, valida pipeline)
   → LOTE 1 (e1→6)
   → LOTE 3 (sobreposições)
   → LOTE 4 (órfãos)
   → LOTE 5 (testes)
   → LOTE 6 (índices/perf)
   → LOTE 7 (limpeza técnica)
```

## Formato obrigatório de dry-run (§23) — cada candidato
```
table | record_id | tenant_before | tenant_after | classification | confidence | evidence | relations_count | action | rollback_action
```
**Nenhuma escrita sem este relatório aprovado.**
