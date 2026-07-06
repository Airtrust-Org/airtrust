# Relatório de Validação Pós-Migration 0417 — `tripulante A/B/AB por criticidade`

**Data da validação**: 2026-07-06
**Agente**: Validação pós-produção (read-only)
**Migration**: `0417_tripulante_ab_por_criticidade.sql`
**Escopo**: 42 `UPDATE` statements em `modelos_sessao_manobras`, 51 modelos V6.2, 918 itens técnicos

---

## Veredito Final

| Critério | Status |
|---|---|
| `fichas_sessao_manobras` históricas não alteradas | ✅ GO |
| `fichas_sessao` não alterada | ✅ GO |
| `simulador_agendamentos` não alterado | ✅ GO |
| Total de itens preservado (918) | ✅ GO |
| Distribuição A/B/AB coerente | ✅ GO |
| SK76 legados (ids 39–44) não afetados | ✅ GO |
| Migration versionada no Git | ❌ NO-GO |
| Migration registrada no D1 | ❌ NO-GO |
| CRED-EXA item 10 | ⚠️ PENDÊNCIA documental |
| SK76-I-08/12 (A=0, B=1) | ⚠️ REVISAR |
| PDFs validados visualmente | ⚠️ NÃO EXECUTADO (requer ficha real) |

**Veredito**: **GO parcial** — a alteração está correta e deve ser mantida, mas **NÃO ENCERRAR** até resolver rastreabilidade Git/D1 e a pendência documental do CRED-EXA.

---

## 1. Git e Rastreabilidade

| Item | Status | Detalhe |
|---|---|---|
| Arquivo `0417_tripulante_ab_por_criticidade.sql` existe | ✅ | 693 linhas |
| Arquivo commitado | ❌ | **UNTRACKED** (`??`) — produção à frente do Git |
| HEAD = `origin/main` | ✅ | `dc31c4a9` |
| `git diff --name-only HEAD` | ✅ | Vazio (sem alterações em tracked files) |
| Backup `backup_tripulante_pre_0417_20260706.json` | ⚠️ | Existe (133KB) mas também UNTRACKED. Sem dados sensíveis visíveis |
| Branch | ✅ | `main` |

**Ação necessária**: Commitar ambos os arquivos IMEDIATAMENTE. A produção não pode ficar à frente do Git.

---

## 2. Registro da Migration no D1

| Item | Status |
|---|---|
| Tabela `d1_migrations` existe | ✅ |
| Migration 0417 registrada | ❌ **NÃO consta** |
| Última migration registrada | 0416 (2026-07-04) |

**Conclusão**: A migration foi aplicada **manualmente via `wrangler d1 execute`** sem registro na tabela de tracking. Isso é uma exceção operacional.

**Ação necessária**: Inserir manualmente o registro:
```sql
INSERT INTO d1_migrations (name, applied_at)
VALUES ('0417_tripulante_ab_por_criticidade.sql', '2026-07-06');
```

---

## 3. Escopo de Dados Alterados

| Tabela | Total de registros | Afetada pela migration? |
|---|---|---|
| `fichas_sessao_manobras` | 4.706 | ❌ NÃO (A=606, B=615, AB=2184 — distribuição histórica preservada) |
| `fichas_sessao` | 224 | ❌ NÃO |
| `simulador_agendamentos` | 108 | ❌ NÃO |
| `modelos_sessao_manobras` | 1.253 (918 ativos) | ✅ SIM (apenas `tripulante`) |

**Comparação pré/pós migration (modelos_sessao_manobras ativos)**:

| Tripulante | Pré (backup) | Pós (produção) | Delta |
|---|---|---|---|
| A | 118 (12.9%) | 232 (25.3%) | +114 |
| B | 122 (13.3%) | 259 (28.2%) | +137 |
| AB | 678 (73.9%) | 427 (46.5%) | -251 |
| **Total** | **918** | **918** | **0** ✅ |

**Conclusão**: O escopo está correto. Apenas `modelos_sessao_manobras.tripulante` foi alterado. O total de 918 itens foi preservado. A distribuição saiu de 74% AB (excessivo, herança da alternância mecânica da migration 0297) para 46% AB com A e B mais equilibrados.

---

## 4. Modelos Ativos Validados

**51 modelos V6.2 afetados**, todos com `deleted_at IS NULL`:

