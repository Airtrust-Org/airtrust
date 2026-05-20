# 📊 Análise de Dados: EdApp ↔ AirTrust

**Data:** 2026-02-05  
**Objetivo:** Verificar coerência entre dados do EdApp e AirTrust

---

## 🔍 RESUMO EXECUTIVO

### Status Geral

- ✅ **Integração ativa** e funcional
- ✅ **19 usuários** mapeados
- ✅ **9 cursos** mapeados
- ⚠️ **22 eventos** recebidos, mas **apenas 3 com qualificações criadas**
- ❌ **19 eventos** processados mas **SEM qualificação associada**

### 🚨 PROBLEMA CRÍTICO IDENTIFICADO

**Eventos marcados como processados (processado=1) mas sem qualificação criada (qualificacao_historico_id=NULL)**

---

## 📋 DADOS DETALHADOS

### 1️⃣ Usuários Mapeados (19 total)

| ID  | EdApp User ID            | Funcionário                    | Matrícula | Status                                |
| --- | ------------------------ | ------------------------------ | --------- | ------------------------------------- |
| 2   | 670f02ce0e5aa591a4e670ee | Wilson Maciel Martins Nery     | 00001     | ✅ OK                                 |
| 3   | 671f8bc30f5979f8066e8b72 | Caio Cesar Simões De Alcantara | 00170     | ✅ OK                                 |
| 4   | 671f8c101d09157bff5f4782 | _Funcionário deletado_         | -         | ⚠️ Mapeado mas funcionário não existe |
| 5   | 671f8c101d09157bff5f47c0 | Max Monteiro Magioli           | 00004     | ✅ OK                                 |
| 6   | 671f8c111d09157bff5f487c | _Funcionário deletado_         | -         | ⚠️ Mapeado mas funcionário não existe |
| 7   | 671fb5c10217a73d22c43d63 | _Funcionário deletado_         | -         | ⚠️ Mapeado mas funcionário não existe |
| 8   | 671fcf3c3b0900f7300aae74 | _Funcionário deletado_         | -         | ⚠️ Mapeado mas funcionário não existe |
| 9   | 671fdc480217a73d22326057 | Ramon Godinho Bastos           | 00264     | ✅ OK                                 |
| 10  | 67202f366d0ad4a303d66daa | _Funcionário deletado_         | -         | ⚠️ Mapeado mas funcionário não existe |
| 11  | 6728cd313b5f605ddc4fed23 | Nivaldo Antonio Naressi        | 00232     | ✅ OK                                 |
| 12  | 6728cd537b4401e499952c39 | Rafael Siegmann Paradeda       | 00262     | ✅ OK                                 |
| 13  | 6728ceedd11ed54be21e1d0b | Karl Martin Kühr               | 00334     | ✅ OK                                 |
| 14  | 6728d07d7b4401e499a0bad0 | Paloma Gonçalves Magioli       | 00333     | ✅ OK                                 |
| 15  | 6728d2f36a6070cd45ed74a1 | _Funcionário deletado_         | -         | ⚠️ Mapeado mas funcionário não existe |
| 16  | 6728f1a94d4c0d27d977bd7d | _Funcionário deletado_         | -         | ⚠️ Mapeado mas funcionário não existe |
| 17  | 6728ff1f0f30924b4fc1d806 | José Alfredo Gomes Marinho     | 00251     | ✅ OK                                 |
| 18  | 67290be0ef32cd32c7f1cc1b | Dieter Johny Kühr              | 00252     | ✅ OK                                 |
| 19  | 672b628f660e91ead9c3d535 | Rubens Negreiros Silva         | 00313     | ✅ OK                                 |
| 20  | 64bdc06b4a16e4ac98a5a32a | Filipe Passaroni Daumas        | 00353     | ✅ OK                                 |

**Análise:**

- ✅ 12 mapeamentos válidos (funcionários existem)
- ⚠️ 7 mapeamentos órfãos (funcionários deletados)
- **Ação recomendada:** Limpar mapeamentos órfãos

---

### 2️⃣ Cursos Mapeados (9 total)

| ID  | Course ID          | Nome do Curso                                    | Qualificação | Status |
| --- | ------------------ | ------------------------------------------------ | ------------ | ------ |
| 9   | E6                 | Operações em Terrenos Desabitados                | E6           | ✅ OK  |
| 8   | E2                 | Operações PBN – Navegação Baseada em Performance | E2           | ✅ OK  |
| 7   | E1                 | Operações Offshore                               | E1           | ✅ OK  |
| 6   | E4                 | Operação Aeromédica                              | E4           | ✅ OK  |
| 5   | C                  | Emergências Gerais                               | C            | ✅ OK  |
| 4   | E5                 | EFB – Eletronic Flight Bag                       | E5           | ✅ OK  |
| 3   | B                  | CGA - Conhecimentos Gerais de Aeronave           | B            | ✅ OK  |
| 2   | test-course-safety | Safety Management System - Teste                 | SAFETY001    | ✅ OK  |
| 1   | test-course-crm    | CRM Online - Teste EdApp                         | CRM001       | ✅ OK  |

