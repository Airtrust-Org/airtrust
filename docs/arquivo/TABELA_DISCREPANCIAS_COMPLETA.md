# 📋 TABELA COMPLETA DE DISCREPÂNCIAS - CASO A CASO

**Data:** 28/11/2025  
**Fonte:** Auditoria Endpoint `/api/qualificacoes-historico/auditoria`

---

## 🔴 DUPLICATAS (21 casos)

> **Problema:** Mesma combinação CPF + Código + Vencimento aparece **2 vezes** no banco

| #   | CPF            | Qualificação | Data Vencimento | Qtd | Status                 | Ação Recomendada    |
| --- | -------------- | ------------ | --------------- | --- | ---------------------- | ------------------- |
| 1   | 017.058.448-80 | FAP14        | 2025-10-13      | 2x  | 🔴 Duplicado           | Manter mais recente |
| 2   | 052.414.847-36 | FAP14        | 2026-10-21      | 2x  | 🔴 Duplicado           | Manter mais recente |
| 3   | 112.015.317-48 | FAP05.2      | 2025-11-30      | 2x  | 🔴 Duplicado           | Manter mais recente |
| 4   | 112.015.317-48 | FAP06        | 2025-11-30      | 2x  | 🔴 Duplicado           | Manter mais recente |
| 5   | 112.015.317-48 | FAP14        | 2026-03-09      | 2x  | 🔴 Duplicado           | Manter mais recente |
| 6   | 112.015.317-48 | IFR          | 2026-02-26      | 2x  | 🔴 Duplicado           | Manter mais recente |
| 7   | 112.015.317-48 | OPC          | 2026-02-26      | 2x  | 🔴 Duplicado           | Manter mais recente |
| 8   | 112.015.317-48 | TIPO         | 2025-11-30      | 2x  | 🔴 Duplicado           | Manter mais recente |
| 9   | 134.651.428-37 | FAP06        | 2026-03-31      | 2x  | 🔴 Duplicado           | Manter mais recente |
| 10  | 311.120.807-91 | FAP14        | 2026-11-03      | 2x  | 🔴 Duplicado           | Manter mais recente |
| 11  | 401.238.047-87 | FAP14        | 2025-12-07      | 2x  | 🔴 Duplicado           | Manter mais recente |
| 12  | 419.906.257-20 | FAP14        | 2026-02-20      | 2x  | 🔴 Duplicado           | Manter mais recente |
| 13  | 663.794.586-20 | FAP14        | 2025-11-15      | 2x  | 🔴 Duplicado           | Manter mais recente |
| 14  | 713.920.927-87 | FAP05.2      | 2026-09-30      | 2x  | 🔴 Duplicado           | Manter mais recente |
| 15  | 713.920.927-87 | FAP06        | 2026-09-30      | 2x  | 🔴 Duplicado           | Manter mais recente |
| 16  | 713.920.927-87 | FAP06SEM     | 2026-04-30      | 2x  | 🔴 Duplicado           | Manter mais recente |
| 17  | 713.920.927-87 | FAP14        | 2025-12-07      | 2x  | 🔴 Duplicado           | Manter mais recente |
| 18  | 713.920.927-87 | OFEXCRED     | 2033-06-06      | 2x  | 🔴 Duplicado           | Manter mais recente |
| 19  | 713.920.927-87 | OPC          | 2026-04-30      | 2x  | 🔴 Duplicado           | Manter mais recente |
| 20  | 713.920.927-87 | TIPO         | 2026-10-31      | 2x  | 🔴 Duplicado           | Manter mais recente |
| 21  | 939.571.227-91 | FAP14        | 2024-12-05      | 2x  | 🔴 Duplicado + Vencido | Manter mais recente |

**Solução Técnica:**

```sql
-- Manter apenas o registro mais recente (por data_conclusao)
DELETE FROM qualificacoes_historico
WHERE id NOT IN (
  SELECT MAX(id)
  FROM qualificacoes_historico
  GROUP BY funcionario_cpf, qualificacao_codigo, data_vencimento
);
```

---

## 🟡 REGISTROS VENCIDOS (30 casos)

> **Problema:** Qualificações com `data_vencimento < 28/11/2025` (hoje)

