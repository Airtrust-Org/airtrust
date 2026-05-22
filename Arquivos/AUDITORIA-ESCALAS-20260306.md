# AUDITORIA MÓDULO ESCALAS — 2026-03-06

**Versão auditada**: `cf2ee094` (entrada) → `53046411` (saída após fixes)  
**Deploy**: 2026-03-06 15:06:19  
**Worker Version ID**: `b7638afb-7f91-4625-b67c-6f6ddbb652c4`

---

## ETAPA 0 — Mapeamento do Codebase

### Backend (`worker-airtrust/src/routes/`)

- `escalas-crud.ts` — CRUD escalas_mensais
- `escalas-shared.ts` — Schemas/utilidades compartilhadas
- `escalas-tripulacoes.ts` — POST/PUT/DELETE tripulações, alertas CMA
- `escalas-tripulantes-operacionais.ts` — List + quinzena enrichment
- `escalas-eventos.ts`, `escalas-alertas.ts`, `escalas-dashboard.ts`
- `escalas-quinzenas.ts`, `escalas-padroes.ts`, `escalas-preferencias.ts`
- `escalas-tipos-evento-config.ts`, `escalas-templates.ts`
- - 10 outros arquivos de rota

### Frontend (`src/react-app/pages/escalas/`)

- 32 arquivos no total
- Componentes principais: `GradeGantt.tsx`, `ModalAdicionarTripulacao.tsx`, `ModalDetalhesEvento.tsx`, `ConfiguracaoEscalaPage.tsx`
- Hooks: `useEscalasQuery.ts`, `useEscalasMutations.ts`
- Constantes: `tiposEvento.ts`

### Migrações

- Migrations 0220–0248 (29 arquivos), incluindo 0247 (quinzena) e 0248 já aplicadas

---

## ETAPA 1 — Testes de API (Produção)

| #   | Endpoint                                                    | Resultado | Observação                        |
| --- | ----------------------------------------------------------- | --------- | --------------------------------- |
| 1   | POST /api/auth/login                                        | ✅ PASS   | Token JWT OK                      |
| 2   | GET /api/escalas                                            | ✅ PASS   | Lista com campo `periodo`         |
| 3   | GET /api/escalas/:id                                        | ✅ PASS   | Retorna dados completos           |
| 4   | POST /api/escalas                                           | ✅ PASS   | Cria com status `rascunho`        |
| 5   | POST /api/escalas (duplicado)                               | ✅ PASS   | 409 Conflict                      |
| 6   | GET /api/escalas/tripulantes-operacionais                   | ✅ PASS   | 17 tripulantes                    |
| 7   | GET /api/escalas/tripulantes-operacionais?quinzena=primeira | ✅ PASS   | Filtro quinzena                   |
| 8   | GET /api/escalas/:id/funcionarios-quinzena                  | ✅ PASS   | Retorna por piloto                |
| 9   | PUT /api/escalas/:id/funcionarios-quinzena                  | ✅ PASS   | Persiste quinzena                 |
| 10  | GET /api/escalas/preferencias                               | ✅ PASS   | Retorna preferências              |
| 11  | PUT /api/escalas/preferencias                               | ✅ PASS   | Persiste nome_guerra              |
| 12  | GET /api/escalas/tipos-evento-config                        | ✅ PASS   | 12 tipos configurados             |
| 13  | GET /api/escalas/padroes                                    | ✅ PASS   | 5 padrões (15x15, 7x7, etc.)      |
| 14  | POST /api/escalas (ano inválido)                            | ✅ PASS   | 400 validação Zod                 |
| 15  | POST /api/escalas/:id/tripulacoes                           | ✅ PASS   | Cria tripulação + 31 eventos      |
| 16  | GET /api/escalas/:id/tripulacoes                            | ✅ PASS   | Lista imediata após POST          |
| 17  | POST /api/escalas/:id/tripulacoes (duplicado)               | ✅ PASS   | 409 TRIPULACAO_DUPLICADA_AERONAVE |

**Resultado**: 17/17 PASS ✅

---

## ETAPA 2 — Auditoria D1 (Banco de Dados)

