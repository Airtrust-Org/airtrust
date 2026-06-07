# AIRTRUST — Auditoria Separada FIRA / Migração 0391 (READ-ONLY)

- **Data:** 2026-06-07 · **Modelo:** Opus 4.8 · **Produção:** `airtrust-db` (somente SELECT)
- **Arquivo:** `worker-airtrust/migrations/0391_fira_historico_audit_labels.sql`

> Auditado **separadamente** do saneamento multi-tenant, conforme §21 do briefing. Nada foi alterado.

## 1. O que a 0391 faz
1. **Rotula** `observacao` dos registros `origem='FIRA'` ativos com `[FIRA_HISTORICO: auditoria 2026-06-06]` (guard idempotente `NOT LIKE '%FIRA_HISTORICO%'`).
2. **Corrige** `duracao_jornada_minutos = horas_voo_minutos` para registros FIRA com `HV > jornada` e `jornada > 0` (label `FIRA_INCONSISTENTE`).
3. **Rotula** (sem corrigir jornada) os FIRA com `jornada=0` e `HV>0`.

## 2. Estado REAL em produção (medido)

| Métrica | Valor |
|---|---:|
| `d1_migrations` contém 0391? | **NÃO** (tem 0389, 0390; não 0391) |
| FIRA ativos (`origem='FIRA'`, `deleted_at IS NULL`) | **531** |
| FIRA ativos **já rotulados** `FIRA_HISTORICO` | **531** (100%) |
| FIRA `HV>jornada` com `jornada>0` (alvo da correção 2a) | **0** (nada a corrigir) |
| FIRA `jornada=0` e `HV>0` (alvo do label 2b) | 5 |

### Achado-chave (discrepância)
**Os efeitos da 0391 já estão presentes nos dados** (531/531 rotulados; 0 inconsistências HV>jornada remanescentes), **mas a migração 0391 NÃO está registrada em `d1_migrations`.**

Hipóteses (a confirmar): aplicada via `--command` sem registro de migração, via rota de aplicação/admin, ou por operação equivalente da auditoria de 2026-06-06 (memória do projeto: "FIRA historical cleanup pending DB-write phase" — aparentemente já executada na prática).

**Consequência:** rodar 0391 agora seria **no-op** (guards `LIKE`/condições casam 0 linhas). Inofensivo, porém o **rastro de migração está inconsistente** com o estado dos dados.

## 3. Impacto e isolamento
- FIRA é **história pré-SIGVOOS** (Jan–Mar 2026). A auditoria 2026-06-06 confirmou que **não alimenta** queries rolling/alertas/operacionais (canônico = SIGVOOS, commit `4c8c41d`).
- 2.223 registros FIRA estão com `empresa_id IS NULL` (ver achado multi-tenant) — pertencem à empresa 6 via `tripulante_id`. **Isso é tema do saneamento de tenant, não da 0391.**

## 4. Reversibilidade
- **Labels (`observacao`):** reversíveis (strip da string).
- **Correção de `duracao_jornada_minutos` (até 8 casos):** sobrescreve valor; **só reversível via backup**. Backup existe: `artifacts/frms-sigvoos-global-rebuild-20260605/backup-20260605T213800Z/frms_jornada.json`. Como hoje há **0** casos HV>jornada remanescentes, a correção já ocorreu — manter o backup é essencial para qualquer rollback.

## 5. Classificação
```
SEGURO — efeitos já presentes; FIRA isolado de SIGVOOS/rolling/alertas; reversível via backup
PENDÊNCIA DE GOVERNANÇA: registrar 0391 em d1_migrations OU documentar que foi aplicada fora do trilho,
para reconciliar o rastro de migração com o estado real dos dados.
```

## 6. Recomendações (sem executar)
1. **Não** misturar 0391 com o saneamento multi-tenant.
2. Reconciliar `d1_migrations` ↔ dados: confirmar como os 531 labels chegaram e registrar formalmente (quando autorizado).
3. Reter o backup `frms_jornada.json` (20260605) enquanto houver risco de rollback.
4. Verificar os 5 casos `jornada=0 HV>0` (FIRA) — são inconsistências de origem aceitas como histórico; sem ação de dado.
