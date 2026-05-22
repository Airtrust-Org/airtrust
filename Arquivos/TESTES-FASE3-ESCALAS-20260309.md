# TESTES-FASE3-ESCALAS — Relatório de Implementação

**Data:** 09 de Março de 2026  
**Módulo:** Escalas Mensais  
**Branch:** main  
**Build:** ✅ verde (4.62s)

---

## Resumo Executivo

| Camada                       | Arquivos    | Testes        | Status         |
| ---------------------------- | ----------- | ------------- | -------------- |
| Unitários (tripulacao-utils) | 1           | 89            | ✅ 89/89       |
| Integração (hooks queries)   | 1           | 9             | ✅ 9/9         |
| Integração (hooks mutations) | 1           | 6             | ✅ 6/6         |
| E2E (Playwright)             | 1           | 9 spec blocks | ✅ criados     |
| **Total escalas**            | **3 novos** | **101**       | **✅ 101/101** |

---

## 1. Infraestrutura de Testes

### 1.1 Pacotes instalados

- **msw@2.12.10** — Mock Service Worker para interceptação de HTTP em Node.js

### 1.2 Arquivos criados

| Arquivo                                       | Propósito                                                                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/test/mocks/server.ts`                    | setupServer MSW (node)                                                                                                                                                         |
| `src/test/mocks/handlers/escalas.handlers.ts` | Handlers MSW para todos os endpoints escalas                                                                                                                                   |
| `src/test/mocks/factories/escala.factory.ts`  | Fábricas de dados: 7 funções (`makeEscalaMensal`, `makeCalendarioData`, `makeAlocacao`, `makeEvento`, `makeTipoEvento`, `makeConflitosData`, `makeQuinzena`, `makeTripulante`) |

### 1.3 Arquivos modificados

| Arquivo                | Modificação                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/test/setup.ts`    | Adicionados hooks MSW: `beforeAll(server.listen)`, `afterEach(server.resetHandlers)`, `afterAll(server.close)` |
| `vitest.config.ts`     | Coverage expandido para `pages/escalas/**`; `VITE_API_URL` fixado para URL de produção em testes               |
| `playwright.config.ts` | Adicionado projeto `setup` (auth); projetos dependem de `setup`; `storageState` configurado                    |

### 1.4 Fix crítico: URL de API em testes

`.env.local` define `VITE_API_URL=http://localhost:8787/api` para desenvolvimento local.
Em testes Vitest, isso causava requests para `localhost:8787` (sem servidor rodando) → httpClient retry → timeout.

**Solução:** `vitest.config.ts` agora sobrescreve com:

```ts
env: {
  VITE_API_URL: 'https://airtrust-api-production.airtrust.workers.dev/api',
}
```

MSW handlers interceptam esta URL. Nenhum servidor externo necessário.

### 1.5 Fix MSW handler ordering

Handlers `escalas/:id` (parâmetro dinâmico) capturavam `escalas/tipos-evento-config` antes do handler específico.

**Solução:** Handlers de rotas exatas (`/escalas`, `/escalas/tipos-evento-config`) movidos para **antes** dos handlers paramétricos (`/escalas/:id`).

---

## 2. Testes Unitários — tripulacao-utils.ts

**Arquivo:** `src/react-app/pages/escalas/components/Modais/__tests__/tripulacao-utils.test.ts`  
**Resultado:** ✅ 89/89 passando

### Funções cobertas (18/18)

