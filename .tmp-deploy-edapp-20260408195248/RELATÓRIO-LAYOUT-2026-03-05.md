# RELATÓRIO LAYOUT — 2026-03-05

## ✅ O que foi feito (comparando com o prompt)

### PARTE 1 — Bugs Críticos

#### BUG-CRIT-01 — 0/12 visíveis na Gantt

- Default de `tiposEventoVisiveis` foi corrigido para iniciar com todos os tipos padrão:
  - [src/react-app/pages/escalas/hooks/useEscalaUIStore.ts](src/react-app/pages/escalas/hooks/useEscalaUIStore.ts#L10)
  - [src/react-app/pages/escalas/hooks/useEscalaUIStore.ts](src/react-app/pages/escalas/hooks/useEscalaUIStore.ts#L99)
- `toggleTipoEvento` agora nunca deixa a lista zerar (mínimo 1 visível):
  - [src/react-app/pages/escalas/hooks/useEscalaUIStore.ts](src/react-app/pages/escalas/hooks/useEscalaUIStore.ts#L100-L110)
- `mostrarTodosOsTipos` aceita fallback para defaults quando vazio:
  - [src/react-app/pages/escalas/hooks/useEscalaUIStore.ts](src/react-app/pages/escalas/hooks/useEscalaUIStore.ts#L112-L113)
- “Restaurar padrões” na configuração agora restaura tipos padrão e usa toast solicitado:
  - [src/react-app/pages/escalas/ConfiguracaoEscalaPage.tsx](src/react-app/pages/escalas/ConfiguracaoEscalaPage.tsx#L603)

#### BUG-CRIT-02 — datas inválidas (ex: 38/04/2026)

- `formatDate` e `formatDateShort` passaram a validar rigorosamente ano/mês/dia para não normalizar datas impossíveis:
  - [src/react-app/utils/formatDate.ts](src/react-app/utils/formatDate.ts#L27-L31)
  - [src/react-app/utils/formatDate.ts](src/react-app/utils/formatDate.ts#L81-L85)
- `ConfiguracaoEscalaPage` passou a usar `formatDate` centralizado (removeu formatter local permissivo):
  - [src/react-app/pages/escalas/ConfiguracaoEscalaPage.tsx](src/react-app/pages/escalas/ConfiguracaoEscalaPage.tsx#L27)
- Validação lógica de quinzenas para todos os meses (incluindo fevereiro bissexto) executada via script local.

#### BUG-CRIT-03 — confusão entre toggle de `ativo` e visibilidade da grade

- Separação implementada:
  - Toggle de linha controla `ativo` no banco (via `useTiposEventoConfigQuery` + `useTiposEventoConfigMutations`):
    - [src/react-app/pages/escalas/ConfiguracaoEscalaPage.tsx](src/react-app/pages/escalas/ConfiguracaoEscalaPage.tsx#L430)
    - [src/react-app/pages/escalas/ConfiguracaoEscalaPage.tsx](src/react-app/pages/escalas/ConfiguracaoEscalaPage.tsx#L530-L543)
  - Seção separada “Visibilidade na Grade” controla `tiposEventoVisiveis` localmente:
    - [src/react-app/pages/escalas/ConfiguracaoEscalaPage.tsx](src/react-app/pages/escalas/ConfiguracaoEscalaPage.tsx#L558)
- Seed de tipos padrão com `ativo = 1`:
  - Migração para empresas existentes:
    - [worker-airtrust/migrations/0230_escalas_tipos_evento_config.sql](worker-airtrust/migrations/0230_escalas_tipos_evento_config.sql#L24-L25)
  - Seed runtime para empresas sem registros:
    - [worker-airtrust/src/routes/escalas-core.ts](worker-airtrust/src/routes/escalas-core.ts#L1807-L1847)

---

### PARTE 2 — Layout

#### LAYOUT-02 (Toolbar 3 zonas) — **parcial implementado**

- Toolbar reorganizada com:
  - Zona A: contadores de contexto (pilotos/eventos/alertas/conflitos)
  - Zona B: ações primárias (Adicionar, Conflitos com badge pulsante, ação de status)
  - Zona C: menu “Mais” agrupando ações secundárias
- Referências:
  - [src/react-app/pages/escalas/EscalasPage.tsx](src/react-app/pages/escalas/EscalasPage.tsx#L695)
  - [src/react-app/pages/escalas/EscalasPage.tsx](src/react-app/pages/escalas/EscalasPage.tsx#L755-L757)

#### LAYOUT-03 (filtros unificados) — **implementado (versão funcional)**

- Duas barras (aeronave + tipos) substituídas por 1 barra unificada com:
  - busca por tripulante
  - dropdown de aeronave
  - dropdown de tipos
  - chips + “Limpar todos” quando filtros ativos
- Referência:
  - [src/react-app/pages/escalas/EscalasPage.tsx](src/react-app/pages/escalas/EscalasPage.tsx#L936)

#### LAYOUT-04 (legibilidade da Gantt) — **parcial implementado**

- Densidade e contraste ajustados:
  - células com `h-12`
  - finais de semana com fundo dedicado
  - Q1/Q2 com fundo mais suave
  - coluna de nome com largura mínima ajustada
- Referências:
  - [src/react-app/pages/escalas/components/EscalaCalendario/GradeGantt.tsx](src/react-app/pages/escalas/components/EscalaCalendario/GradeGantt.tsx#L625-L627)
  - [src/react-app/pages/escalas/components/EscalaCalendario/GradeGantt.tsx](src/react-app/pages/escalas/components/EscalaCalendario/GradeGantt.tsx#L683)
  - [src/react-app/pages/escalas/components/EscalaCalendario/GradeGantt.tsx](src/react-app/pages/escalas/components/EscalaCalendario/GradeGantt.tsx#L790-L795)

---

## ❌ O que ficou pendente (com motivo)

1. **LAYOUT-01 (listagem anual com timeline de 12 meses clicável)**

- Motivo: exige redesenho completo de `EscalasMensais.tsx` com nova estrutura de cards/timeline e fluxos de criação por mês.

2. **LAYOUT-05 (reorganização completa de Configurações)**

- Motivo: parte foi feita em Tipos de Evento, mas Quinzenas/Templates/Geral ainda não receberam todo o redesign (coluna “Dias”, CTA templates, preferências adicionais).

3. **PEND-01 (quebra real de `escalas-core.ts` em múltiplos arquivos <350 linhas)**

- Motivo: refatoração backend estrutural grande, com risco alto sem fase incremental dedicada.

4. **PEND-02 (PainelDisponibilidade integrado no ModalAdicionarTripulacao 60/40 com dots por dia + click-to-autofill)**

- Motivo: componente atual de disponibilidade é agregado por mês; falta modelo diário por piloto e integração operacional no modal.

5. **PEND-03 (confirmação inline médica na própria célula da Grade)**

- Motivo: requer alterar fluxo de `CelulaEvento`/`GradeGantt` para popover inline + PATCH com `datareal`.

6. **PEND-05 (FRMS bidirecional completo + endpoint `/api/frms/score-atual/:funcionarioid`)**

- Motivo: precisa endpoint novo e acoplamento com disponibilidade/modal/Gantt.

7. **PEND-06 (Comparação de versões com snapshots reais + migração 0233)**

- Motivo: hoje não existe persistência de snapshot histórico de publicação para diff real.

8. **PEND-07 (WorkloadBalance com média + desvio padrão + recomendação textual completa)**

- Motivo: componente já existe e usa barras CSS, mas falta concluir toda a lógica analítica pedida.

9. **DS-01 a DS-04 (varredura completa em todo o módulo)**

- Motivo: aplicado parcialmente em blocos alterados, mas não houve varredura total de todas as telas/modais.

---

## 📊 Nota UX estimada

- **Antes desta rodada:** ~6.2/10
- **Depois desta rodada:** ~7.6/10

Ganhos principais: filtros mais claros, toolbar com menos overload, correção crítica de visibilidade (0/12), correção de datas inválidas e separação correta entre “ativo no banco” vs “visível na grade”.

---

## 🎨 Screenshot mental (ASCII)

### 1) Escala aberta (toolbar + filtros unificados)

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← Escalas / Março 2026 [Rascunho]      7 pilotos · 24 eventos · 2 alertas  │
│                                 [+ Adicionar] [Conflitos 2] [Enviar revisão]│
│                                                     [⋯ Mais] [⚙]            │
├──────────────────────────────────────────────────────────────────────────────┤
│ [🔍 Filtrar tripulante...] [Aeronave ▼] [Tipo ▼] [AW139 ×] [8/12 tipos] Limpar│
├──────────────────────────────────────────────────────────────────────────────┤
│ (Grade Gantt)                                                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2) Configurações > Tipos de Evento

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Tipos de Evento                                      12 tipos cadastrados    │
├──────────────────────────────────────────────────────────────────────────────┤
│ Visibilidade na Grade         [8/12 visíveis] (amarelo)                     │
│ [☑ VOO] [☑ SIM] [☐ MED] ...   [Mostrar todos] [Restaurar padrões]           │
├──────────────────────────────────────────────────────────────────────────────┤
│ [ícone] Voo Operacional [VOO]  [editar] [toggle ativo no sistema ON]        │
│ [ícone] Simulador       [SIM]  [editar] [toggle ativo no sistema ON]         │
│ ...                                                                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3) Gantt com legibilidade melhorada

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Duplas │ Qui 5 │ Sex 6 │ Sáb 7 │ Dom 8 │ ...                                 │
│        │  Q1   │  Q1   │ FDS   │ FDS   │                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│ [J] João PIC  ✈6d  🏖2d  │ [VOO] [SIM] [   ] [   ] ...                       │
│ [A] Ana  SIC  ✈4d  🏖1d  │ [   ] [MED] [   ] [FOL] ...                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Build e qualidade

- Frontend: `npm run build` ✅
- Typecheck: `npx tsc --noEmit` ✅
- Worker: `wrangler deploy --dry-run` ✅
