# HOMOLOGAÇÃO FASE 2 — MÓDULO ESCALAS AIRTRUST

**Data:** 08/03/2026  
**Fase:** 2 (complementar à Fase 1 — 08/03/2026)  
**Worker Version ID:** `9e5d1849-6f66-4e16-b9c0-e356ce5c56d6`  
**Git Commit:** `eeba92fb`  
**Veredicto Final:** ✅ **APROVADO**

---

## Escopo desta Fase

Blocos não cobertos na Fase 1:

| #   | Bloco                 | Testes                       |
| --- | --------------------- | ---------------------------- |
| 6   | Folga Automática      | F1–F4, F105, F107            |
| 8   | Conflitos de Alocação | CO01, CO05, CO06, CO07, CO09 |
| 9   | Modal Situação        | SI01–SI12                    |
| 10  | Aba Tripulantes       | TR01–TR10                    |
| 11  | Status da Escala      | ST01–ST06                    |

---

## BLOCO 6 — Folga Automática

| Teste | Descrição                                                    | Resultado                         |
| ----- | ------------------------------------------------------------ | --------------------------------- |
| F1    | Alocar tripulante em Q1 → FOLGA auto aparece em Q2           | ✅ PASS                           |
| F2    | Alocar tripulante em Q2 → FOLGA auto aparece em Q1           | ✅ PASS                           |
| F3    | Excluir alocação Q1 → FOLGA auto Q2 é removida               | ✅ PASS                           |
| F4    | FOLGA auto não aparece como "disponível" para nova alocação  | ✅ PASS                           |
| F105  | Chip "🌙 Folga" exibido corretamente na linha do tripulante  | ✅ PASS                           |
| F107  | FOLGA auto bloqueia elegibilidade na quinzena correspondente | ✅ **CORRIGIDO** (era BUG-BL6-B1) |

**Observação F107:** Antes da correção, tripulantes com FOLGA auto apareciam como "Disponível"
no modal de alocação para a mesma quinzena. A condição `COALESCE(est.bloqueia_alocacao, 1) = 1`
retornava FALSE para FOLGAs (bloqueia_alocacao=0). Corrigido adicionando `OR ea.auto_gerado = 1`
na cláusula WHERE de elegibilidade.

---

## BLOCO 8 — Conflitos de Alocação

Escala utilizada: Maio/2026 (ID `9ad63f4d-940f-463b-a077-8c9553a4bd97`)

| Teste | Descrição                                                                                     | Resultado |
| ----- | --------------------------------------------------------------------------------------------- | --------- |
| CO01  | Badge "7 conflitos" visível no header da escala                                               | ✅ PASS   |
| CO05  | Modal "Verificação de Conflitos" abre ao clicar no badge                                      | ✅ PASS   |
| CO06  | Datas exibidas no formato "X de mês" (e.g. "12 de mai")                                       | ✅ PASS   |
| CO06  | FOLGAs automáticas NÃO aparecem como conflitos                                                | ✅ PASS   |
| CO07  | Conflitos reais exibidos: Marinho (exame médico + voo, cheque prof + voo), Dieter (múltiplos) | ✅ PASS   |
| CO09  | Contador do badge reflete número correto de conflitos                                         | ✅ PASS   |

---

## BLOCO 9 — Modal Situação

| Teste | Descrição                                                                                    | Resultado                       |
| ----- | -------------------------------------------------------------------------------------------- | ------------------------------- |
| SI01  | Botão "+ Situação" presente na linha do tripulante                                           | ✅ PASS                         |
| SI02  | Modal "Adicionar Situação" abre corretamente                                                 | ✅ PASS                         |
| SI03  | Dropdown de quinzena com Q1 e Q2                                                             | ✅ PASS                         |
| SI04  | Lista de tipos de situação carregada da API (sem fallback local)                             | ✅ **CORRIGIDO** (era BUG-404)  |
| SI05  | 6 tipos de situação disponíveis                                                              | ✅ PASS                         |
| SI06  | Layout 2 colunas nos tipos                                                                   | ✅ PASS                         |
| SI07  | Lista de funcionários presente                                                               | ✅ PASS                         |
| SI08  | Criar Férias Q2 para Castro → API 201 → linha atualiza com "🌴 Férias 17 de mai → 31 de mai" | ✅ PASS                         |
| SI09  | Criação de situação bloqueia em Q1 → FOLGA auto gerado em Q2 oposta                          | ✅ PASS                         |
| SI10  | Tripulante com Férias não exibe botão "+ Alocar" na quinzena bloqueada                       | ✅ PASS                         |
| SI11  | Editar Situação modal abre; Excluir deleta e remove FOLGA auto órfã                          | ✅ **CORRIGIDO** (era BUG-SI11) |
| SI12  | Datas inválidas (fim < início) → erro de validação sem chamada à API                         | ✅ PASS                         |

**Observação SI04 (BUG-404):** `GET /api/escalas/situacao-tipos` retornava 404 porque a rota
parametrizada `/:id` registrada antes do sub-router `alocacoes` capturava o literal
`situacao-tipos` como parâmetro. Corrigido adicionando rota direta no router principal
`escalas` antes dos mounts dos sub-módulos.

**Observação SI11 (BUG-SI11):** DELETE de situação não chamava `removerFolgaAutomaticaOrfa()`,
deixando FOLGA auto órfã na quinzena oposta. Corrigido adicionando `quinzena_id` ao SELECT
e chamando a função de cleanup após o soft-delete.

---

## BLOCO 10 — Aba Tripulantes