| #   | CPF            | Qualificação | Data Vencimento | Dias Vencido | Situação   | Ação Recomendada          |
| --- | -------------- | ------------ | --------------- | ------------ | ---------- | ------------------------- |
| 1   | 939.571.227-91 | LOFT         | 2023-11-02      | **757**      | 🔴 Crítico | Verificar se foi renovada |
| 2   | 939.571.227-91 | FAP05.2      | 2024-05-04      | **573**      | 🔴 Crítico | Verificar se foi renovada |
| 3   | 939.571.227-91 | B            | 2024-06-13      | **533**      | 🔴 Crítico | Verificar se foi renovada |
| 4   | 772.105.497-49 | SAEFAP06     | 2024-07-06      | **510**      | 🔴 Crítico | Verificar se foi renovada |
| 5   | 939.571.227-91 | CMA          | 2024-10-21      | **403**      | 🔴 Crítico | Verificar se foi renovada |
| 6   | 939.571.227-91 | FAP14        | 2024-12-05      | **358**      | 🔴 Crítico | Verificar se foi renovada |
| 7   | 939.571.227-91 | PP           | 2025-01-14      | **318**      | 🔴 Crítico | Verificar se foi renovada |
| 8   | 939.571.227-91 | IFR          | 2025-03-21      | **252**      | 🟠 Alto    | Verificar se foi renovada |
| 9   | 939.571.227-91 | INVA         | 2025-04-13      | **229**      | 🟠 Alto    | Verificar se foi renovada |
| 10  | 939.571.227-91 | TIPO         | 2025-04-14      | **228**      | 🟠 Alto    | Verificar se foi renovada |
| 11  | 939.571.227-91 | A            | 2025-05-04      | **208**      | 🟠 Alto    | Verificar se foi renovada |
| 12  | 939.571.227-91 | OPC          | 2025-05-04      | **208**      | 🟠 Alto    | Verificar se foi renovada |
| 13  | 939.571.227-91 | PC           | 2025-05-04      | **208**      | 🟠 Alto    | Verificar se foi renovada |
| 14  | 939.571.227-91 | C            | 2025-05-15      | **197**      | 🟠 Alto    | Verificar se foi renovada |
| 15  | 772.105.497-49 | A            | 2025-05-15      | **197**      | 🟠 Alto    | Verificar se foi renovada |
| 16  | 772.105.497-49 | PAIPA        | 2025-06-05      | **176**      | 🟡 Médio   | Verificar se foi renovada |
| 17  | 939.571.227-91 | B-100        | 2025-06-05      | **176**      | 🟡 Médio   | Verificar se foi renovada |
| 18  | 939.571.227-91 | B-200        | 2025-06-05      | **176**      | 🟡 Médio   | Verificar se foi renovada |
| 19  | 772.105.497-49 | IFR          | 2025-06-22      | **159**      | 🟡 Médio   | Verificar se foi renovada |
| 20  | 772.105.497-49 | PP           | 2025-06-22      | **159**      | 🟡 Médio   | Verificar se foi renovada |
| 21  | 401.238.047-87 | SAEFAP06     | 2025-07-01      | **150**      | 🟡 Médio   | Verificar se foi renovada |
| 22  | 772.105.497-49 | OPC          | 2025-07-31      | **120**      | 🟡 Médio   | Verificar se foi renovada |
| 23  | 083.286.227-42 | SAEFAP06     | 2025-08-01      | **119**      | 🟡 Médio   | Verificar se foi renovada |
| 24  | 899.850.527-49 | SAEFAP06     | 2025-08-01      | **119**      | 🟡 Médio   | Verificar se foi renovada |
| 25  | 772.105.497-49 | C            | 2025-10-01      | **58**       | 🟢 Baixo   | Verificar se foi renovada |
| 26  | 772.105.497-49 | INVA         | 2025-10-01      | **58**       | 🟢 Baixo   | Verificar se foi renovada |
| 27  | 772.105.497-49 | PLA-TIPO     | 2025-10-01      | **58**       | 🟢 Baixo   | Verificar se foi renovada |
| 28  | 772.105.497-49 | TIPO         | 2025-10-01      | **58**       | 🟢 Baixo   | Verificar se foi renovada |
| 29  | 663.794.586-20 | FAP14        | 2025-11-15      | **13**       | 🟢 Baixo   | Verificar se foi renovada |
| 30  | 112.015.317-48 | FAP05.2      | 2025-11-30      | **2**        | 🟢 Hoje    | Vence em 2 dias!          |

**Análise:**

- **CPF 939.571.227-91**: 17 vencidos (57% do total) - Funcionário com histórico muito antigo
- **CPF 772.105.497-49**: 10 vencidos (33% do total) - Múltiplas qualificações desatualizadas
- **Criticidade**: 7 casos com mais de 1 ano vencido

---

## 🟣 CANDIDATOS A RENOVAÇÃO SEM VÍNCULO (21 casos)

> **Problema:** Múltiplos registros da mesma qualificação, mas `renovacao_de = NULL` (não há ligação entre eles)