**Análise:** ✅ Todos os cursos corretamente mapeados

---

### 3️⃣ Eventos Recebidos do EdApp (22 total)

#### Resumo por Status

| Status                         | Quantidade | %     |
| ------------------------------ | ---------- | ----- |
| ✅ Processado COM qualificação | 3          | 13.6% |
| ⚠️ Processado SEM qualificação | 13         | 59.1% |
| ❌ Não processado              | 3          | 13.6% |
| ❌ ERROR                       | 3          | 13.6% |

#### Detalhamento dos Eventos

**✅ EVENTOS COM QUALIFICAÇÃO CRIADA (3):**

| ID  | User                 | Curso   | Data Conclusão   | Qualif ID | Status |
| --- | -------------------- | ------- | ---------------- | --------- | ------ |
| 22  | 64bdc06b... (Filipe) | B (CGA) | 2026-01-23 23:56 | 3958      | ✅ OK  |
| 21  | 64bdc06b... (Filipe) | B (CGA) | 2026-01-23 23:54 | 3957      | ✅ OK  |
| 20  | 64bdc06b... (Filipe) | B (CGA) | 2026-01-23 23:48 | 3213      | ✅ OK  |

**⚠️ EVENTOS PROCESSADOS MAS SEM QUALIFICAÇÃO (13):**

| ID  | User                 | Curso              | Data Conclusão      | Func ID | Problema                           |
| --- | -------------------- | ------------------ | ------------------- | ------- | ---------------------------------- |
| 19  | 64bdc06b... (Filipe) | B (CGA)            | 2026-01-23 23:36    | NULL    | ⚠️ funcionario_id NULL             |
| 18  | 64bdc06b... (Filipe) | B (CGA)            | 2026-01-23 23:33    | NULL    | ⚠️ funcionario_id NULL             |
| 17  | 64bdc06b... (Filipe) | B (CGA)            | 2026-01-23 23:30:40 | NULL    | ⚠️ funcionario_id NULL             |
| 16  | 64bdc06b... (Filipe) | B (CGA)            | 2026-01-23 23:30:34 | NULL    | ⚠️ funcionario_id NULL             |
| 15  | 64bdc06b... (Filipe) | B (CGA)            | 2026-01-23 23:28    | NULL    | ⚠️ funcionario_id NULL             |
| 14  | 64bdc06b... (Filipe) | B (CGA)            | 2026-01-23 23:26    | NULL    | ⚠️ funcionario_id NULL             |
| 13  | 64bdc06b... (Filipe) | B (CGA)            | 2026-01-23 23:25    | NULL    | ⚠️ funcionario_id NULL             |
| 12  | 64bdc06b... (Filipe) | B (CGA)            | 2026-01-23 23:11:56 | NULL    | ⚠️ funcionario_id NULL             |
| 11  | 64bdc06b... (Filipe) | B (CGA)            | 2026-01-23 23:11:52 | NULL    | ⚠️ funcionario_id NULL             |
| 10  | 64bdc06b... (Filipe) | B (CGA)            | 2026-01-23 23:11:39 | NULL    | ⚠️ funcionario_id NULL             |
| 9   | 64bdc06b... (Filipe) | test-course-safety | NULL                | 41      | ✅ Func OK mas qual ID=3868        |
| 8   | test-user-filipe     | test-course-crm    | NULL                | 41      | ✅ Func OK mas qual ID=3867        |
| 7   | test-user-filipe     | test-course-crm    | NULL                | 41      | ⚠️ Mesmo qual ID=3867 (duplicado?) |

**❌ EVENTOS NÃO PROCESSADOS (3):**

| ID  | User             | Curso           | Motivo            |
| --- | ---------------- | --------------- | ----------------- |
| 5   | test-user-filipe | test-course-crm | ❌ Não processado |
| 3   | test-user-filipe | test-course-crm | ❌ Não processado |
| 1   | test-user-filipe | test-course-crm | ❌ Não processado |

**❌ EVENTOS COM ERRO (3):**

| ID  | Tipo  | Problema                                  |
| --- | ----- | ----------------------------------------- |
| 6   | ERROR | Payload inválido ou erro de processamento |
| 4   | ERROR | Payload inválido ou erro de processamento |
| 2   | ERROR | Payload inválido ou erro de processamento |

---

### 4️⃣ Qualificações Criadas no AirTrust (9 total)