### A139 (25 modelos)
| Código | id | A | B | AB | Status |
|---|---|---|---|---|---|
| A139-I-01/12 | 16 | 6 | 7 | 5 | ✅ OK |
| A139-I-02/12 | 17 | 8 | 8 | 2 | ✅ OK |
| A139-I-03/12 | 18 | 8 | 9 | 1 | ✅ OK |
| A139-I-04/12 | 19 | 7 | 7 | 4 | ✅ OK |
| A139-I-05/12 | 20 | 7 | 8 | 3 | ✅ OK |
| A139-I-06/12 | 21 | 4 | 5 | 9 | ✅ OK |
| A139-I-07/12 | 22 | 8 | 9 | 1 | ✅ OK |
| A139-I-08/12 | 23 | 2 | 2 | 14 | ✅ OK |
| A139-I-09/12 | 24 | 4 | 5 | 9 | ✅ OK |
| A139-I-10/12 | 25 | 5 | 5 | 8 | ✅ OK |
| A139-I-11/12 | 26 | 0 | 0 | 18 | ✅ OK (LOFT-like, esperado) |
| A139-I-12/12 | 27 | 0 | 0 | 18 | ✅ OK (CHECK-like, esperado) |
| A139-NOT-01 | 56 | 5 | 6 | 7 | ✅ OK |
| A139-NOT-02 | 77 | 6 | 5 | 7 | ✅ OK |
| A139-P-C1/IFR | 29 | 8 | 9 | 1 | ✅ OK |
| A139-P-C1/VFR | 28 | 4 | 5 | 9 | ✅ OK |
| A139-P-C2/IFR | 31 | 7 | 8 | 3 | ✅ OK |
| A139-P-C2/VFR | 30 | 4 | 5 | 9 | ✅ OK |
| A139-P-C3/IFR | 33 | 6 | 7 | 5 | ✅ OK |
| A139-P-C3/VFR | 32 | 5 | 5 | 8 | ✅ OK |
| A139-P-LOFT/CHECK | 34 | 0 | 0 | 18 | ✅ OK (100% AB esperado) |
| A139-P-LOFT/OFFSHORE | 51 | 0 | 0 | 18 | ✅ OK (100% AB esperado) |
| A139-REQ-01 | 62 | 7 | 7 | 4 | ✅ OK |
| A139-S-01/02 | 52 | 5 | 6 | 7 | ✅ OK |
| A139-S-02/02 | 53 | 6 | 7 | 5 | ✅ OK |

### CRED-EXA + TRE-INST (2 modelos)
| Código | id | A | B | AB | Status |
|---|---|---|---|---|---|
| CRED-EXA | 55 | 0 | 0 | 18 | ✅ OK (examinador, 100% AB esperado) |
| TRE-INST | 54 | 0 | 0 | 18 | ✅ OK (instrutor, 100% AB esperado) |

### S76 (9 modelos)
| Código | id | A | B | AB | Status |
|---|---|---|---|---|---|
| S76-NOT-01 | 57 | 5 | 7 | 6 | ✅ OK |
| S76-NOT-02 | 78 | 3 | 4 | 11 | ✅ OK |
| S76-P-C1/IFR | 46 | 6 | 7 | 5 | ✅ OK |
| S76-P-C1/VFR | 45 | 4 | 4 | 10 | ✅ OK |
| S76-P-C2/IFR | 48 | 7 | 7 | 4 | ✅ OK |
| S76-P-C2/VFR | 47 | 4 | 5 | 9 | ✅ OK |
| S76-P-C3/IFR | 50 | 6 | 7 | 5 | ✅ OK |
| S76-P-C3/VFR | 49 | 5 | 5 | 8 | ✅ OK |
| S76-REQ-01 | 58 | 6 | 7 | 5 | ✅ OK |

### SK76 (15 modelos ativos)
| Código | id | A | B | AB | Status |
|---|---|---|---|---|---|
| SK76-I-01/12 | 63 | 8 | 9 | 1 | ✅ OK |
| SK76-I-02/12 | 64 | 8 | 9 | 1 | ✅ OK |
| SK76-I-03/12 | 65 | 8 | 8 | 2 | ✅ OK |
| SK76-I-04/12 | 66 | 7 | 8 | 3 | ✅ OK |
| SK76-I-05/12 | 67 | 7 | 8 | 3 | ✅ OK |
| SK76-I-06/12 | 68 | 2 | 2 | 14 | ✅ OK |
| SK76-I-07/12 | 69 | 8 | 8 | 2 | ✅ OK |
| SK76-I-08/12 | 70 | 0 | 1 | 17 | ⚠️ REVISAR |
| SK76-I-09/12 | 71 | 4 | 5 | 9 | ✅ OK |
| SK76-I-10/12 | 72 | 5 | 5 | 8 | ✅ OK |
| SK76-I-11/12 | 73 | 2 | 3 | 13 | ✅ OK |
| SK76-I-12/12 | 74 | 2 | 3 | 13 | ✅ OK |
| SK76-P-CHECK | 44 | 8 | 9 | 1 | ✅ OK |
| SK76-S-01/02 | 75 | 6 | 7 | 5 | ✅ OK |
| SK76-S-02/02 | 76 | 6 | 7 | 5 | ✅ OK |

### SK76 Legados (NÃO afetados)
| Código | id | deleted_at |
|---|---|---|
| SK76-I-01/03 | 39 | 2026-05-22 ✅ |
| SK76-I-02/03 | 40 | 2026-05-22 ✅ |
| SK76-I-03/03 | 41 | 2026-05-22 ✅ |
| SK76-P-01/03 | 42 | 2026-03-11 ✅ |
| SK76-P-02/03 | 43 | 2026-03-11 ✅ |