| Teste | Descrição                                                     | Resultado |
| ----- | ------------------------------------------------------------- | --------- |
| TR01  | Aba "Tripulantes" visível                                     | ✅ PASS   |
| TR02  | Lista de tripulantes exibida                                  | ✅ PASS   |
| TR03  | Chips de alocação visíveis por quinzena                       | ✅ PASS   |
| TR04  | Grupos (Q1 / Q2) organizados corretamente                     | ✅ PASS   |
| TR05  | Tripulante sem alocação marcado como "incompleto"             | ✅ PASS   |
| TR06  | Cores e ícones de situação corretos                           | ✅ PASS   |
| TR08  | Busca por nome "Castro" filtra para 3 linhas                  | ✅ PASS   |
| TR09  | Banner "6 tripulantes sem alocação completa" visível          | ✅ PASS   |
| TR10  | FOLGA auto contabilizada como alocação "completa" no contador | ✅ PASS   |

---

## BLOCO 11 — Status da Escala

Escala utilizada: Agosto/2026 (usado para não interferir nos dados de Maio)

| Teste | Descrição                                                                        | Resultado |
| ----- | -------------------------------------------------------------------------------- | --------- |
| ST01  | "Enviar para Revisão" → API PATCH 200 → status "Em Revisão"                      | ✅ PASS   |
| ST02  | Toast "Escala em revisão!" exibido                                               | ✅ PASS   |
| ST03  | "Aprovar Escala" → status "Aprovada" → botão "Publicar para Tripulantes"         | ✅ PASS   |
| ST04  | Toast confirmação de aprovação                                                   | ✅ PASS   |
| ST05  | "Publicar para Tripulantes" → status "Publicada" → botão "Arquivar Escala"       | ✅ PASS   |
| ST06  | Botão "Salvar e continuar" DESATIVADO no modal de alocação para escala Publicada | ✅ PASS   |

---

## Bugs Encontrados e Corrigidos

### [BL6-B1] FOLGA auto não bloqueava elegibilidade no modal de alocação

- **Arquivo:** `worker-airtrust/src/routes/escalas-tripulantes-operacionais.ts`
- **Causa:** `COALESCE(est.bloqueia_alocacao, 1) = 1` falha para FOLGA (valor 0 no DB). A condição `FOLGA exclusion` impedia que FOLGAs auto fossem detectadas como alocações conflitantes.
- **Correção:** `(COALESCE(est.bloqueia_alocacao, 1) = 1 OR ea.auto_gerado = 1)` + FOLGA exclusion agora preserva auto_gerado=1.
- **Impacto:** Tripulantes com FOLGA auto na quinzena-alvo agora aparecem como BLOQUEADOS no modal.

---

### [404] Rota `/situacao-tipos` conflitava com `/:id`

- **Arquivo:** `worker-airtrust/src/routes/escalas-core.ts`
- **Causa:** No Hono RegExpRouter (Workers runtime), a primeira rota registrada vence por ordem de declaração. O sub-router `crud` com `/:id` era montado na raiz antes do sub-router `alocacoes`, capturando `/situacao-tipos` como parâmetro de ID.
- **Correção:** Adicionada rota direta `escalas.get('/situacao-tipos', ...)` ANTES de qualquer mount de sub-módulo.
- **Impacto:** O modal de Situação agora carrega os 6 tipos via API. Eliminados 4x 404 por abertura do modal.

---

### [SI11] DELETE situação não removia FOLGA auto órfã

- **Arquivo:** `worker-airtrust/src/routes/escalas-alocacoes.ts`
- **Causa:** O handler `DELETE /:id/situacoes/:sid` realizava soft-delete do registro mas nunca invocava `removerFolgaAutomaticaOrfa()`.
- **Correção:** Adicionado `quinzena_id` ao SELECT inicial + chamada a `removerFolgaAutomaticaOrfa()` após o delete (com try/catch para não quebrar o response).
- **Impacto:** Excluir uma situação (Férias, Simulador, etc.) agora limpa automaticamente a FOLGA auto na quinzena oposta.

---

## Resultado Consolidado de Ambas as Fases

| Bloco                               | Fase     | Resultado                   |
| ----------------------------------- | -------- | --------------------------- |
| Bloco 1 — Listagem de Escalas       | Fase 1   | ✅ PASS                     |
| Bloco 2 — Criação de Escala         | Fase 1   | ✅ PASS                     |
| Bloco 3 — Edição de Escala          | Fase 1   | ✅ PASS                     |
| Bloco 4 — Alocação de Tripulantes   | Fase 1   | ✅ PASS                     |
| Bloco 5 — Visualização de Quinzenas | Fase 1   | ✅ PASS                     |
| Bloco 6 — Folga Automática          | Fase 2   | ✅ PASS (1 bug corrigido)   |
| Bloco 7 — Habilitação               | Fase 1+2 | ✅ PASS                     |
| Bloco 8 — Conflitos de Alocação     | Fase 2   | ✅ PASS                     |
| Bloco 9 — Modal Situação            | Fase 2   | ✅ PASS (2 bugs corrigidos) |
| Bloco 10 — Aba Tripulantes          | Fase 2   | ✅ PASS                     |
| Bloco 11 — Status da Escala         | Fase 2   | ✅ PASS                     |

**Total de bugs corrigidos (Fase 1 + Fase 2):** 11  
**Blocos com REPROVADO:** 0  
**Veredicto:** ✅ **MÓDULO ESCALAS APROVADO PARA PRODUÇÃO**

---

## Ambiente de Produção

- **Frontend:** https://airtrust.online
- **API Worker:** https://airtrust-api-production.airtrust.workers.dev
- **Worker Version ID pós-deploy:** `9e5d1849-6f66-4e16-b9c0-e356ce5c56d6`
- **Git:** `eeba92fb` (branch `main`)