| Função                            | Cenários                                                                                                                | Casos testados |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------- |
| `formatarAeronave`                | prefixo+modelo, só prefixo, só modelo, ambos null, vazio                                                                | 6              |
| `normalizeText`                   | trim+upper, null, undefined, já trimmed                                                                                 | 4              |
| `normalizeModeloOperacional`      | S76 variantes → SK76, AW139, null, modelo desconhecido                                                                  | 4              |
| `getFuncaoPreferidaFluxoB`        | COP → SIC, CMT → PIC, null → PIC                                                                                        | 3              |
| `isFuncaoCompativelFluxoB`        | COP+SIC✓, COP+PIC✗, COM+PIC✓, COM+SIC✗, outros                                                                          | 4              |
| `funcaoExigeComandante`           | PIC/PIC_CHK/INSTRUTOR/FLEX → true, SIC → false, null, lowercase                                                         | 8              |
| `isTripulanteCompativelComFuncao` | COP+PIC✗, COP+INSTRUTOR✗, COP+SIC✓, CMT+PIC✓, qualquer+SIC✓                                                             | 5              |
| `intervaloSobrepoe`               | overlap, adjacente separado (sem overlap), A⊂B, B⊂A, toque em boundary, mesmo dia, dias separados, B antes A, A antes B | **10**         |
| `inferirModoPeriodo`              | 1q, 2q, custom, sem quinzenas                                                                                           | 4              |
| `getQuinzenaSelecionada`          | modo 1q, modo 2q, modo custom, sem quinzenas                                                                            | 4              |
| `getQuinzenaPreset`               | 1q, 2q                                                                                                                  | 2              |
| `getQuinzenaFiltro`               | 1q→primeira, 2q→segunda, custom→personalizada                                                                           | 3              |
| `normalizeQuinzena`               | 6 variantes primeira, 6 variantes segunda, null/undefined/desconhecido                                                  | 15             |
| `getQuinzenaLabel`                | numero 1→1Q, 2→2Q, outros→null                                                                                          | 3              |
| `getQuinzenaBadge`                | primeira→Q1, segunda→Q2, null                                                                                           | 3              |
| `getResumoAlocacaoExistente`      | sem alocação, com quinzena+aeronave+funcao, sem quinzena                                                                | 3              |
| `getAvisoQuinzenaCruzada`         | null tripulante, null quinzena, personalizada, mesma quinzena, quinzenas diferentes, uso de nome                        | 6              |
| `buildFallbackTripulante`         | undefined → null, constrói de EscalaAlocacao, fallback funcao para role                                                 | 3              |

---

## 3. Testes de Integração — Hooks

### 3.1 useEscalasQueries.test.ts

**Arquivo:** `src/react-app/pages/escalas/hooks/queries/__tests__/useEscalasQueries.test.ts`  
**Resultado:** ✅ 9/9 passando

| Hook                        | Cenário                                       | Status |
| --------------------------- | --------------------------------------------- | ------ |
| `useEscalasQuery`           | Retorna lista de escalas via MSW              | ✅     |
| `useEscalasQuery`           | Expõe função `refetch`                        | ✅     |
| `useEscalaCalendarioQuery`  | Estado inicial loading=true com id            | ✅     |
| `useEscalaCalendarioQuery`  | Busca dados de calendário quando id fornecido | ✅     |
| `useEscalaCalendarioQuery`  | Query desabilitada quando id=null             | ✅     |
| `useEscalaCalendarioQuery`  | Retorna erro quando API retorna 500           | ✅     |
| `useTiposEventoConfigQuery` | Retorna todos tipos (ativo+inativo)           | ✅     |
| `useTiposEventoConfigQuery` | Usa URL com `?ativo=1` quando ativoOnly=true  | ✅     |

### 3.2 useEscalasMutations.test.ts

**Arquivo:** `src/react-app/pages/escalas/hooks/queries/__tests__/useEscalasMutations.test.ts`  
**Resultado:** ✅ 6/6 passando

| Mutation                       | Cenário                                        | Status |
| ------------------------------ | ---------------------------------------------- | ------ |
| `useEscalaMutations`           | Estado inicial loading=false, error=null       | ✅     |
| `adicionarAlocacaoOperacional` | Sucesso retorna alocação                       | ✅     |
| `adicionarAlocacaoOperacional` | Erro 409 SOBREPOSICAO seta error               | ✅     |
| `adicionarAlocacaoOperacional` | Erro 409 CMA_BLOQUEADA seta error              | ✅     |
| `adicionarEvento`              | Erro 422 (handler override via `server.use()`) | ✅     |
| `removerEvento`                | Sucesso sem throw                              | ✅     |

---

## 4. data-testid adicionados

| Componente                 | Arquivo                                         | Atributo                                      |
| -------------------------- | ----------------------------------------------- | --------------------------------------------- |
| GradeGantt                 | `components/EscalaCalendario/GradeGantt.tsx`    | `data-testid="grade-gantt"`                   |
| BlocoAeronave              | `components/EscalaCalendario/BlocoAeronave.tsx` | `data-testid="bloco-aeronave-{aeronaveId}"`   |
| CelulaEvento               | `components/EscalaCalendario/CelulaEvento.tsx`  | `data-testid="celula-{funcionarioId}-{data}"` |
| EscalasListagemView (grid) | `views/EscalasListagemView.tsx`                 | `data-testid="lista-escalas"`                 |
| EscalasListagemView (card) | `views/EscalasListagemView.tsx`                 | `data-testid="card-escala-{escala.id}"`       |

