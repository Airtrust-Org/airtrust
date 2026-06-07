# Lote 1 — Dry-Run: Reconciliação de Tenant em Qualificações

**Data:** 2026-06-07  
**Branch:** main  
**HEAD:** `3ca7b7264fcd4124e8588743ee05a32e71a84337`  
**Produção auditada:** D1 `airtrust-db` (somente SELECT)  
**Escrita executada:** Nenhuma  
**Status:** DRY-RUN CONCLUÍDO — PRONTO PARA REVISÃO

---

## 1. Contagens atuais confirmadas

| Métrica | Valor |
|---|---:|
| `qualificacoes_historico` total físico | 967 |
| Ativos | 877 |
| Soft-deleted | 90 |
| empresa_id=1 total | 362 |
| empresa_id=1 ativos | 324 |
| empresa_id=1 soft-deleted | 38 |
| empresa_id=6 total | 590 |
| empresa_id=6 ativos | 538 |
| Funcionários distintos afetados (e1→e6) | 39 |

---

## 2. Explicação: 324 vs 361

| Número | O que representa |
|---|---|
| **362** | Total de linhas físicas em `qualificacoes_historico` com `empresa_id=1` |
| **361** | Linhas em empresa_id=1 cujo `funcionario_id` aponta para um funcionário de `empresa_id=6` (324 ativos + 37 soft-deleted) |
| **324** | Linhas **ativas** (`deleted_at IS NULL`) em empresa_id=1 vinculadas a funcionários da empresa 6 → candidatos automáticos do Lote 1 |
| **1** | Registro orphan: id=4517, funcionario_id=0 (FK inválida), status='PLANEJADA', soft-deleted em 2026-05-22 — **excluído do Lote 1** |
| **37** | Soft-deleted empresa_id=1 com funcionário e6 válido → avaliação secundária (Passo 3 do apply, comentado) |
| **38** | 37 + 1 orphan = total soft-deleted em empresa_id=1 |

---

## 3. Candidatos automáticos (confiança ALTA)

**Total: 324 registros ativos**

Critérios satisfeitos:
- `classification = TENANT_INCORRETO` ✓
- `confidence = ALTA` ✓
- `funcionario_empresa_id = 6` ✓
- `deleted_at IS NULL` ✓
- Duplicatas exatas: **0** ✓
- `sessao_id IS NOT NULL`: **0** ✓
- Conflito de tipo irresolvido: **0** ✓

### Distribuição por status dos 324

| Status | Ativos |
|---|---:|
| NULL (sem status explícito) | 129 |
| RENOVADA | 117 |
| CONCLUIDA | 74 |
| CANCELADA | 4 |
| **Total ativos** | **324** |

### Distribuição por status completa (ativos + soft-deleted)

| Status | Ativos | Soft-deleted |
|---|---:|---:|
| NULL | 129 | 9 |
| RENOVADA | 117 | 3 |
| CONCLUIDA | 74 | 20 |
| CANCELADA | 4 | 3 |
| PLANEJADA | 0 | 2 |

---

## 4. Candidatos revisão manual

| Registro | Situação | Motivo |
|---|---|---|
| id=4517 | Orphan soft-deleted, `funcionario_id=0` | FK inválida — excluído do apply |
| 37 soft-deleted válidos | TENANT_INCORRETO_SOFT_DELETED | Passo 3 comentado no apply — requer decisão explícita |

---

## 5. Excluídos do Lote 1

| Item | Quantidade | Motivo |
|---|---:|---|
| Orphan (id=4517) | 1 | funcionario_id=0 inválido |
| Soft-deleted (não Passo 3) | 37 | Decisão pendente — Passo 3 do apply está comentado |
| Tipos em empresa_id=6 (sem ação) | 22 | Já estão no tenant correto |

---

## 6. Tipos de qualificação envolvidos

### 6A. Tipos JÁ em empresa_id=6 (sem ação)

22 tipos dos 30 distintos usados pelos candidatos já estão em empresa_id=6. Exemplos:
`E4`, `E5`, `E1`, `E2`, `B`, `C`, `E6`, `CMA`, `CHT-IFR-76`, `CHT-TIPO-A139`, `D3`, `F1`, `F2`, `G1`, `D2`, `D1`, `D4`, `FAP05.2-76`, `FAP06-76`, `FAP14-139`, `IFR-139`, `FAP13-139`, `R`

### 6B. Tipos em empresa_id=1 — MOVER_PARA_E6