### Tabelas verificadas

| Tabela                        | Status                                                              |
| ----------------------------- | ------------------------------------------------------------------- |
| `escalas_mensais`             | ✅ Existe, `periodo` col (cid=15, DEFAULT='personalizada')          |
| `escala_tripulacoes`          | ✅ Existe, unique idx `ux_escala_tripulacoes_escala_aeronave_ativa` |
| `escala_eventos`              | ✅ Existe                                                           |
| `escalas_tipos_evento_config` | ✅ Existe                                                           |
| `padroes_escala`              | ✅ Existe                                                           |
| `escalas_quinzenas`           | ✅ Existe                                                           |
| `domain_events`               | ✅ Existe                                                           |
| `escala_alertas`              | ✅ Existe                                                           |
| `funcionarios.quinzena`       | ✅ Coluna presente (migration 0247)                                 |

### Dados verificados

- Padrões: 5 (15x15, 7x7, 14x14, 21x21, Standby) ✅
- Sem tripulações ativas duplicadas por aeronave ✅
- Índices únicos e secundários presentes ✅

---

## ETAPA 3 — Auditoria Frontend

### Componentes auditados

#### `GradeGantt.tsx`

- Lógica Alocar PIC/SIC: `hasPIC`/`hasSIC` detectados corretamente ✅
- Botão oculto quando ambos preenchidos ✅
- Renderização de eventos com tipo correto ✅

#### `ModalDetalhesEvento.tsx`

- `onClose()` chamado após save (toast + setEditMode(false) + onClose) ✅
- `onClose()` chamado após delete ✅
- Modo edição gerenciado corretamente ✅

#### `ModalAdicionarTripulacao.tsx`

- `quinzenaMode` detectado com `[Q1]`/`[Q2]` badges ✅
- Templates por aeronave/quinzena (FIX-07) ✅
- **BUG ENCONTRADO**: `pilotosPIC` e `sicList` não filtravam por quinzena → **CORRIGIDO**

#### `useEscalasQuery.ts`

- `usePilotosDisponiveisQuery` busca pilotos com habilitações e CMA ✅
- **BUG ENCONTRADO**: campo `quinzena` ausente em `TripulanteOperacional` e `PilotoOption` → **CORRIGIDO**
- **BUG ENCONTRADO**: campo `quinzena` não mapeado no retorno do hook → **CORRIGIDO**

---

## ETAPA 4 — Auditoria UX

| Item                                                | Status           |
| --------------------------------------------------- | ---------------- |
| Toast de sucesso após salvar evento                 | ✅ OK            |
| Toast de erro em falhas de api                      | ✅ OK            |
| Modal fecha após salvar tripulação                  | ✅ OK            |
| Grade atualiza imediatamente após save (invalidate) | ✅ OK            |
| Badges [Q1]/[Q2] nos selects de piloto              | ✅ OK (após fix) |
| Filtro automático de pilotos por quinzena na modal  | ✅ OK (após fix) |
| Loading state em botões durante mutations           | ✅ OK            |

---

## ETAPA 5 — Bugs Encontrados e Corrigidos

### BUG-C1: `periodo` ignorado em POST/PUT escalas (CRÍTICO → CORRIGIDO)

**Problema**: Campo `periodo` silenciosamente ignorado ao criar ou atualizar escalas.

**Causa raiz**:

1. `EscalaMensalSchema` em `escalas-shared.ts` não incluía `periodo`
2. `POST /` handler — INSERT não incluía coluna `periodo`
3. `PUT /:id` handler — `fields/values` nunca atualizavam `periodo`

**Correção**:

- `escalas-shared.ts`: Adicionado `periodo: z.enum(['primeira', 'segunda', 'personalizada']).optional()`
- `escalas-crud.ts` POST: INSERT agora inclui coluna `periodo` com default `'personalizada'`
- `escalas-crud.ts` PUT: Bloco `if (parsed.data.periodo !== undefined)` adicionado

