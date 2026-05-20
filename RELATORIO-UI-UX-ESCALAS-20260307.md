# Relatório UI/UX — Módulo Escalas

**Data:** 7 de março de 2026  
**Revisor:** GitHub Copilot (Claude Opus 4.6)  
**Escopo:** Revisão completa de 6 telas, modals, e padrões globais

---

## Resumo Executivo

Revisão UI/UX completa do módulo de Escalas com foco em redudir ruído visual, melhorar hierarquia de informações, e alinhar com padrões modernos (Linear, Notion, Vercel Dashboard). **14 melhorias implementadas**, build verificado sem erros (3610 módulos, `tsc --noEmit` limpo).

---

## TELA 1 — Listagem de Escalas (`/escalas`)

### Problemas Identificados

| #   | Problema                                                     | Severidade |
| --- | ------------------------------------------------------------ | ---------- |
| 1   | Título "Escalas Mensais" verboso                             | Baixa      |
| 2   | Subtítulo longo e genérico                                   | Baixa      |
| 3   | Filtros sem contagem por status                              | Média      |
| 4   | Filtro ativo com cor de marca (brand color) em vez de neutro | Baixa      |
| 5   | "Resumo Anual" em accordion colapsável — pouco discoverable  | Média      |
| 6   | Meses passados/futuros sem diferenciação visual              | Média      |
| 7   | Cards com emojis (👥📅✈📋) nos métricas — ruído              | Baixa      |
| 8   | Footer "Criada por você" redundant (single-tenant)           | Baixa      |
| 9   | Botão "Nova Escala Mensal" texto longo                       | Baixa      |
| 10  | Empty state sem dual-action (gerar + criar)                  | Média      |

### Melhorias Implementadas

1. **Header**: "Escalas Mensais" → "Escalas", subtitle → "Planejamento operacional mensal"
2. **Botão**: "Nova Escala Mensal" → "Nova Escala"
3. **Filtros**: Adicionada contagem por status `(3)`, estilo ativo mudado para `bg-gray-900 text-white`
4. **Resumo Anual**: Substituído `<details>` accordion por strip horizontal always-visible
   - Meses passados: `opacity-40`
   - Mês atual (MAR): border azul highlight
   - Dots de status sob cada mês (verde=publicada, azul=aprovada, amber=revisão, gray=rascunho, dashed=vazio)
5. **Cards**: `rounded-xl` → `rounded-2xl`, removidos emojis, métricas com separadores `·`, footer limpo com ações alinhadas à direita
6. **Empty state**: Emoji `📅`, dual buttons "Gerar Escalas" + "Criar manualmente"
7. **Ghost cards**: Hover com `group` utility

**Arquivo:** `EscalasPage.tsx` linhas ~746-1080

---

## TELA 2 — Header e Barra de Controles (Detail View)

### Problemas Identificados

| #   | Problema                                                             | Severidade |
| --- | -------------------------------------------------------------------- | ---------- |
| 1   | 7+ botões na barra header — excesso visual                           | Alta       |
| 2   | "Conflitos" como botão standalone + badge separado                   | Média      |
| 3   | "Adicionar" como dropdown separado (indigo) — distrai                | Média      |
| 4   | "Enviar para Revisão" como botão primário vermelho — muito agressivo | Média      |

### Melhorias Implementadas

1. **Conflitos integrado nas métricas**: "⚠ 7 conflitos" agora é clickable (abre modal de conflitos), removido botão standalone
2. **"Adicionar Evento" movido para menu "Mais"**: Reduz 1 botão da barra principal
3. **Conflitos badge móvel**: Badge compacto visível apenas em telas menores (onde metrics pill está hidden)
4. **"Enviar para Revisão"**: Mudado para `variant="secondary"` — menos agressivo visualmente
5. **Menu "Mais" melhorado**: Adicionadas seções "Ações" (Adicionar Evento, Verificar Conflitos com badge), bordas `rounded-xl`

**Resultado**: Header passou de **7 botões** para **4 botões** (Alocar, Situação, Status Action, Mais + Settings)

**Arquivo:** `EscalasPage.tsx` linhas ~1095-1390

---

## TELA 3 — Cobertura Operacional

### Problemas Identificados

| #   | Problema                                                             | Severidade |
| --- | -------------------------------------------------------------------- | ---------- |
| 1   | Subtítulo explicativo ("Cada cartão mostra os gaps...") — redundante | Baixa      |
| 2   | "Atualizar visão" como botão completo — ocupa espaço                 | Baixa      |
| 3   | Banner "tripulantes incompleta" com 2 linhas — verboso               | Baixa      |

