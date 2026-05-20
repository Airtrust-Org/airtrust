# Relatório de Auditoria e Correções — Módulo Escalas

**Data:** 09 de março de 2026  
**Escopo:** Auditoria completa + correções imediatas do módulo Escalas  
**Status final:** ✅ Build passando (4.93s, zero erros) — Deploy produção `212a12d6` / Worker `75a0ab16`

---

## Resumo Executivo

Foram realizadas duas sessões de trabalho abrangendo 7 categorias de auditoria: Database, Backend, Frontend, Segurança, Regras de Negócio, Organização de Arquivos e Migração. Todas as correções foram aplicadas diretamente — zero itens adiados.

---

## Sessão Anterior (Contexto)

### Database

- **Migration 0258** aplicada em produção (D1): 6 índices criados nas tabelas do módulo Escalas
  - `escala_alocacoes(escala_id, deleted_at)`
  - `escala_alocacoes(funcionario_id, escala_id)`
  - `escala_eventos(escala_id, deleted_at)`
  - `escala_tripulacoes(escala_id, deleted_at)`
  - `escala_cobertura_diaria(escala_id, data)`
  - `escalas_mensais(empresa_id, deleted_at)`

### Frontend — Queries

- **`staleTime` corrigido** em 13 queries do módulo (eram `0`, causando refetch excessivo)
- **4 tipos `any` eliminados** em hooks de mutations
- **`React.memo`** adicionado a `DayCell` e `CelulaEvento` (evita re-renders desnecessários no Gantt)

---

## Sessão Atual — Correções Aplicadas

### 1. Smoke Test ✅

- Navegação para `/escalas` → clique direto em "Maio" (não existe sub-rota `/escalas/:id`)
- Escala Maio/2026 carregou corretamente:
  - 20/20 tripulantes
  - 404 eventos
  - Sem conflitos
  - Cobertura completa em PS-CDV (AW139) e PR-BGE (SK76)
  - Grid calendário com marcadores Q1/Q2, legenda de eventos e blocos coloridos

---

### 2. Split de `useEscalasQuery.ts` (1698 → 14 linhas + 4 arquivos) ✅

**Problema:** Ficheiro monolítico de 1698 linhas com 30+ interfaces e 20+ hooks acoplados.

**Solução:** Extração em 4 arquivos de domínio + barrel file de re-exportação.

| Arquivo criado           | Linhas | Conteúdo                                                    |
| ------------------------ | ------ | ----------------------------------------------------------- |
| `escalas-types.ts`       | ~430   | Todos os tipos/interfaces exportados                        |
| `escalas-infra.ts`       | ~170   | `escalasKeys`, `fetchApi`, `mutateApi`, `useManualMutation` |
| `useEscalasQueries.ts`   | ~380   | Todos os hooks `useQuery` (19 hooks)                        |
| `useEscalasMutations.ts` | ~450   | Todos os hooks `useMutation` (9 mega-hooks)                 |
| `useEscalasQuery.ts`     | 14     | Barrel file com re-exports — **zero quebra de importação**  |

**Impacto:** 37 arquivos que importam de `useEscalasQuery` continuam funcionando sem alteração.

---

### 3. Split `EscalasPage.tsx` ✅ CONCLUÍDO NA FASE 2

- Arquivo com **2387 linhas** → **22 linhas** (thin provider wrapper)
- Padrão React Context: `EscalaPageProvider` + `useEscalaPageCtx()` hook
- Toda a lógica migrada para `EscalaPageContext.tsx` (992 linhas)
- JSX dividido em `views/EscalasListagemView.tsx` (405 linhas) e `views/EscalasDetalheView.tsx` (1377 linhas)

---

### 4. Auditoria N+1 — Backend ✅

- Auditoria completa de todas as rotas de escalas
- **Resultado: Zero padrões N+1 encontrados** no backend
- **Descoberta crítica:** 6 de 12 mutations sem trilha de auditoria (50% sem rastreabilidade)

---

### 5. Audit Logging — `escalas-tripulacoes.ts` ✅

