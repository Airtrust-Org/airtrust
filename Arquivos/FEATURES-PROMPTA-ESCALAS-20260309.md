# FEATURES PROMPT A — Escalas QoL (2026-03-09)

## Feature 1: Filtro de Quinzena (Q1/Q2/Todas)

### Resumo

Toggle de 3 botões (Todas / Q1 / Q2) que filtra as **colunas de dias** na grade Gantt, mostrando apenas os dias pertencentes à quinzena selecionada.

### Arquivos modificados

| Arquivo                       | Tipo                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------- | ---- | -------------- |
| `useEscalaUIStore.ts`         | Zustand: `filtroQuinzena: 'todas'                                                               | 'q1' | 'q2'` + setter |
| `useEscalaStore.ts`           | Facade: expõe filtroQuinzena + setter                                                           |
| `EscalaPageContext.tsx`       | Interface + store destructure + context value                                                   |
| `FiltroQuinzena.tsx`          | **NOVO** — 3 pill buttons (data-testid="filtro-quinzena")                                       |
| `EscalasDetalheView.tsx`      | Integração no filter bar + chip violeta + prop para GradeGantt                                  |
| `GradeGantt.tsx`              | Prop `filtroQuinzena`, `diasFiltrados` useMemo, substituição de `diasDoMes` por `diasFiltrados` |
| `BlocoAeronave.tsx`           | `data-testid="coluna-dia-{N}"` nas colunas do header                                            |
| `e2e/escalas/escalas.spec.ts` | test.skip convertido em test real                                                               |

### Lógica de filtragem

- `diasFiltrados = diasDoMes.filter(dia => dia dentro da data_inicio/data_fim da quinzena)`
- Quinzena é encontrada por `numero` (1=Q1, 2=Q2) + `mes` + `ano`
- Se `filtroQuinzena === 'todas'` → retorna todos os dias

---

## Feature 2: Filtro de Tripulante por Nome (na Grade Gantt)

### Resumo

O input de busca "Filtrar tripulante..." já existia na view mas **só filtrava a aba Tripulantes**. Agora filtra também as **linhas dentro de cada bloco de aeronave** na grade Gantt (por nome, nome de guerra ou matrícula).

### Arquivos modificados

| Arquivo                  | Tipo                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `GradeGantt.tsx`         | Prop `filtroNome`, filtro em `grupos` useMemo (filtra `linhas` e remove grupos vazios) |
| `EscalasDetalheView.tsx` | `filtroNome={filtroNome}` passado para GradeGantt                                      |

### Lógica de filtragem

- `grupos.map(g => { ...g, linhas: g.linhas.filter(l => [nome, nomeGuerra, matricula].join(' ').toLowerCase().includes(termo)) })`
- Grupos sem linhas após filtro são removidos
- Estado "Nenhum tripulante encontrado" exibido quando todos os grupos são filtrados

---

## Feature 3: Badge CMA na Grade

### Resumo

Badges visuais ao lado do nome de cada tripulante na grade, indicando status do CMA (Certificado Médico Aeronáutico):

- **🔴 CMA** — vencido ou sem CMA (fundo vermelho)
- **⚠️ Xd** — vencendo em X dias (fundo amarelo)
- **Nada** — ok (sem badge)

### Arquivos modificados

| Arquivo             | Tipo                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| `GradeGantt.tsx`    | Import `useCMAStatusQuery`, coleta IDs, chama hook, constrói `cmaMap`, passa para BlocoAeronave |
| `BlocoAeronave.tsx` | Import `CMAStatus`, prop `cmaMap`, renderiza badge em `renderLinhaPreenchida`                   |

### Lógica

- `useCMAStatusQuery` busca `/api/escalas/funcionarios/cma-status?ids=...` (max 50 IDs)
- CMA status: `ok | vencendo | expirado | sem_cma`
- Badge usa `title` nativo como tooltip
- Badge responsivo: mostra texto em sm+, só emoji em mobile

---

## Build

- ✅ `npm run build` — verde (9.34s)
- Chunk EscalasMensais: 395 kB (gzip ~66 kB)
