# REDESIGN-FRMS-FASE3-20260310

## Resumo Executivo

Fase 3 do FRMS concluída: redesign completo do dashboard de Gerenciamento de Fadiga.  
Deploy: **`8e2ed65a`** — Worker + Pages em produção.  
Build: **zero errors** · Testes: **292 passing** (16 novos FRMS).

---

## 1. Análise da Imagem de Referência

Mockup estilo Muza Costa do Sol analisado:

- Cards de resumo (Tripulantes, Atenção, Risco, Violação)
- Gráfico de barras horizontais por base com segmentos por nível
- Linha de tendência de fadiga com thresholds (100%, 75%, 62%)
- Tabela de fadiga por tripulante com barras coloridas
- Top 10 em risco com ranking
- Gauge de limite mensal

Elementos implementados: Cards, Timeline com thresholds, Heatmap (substitui barras por base), Tabela completa, Filtros sidebar.

---

## 2. Componentes Removidos

| Componente                   | Motivo                                                            |
| ---------------------------- | ----------------------------------------------------------------- |
| `RadarChart` (recharts)      | Confuso para operadores, informação coberta pelo heatmap + tabela |
| `BarChart` vertical fadiga   | Substituído por CSS Grid Heatmap (mais informação, 2D)            |
| `StatCard` inline            | Substituído por `FrmsMetricCards` com animação countUp            |
| `ProgressBar` inline         | Movido para sub-componentes                                       |
| 800+ linhas de código legado | Dashboard reduziu de 1261 → 290 linhas (componetizado)            |

---

## 3. Novo Layout — 3 Zonas

```
┌──────────┬────────────────────────────────────────┐
│          │  HEADER FIXO: título + botões           │
│  SIDEBAR │  (Importar FIRA SEMPRE visível)         │
│  FILTROS ├────────────────────────────────────────┤
│  (w-64)  │  Filter Chips                           │
│          │  Metric Cards (4)                        │
│          ├────────────────────────────────────────┤
│          │  SCROLLABLE:                             │
│          │    Heatmap (CSS Grid)                    │
│          │    Timeline Chart (Recharts)             │
│          │    Tripulantes Table (sortable)          │
└──────────┴────────────────────────────────────────┘
```

**Responsivo**: Em `<1024px`, sidebar vira drawer off-canvas com botão hamburger.

---

## 4. Novos Componentes

### 4.1 FrmsFilterContext.tsx

- Context API + sessionStorage (key: `frms-filters-v3`)
- Estado: periodo (7|30|90), base, aeronave, status[], busca, selectedTripulanteId
- Hook: `useFrmsFilters()` → { filters, setFilter, removeFilter, resetFilters, periodoNumDias }

### 4.2 FrmsFilters.tsx

- Sidebar com busca (debounce 200ms), botões período, dropdown aeronave, checkboxes status
- Fetch aeronaves de `/api/aeronaves?limit=50&status=ativo`

### 4.3 FrmsFilterChips.tsx

- Chips com × para filtros ativos (periodo ≠ 30, aeronave, status < 4, busca)
- Labels traduzidos (CRITICO → Crítico)

### 4.4 FrmsMetricCards.tsx

- 4 cards: Normal, Atenção, Crítico, Violação
- Animação countUp (600ms), clicável para filtrar
- data-testid: `frms-card-ok`, `frms-card-atencao`, `frms-card-critico`, `frms-card-violacao`

### 4.5 FrmsHeatmap.tsx (~220 linhas)

- **CSS Grid** (não recharts) — escolha por performance com 30+ tripulantes × 30+ dias
- Eixo Y: tripulantes ordenados por severidade DESC
- Eixo X: dias do período
- Cores: <40% verde, 40-70% amarelo, 70-85% laranja, ≥85% vermelho, null cinza
- Tooltip: nome, data, fadiga %, HV 7d, HV 28d
- Click célula → navega para ficha; Click nome → seleciona para timeline
- Alturas adaptáveis: ≤20 → 32px, 21-40 → 22px, >40 → 20px
- Legenda com quadrados coloridos
- Empty state com botão "Importar FIRA"

### 4.6 FrmsTimelineChart.tsx (~210 linhas)

- Recharts `ComposedChart` com `Area` (gradiente) + `Line` (azul, 2px)
- `ReferenceLine` para thresholds Atenção (amarelo, tracejado) e Crítico (vermelho, tracejado)
- Valores dinâmicos de `frms_configuracao_limites` (não hardcoded)
- Tooltip customizado: data, fadiga %, HV 7d/28d, detalhes jornada
- Dropdown seletor de tripulante (ordenado por severidade)
- Placeholder quando nenhum selecionado

### 4.7 FrmsTripulantesTable.tsx (~230 linhas)

- Colunas: Tripulante, Fadiga %, Status (badge), 7 dias, 28 dias, 365 dias, ação
- Ordenação por qualquer coluna (click header alterna direção)
- Paginação: 20/página
- Exportação CSV (blob download)
- Bordas coloridas: vermelho para CRITICO/VIOLACAO, amarelo para ATENCAO
- Filtros de busca + status integrados via FrmsFilterContext