| id | Código | Nome | Usos em e1 | Usos em e6 | Conflito de código em e6 | Ação |
|---|---|---|---:|---:|---|---|
| 106 | G1-SEM | AW139 — Currículo de Voo - Semestral (FFS) | 16 | 0 | Nenhum | **MOVER_PARA_E6** (exclusivo) |
| 115 | OPC-SK76 | OPC - FAP 05.02 - SK76 | 10 | 0 | Nenhum | **MOVER_PARA_E6** (exclusivo) |
| 114 | IFR-SK76 | IFR - FAP 06 - SK76 | 9 | 0 | Nenhum | **MOVER_PARA_E6** (exclusivo) |
| 112 | CFIT | CFIT - Controlled Flight Into Terrain | 2 | 0 | Nenhum | **MOVER_PARA_E6** (exclusivo) |
| 113 | OPC | OPC - FAP 05.2 - AW139 | 0 | 0 | Nenhum | **MOVER_PARA_E6** (zero uso) |
| 110 | CHT-TIPO-S76 | CHT Tipo SK76 (Extrato Anac) | 5 | 13 | Nenhum | **MOVER_PARA_E6** (compartilhado¹) |
| 105 | FAP14-76 | FAP 14 - Exame em Rota - SK76 | 4 | 13 | Nenhum | **MOVER_PARA_E6** (compartilhado¹) |
| 111 | CHT-IFR-A139 | CHT IFR AW139 (Extrato Anac) | 3 | 7 | Nenhum | **MOVER_PARA_E6** (compartilhado¹) |

¹ **"Compartilhado"** significa que esses tipos (empresa_id=1) já são referenciados por históricos `empresa_id=6`. Isso é uma inconsistência adicional: historicos da empresa 6 apontam para tipos da empresa 1. Mover os tipos para empresa_id=6 corrige essa inconsistência também. Nenhum dos 8 tipos tem código duplicado em empresa_id=6 — **zero bloqueio**.

### 6C. Verificação de conflito de código

Query executada na seção 4B do dry-run. **Resultado: 0 linhas** (sem conflito). Todos os 8 códigos são únicos na empresa 6.

---

## 7. Cadeias de renovação

### 7A. Cadeias inteiramente em e1 (ambas as pontas em e1)

Após o move, ambas as pontas migram para e6. **Sem ruptura.**

### 7B. Cadeias cruzadas (registro antigo em e1, renovação em e6)

**20 registros** com `status='RENOVADA'` em e1 têm seu successor (data posterior, mesmo funcionário+código) em e6. Esses são os casos típicos de renovação histórica: o registro antigo ficou em e1 pelo `DEFAULT 1`, a renovação já foi gravada na e6 (após correções parciais anteriores).

Exemplos representativos:
- func_id=1, código B: antigo (2024-11-11, e1) → renovação (2025-10-22, e6)
- func_id=1, código E2: dois antigos em e1 (2024-11-24 e 2025-11-17) → renovação (2025-11-30, e6)
- func_id=3, código B: antigo (2024-11-11, e1) → renovação (2025-10-28, e6)

**Impacto após move:** ambas as pontas ficam em e6 → cadeia logicamente preservada.

### 7C. Contador Renovadas — impacto

| Métrica | Valor atual | Após move |
|---|---:|---:|
| Renovadas via JOIN funcionário (UI atual) | **175** | 175 (sem mudança visível — mesma lógica) |
| Renovadas via `empresa_id=6` direto | **58** | **175** (+117) |
| Gap entre os dois métodos | 117 | 0 |

**Conclusão:** A UI que usa o JOIN funcionário não muda. APIs/contadores que filtram por `qh.empresa_id=6` diretamente passarão a mostrar 175 Renovadas (em vez de 58). O gap de 117 que gerava o "zero falso" em Renovadas é exatamente o que o Lote 1 resolve.

---

## 8. Planejadas

| Status | Ativos | Soft-deleted |
|---|---:|---:|
| PLANEJADA em e1 (candidatos) | **0** | 2 |

Nenhuma planejada ativa entra no Lote 1. Os 2 registros soft-deleted (incluindo o orphan) não requerem ação.

---

## 9. Duplicidades

| Verificação | Resultado |
|---|---|
| Duplicatas exatas (func+código+data_conclusao iguais nos dois tenants) | **0** |
| Sobreposições func+código (datas diferentes — renovações normais) | 30 pares |
| Registros únicos (func+código ausente na e6) | **294** |

Nenhuma duplicata bloqueia o apply.

---

## 10. Órfãos

| id | Situação | Ação |
|---|---|---|
| 4517 | `funcionario_id=0`, PLANEJADA, soft-deleted 2026-05-22 | **Excluído** do Lote 1 — nenhuma ação |

---

## 11. SQL de aplicação proposto

**Arquivo:** `scripts/sanitization/apply-qualificacoes-lote1.sql`

Ordem de execução:
1. **Passo 1a** — Mover 5 tipos exclusivos para e6: `UPDATE qualificacoes_tipos SET empresa_id=6 WHERE id IN (106, 112, 113, 114, 115) AND empresa_id=1 AND deleted_at IS NULL` → 5 linhas
2. **Passo 1b** — Mover 3 tipos compartilhados para e6: `UPDATE qualificacoes_tipos SET empresa_id=6 WHERE id IN (105, 110, 111) AND empresa_id=1 AND deleted_at IS NULL` → 3 linhas
3. **Passo 2** — Mover 324 históricos ativos via EXISTS guard → 324 linhas
4. **Passo 3 (comentado)** — Soft-deleted opcionais (37 linhas) — requer decisão

