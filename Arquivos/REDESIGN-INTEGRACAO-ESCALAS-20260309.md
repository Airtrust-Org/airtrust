# REDESIGN & INTEGRAÇÃO — Módulo Escalas

**Data:** 2026-03-09  
**Build:** ✅ GREEN (`✓ built in 9.04s`)

---

## Resumo Executivo

Três frentes concluídas nesta sessão:

| Frente                             | Resultado                               |
| ---------------------------------- | --------------------------------------- |
| **1 — Remoção de ícones**          | ✅ Concluído — 6 arquivos editados      |
| **2 — Redesign tela configuração** | ✅ Concluído — AbaTiposEvento reescrita |
| **3 — Auditoria de integração**    | ✅ 6 integrações analisadas             |

---

## Frente 1 — Remoção de Ícones/Emojis

**Regra aplicada:** "O sistema trabalha apenas com cores. Campo `icone` mantido no banco mas nunca renderizado."

### Arquivos Modificados

| Arquivo                      | Antes                                                                                    | Depois                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `PainelLegenda.tsx`          | `{icone}` dentro do quadrado colorido                                                    | `<span>` colorido vazio                                      |
| `buildDayCellState.ts`       | Tooltip: `${getEventIcon(primary)} ${label}`                                             | Tooltip: `${label}` apenas                                   |
| `ModalDetalhesEvento.tsx`    | Header com ícone vazio                                                                   | Badge colorido (dot + label com `backgroundColor: cor+'20'`) |
| `ModalConfigModulo.tsx`      | Ícone no item da lista                                                                   | Bloco colorido sem texto                                     |
| `ConfiguracaoEscalaPage.tsx` | Ícone em cards de visibilidade + edição + preview; input de ícone + grid `ICONES_PRESET` | Tudo removido — quadrados coloridos limpos                   |
| `EscalaDayCell.tsx`          | Já não renderizava ícone                                                                 | Sem alteração                                                |

### Dados Preservados (por design)

- `EVENTO_CONFIG[].icone` em `tiposEvento.ts`
- `EVENT_TOKENS[].icon` em `escalaTokens.ts`
- Campo `icone` na tabela `escala_tipos_evento_config`
- `useTiposEventoResolvidos()` continua mergeando `icone` (campo inerte)

---

## Frente 2 — Redesign da Tela de Configuração

### Antes

- 3 cards resumo (Ativos, Visíveis na Grade, Personalizados)
- Seção "Visibilidade na Grade" com checkbox grid
- Grid 2 colunas de cards com toggle switch para ativar/desativar
- UI de edição inline com input de ícone + ICONES_PRESET
- Botões "Mostrar todos" / "Restaurar padrões" na seção visibilidade

### Depois

- Header com badges `{N} ativos` / `{N} inativos`
- Card list (1 coluna) com:
  - Quadrado colorido 24×24 `rounded-md`
  - Nome + código (mono) + badge "personalizado" + badge "Ativo"/"Inativo"
  - Botão editar (Pencil) + menu ⋮ (SlidersHorizontal)
- Menu ⋮: Ativar/Desativar + Restaurar padrão (se personalizado)
- **Diálogo de confirmação** antes de desativar (amber warning box)
- **Edição inline expandida**: input nome + color picker nativo + input hex + paleta presets
- **Código readonly** — exibido como texto, não editável
- **Live preview panel** (lateral `xl:w-64`) mostrando legenda dos tipos ativos
- Info box com explicação
- Cards inativos com `opacity-50` e `bg-slate-50/80`

### Código Removido

- `editIcone` state
- `ICONES_PRESET` array
- `visiveisCount`, `personalizadosCount`, `statusVisibilidadeClass`
- Seção "Visibilidade na Grade" (controle local movido para outra parte)
- Toggle switches
- Import `Palette`, `DEFAULT_TIPOS_EVENTO_VISIVEIS`

---

## Frente 3 — Auditoria de Integração

### 1. Funcionários → Escalas ✅

| Aspecto                    | Status | Detalhe                                                                          |
| -------------------------- | ------ | -------------------------------------------------------------------------------- |
| Endpoint                   | ✅     | `GET /api/escalas/tripulantes-operacionais`                                      |
| Filtro ativo               | ✅     | `deleted_at IS NULL AND status = 'ATIVO'`                                        |
| Modelo aeronave            | ✅     | `normalizeModeloOperacional()` com aliases SK76↔S76                              |
| Habilitação                | ✅     | `verificarHabilitacaoModelo()` cruza `modelo_aeronave_id` com `modelos_aeronave` |
| Quinzena preferencial      | ✅     | `normalizeQuinzenaPreferencial()` normaliza variantes                            |
| Função (PIC/SIC/CHK/INSTR) | ✅     | `isCompativelComFuncao()` filtra por `is_instrutor`, `is_checador`               |
| Conflitos período          | ✅     | SQL cruza `escala_alocacoes` + `funcionario_ferias` contra datas da quinzena     |

### 2. Aeronaves → Escalas ✅

