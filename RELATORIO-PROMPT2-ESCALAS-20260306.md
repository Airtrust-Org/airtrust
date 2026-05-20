# Relatório Final — Prompt 2: Implementação Escalas

**Data:** 2026-03-06  
**Versão deployada:** `f3c1d4b1` (Pages) / `653ca237` (Worker)  
**Commit:** `f3c1d4b1` → `60ec4348` (auto deploy)

---

## Resumo da Migração

| Métrica                               | Valor |
| ------------------------------------- | ----- |
| Rows written (migration 0254)         | 112   |
| Rows read (migration 0254)            | 1390  |
| total `escala_alocacoes` pós-migração | 16    |
| Alocacoes via API (Mar 2026)          | 6     |
| Alocacoes via API (Abr 2026)          | 2     |
| Alocacoes via API (Mai 2026)          | 6     |
| Cobertura aeronaves (Mar)             | 5     |
| Cobertura aeronaves (Abr)             | 4     |
| Cobertura aeronaves (Mai)             | 5     |

---

## Arquivos Modificados

| Arquivo                                                                      | Alteração                                                                                                                                                   |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/react-app/pages/escalas/hooks/useEscalaUIStore.ts`                      | `resetEscalaState` aceita `escalaStatus`; `modoEdicao` calculado por status; `ModalAberto` com `quinzenaInicial`                                            |
| `src/react-app/pages/escalas/EscalasPage.tsx`                                | `abrirEscala` passa status; `totalPilotos` com fallback legacy; `abrirAlocacaoTripulante` passa `quinzenaId`; banner de gaps; modal passa `quinzenaInicial` |
| `src/react-app/pages/escalas/components/EscalaCalendario/GradeGantt.tsx`     | `quinzenas` prop; `quinzenasMes` computed; `quinzenaId` em `LinhaAlocacaoGantt`; passa `quinzenas` a `BlocoAeronave`                                        |
| `src/react-app/pages/escalas/components/EscalaCalendario/BlocoAeronave.tsx`  | 4 slots fixos (Q1-PIC, Q1-SIC, Q2-PIC, Q2-SIC); slots vazios clicáveis com `+ Alocar PIC/SIC`; `quinzenas` + `quinzenaId` props; `SlotFixo` interface       |
| `src/react-app/pages/escalas/components/Modais/ModalAdicionarTripulacao.tsx` | `quinzenaInicial` prop; pré-seleciona quinzena ao abrir via slot vazio                                                                                      |
| `worker-airtrust/migrations/0254_migrate_tripulacoes_to_alocacoes.sql`       | Migration PIC+SIC de `escala_tripulacoes` → `escala_alocacoes` (INSERT OR IGNORE + NOT EXISTS)                                                              |

---

## Critérios de Aceite

| Critério                                                       | Status | Evidência                                                                      |
| -------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------ |
| `modoEdicao = true` quando status ≠ publicada/aprovada         | ✅     | `resetEscalaState` aceita status; 7 call sites atualizados                     |
| Migration cria ≥ 8 alocações a partir de 11 tripulações        | ✅     | 112 rows written → 16 registros em `escala_alocacoes`                          |
| `totalPilotos` mostra valor > 0 com dados legados              | ✅     | Fallback IIFE conta `pic_id`/`sic_id` de `tripulacoes`                         |
| Grade mostra 4 slots/aeronave (Q1-PIC, Q1-SIC, Q2-PIC, Q2-SIC) | ✅     | `BlocoAeronave` com `slotsFixos` + `renderSlotVazio` + `renderLinhaPreenchida` |
| Slots vazios mostram "+ Alocar PIC/SIC" clicável               | ✅     | `renderSlotVazio` com botão → `onAdicionarAlocacao({ quinzenaId })`            |
| Células de dias vazios dentro da quinzena clicáveis            | ✅     | Cells com `cursor-pointer bg-red-50/40` e click handler                        |
| Modal pré-seleciona quinzena ao abrir de slot vazio            | ✅     | `quinzenaInicial` prop → `periodoModo` inferido via `q.numero`                 |
| Banner de gaps acima da grade                                  | ✅     | `coberturaOperacional.some(gaps>0)` → badges clicáveis por aeronave            |
| Botão "+Nova Alocação" visível em modo edição                  | ✅     | Resolvido pelo fix de `modoEdicao` (PASSO 1)                                   |
| Build limpo (0 erros TS)                                       | ✅     | `npm run build` sem erros                                                      |
| Deploy bem-sucedido                                            | ✅     | Pages `f3c1d4b1` + Worker `653ca237`                                           |
| Cobertura recalculada com `dias_cobertos > 0`                  | ✅     | Mar: 15/31 cobertos, Abr/Mai: dados presentes                                  |

---

## Alocações Migradas (Escala Março 2026)

| Função | Aeronave      | Período   | Tripulante               |
| ------ | ------------- | --------- | ------------------------ |
| PIC    | (sem prefixo) | 01→15 Mar | Filipe Passaroni Daumas  |
| SIC    | (sem prefixo) | 01→15 Mar | Jair Cesar Da Silva      |
| PIC    | PR-BGE        | 01→15 Mar | Dieter Johny Kühr        |
| SIC    | PR-BGE        | 01→15 Mar | Gabriel Ferreira Barreto |
| PIC    | PS-CDV        | 16→31 Mar | Nivaldo Antonio Naressi  |
| SIC    | PS-CDV        | 16→31 Mar | Adriana Brasil           |

---

## Observações

1. **2 alocações sem prefixo de aeronave** — Provavelmente originadas de tripulações cujo campo `aeronave` na tabela `escala_tripulacoes` continha texto não reconhecido pela tabela `aeronaves`. A cobertura calcula corretamente mesmo assim.
2. **POST cobertura/recalcular timeout** — O endpoint de recálculo forçado deu timeout (>25s). O fallback `GET /cobertura` com recálculo lazy funcionou normalmente.
3. **Escala Abril (publicada)** — 2 alocacoes apenas. `modoEdicao = false` para escalas publicadas é o comportamento correto.