---

## 5. Novos Endpoints

### GET /api/frms/heatmap

- Query: `?periodo=30`
- Resposta: `{ tripulante_id, nome, nome_guerra, cargo, dias: { [date]: { pct, hv7d, hv28d, hvDia, pctDia } }, maxPct }`
- Join: `frms_acumulo_rolling` × `funcionarios`
- Ordenação: severidade DESC (pior primeiro)

### GET /api/frms/tripulante/:id/timeline

- Query: `?periodo=30`
- Resposta: `[{ data, pct_fadiga, hv_7d, hv_28d, hv_dia, pct_dia, teve_jornada, hora_apresentacao, hora_termino }]`
- LEFT JOIN com `frms_jornada` para detalhes de jornada
- Auth: requer JWT (Fase 2)

---

## 6. Testes

| Suite                         | Testes  | Status  |
| ----------------------------- | ------- | ------- |
| FrmsMetricCards.test.tsx      | 4       | ✅ Pass |
| FrmsFilters.test.tsx          | 5       | ✅ Pass |
| FrmsTripulantesTable.test.tsx | 7       | ✅ Pass |
| **Total novos**               | **16**  | ✅      |
| **Total projeto**             | **292** | ✅      |

MSW handlers adicionados em `src/test/mocks/handlers/frms.handlers.ts` cobrindo:

- `/api/frms/heatmap`, `/api/frms/tripulante/:id/timeline`, `/api/frms/frota`
- `/api/frms/alertas`, `/api/frms/alertas/count`, `/api/frms/configuracao/limites`
- `/api/aeronaves`, `/api/funcionarios`

---

## 7. Arquivos Modificados

| Arquivo                                                        | Ação          | Linhas     |
| -------------------------------------------------------------- | ------------- | ---------- |
| `src/react-app/pages/frms/FrmsDashboard.tsx`                   | Reescrito     | 1261 → 290 |
| `worker-airtrust/src/routes/frms.ts`                           | +2 endpoints  | +140       |
| `src/react-app/pages/frms/components/FrmsFilterContext.tsx`    | Novo          | 85         |
| `src/react-app/pages/frms/components/FrmsFilters.tsx`          | Novo          | 155        |
| `src/react-app/pages/frms/components/FrmsFilterChips.tsx`      | Novo          | 85         |
| `src/react-app/pages/frms/components/FrmsMetricCards.tsx`      | Novo          | 100        |
| `src/react-app/pages/frms/components/FrmsHeatmap.tsx`          | Novo          | 280        |
| `src/react-app/pages/frms/components/FrmsTimelineChart.tsx`    | Novo          | 210        |
| `src/react-app/pages/frms/components/FrmsTripulantesTable.tsx` | Novo          | 260        |
| `src/test/mocks/handlers/frms.handlers.ts`                     | Novo          | 120        |
| `src/test/mocks/server.ts`                                     | +frmsHandlers | +2         |
| `src/react-app/__tests__/frms/FrmsMetricCards.test.tsx`        | Novo          | 50         |
| `src/react-app/__tests__/frms/FrmsFilters.test.tsx`            | Novo          | 103        |
| `src/react-app/__tests__/frms/FrmsTripulantesTable.test.tsx`   | Novo          | 95         |

**Total**: +2347 linhas adicionadas, -1101 removidas (16 arquivos)

---

## 8. Deploy

- Commit: `8e2ed65a`
- Worker Version ID: `c8422af6-5d5a-411e-8a5c-51874fe6bf9c`
- Pages: `https://airtrust.online` → build-version `8e2ed65a`
- API Health: `https://airtrust-api-production.airtrust.workers.dev/api/health` → healthy, version `8e2ed65a`
- Build: **zero errors**
- Smoke: assets 404 ✅, protected 401 ✅

---

## 9. Decisões de Design

| Decisão                              | Justificativa                                                    |
| ------------------------------------ | ---------------------------------------------------------------- |
| CSS Grid para Heatmap (não recharts) | Performance: 900+ células DOM > SVG. Tooltip nativo sem overhead |
| Context API (não URL params)         | Spec: "NÃO usar URL params — manter SPA". SessionStorage per-tab |
| countUp animation nas cards          | Feedback visual de carregamento, UX premium                      |
| Drawer off-canvas <1024px            | Mobile-first, não colapsa sidebar em accordion                   |
| Thresholds dinâmicos no timeline     | Valores de `frms_configuracao_limites`, nunca hardcoded          |
| Paginação 20/página                  | Balanceia DOM nodes vs scroll infinito para tabelas médias       |

---

## 10. Nota sobre Dimensão Perdida

O RadarChart antigo mostrava comparação simultânea de 4 eixos (Diário/7 Dias/Mensal/365 Dias) para top 5 tripulantes. Esta dimensão comparativa agora está coberta por:

- **Heatmap**: mostra evolução temporal por tripulante (substitui eixo tempo)
- **Tabela**: colunas separadas para 7d, 28d, 365d (substitui eixos radar)
- **Timeline**: drill-down em tripulante individual com todas as métricas

A troca sacrifica a visão "radar overview" em favor de profundidade analítica.