| ID   | Funcionário    | Qualif  | Data Conclusão | Vencimento | Validade | Status                |
| ---- | -------------- | ------- | -------------- | ---------- | -------- | --------------------- |
| 3966 | Filipe (00353) | B (CGA) | 2026-01-23     | 2027-01-23 | 12 meses | ✅ Reprocessado       |
| 3967 | Filipe (00353) | B (CGA) | 2026-01-23     | 2027-01-23 | 12 meses | ✅ Reprocessado       |
| 3968 | Filipe (00353) | B (CGA) | 2026-01-23     | 2027-01-23 | 12 meses | ✅ Reprocessado       |
| 3969 | Filipe (00353) | B (CGA) | 2026-01-23     | 2027-01-23 | 12 meses | ✅ Reprocessado       |
| 3970 | Filipe (00353) | B (CGA) | 2026-01-23     | 2027-01-23 | 12 meses | ✅ Reprocessado       |
| 3971 | Filipe (00353) | B (CGA) | 2026-01-23     | 2027-01-23 | 12 meses | ✅ Reprocessado       |
| 3972 | Filipe (00353) | B (CGA) | 2026-01-23     | 2027-01-23 | 12 meses | ✅ Reprocessado       |
| 3973 | Filipe (00353) | B (CGA) | 2026-01-23     | 2027-01-23 | 12 meses | ✅ Reprocessado       |
| 3213 | Filipe (00353) | B (CGA) | 2025-08-28     | 2027-08-28 | NULL     | ⚠️ Sem validade_meses |

**Observação:** As qualificações 3966-3973 foram criadas via reprocessamento manual em 2026-02-05.

---

## 🔴 PROBLEMAS IDENTIFICADOS

### Problema 1: Eventos Processados Sem Qualificação

**Gravidade:** 🔴 CRÍTICA

**Descrição:**

- 13 eventos marcados como `processado=1`
- Mas todos têm `funcionario_id=NULL` e `qualificacao_historico_id=NULL`
- Isso significa que o webhook foi recebido mas não gerou qualificação

**Causa provável:**

- Bug no código de webhook que marca evento como processado mesmo falhando
- Falta de atualização do campo `funcionario_id` no evento

**Impacto:**

- Treinamentos concluídos no EdApp NÃO estão sendo registrados no AirTrust
- Sistema reporta "processado" mas nada foi criado

### Problema 2: Mapeamentos Órfãos

**Gravidade:** ⚠️ MÉDIA

**Descrição:**

- 7 mapeamentos de usuários apontam para funcionários deletados
- IDs: 4, 6, 7, 8, 10, 15, 16

**Impacto:**

- Se esses usuários concluírem cursos no EdApp, falha no processamento
- Gera eventos de erro

### Problema 3: Duplicações

**Gravidade:** ⚠️ BAIXA

**Descrição:**

- Evento 7 e 8 criam mesma qualificação (ID 3867)
- Múltiplas qualificações para mesmo curso/data (IDs 3966-3973)

**Impacto:**

- Histórico poluído com duplicatas
- Dificulta rastreabilidade

---

## ✅ COERÊNCIA DOS DADOS

### Dados Coerentes

- ✅ Cursos mapeados estão corretos
- ✅ Usuários válidos estão corretamente mapeados
- ✅ Qualificações criadas têm datas corretas
- ✅ Validade calculada corretamente (12 meses para CGA)

### Dados Incoerentes

- ❌ **13 eventos** marcados como processados mas sem resultado
- ❌ **7 mapeamentos** apontam para funcionários inexistentes
- ❌ **Duplicações** de qualificações para mesmo evento

---

## 🎯 AÇÕES RECOMENDADAS

### 1. URGENTE: Corrigir Lógica de Processamento

```typescript
// O código deve SEMPRE atualizar funcionario_id E qualificacao_historico_id
// ANTES de marcar processado=1
```

### 2. Limpar Mapeamentos Órfãos

```sql
-- Deletar mapeamentos de usuários cujos funcionários não existem
UPDATE integracoes_edapp_usuarios
SET deleted_at = datetime('now')
WHERE funcionario_id IN (4, 6, 7, 8, 10, 15, 16);
```

### 3. Reprocessar Eventos Falhados

```sql
-- Eventos 10-19 (os 10 que foram reprocessados mas ainda falharam)
-- Precisam ser investigados individualmente
```

### 4. Adicionar Validações

- ✅ Verificar se funcionário existe antes de processar
- ✅ Verificar se curso está mapeado
- ✅ NUNCA marcar `processado=1` se qualificação não foi criada

---

## 📊 CONCLUSÃO

### Status Geral: ⚠️ PARCIALMENTE FUNCIONAL

**Funcionando:**

- ✅ Webhook recebe eventos corretamente
- ✅ Mapeamentos de cursos OK
- ✅ Quando processa, cria qualificações corretamente

**Quebrado:**

- ❌ Maioria dos eventos (59%) processados sem criar qualificação
- ❌ Falta atualizar `funcionario_id` nos eventos
- ❌ Lógica marca "processado" mesmo falhando

**Recomendação:**
🔴 **CORRIGIR URGENTEMENTE** a lógica de processamento de webhook antes de usar em produção com usuários reais.

---

**Executado por:** Sistema AirTrust  
**Versão:** 744ff611  
**Ambiente:** Produção (Cloudflare D1)