**Arquivo:** `worker-airtrust/src/routes/escalas-tripulacoes.ts`

**Adicionado:** Função `auditarTripulacao()` que escreve em **ambas** as tabelas de auditoria:

- `escala_auditoria`
- `auditoria_avancada_v2`

**3 chamadas adicionadas:**

| Endpoint                          | Ação                 | `valor_anterior`                  | `valor_novo`                          |
| --------------------------------- | -------------------- | --------------------------------- | ------------------------------------- |
| `POST /:id/tripulacoes`           | `CRIAR_TRIPULACAO`   | —                                 | `{ pic_id, sic_id, aeronave, datas }` |
| `PUT /:id/tripulacoes/:tripId`    | `EDITAR_TRIPULACAO`  | `beforeUpdate`                    | `body` (campos atualizados)           |
| `DELETE /:id/tripulacoes/:tripId` | `REMOVER_TRIPULACAO` | `currentTrip` (snapshot completo) | —                                     |

---

### 6. Audit Logging — `escalas-eventos.ts` ✅

**Arquivo:** `worker-airtrust/src/routes/escalas-eventos.ts`

**Adicionado:** Função `auditarEvento()` com o mesmo padrão duplo de escrita.

**3 chamadas adicionadas:**

| Endpoint                        | Ação             | `valor_anterior`         | `valor_novo`                                     |
| ------------------------------- | ---------------- | ------------------------ | ------------------------------------------------ |
| `POST /:id/eventos`             | `CRIAR_EVENTO`   | —                        | `{ funcionario_id, tipo_evento, datas, status }` |
| `PUT /:id/eventos/:eventoId`    | `EDITAR_EVENTO`  | `eventoAtual` (snapshot) | `d` (campos do body)                             |
| `DELETE /:id/eventos/:eventoId` | `REMOVER_EVENTO` | `eventoAtual` (snapshot) | —                                                |

**Resultado total:** 6/6 mutations cobertas — 100% de rastreabilidade de auditoria.

---

### 7. Deduplicação de Schema — `helpers.ts` vs `escalas-shared.ts` ✅

**Problema:** Dois arquivos com schemas Zod duplicados e divergentes:

| Item                      | `escalas/helpers.ts` (antigo)     | `escalas-shared.ts` (canônico)           |
| ------------------------- | --------------------------------- | ---------------------------------------- |
| `TripulacaoSchema.pic_id` | `z.string()` (sem coerção)        | `IdCoerceSchema` (coerção + trim)        |
| `TripulacaoSchema`        | Sem refinamento PIC≠SIC           | `.refine()` com validação                |
| `EscalaMensalSchema`      | Sem campo `periodo`               | Com campo `periodo` opcional             |
| `AlterarStatusSchema`     | Sem status `arquivada`            | Com status `arquivada`                   |
| Data parsing              | Regex simples                     | Préprocessamento BR (`DD/MM/YYYY` → ISO) |
| Arquivo                   | `escalas/helpers.ts` (171 linhas) | `escalas-shared.ts` (canônico)           |

**Ações:**

1. Redireccionado import em `escalas/index.ts`: `./helpers` → `../escalas-shared`
2. **Deletado** `worker-airtrust/src/routes/escalas/helpers.ts` (código morto)

---

### 8. Extração de Utilitários — `ModalAdicionarTripulacao.tsx` ✅

**Problema:** 1447 linhas com 18 funções utilitárias puras definidas dentro do componente.

**Solução:** Criado `tripulacao-utils.ts` com todas as 18 funções exportadas.

**Funções extraídas:**
`formatarAeronave`, `normalizeText`, `normalizeModeloOperacional`, `getFuncaoPreferidaFluxoB`, `isFuncaoCompativelFluxoB`, `funcaoExigeComandante`, `isTripulanteCompativelComFuncao`, `intervaloSobrepoe`, `inferirModoPeriodo`, `getQuinzenaSelecionada`, `getQuinzenaPreset`, `getQuinzenaFiltro`, `getQuinzenaBadge`, `normalizeQuinzena`, `getQuinzenaLabel`, `getResumoAlocacaoExistente`, `getAvisoQuinzenaCruzada`, `buildFallbackTripulante`