Cada UPDATE é restrito por `AND empresa_id = 1` e `AND EXISTS (SELECT 1 FROM funcionarios ...)`. Não usa update amplo por funcionario_id.

---

## 12. SQL de rollback

**Arquivo:** `scripts/sanitization/rollback-qualificacoes-lote1.sql`

Restaura:
- `qualificacoes_tipos`: `UPDATE ... SET empresa_id=1 WHERE id IN (105,106,110,111,112,113,114,115)` → 8 linhas
- `qualificacoes_historico`: reversão por ID range + EXISTS guard (preferencialmente lista explícita de IDs capturada pré-apply)

---

## 13. Impacto previsto nas telas

| Tela / Métrica | Antes | Depois | Tipo de mudança |
|---|---|---|---|
| Qualificações · Renovadas (por JOIN) | 175 | 175 | Sem mudança (UI já usa JOIN) |
| Qualificações · Renovadas (por empresa_id direto) | 58 | 175 | +117 (correção) |
| Qualificações · Total ativos e6 (direto) | 538 | 862 | +324 (correto) |
| Qualificações · Histórico geral | sem mudança visível | sem mudança visível | UI usa JOIN funcionário |
| Gestão · Contadores | dependem da query | +324 no total e6 | possivelmente visível |
| Tipos disponíveis para e6 | 80 + 0 tipos e1 | 80 + 8 tipos e1 migrados | +8 tipos para novas gravações |

---

## 14. Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Conflito de código em tipo | **Baixa** — verificado: 0 conflitos | Pré-check no apply (seção 4B dry-run) |
| Duplicata surgir antes do apply | Média (uso contínuo) | Re-executar query 1C antes do apply |
| sessao_id criado entre dry-run e apply | Baixa | Re-executar query 1D antes do apply |
| Rollback parcial (tipos movidos mas historicos não) | Média | Executar apply em transação ou verificar cada passo |
| Novo DEFAULT 1 criar residual durante o apply | Zero | Lote -1 já fechou a causa raiz |

---

## 15. Pré-condições para aplicação

1. ✅ Lote -1 deployado e confirmado saudável (`d055d998`, commit `3ca7b72`)
2. ✅ Write path corrigido — novos registros não voltam ao DEFAULT 1
3. ✅ 0 duplicatas exatas (re-verificar na hora do apply)
4. ✅ 0 sessao_id nos candidatos (re-verificar na hora do apply)
5. ✅ 0 conflito de código nos tipos (re-verificar na hora do apply)
6. ⏳ Autorização explícita para executar UPDATEs em produção
7. ⏳ Decisão sobre Passo 3 (soft-deleted): incluir ou manter comentado

---

## 16. Gates executados nesta sessão

| Gate | Resultado |
|---|---|
| `npx tsc -p worker-airtrust/tsconfig.json --noEmit` | PASS |
| Nenhum arquivo TypeScript alterado | N/A — apenas docs e SQL criados |
| Todas as queries SELECT executadas sem erro | PASS |
| `rows_written = 0` em todas as chamadas D1 | CONFIRMADO |

---

## 17. Scripts criados

| Arquivo | Propósito |
|---|---|
| `scripts/sanitization/dry-run-qualificacoes-lote1.sql` | 7 seções de SELECTs para verificação completa |
| `scripts/sanitization/apply-qualificacoes-lote1.sql` | 4 passos de UPDATE + verificação pós-apply |
| `scripts/sanitization/rollback-qualificacoes-lote1.sql` | Reversão completa dos UPDATEs do apply |

---

## 18. Confirmações desta sessão

- ✅ Nenhuma escrita no D1 de produção
- ✅ Nenhum UPDATE, DELETE, INSERT executado
- ✅ Nenhuma migration aplicada
- ✅ Nenhum backfill real executado
- ✅ Nenhum deploy realizado
- ✅ HEAD = origin/main = `3ca7b72` sem divergência

---

## 19. Recomendação

**O Lote 1 está pronto para aplicação** condicional a:

1. Re-executar as queries de pré-check (seções 1C, 1D, 4B do dry-run) imediatamente antes do apply para confirmar que o estado não mudou.
2. Decidir sobre o Passo 3 (37 soft-deleted).
3. Obter autorização explícita para executar UPDATEs em produção.

Não há duplicatas, sessao_id, conflito de tipo ou cadeia de renovação que bloqueie a aplicação automática dos 324 históricos e 8 tipos.

---

## Classificação final

```
LOTE 1 DRY-RUN CONCLUÍDO — PRONTO PARA REVISÃO
```
