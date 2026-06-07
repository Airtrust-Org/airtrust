# AIRTRUST — FRMS Tenant Reconciliation Lote 3: Apply Report

**Data**: 2026-06-07  
**Executor**: Claude Code (Sonnet 4.6) sob autorização explícita  
**Operação**: UPDATE frms_jornada SET empresa_id = 6 — 76 IDs auto-candidatos  
**Classificação**: LOTE 3 APLICADO, VALIDADO E REVERSÍVEL

---

## 1. Estado Inicial

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD inicial | `53c232b161ab9e7883be70e43e7bb35625015ee2` |
| origin/main | `53c232b161ab9e7883be70e43e7bb35625015ee2` |
| Tracked changes | nenhum |
| Divergência HEAD/origin | 0 left / 0 right |

---

## 2. Backup

| Campo | Valor |
|---|---|
| Arquivo | `artifacts/db-backups/airtrust-db-preapply-lote3-20260607_162556.sql` |
| Tamanho | 98MB |
| Linhas | 160.427 |
| Timestamp | 2026-06-07T16:25:56 (UTC-3) |
| Comando | `npx wrangler d1 export airtrust-db --env production --remote --output <arquivo>` |
| Resultado | Sucesso — `Downloaded successfully` |

---

## 3. Snapshot Pré-Apply

| Campo | Valor |
|---|---|
| Arquivo | `artifacts/sanitization/lote3-preapply-frms-jornada-20260607.csv` |
| Registros | 76 |
| Colunas | id, empresa_id, tripulante_id, data, origem, duracao_jornada_minutos, horas_voo_minutos, deleted_at, created_at, updated_at |
| Estado pré-apply | empresa_id = NULL em todos os 76 |

> Nota: coluna `tipo` não existe em `frms_jornada` (schema confirmado); substituída por campos disponíveis.

---

## 4. Pré-Checks

### 5.1 — Contagem auto-candidatos

| Check | Esperado | Obtido | Status |
|---|---|---|---|
| auto-candidatos com empresa_id IS NULL | 76 | 76 | ✓ PASS |

### 5.2 — Critérios dos 76

| Critério | Esperado | Obtido | Status |
|---|---|---|---|
| total_ids na lista | 76 | 76 | ✓ |
| empresa_id IS NULL | 76 | 76 | ✓ |
| nao_soft_deleted | 76 | 76 | ✓ |
| func_empresa_6 | 76 | 76 | ✓ |
| func_nao_deleted | 76 | 76 | ✓ |
| func_ativo | 76 | 76 | ✓ |
| func_status_ativo | 76 | 76 | ✓ |
| nao_fira | 76 | 76 | ✓ |
| nao_hv_inconsistente | 76 | 76 | ✓ |
| nao_jornada_zero_hv_positiva | 76 | 76 | ✓ |

### 5.3 — Referências

| Check | Esperado | Obtido | Status |
|---|---|---|---|
| horas_voo_lancamentos refs aos 76 | 0 | 0 | ✓ |
| sgso_relatos refs aos 76 | 0 | 0 | ✓ |
| frms_fatorizacao_jornada jornadas | 10 | 10 | ✓ |
| frms_alerta jornadas | 4 | 4 | ✓ |
| frms_fadiga_checkin mesmo dia | 3 | 3 | ✓ |

---

## 5. Apply

| Campo | Valor |
|---|---|
| Script | `scripts/sanitization/apply-frms-lote3.sql` |
| Timestamp execução | 2026-06-07T19:33 UTC |
| D1 database | `airtrust-db` (7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae) |
| Queries executadas | 2 (UPDATE + SELECT verificação) |
| Rows read | 3.956 |
| Rows written | 228 (inclui índices) |
| Duração | 13.8ms |
| changed_db | `true` |
| Bookmark final | `00004764-0000003a-00005083-d76fc95509c0ea743f8bcda961fed7a6` |

### Guardas do script aplicado

- `WHERE empresa_id IS NULL` — confirmado
- `AND deleted_at IS NULL` — confirmado
- `AND id IN (...)` — lista explícita de 76 IDs
- `AND EXISTS (funcionarios empresa_id = 6, ativo, status ATIVO)` — confirmado
- `AND observacao NOT LIKE '%FIRA_HISTORICO%'` — confirmado
- `AND NOT (horas_voo > duracao AND duracao > 0)` — confirmado
- `AND NOT (duracao = 0 AND horas_voo > 0)` — confirmado
- Nenhuma alteração de `duracao_jornada_minutos`, `horas_voo_minutos`, `observacao`, `deleted_at`

---

## 6. Pós-Checks

| Check | Esperado | Obtido | Status |
|---|---|---|---|
| auto_ids_em_empresa_6 | 76 | 76 | ✓ PASS |
| auto_ids_ainda_null | 0 | 0 | ✓ PASS |
| null_ativos_residuais | 591 | 591 | ✓ PASS |
| fira_historico_intocados | 523 | 523 | ✓ PASS |
| soft_deleted_dos_76_empresa_6 | 0 | 0 | ✓ PASS |
| func_inativos_mantidos_null | ≥ 68 | 133 | ✓ PASS |

---

## 7. Campos Não Alterados — Confirmação

Os campos `duracao_jornada_minutos`, `horas_voo_minutos`, `observacao` e `deleted_at` não foram modificados pelo script. Confirmado por:
- Ausência de SET para esses campos no script
- Nenhum dos 76 IDs com empresa_id = 6 apresenta deleted_at (0 registros)
- Snapshot pré-apply disponível para comparação linha a linha

---

## 8. Decisão sobre Registros Não Aplicados

| Grupo | Contagem | Decisão |
|---|---|---|
| FIRA_HISTORICO | 523 | **NÃO APLICAR** — aguardam migração 0391 isolada |
| Funcionário inativo | 68+ | **NÃO APLICAR** — requerem revisão manual |
| Revisão manual total | 591 | **NÃO APLICAR** — fora do escopo auto-candidatos |

Os 591 registros de revisão manual permanecem com `empresa_id IS NULL` e `deleted_at IS NULL`. Não foram tocados.

---

## 9. Rollback

Script pronto em `scripts/sanitization/rollback-frms-lote3.sql`.

```sql
UPDATE frms_jornada
SET empresa_id = NULL, updated_at = datetime('now')
WHERE empresa_id = 6
  AND deleted_at IS NULL
  AND id IN (...76 IDs explícitos...);
```

**Não executado** — todos os pós-checks aprovados.

---

## 10. Testes

| Suite | Resultado |
|---|---|
| `npx tsc -p worker-airtrust/tsconfig.json --noEmit` | 0 erros ✓ |
| `cd worker-airtrust && npm test -- --run` | 150 arquivos / 1017 testes PASS ✓ |

---

## 11. Confirmações Finais

| Item | Status |
|---|---|
| FIRA_HISTORICO alterados | 0 — NENHUM |
| Funcionário inativo alterados | 0 — NENHUM |
| Soft-deleted alterados | 0 — NENHUM |
| duracao_jornada_minutos alterados | 0 — NENHUM |
| horas_voo_minutos alterados | 0 — NENHUM |
| Alertas alterados | 0 — NENHUM |
| Escalas alteradas | 0 — NENHUM |
| Migrations executadas | 0 — NENHUMA |
| Backfill amplo | 0 — NENHUM |
| Deploy executado | 0 — NENHUM |