---

## 5. CRED-EXA — Ordem 10

**Situação atual em produção**:
- Ordem 10: `EXA-CND-03` — "Conduzir um Exame de Proficiencia" — tripulante `AB`
- O documento de referência espera `EXA-CND-01`

**Análise**: O código `EXA-CND-03` vs `EXA-CND-01` é uma questão de **conteúdo/código da manobra**, não de classificação `tripulante`. A classificação AB está correta para este item (competência de examinador requer ambos os pilotos).

**Decisão**: **Pendência documental**. Não é um problema da migration 0417. Deve ser tratado em:
- Migration 0418 separada (se for necessário trocar o código da manobra), OU
- Confirmação documental de que `EXA-CND-03` é o código correto

**Recomendação**: Manter pendente. Não bloqueia a migration 0417.

---

## 6. PDFs de Amostra

**Status**: ⚠️ NÃO EXECUTADO

**Motivo**: A geração de PDF requer uma ficha real executada (`fichas_sessao`). Os templates foram alterados hoje (20:53 UTC), mas as fichas existentes foram criadas antes (13:05 UTC) com os valores antigos de tripulante. Para validar visualmente:
1. Criar uma nova ficha a partir de um modelo afetado (ex: A139-I-01/12)
2. Gerar o PDF via `POST /api/fichas/:id/pdf`
3. Verificar coluna `TRIP.` com A/B/AB

**Recomendação**: Executar esta validação no ambiente de desenvolvimento local com `ENABLE_DEV_AUTH_BYPASS=true`, ou aguardar a próxima ficha real criada em produção.

---

## 7. Distribuição Pedagógica

### Resumo estatístico
| Tripulante | Total | Percentual |
|---|---|---|
| A | 249 | 27.7% |
| B | 280 | 31.1% |
| AB | 371 | 41.2% |
| **Total** | **900** (50 modelos analisados) | |

### Modelos com 100% AB (esperado)
- A139-I-11/12, A139-I-12/12 (LOFT/CHECK)
- A139-P-LOFT/CHECK, A139-P-LOFT/OFFSHORE
- CRED-EXA, TRE-INST

**Todos justificados**: são sessões de avaliação conjunta ou formação de instrutor/examinador.

### Alerta: SK76-I-08/12
- A=0, B=1, AB=17 (94% AB)
- Item com B: ordem 16 — `76-AMOTV` "Amortecedor dos comandos travado"
- Os outros 17 itens são AB (falhas de sistema/emergências)
- A migration 0417 explicitamente só alterou 5 itens (ordens 1–5 → AB), o resto manteve o que já estava

**Avaliação**: O item 76-AMOTV como B (apenas PM executa) é questionável pedagogicamente — um amortecedor travado é uma emergência que o PF também deve saber diagnosticar. **Revisar em migration 0418**.

### OPS-NOT-X1
✅ Confirmado como AB em todos os 4 modelos NOT (A139-NOT-01, A139-NOT-02, S76-NOT-01, S76-NOT-02).

---

## 8. Riscos Residuais

| Risco | Severidade | Mitigação |
|---|---|---|
| Migration não versionada no Git | **ALTA** | Commitar IMEDIATAMENTE |
| Migration não registrada no `d1_migrations` | **MÉDIA** | Inserir registro manual |
| SK76-I-08/12 com apenas 1 item B | **BAIXA** | Revisar em 0418 |
| CRED-EXA ordem 10: EXA-CND-03 vs EXA-CND-01 | **BAIXA** | Confirmar documentalmente |
| PDFs não validados visualmente | **BAIXA** | Validar na próxima ficha real |

---

## 9. GO / NO-GO

| Critério | Veredito |
|---|---|
| `fichas_sessao_manobras` não foi alterada | ✅ GO |
| Migration aplicada corretamente (escopo, dados) | ✅ GO |
| Distribuição A/B/AB coerente | ✅ GO |
| SK76 legados não afetados | ✅ GO |
| OPS-NOT-X1 = AB | ✅ GO |
| Migration versionada no Git | ❌ NO-GO |
| Migration registrada no D1 | ❌ NO-GO |
| PDFs validados | ⚠️ PENDENTE |
| CRED-EXA item 10 | ⚠️ PENDENTE |

**Veredito final**: **GO para manter a alteração aplicada, NO-GO para encerrar a frente.**

---

## 10. Ações Imediatas (SOMENTE LEITURA — este relatório)

1. ⚠️ **Commitar** `0417_tripulante_ab_por_criticidade.sql` e `backup_tripulante_pre_0417_20260706.json`
2. ⚠️ **Inserir** registro manual em `d1_migrations`
3. 📋 **Validar PDF** na próxima ficha real criada a partir de template afetado
4. 📋 **Documentar** CRED-EXA item 10 como pendência para 0418
5. 📋 **Revisar** SK76-I-08/12 em migration 0418

---

*Relatório gerado em 2026-07-06. Nenhuma DML executada durante esta validação.*