**Arquivos**: [worker-airtrust/src/routes/escalas-shared.ts](worker-airtrust/src/routes/escalas-shared.ts), [worker-airtrust/src/routes/escalas-crud.ts](worker-airtrust/src/routes/escalas-crud.ts)

---

### BUG-C2: Campo `quinzena` ausente nas interfaces TypeScript (MÉDIO → CORRIGIDO)

**Problema**: O backend retorna `quinzena` por piloto (implementado em FEATURE-Q1), mas:

1. `TripulanteOperacional` não declarava `quinzena?: string | null`
2. `PilotoOption` não declarava `quinzena?: string | null`
3. `usePilotosDisponiveisQuery` não mapeava `quinzena` no objeto retornado
4. Resultado: badges `[Q1]`/`[Q2]` nunca renderizados no modal

**Correção**:

- Adicionado `quinzena?: string | null` em ambas as interfaces
- Mapeado `quinzena: tripulante.quinzena ?? null` no `usePilotosDisponiveisQuery`

**Arquivo**: [src/react-app/pages/escalas/hooks/queries/useEscalasQuery.ts](src/react-app/pages/escalas/hooks/queries/useEscalasQuery.ts)

---

### BUG-C3: Modal não filtrava pilotos por quinzena automaticamente (MÉDIO → CORRIGIDO)

**Problema**: Ao alocar tripulação em modo quinzena (1ª ou 2ª), todos os pilotos apareciam nos selects independente de sua quinzena configurada.

**Causa raiz**: `pilotosPIC` e `pilotosComFallback` não aplicavam filtro por `quinzenaMode`.

**Correção**: Adicionado memo `pilotosFiltradosPorQuinzena`:

```ts
const pilotosFiltradosPorQuinzena = useMemo(() => {
  if (quinzenaMode === 'full') return pilotos;
  const quinzenaAlvo = quinzenaMode === '1q' ? 'primeira' : 'segunda';
  return pilotos.filter(
    (p) => !p.quinzena || p.quinzena === quinzenaAlvo || p.quinzena === 'personalizada',
  );
}, [pilotos, quinzenaMode]);
```

- Pilotos com `quinzena=null` aparecem em todos os modos (retro-compatível)
- Pilotos com `quinzena='personalizada'` aparecem em todos os modos
- Pilotos em modo edição com fallback sempre incluídos independente de quinzena

**Arquivo**: [src/react-app/pages/escalas/components/Modais/ModalAdicionarTripulacao.tsx](src/react-app/pages/escalas/components/Modais/ModalAdicionarTripulacao.tsx)

---

## ETAPA 6 — Deploy e Verificação

| Item                                | Resultado                                             |
| ----------------------------------- | ----------------------------------------------------- |
| `npm run build`                     | ✅ Zero erros TypeScript                              |
| Worker deploy                       | ✅ Version ID: `b7638afb-7f91-4625-b67c-6f6ddbb652c4` |
| Pages deploy                        | ✅ App Version: `53046411`                            |
| Smoke test: AUTH                    | ✅ PASS                                               |
| Smoke test: escalas CRUD            | ✅ PASS                                               |
| Smoke test: tripulações + eventos   | ✅ PASS (31 eventos gerados)                          |
| Smoke test: auto_quinzena VOO/FOL   | ✅ PASS (voo=15, fol=16)                              |
| Smoke test: preferências            | ✅ PASS                                               |
| Smoke test: padrões                 | ✅ PASS                                               |
| Smoke test: tipos-evento-config     | ✅ PASS                                               |
| Smoke test: regenerar-eventos       | ✅ PASS                                               |
| Smoke test: endpoint admin removido | ✅ PASS                                               |

---

## Resumo Executivo

| Categoria                 | Encontrado     | Corrigido |
| ------------------------- | -------------- | --------- |
| Bugs críticos backend     | 1              | 1 ✅      |
| Bugs médios frontend      | 2              | 2 ✅      |
| Problemas D1              | 0              | —         |
| Problemas de API contract | 0              | —         |
| Problemas UX              | 0 (após fixes) | —         |

**Resultado final**: 3 bugs corrigidos, 0 problemas abertos. Módulo de Escalas em conformidade total com a spec.
