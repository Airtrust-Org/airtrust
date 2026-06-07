# Lote 1 — Apply: Reconciliação de Tenant em Qualificações

**Data:** 2026-06-07  
**Branch:** main  
**HEAD:** `3ca7b7264fcd4124e8588743ee05a32e71a84337`  
**Produção:** D1 `airtrust-db` (7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae)  
**Worker em produção:** `d055d998-682e-4e87-ae5e-9d4ad7b56b4a`  
**Status:** LOTE 1 APLICADO, VALIDADO E REVERSÍVEL

---

## 1. Backup

| Item | Valor |
|---|---|
| Arquivo | `artifacts/db-backups/airtrust-db-preapply-lote1-20260607_121016.sql` |
| Tamanho | **98 MB** |
| Timestamp | 2026-06-07 12:10 |
| Comando | `wrangler d1 export airtrust-db --env production --remote` |
| Confirmação | Download concluído com sucesso |

---

## 2. Snapshots pré-apply

| Arquivo | Registros |
|---|---:|
| `artifacts/sanitization/lote1-preapply-qualificacoes-historico-20260607.csv` | 324 linhas |
| `artifacts/sanitization/lote1-preapply-qualificacoes-tipos-20260607.csv` | 8 linhas |

Contêm `id`, `empresa_id`, `funcionario_id`, `qualificacao_tipo_id`, `status`, `data_conclusao`, `data_vencimento`, `deleted_at` para históricos; `id`, `empresa_id`, `codigo`, `nome`, `deleted_at` para tipos.

---

## 3. Pré-checks (imediatamente antes do apply)

| Check | Esperado | Obtido | Resultado |
|---|---:|---:|---|
| Duplicatas exatas | 0 | 0 | **PASS** |
| Candidatos com sessao_id | 0 | 0 | **PASS** |
| Conflito de código em tipos | 0 | 0 | **PASS** |
| Históricos candidatos | 324 | 324 | **PASS** |
| Tipos candidatos | 8 | 8 | **PASS** |

---

## 4. Apply executado

### Passo 1a — Tipos exclusivos (5 linhas)
```sql
UPDATE qualificacoes_tipos
SET empresa_id = 6, updated_at = datetime('now')
WHERE id IN (106, 112, 113, 114, 115)
  AND empresa_id = 1 AND deleted_at IS NULL;
```
**Resultado:** 5 tipos movidos. IDs: 106 (G1-SEM), 112 (CFIT), 113 (OPC), 114 (IFR-SK76), 115 (OPC-SK76).

### Passo 1b — Tipos compartilhados (3 linhas)
```sql
UPDATE qualificacoes_tipos
SET empresa_id = 6, updated_at = datetime('now')
WHERE id IN (105, 110, 111)
  AND empresa_id = 1 AND deleted_at IS NULL;
```
**Resultado:** 3 tipos movidos. IDs: 105 (FAP14-76), 110 (CHT-TIPO-S76), 111 (CHT-IFR-A139).

### Passo 2 — Históricos ativos (324 linhas)
```sql
UPDATE qualificacoes_historico
SET empresa_id = 6, updated_at = datetime('now')
WHERE empresa_id = 1 AND deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM funcionarios
    WHERE id = qualificacoes_historico.funcionario_id
      AND empresa_id = 6 AND deleted_at IS NULL
  );
```
**Resultado:** `changes = 324` — PASS.

### Passo 3 — Soft-deleted (NÃO EXECUTADO)
O Passo 3 permanece **comentado** no script. Os 37 soft-deleted com funcionário empresa 6 aguardam decisão posterior. Razão: nenhum impacto operacional imediato (já são soft-deleted), e a decisão de incluí-los ou não requer aprovação explícita.

---

## 5. Verificações pós-apply

| Verificação | Esperado | Obtido | Resultado |
|---|---:|---:|---|
| Tipos em empresa_id=1 residuais (ids 105-115) | 0 | 0 | **PASS** |
| Históricos ativos e1 com funcionário e6 | 0 | 0 | **PASS** |
| Soft-deleted e1 intocados (func e6) | 37 | 37 | **PASS** |
| Orphan id=4517 intocado (e1, soft-deleted) | empresa_id=1 | empresa_id=1 | **PASS** |
| Renovadas empresa_id=6 direto | 175 | 175 | **PASS** |
| Gap JOIN vs empresa_id direto | 0 | 0 | **PASS** |
| Total ativos empresa_id=6 | 862 | 862 | **PASS** |
| Tipos ativos restantes em empresa_id=1 | 0 | 0 | **PASS** |