### Melhorias Implementadas

1. **Header compacto**: Label uppercase "COBERTURA OPERACIONAL" sem subtítulo
2. **Refresh icon**: Substituído `Button "Atualizar visão"` por ícone `RefreshCw` 24px
3. **Warning banner**: Colapsado para 1 linha: "⚠ 14 tripulantes sem alocação completa"

**Arquivo:** `EscalasPage.tsx` linhas ~1700-1830

---

## TELA 4 — Grade Gantt (Visão Aeronave)

### Avaliação

Grade Gantt **já bem implementada**:

- `BlocoAeronave.tsx` (714 linhas): Headers com dot colorido, badges de função (PIC/SIC), cobertura badges, gap alerts com intervalos formatados
- Células com drag & drop, backgrounds coloridos por status (ativo=sky, gap=red)
- Slots fixos Q1/Q2 com botões "Alocar PIC/SIC"
- `GradeGantt.tsx` (496 linhas): Agrupamento por aeronave, filtering por prefixo/modelo, refreshing indicator

**Status:** Nenhuma alteração necessária — design já alinhado com padrões modernos.

---

## TELA 5 — Grade Tripulantes (Visão Tripulante)

### Avaliação

GradeTripulantes **já bem implementada**:

- Tabela com colunas Q1/Q2 + row por tripulante
- Grupos "Comandantes" / "Copilotos" com contagem
- Status dots (verde=completo, amber=parcial, red=livre)
- CellAlocada: Aeronave (🚁), Situação (colorida), Folga auto (🏖)
- CellLivre: Border-left vermelho com "+" para alocar
- Resumo no header (X completos, Y parciais, Z sem alocação)

**Status:** Nenhuma alteração necessária.

---

## TELA 6 — Configurações (`/escalas/configuracoes`)

### Avaliação

Página de configurações **já bem organizada**:

- Header claro com "← Voltar às Escalas"
- Tabs: Quinzenas | Tipos de Evento | Templates | Geral
- Tabela de quinzenas com Q1/Q2 por mês, edit icons, day counts
- Seletores de ano com "Gerar Padrão 2026"

**Status:** Nenhuma alteração necessária.

---

## Modais

### Avaliação

Todos os modais usam `<Modal>` base component consistente:

- **ModalCriarEscala**: Título atualizado "Nova Escala" (era "Nova Escala Mensal")
- **ModalVerificarConflitos**: Banner verde/vermelho, seções por tipo de conflito — limpo
- **ModalAdicionarTripulacao** (53KB): Complexo mas funcional — formulário multi-step
- **ModalDetalhesEvento**: Timeline com detalhes do evento — adequado
- **ModalNovaSituacao**: Formulário de situação — funcional
- **ModalAdicionarEvento**: Formulário simples — limpo
- **ModalVerificarConflitos**: Análise com badge counts — profissional

**Status:** 1 melhoria (título ModalCriarEscala), restante já consistente.

---

## Legenda (PainelLegenda)

### Avaliação

- Toggle pills por tipo de evento (clicável para show/hide)
- Marcadores da grade: Q1, Q2, Fim de semana, Sem conflitos
- Layout horizontal com separador vertical entre seções

**Status:** Nenhuma alteração necessária.

---

## Verificação Final

| Check              | Status                   |
| ------------------ | ------------------------ |
| `npx tsc --noEmit` | ✅ 0 erros               |
| `vite build`       | ✅ 3610 módulos, 0 erros |
| TELA 1 visual      | ✅ Screenshot verificado |
| TELA 2 visual      | ✅ Screenshot verificado |
| TELA 3 visual      | ✅ Screenshot verificado |
| Modais             | ✅ Consistentes          |
| Grade Gantt        | ✅ Já profissional       |
| Grade Tripulantes  | ✅ Já profissional       |
| Configurações      | ✅ Já profissional       |

---

## Arquivos Modificados

| Arquivo                                                              | Alterações                                                                    |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/react-app/pages/escalas/EscalasPage.tsx`                        | Header listing, filtros, month strip, cards, header detail, coverage, warning |
| `src/react-app/pages/escalas/components/Modais/ModalCriarEscala.tsx` | Título "Nova Escala"                                                          |

---

## Impacto

- **Redução de ruído**: ~40% menos elementos visuais na barra de ações (7→4 botões)
- **Discoverbility**: Meses com status visible at-a-glance na strip horizontal
- **Consistência**: Todos os filtros com contagem, badges uniformizados
- **Compacidade**: Coverage section e warnings mais condensados, header de listagem mais limpo