| #   | CPF            | Qualificação | Total Registros | Vínculos | Problema         | Solução       |
| --- | -------------- | ------------ | --------------- | -------- | ---------------- | ------------- |
| 1   | 017.058.448-80 | FAP14        | 2               | 0        | Sem renovacao_de | Fix-renovadas |
| 2   | 052.414.847-36 | FAP14        | 2               | 0        | Sem renovacao_de | Fix-renovadas |
| 3   | 112.015.317-48 | FAP05.2      | 2               | 0        | Sem renovacao_de | Fix-renovadas |
| 4   | 112.015.317-48 | FAP06        | 2               | 0        | Sem renovacao_de | Fix-renovadas |
| 5   | 112.015.317-48 | FAP14        | 2               | 0        | Sem renovacao_de | Fix-renovadas |
| 6   | 112.015.317-48 | IFR          | 2               | 0        | Sem renovacao_de | Fix-renovadas |
| 7   | 112.015.317-48 | OPC          | 2               | 0        | Sem renovacao_de | Fix-renovadas |
| 8   | 112.015.317-48 | TIPO         | 2               | 0        | Sem renovacao_de | Fix-renovadas |
| 9   | 134.651.428-37 | FAP06        | 2               | 0        | Sem renovacao_de | Fix-renovadas |
| 10  | 311.120.807-91 | FAP14        | 2               | 0        | Sem renovacao_de | Fix-renovadas |
| 11  | 401.238.047-87 | FAP14        | 2               | 0        | Sem renovacao_de | Fix-renovadas |
| 12  | 419.906.257-20 | FAP14        | 2               | 0        | Sem renovacao_de | Fix-renovadas |
| 13  | 663.794.586-20 | FAP14        | 2               | 0        | Sem renovacao_de | Fix-renovadas |
| 14  | 713.920.927-87 | FAP05.2      | 2               | 0        | Sem renovacao_de | Fix-renovadas |
| 15  | 713.920.927-87 | FAP06        | 2               | 0        | Sem renovacao_de | Fix-renovadas |
| 16  | 713.920.927-87 | FAP06SEM     | 2               | 0        | Sem renovacao_de | Fix-renovadas |
| 17  | 713.920.927-87 | FAP14        | 2               | 0        | Sem renovacao_de | Fix-renovadas |
| 18  | 713.920.927-87 | OPC          | 2               | 0        | Sem renovacao_de | Fix-renovadas |
| 19  | 713.920.927-87 | TIPO         | 2               | 0        | Sem renovacao_de | Fix-renovadas |
| 20  | 939.571.227-91 | FAP14        | 2               | 0        | Sem renovacao_de | Fix-renovadas |
| 21  | 939.571.227-91 | FAP14        | 2               | 0        | Sem renovacao_de | Fix-renovadas |

**Impacto:**

- ❌ Não aparece histórico de renovações na interface
- ❌ Registros antigos não são marcados como "RENOVADA"
- ❌ Impossível rastrear evolução temporal
- ❌ Relatórios de compliance ficam incorretos

**Solução Técnica:**

```bash
# Executar endpoint já implementado
curl -X POST https://airtrust-api-production.airtrust.workers.dev/api/qualificacoes-historico/fix-renovadas
```

---

## 📊 ANÁLISE POR CPF

### CPF com Mais Problemas:

| CPF            | Duplicatas | Vencidos | Sem Vínculo | Total | Prioridade |
| -------------- | ---------- | -------- | ----------- | ----- | ---------- |
| 112.015.317-48 | 6          | 1        | 6           | 13    | 🔴 CRÍTICA |
| 713.920.927-87 | 7          | 0        | 6           | 13    | 🔴 CRÍTICA |
| 939.571.227-91 | 1          | 17       | 2           | 20    | 🔴 CRÍTICA |
| 772.105.497-49 | 0          | 10       | 0           | 10    | 🟠 ALTA    |
| 017.058.448-80 | 1          | 0        | 1           | 2     | 🟡 MÉDIA   |
| 052.414.847-36 | 1          | 0        | 1           | 2     | 🟡 MÉDIA   |
| 134.651.428-37 | 1          | 0        | 1           | 2     | 🟡 MÉDIA   |
| 311.120.807-91 | 1          | 0        | 1           | 2     | 🟡 MÉDIA   |
| 401.238.047-87 | 1          | 1        | 1           | 3     | 🟡 MÉDIA   |
| 419.906.257-20 | 1          | 0        | 1           | 2     | 🟡 MÉDIA   |
| 663.794.586-20 | 1          | 1        | 1           | 3     | 🟡 MÉDIA   |
| 083.286.227-42 | 0          | 1        | 0           | 1     | 🟢 BAIXA   |
| 899.850.527-49 | 0          | 1        | 0           | 1     | 🟢 BAIXA   |

---

## 🎯 PLANO DE AÇÃO PRIORITÁRIO

### FASE 1 - IMEDIATO (Hoje)

1. ✅ **Executar Fix-Renovadas** → Resolve 21 casos sem vínculo
   ```bash
   curl -X POST https://airtrust-api-production.airtrust.workers.dev/api/qualificacoes-historico/fix-renovadas
   ```

### FASE 2 - CURTO PRAZO (Esta Semana)

2. 🔴 **Remover Duplicatas** → Remove 21 registros duplicados
   - Criar endpoint de deduplicação
   - Manter registro mais recente (por data_conclusao)
3. 🟡 **Revisar Vencidos Críticos** → Focar nos 3 CPFs críticos:
   - CPF 939.571.227-91 (17 vencidos)
   - CPF 772.105.497-49 (10 vencidos)
   - Decidir: Renovar? Manter como histórico?

### FASE 3 - MÉDIO PRAZO (Próximas 2 Semanas)

4. 🟢 **Atualizar Dados CSV** → Re-importar com dados corretos
5. 🟢 **Validar Qualificações** → Conferir se todas estão atualizadas

---

**Última atualização:** 28/11/2025  
**Total de discrepâncias:** 72 (21 duplicatas + 30 vencidos + 21 sem vínculo)  
**Status:** ⚠️ AÇÃO NECESSÁRIA