---

## 6. Contadores — antes vs depois

| Métrica | Antes | Depois |
|---|---:|---:|
| `qualificacoes_historico` ativos empresa_id=6 | 538 | **862** (+324) |
| `qualificacoes_historico` ativos empresa_id=1 | 324 | **0** |
| Renovadas via empresa_id=6 direto | 58 | **175** (+117) |
| Renovadas via JOIN funcionário | 175 | 175 (inalterado) |
| Gap Renovadas (JOIN - direto) | 117 | **0** |
| Tipos ativos empresa_id=1 (candidatos) | 8 | **0** |
| Tipos ativos empresa_id=6 | 80 | **88** (+8) |

---

## 7. Estado final da empresa_id=1 em qualificacoes_historico

| Estado | Quantidade | Observação |
|---|---:|---|
| Ativos (func e6) | **0** | Todos movidos — CORRETO |
| Soft-deleted (func e6) | 37 | Passo 3 pendente |
| Orphan (func_id=0) | 1 | Excluído permanentemente do Lote 1 |
| **Total remanescente** | **38** | Apenas soft-deleted |

---

## 8. Validação API

Sem deploy necessário (correção é de dados, não de código).

| Endpoint (simulado via D1) | Resultado |
|---|---|
| `GET /api/qualificacoes/tipos?empresa_id=6` | 8 tipos migrados agora visíveis: G1-SEM, CFIT, OPC, IFR-SK76, OPC-SK76, FAP14-76, CHT-TIPO-S76, CHT-IFR-A139 |
| `GET /api/qualificacoes/historico (empresa 6)` | 862 ativos (era 538) |
| Renovadas (empresa_id direto) | 175 (era 58) |
| Gap JOIN vs direto | 0 (era 117) |

**Validação autenticada UI:** pendente — requer login do operador na interface. O zero falso em Renovadas foi eliminado no banco.

---

## 9. Gates

| Gate | Resultado |
|---|---|
| `npx tsc -p worker-airtrust/tsconfig.json --noEmit` | PASS |
| `npm run test:worker` — 1017 testes | 1017/1017 PASS |
| `rows_written = 0` fora dos UPDATEs autorizados | CONFIRMADO |

Nenhum arquivo TypeScript foi alterado — gates menores são suficientes.

---

## 10. Rollback disponível

**Arquivo:** `scripts/sanitization/rollback-qualificacoes-lote1.sql`

Lista de IDs explícita para rollback dos históricos disponível em:
`artifacts/sanitization/lote1-preapply-qualificacoes-historico-20260607.csv`

Rollback dos tipos:
```sql
UPDATE qualificacoes_tipos
SET empresa_id = 1, updated_at = datetime('now')
WHERE id IN (105, 106, 110, 111, 112, 113, 114, 115) AND empresa_id = 6;
```

Rollback dos históricos (usando IDs do snapshot):
```sql
UPDATE qualificacoes_historico
SET empresa_id = 1, updated_at = datetime('now')
WHERE empresa_id = 6
  AND id IN (/* IDs do CSV snapshot */)
  AND deleted_at IS NULL;
```

---

## 11. Confirmações de conformidade

- ✅ Passo 3 (soft-deleted) **NÃO executado** — permanece comentado
- ✅ Nenhum `DELETE` executado
- ✅ Nenhum `INSERT` executado
- ✅ Nenhuma migration aplicada
- ✅ Nenhum backfill amplo — apenas registros explicitamente identificados
- ✅ Nenhuma alteração fora do Lote 1
- ✅ Nenhum deploy realizado
- ✅ Backup 98 MB confirmado antes de qualquer escrita
- ✅ `rows_written = 0` fora dos UPDATEs autorizados do Lote 1

---

## 12. Pendências pós-Lote 1

| Item | Situação |
|---|---|
| 37 soft-deleted (func e6, empresa_id=1) | Aguardando decisão — Passo 3 |
| 1 orphan id=4517 | Excluído permanentemente; cleanup posterior |
| Lote 2 (documentos + pasta_virtual) | 45 + 60 registros — dry-run preparado |
| Lote 3 (frms_jornada NULL) | 667 registros — dry-run preparado |

---

## Classificação final

```
LOTE 1 APLICADO, VALIDADO E REVERSÍVEL
```