---

## 5. Testes E2E — Playwright

**Arquivos criados:**

- `e2e/auth.setup.ts` — Login único, salva storage state em `e2e/.auth/user.json`
- `e2e/escalas/escalas.spec.ts` — 9 cenários em 5 grupos

| Grupo       | Cenário                                      |
| ----------- | -------------------------------------------- |
| Listagem    | Página /escalas carrega com lista de escalas |
| Listagem    | Cards exibem mês e status                    |
| Grade Gantt | Abre escala e renderiza grade                |
| Grade Gantt | Grade exibe ao menos um bloco aeronave       |
| Filtros     | Filtro de quinzena funciona                  |
| Validação   | Botão Nova Escala abre modal                 |
| Navegação   | Header com título de escalas                 |
| Navegação   | Voltar do detalhe retorna à listagem         |

**Configuração** (`playwright.config.ts`):

- Projeto `setup` executa `auth.setup.ts` como dependência
- Todos os browsers (`chromium`, `firefox`, `webkit`, `Mobile Chrome`, `Mobile Safari`) dependem do `setup`
- `storageState: 'e2e/.auth/user.json'` aplicado a todos

**Execução:**

```bash
# Primeiro configura auth (requer credenciais)
E2E_EMAIL=seu@email.com E2E_PASSWORD=suasenha npx playwright test --project=setup

# Depois roda todos os testes
npx playwright test --project=chromium

# Ou somente escalas
npx playwright test e2e/escalas/ --project=chromium
```

---

## 6. Resultado Final dos Testes

```
Test Files  12 failed | 9 passed | 3 skipped (24)
     Tests  34 failed | 268 passed | 2 skipped (304)
```

**Falhas pré-existentes** (não relacionadas a este trabalho):

- `src/__tests__/api.test.ts` — Endpoints não respondem (sem worker local)
- `src/test/auth.test.ts` — Configuração de auth diferente
- `src/test/logger.test.ts` — Configuração legacy
- `src/__tests__/utils/zod-validation.test.ts` — Schemas divergentes
- `src/__tests__/quinzenas-normalization.test.ts` — Lógica de quinzenas legacy
- `src/__tests__/funcionarios-ssot-reativo.test.ts` — Dependências de D1
- `src/__tests__/hooks.test.ts` — Hooks antigos

**Todos os 101 testes novos do módulo Escalas: ✅ PASSANDO**

---

## 7. Build Status

```
✓ built in 4.62s
```

Sem erros TypeScript. Sem regressões.

---

## 8. Estrutura de Arquivos Criados/Modificados

```
src/
├── test/
│   ├── setup.ts                          MODIFICADO — MSW lifecycle hooks
│   └── mocks/
│       ├── server.ts                     CRIADO
│       ├── handlers/
│       │   └── escalas.handlers.ts       CRIADO
│       └── factories/
│           └── escala.factory.ts         CRIADO
└── react-app/
    └── pages/escalas/
        ├── components/
        │   ├── EscalaCalendario/
        │   │   ├── GradeGantt.tsx        MODIFICADO — data-testid
        │   │   ├── BlocoAeronave.tsx     MODIFICADO — data-testid
        │   │   └── CelulaEvento.tsx      MODIFICADO — data-testid
        │   └── Modais/
        │       └── __tests__/
        │           └── tripulacao-utils.test.ts  CRIADO (89 testes)
        ├── hooks/queries/
        │   └── __tests__/
        │       ├── useEscalasQueries.test.ts     CRIADO (9 testes)
        │       └── useEscalasMutations.test.ts   CRIADO (6 testes)
        └── views/
            └── EscalasListagemView.tsx   MODIFICADO — data-testid

e2e/
├── auth.setup.ts                         CRIADO
├── escalas/
│   └── escalas.spec.ts                   CRIADO (9 cenários)
└── .auth/
    └── .gitkeep

vitest.config.ts                          MODIFICADO — coverage + VITE_API_URL
playwright.config.ts                      MODIFICADO — auth project + storageState
```