| Arquivo                        | Antes       | Depois             |
| ------------------------------ | ----------- | ------------------ |
| `ModalAdicionarTripulacao.tsx` | 1447 linhas | 1255 linhas (-192) |
| `tripulacao-utils.ts`          | —           | 216 linhas (novo)  |

**Benefício:** Funções agora são testáveis isoladamente e reutilizáveis.

---

## Arquivos Modificados

### Backend (`worker-airtrust/src/routes/`)

| Arquivo                  | Tipo         | Descrição                                          |
| ------------------------ | ------------ | -------------------------------------------------- |
| `escalas-tripulacoes.ts` | Modificado   | `auditarTripulacao` + 3 chamadas (POST/PUT/DELETE) |
| `escalas-eventos.ts`     | Modificado   | `auditarEvento` + 3 chamadas (POST/PUT/DELETE)     |
| `escalas/index.ts`       | Modificado   | Import redirecionado para `escalas-shared`         |
| `escalas/helpers.ts`     | **Deletado** | Código morto (schema stale)                        |

### Frontend (`src/react-app/pages/escalas/`)

| Arquivo                                          | Tipo       | Descrição                                                     |
| ------------------------------------------------ | ---------- | ------------------------------------------------------------- |
| `hooks/queries/useEscalasQuery.ts`               | Modificado | Convertido em barrel file (14 linhas)                         |
| `hooks/queries/escalas-types.ts`                 | **Criado** | Todos os tipos/interfaces (~430 linhas)                       |
| `hooks/queries/escalas-infra.ts`                 | **Criado** | Infraestrutura compartilhada (~170 linhas)                    |
| `hooks/queries/useEscalasQueries.ts`             | **Criado** | Todos os hooks `useQuery` (~380 linhas)                       |
| `hooks/queries/useEscalasMutations.ts`           | **Criado** | Todos os hooks `useMutation` (~450 linhas)                    |
| `components/Modais/ModalAdicionarTripulacao.tsx` | Modificado | Removidas 18 funções inline                                   |
| `components/Modais/tripulacao-utils.ts`          | **Criado** | 18 funções utilitárias puras (216 linhas)                     |
| `EscalasPage.tsx`                                | Modificado | 2387 → 22 linhas (thin provider wrapper)                      |
| `EscalaPageContext.tsx`                          | **Criado** | Provider com todo estado/queries/handlers (992 linhas)        |
| `views/EscalasListagemView.tsx`                  | **Criado** | Vista de listagem pura JSX (405 linhas)                       |
| `views/EscalasDetalheView.tsx`                   | **Criado** | Vista de detalhe/gantt pura JSX (1377 linhas)                 |
| `components/EscalaCalendario/BlocoAeronave.tsx`  | Modificado | Removida duplicação de ~100 linhas em `renderLinhaPreenchida` |

---

## Validação de Build

Todos os builds passaram sem erros:

| Etapa                                      | Tempo | Status |
| ------------------------------------------ | ----- | ------ |
| Após split `useEscalasQuery`               | 9.19s | ✅     |
| Após audit logging (tripulacoes + eventos) | 9.15s | ✅     |
| Após remoção de `helpers.ts`               | 9.11s | ✅     |
| Após extração `tripulacao-utils.ts`        | 9.33s | ✅     |
| Fase 2: Split EscalasPage + BlocoAeronave  | 4.93s | ✅     |

---

## Pendências Conhecidas

**Nenhuma.** Todos os itens da Fase 2 foram entregues e deployados em produção.

| Item                                  | Status  | Deploy                  |
| ------------------------------------- | ------- | ----------------------- |
| Split `EscalasPage.tsx` (2387 linhas) | ✅ Done | `212a12d6` / `75a0ab16` |
| Fix `BlocoAeronave.tsx` duplicação    | ✅ Done | `212a12d6`              |
| Deploy produção                       | ✅ Done | Pages + Worker          |