| Aspecto                | Status | Detalhe                                                              |
| ---------------------- | ------ | -------------------------------------------------------------------- |
| Prefixo/modelo display | ✅     | `BlocoAeronave` recebe `prefixo` + `modelo` como props               |
| Filtro ativo           | ✅     | `UPPER(COALESCE(NULLIF(TRIM(a.status), ''), 'ATIVO')) = 'ATIVO'`     |
| Sem-aeronave           | ✅     | `SEM_AERONAVE_VALUE = '__sem_aeronave__'` tratado como caso especial |
| Cobertura PIC/SIC      | ✅     | `cobertura?.resumo.dias_cobertos` exibido no header                  |
| Gaps visual            | ✅     | `gapsPic` / `gapsSic` com badges AlertTriangle                       |

### 3. CMA/Qualificações → Escalas ✅

| Aspecto           | Status | Detalhe                                                                                          |
| ----------------- | ------ | ------------------------------------------------------------------------------------------------ |
| Endpoint CMA      | ✅     | `GET /api/escalas/funcionarios/cma-status?ids=...`                                               |
| Status calculado  | ✅     | `sem_cma`, `expirado`, `vencendo` (≤30d), `ok`                                                   |
| AlertasCMA banner | ✅     | Render no topo com `criticos` (≤15d) e `atencao` (>15d)                                          |
| Badge inline      | ✅     | `BlocoAeronave` renderiza 🔴CMA ou ⚠️Xd na linha do tripulante                                   |
| SQL               | ✅     | `qualificacoes_historico JOIN qualificacoes_tipos WHERE codigo='CMA'` por `MAX(data_vencimento)` |
| Blocking          | ⚠️     | CMA expirado aparece como alerta visual mas **não bloqueia** alocação — apenas informa operador  |

### 4. FRMS → Escalas ✅

| Aspecto            | Status | Detalhe                                                                       |
| ------------------ | ------ | ----------------------------------------------------------------------------- |
| Dados na query     | ✅     | `frms_score`, `frms_status`, `frms_avaliacao_data` na response de tripulantes |
| Badge FRMSBadge    | ✅     | `TripulacaoFieldBadges.tsx` com score e indicador visual                      |
| Status operacional | ✅     | `ATENCAO_FRMS`, `BLOQUEADO_FRMS` mapeados como union type                     |
| Tipo               | ✅     | `escalas-types.ts` tem tipos corretos para `ok`, `atencao`, `critico`         |
| Propagação         | ✅     | `useEscalasQueries.ts` mapeia `frms_score` e `frms_status` no transform       |

### 5. Tipos de Evento Config → Grade ✅

| Aspecto         | Status | Detalhe                                                                                                       |
| --------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| staleTime       | ✅     | `5 * 60 * 1000` (5 min) — adequado para config                                                                |
| Propagação cor  | ✅     | `useTiposEventoResolvidos()` → `configMap` → `buildDayCellState()` → `EscalaDayCell` inline `backgroundColor` |
| Merge API+local | ✅     | API rows override `EVENTO_CONFIG` defaults; fallback preservado                                               |
| Ativo filtering | ✅     | `tiposAtivos` filtra `ativo !== false` com ordered priority                                                   |
| Legend sync     | ✅     | `PainelLegenda` usa `configMap` de `useTiposEventoResolvidos()`                                               |
| Invalidação     | ✅     | `refetchTiposConfig()` chamado após cada mutação                                                              |

### 6. Quinzenas Config → Grade/Modal ✅

| Aspecto              | Status | Detalhe                                                               |
| -------------------- | ------ | --------------------------------------------------------------------- |
| Q1/Q2 date ranges    | ✅     | `getDefaultQuinzenaRange()` com cálculo dinâmico                      |
| Legacy normalization | ✅     | `normalizeLegacyQuinzena()` corrige presets bugados de 2025/2026      |
| Modo detect          | ✅     | `detectQuinzenaMode()` → `1q`/`2q`/`custom`                           |
| Filtro quinzena      | ✅     | `FiltroQuinzena.tsx` com toggle `todas`/`q1`/`q2`                     |
| Boundary visual      | ✅     | `isBoundary={diaIso === q1Fim}` → `border-r-[3px] border-r-slate-300` |
| Folga automática     | ✅     | `criarFolgaAutomaticaQuinzenaOposta()` cria FOLGA na quinzena oposta  |
| Slot matching        | ✅     | `BlocoAeronave` monta `slotsFixos` cruzando quinzenas × PIC/SIC       |

---

## Tabela Consolidada

| #   | Integração                  | Resultado              | Ação                                            |
| --- | --------------------------- | ---------------------- | ----------------------------------------------- |
| 1   | Funcionários → Escalas      | ✅ Completo            | —                                               |
| 2   | Aeronaves → Escalas         | ✅ Completo            | —                                               |
| 3   | CMA/Qualificações → Escalas | ✅ (⚠️ não-bloqueante) | Design intencional — CMA expirado é informativo |
| 4   | FRMS → Escalas              | ✅ Completo            | —                                               |
| 5   | Tipos Evento → Grade        | ✅ Completo            | —                                               |
| 6   | Quinzenas → Grade/Modal     | ✅ Completo            | —                                               |

---

## Observação sobre CMA (item 3)

O CMA expirado **não bloqueia** a alocação na grade — apenas mostra badge visual. Isso é behavior descrito na codebase (`pode_ser_alocado` depende de `status_operacional` mas o UI permite override). Se desejado, pode ser promovido a bloqueio hard no futuro.

---

## Build Final

```
✓ built in 9.04s — ZERO errors, ZERO warnings
```
