# Auditoria UI/UX — Módulo Qualificações

**Data:** 2026-06-09
**Escopo:** Histórico de Qualificações · Categorias · Treinamentos Planejados (Turmas)
**Método:** Análise de screenshots + código fonte + UI/UX Pro Max Design System (Enterprise Gateway / Data-Dense Dashboard)
**Severidade:** 🔴 Crítico · 🟠 Alto · 🟡 Médio · 🟢 Baixo · ℹ️ Informativo

---

## Resumo Executivo

As três páginas formam um módulo funcional maduro com boa cobertura de features. O código revela cuidado com performance (VirtualTable, lazy loading, debounce) e edge cases (URL params, legacy migration). Porém, há **problemas de consistência visual** entre as abas, **bugs de padding em botões**, e **questões de acessibilidade** que precisam ser endereçadas.

**Nota geral:** 7.1/10 — Funcional e usável, mas inconsistente visualmente.

---

## 1. Consistência Visual Entre Abas 🔴

### 1.1 Duas implementações de tabela coexistem

O módulo tem **3 estilos de tabela diferentes** para o mesmo tipo de dado:

| Aba | Componente | Estilo |
|-----|-----------|--------|
| Histórico (main) | `DataTable` (linha 2838) | Moderno, cards arredondados, sem borda externa |
| Histórico (embed) | `HistoricoTab` com `<table>` nativo (linha 354) | Tabela tradicional com `border-gray-200`, `bg-gray-50` header |
| Planejados > Quadro | `<table>` nativo inline (linha 1674) | `rounded-2xl`, `divide-y`, `sticky top-0` header |
| Categorias (tabela) | `<table>` nativo (linha 180) | `border-gray-200`, `bg-gray-50`, sem bordas arredondadas |
| Tipos (Modelos) | `DataTable` (linha 2930) | Mesmo estilo do Histórico |

**Impacto:** O usuário percebe 3 "looks" diferentes ao navegar entre abas. Isso quebra a ilusão de um sistema unificado.

**Recomendação:** Migrar `HistoricoTab`, `CategoriasTab` e a tabela `Quadro` para usar o `DataTable` compartilhado, que já tem sorting, paginação, column config e empty state built-in. Ou, alternativamente, criar um wrapper `QualificacoesTable` consistente.

### 1.2 Tokens de design misturados

O código usa **3 sistemas de cores diferentes** no mesmo arquivo:

```
text-gray-900 / text-gray-600 / bg-gray-50         ← Gray palette (CategoriasTab)
text-slate-900 / text-slate-600 / bg-slate-50       ← Slate palette (TreinamentosPlanejadosPage)
text-primary / bg-primary / border-primary          ← Design tokens (Qualificacoes.tsx)
border-gray-200 / border-slate-200                  ← Dois tons de borda
```

**Exemplo concreto** — `Qualificacoes.tsx:2366`:
```tsx
// Container principal usa slate + dark mode
<div className="overflow-hidden rounded-lg border border-slate-200 bg-white 
     dark:border-slate-800 dark:bg-slate-900">
```

Mas `HistoricoTab.tsx:150` usa gray:
```tsx
<div className="bg-white rounded-lg p-4 border border-gray-200 space-y-4">
```

**Impacto:** Slate e Gray são muito próximos visualmente em light mode, mas em dark mode o comportamento diverge.

**Recomendação:** Padronizar em **slate** (já usado no container principal e no TreinamentosPlanejadosPage) ou **gray**. Preferência: slate, por ser o padrão Tailwind moderno.

### 1.3 Cores de ação nos botões de tabela

Os botões de ação usam cores inconsistentes para a mesma ação:

| Ação | HistoricoTab | Qualificacoes.tsx (main) |
|------|-------------|--------------------------|
| Editar | `text-indigo-600` | `text-slate-600` (sem cor) |
| Deletar | `text-red-600` | `text-red-600` ✓ |
| Renovar | `text-purple-600` | N/A |
| Upload | `text-green-600` / `text-gray-400` | N/A |
| Download | `text-primary` | N/A |

**Recomendação:** Padronizar cores semânticas:
- Editar: `text-blue-600` (ação primária)
- Deletar: `text-red-600` (perigosa)
- Visualizar/Download: `text-slate-600`
- Upload: `text-emerald-600` (quando tem arquivo) / `text-slate-400` (vazio)

---

## 2. Bugs Visuais 🟠

### 2.1 Botões do header sem padding horizontal

**Arquivo:** `QualificacoesHeader.tsx:58-61`

```tsx
// ❌ Espaço duplo entre "gap-2" e "py-2" — falta px-
<button className="flex items-center gap-2  py-2 bg-primary text-white rounded-lg ...">
  <Plus className="w-4 h-4" />
  Nova Qualificação
</button>
```

O botão "Nova Qualificação" e todos os outros no header têm `py-2` mas **não têm `px-`** — o padding horizontal depende apenas do gap entre ícone e texto, resultando em botões visualmente estreitos e desbalanceados.

**Correção:**
```tsx
// ✅ Padding horizontal explícito
<button className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg ...">
```

**Impacto:** Todos os botões do header (Nova Qualificação, Importar, Configurar Colunas, Exportar) são afetados.

### 2.2 Status badges com texto ilegível

**Arquivo:** `Qualificacoes.tsx:529-548` — `getTipoTreinamentoDisplay`

```tsx
// ❌ Contraste questionável
'SEMESTRAL': 'bg-emerald-100 text-emerald-800'  // OK (~7:1)
'INICIAL': 'bg-amber-100 text-amber-800'        // OK (~7:1)
'RECORRENTE': 'bg-sky-100 text-sky-800'         // OK (~7:1)
```

Os badges de tipo estão OK, mas os badges de status no HistoricoTab usam design tokens abstratos (`statusBadges.valid`, `statusBadges.expiring`, `statusBadges.expired`) cujo contraste não é verificável sem ver os tokens.

**Recomendação:** Verificar `src/react-app/styles/design-tokens.ts` para garantir que todos os status badges tenham contraste ≥ 4.5:1.

### 2.3 Botão "Limpar Filtros" usa ícone RotateCcw (recarregar) em vez de X

**Arquivo:** `HistoricoTab.tsx:188` e `CategoriasTab.tsx:118`

```tsx
// ❌ Ícone de "recarregar" para ação de "limpar"
<Button variant="ghost" size="sm" onClick={limparFiltros}>
  <RotateCcw className="w-4 h-4 mr-2" />
  Limpar Filtros
</Button>
```

`RotateCcw` significa "refazer/recarregar". Para "limpar filtros", o ícone correto seria `X` ou `Eraser`.

**Recomendação:** Trocar para `X` (lucide-react) com aria-label="Limpar filtros".

---

## 3. Acessibilidade 🟠

### 3.1 Icon buttons sem aria-label

**Arquivo:** `HistoricoTab.tsx:211-263` (todos os botões de ação na VirtualTable)

```tsx
// ✅ Tem title, mas não tem aria-label
<button
  type="button"
  onClick={() => onRenovar?.(hab)}
  title="Renovar"
  className={tableActionButtonClass}
>
  <RotateCcw className="w-4 h-4 text-purple-600" />
</button>
```

`title` **não é substituto para `aria-label`** em leitores de tela. O comportamento com `title` varia entre screen readers.

**Recomendação:** Adicionar `aria-label="Renovar qualificação"` em TODOS os icon buttons. Isso afeta ~30 botões no HistoricoTab e ~15 na tabela Quadro.

### 3.2 Cores como único indicador visual

**Arquivo:** `HistoricoTab.tsx:324-337` — Dias Restantes

```tsx
// ❌ Cor como único indicador de estado
<span className={`font-medium ${
  hab.dias_restantes && hab.dias_restantes < 0 ? 'text-red-600' 
  : hab.dias_restantes && hab.dias_restantes <= 30 ? 'text-yellow-600' 
  : 'text-green-600'
}`}>
  {hab.dias_restantes !== null ? `${hab.dias_restantes} d` : '-'}
</span>
```

Usuários daltônicos não distinguem vermelho/amarelo/verde apenas por cor.

**Recomendação:** Adicionar ícone ou prefixo textual:
- `< 0`: 🔴 "Vencido há X d" ou ícone `AlertCircle`
- `≤ 30`: 🟡 "X d restantes" ou ícone `Clock`
- `> 30`: 🟢 "X d" ou ícone `CheckCircle2`

### 3.3 Focus visible ausente em vários elementos

O código tem `focus:outline-none` sem `focus-visible:ring-*` compensatório em múltiplos lugares:

**Arquivo:** `HistoricoTab.tsx:164`
```tsx
// ❌ Tem focus:ring mas o outline-none remove o fallback do browser
className="... focus:outline-none focus:ring-2 focus:ring-primary/50"
```

Isso está OK porque tem `focus:ring-2`. Mas em `CategoriasTab.tsx:111`:
```tsx
// ✅ Correto — tem focus:outline-none + focus:ring-2
className="... focus:outline-none focus:ring-2 focus:ring-primary/50"
```

**Verificar:** `QualificacoesHeader.tsx` — os botões do header (linhas 58-91) **não têm focus-visible**. São `<button>` nativos, então o fallback do browser funciona, mas não é consistente com o resto do design system.

### 3.4 Form labels com `for` vs `htmlFor`

**Arquivo:** `HistoricoTab.tsx:156`, `CategoriasTab.tsx:103`

```tsx
// ❌ Label sem htmlFor — não associa ao input
<label className="block text-sm font-medium text-gray-700 mb-2">Funcionário</label>
<input ... />
```

**Recomendação:** Adicionar `htmlFor` + `id` no input, ou envolver o input dentro do label.

---

## 4. Densidade de Informação e Layout 🟡

### 4.1 KPI Cards — bom design, execução inconsistente

**`QualificacoesHeader.tsx:37-54`** — Stats cards:
```tsx
<div className="card card-neutral rounded-lg p-4">
  <div className="text-sm text-gray-600">Total</div>
  <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
</div>
```

Vs. **`TreinamentosPlanejadosPage.tsx:545-569`** — `StatCard`:
```tsx
<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
  <div className="flex items-start justify-between gap-3">
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{helper}</p>
    </div>
    <div className="rounded-xl bg-slate-100 p-2 text-slate-600">{icon}</div>
  </div>
</div>
```

**Dois estilos diferentes** para a mesma função (KPI cards). O `StatCard` é superior: tem ícone, texto auxiliar (helper), cantos mais arredondados, e tipografia mais refinada.

**Recomendação:** Refatorar `QualificacoesHeader` para usar `StatCard` com ícones consistentes.

### 4.2 Ações por linha — densidade excessiva

A tabela de Histórico mostra até **5 botões de ação por linha** (Renovar, Download, Upload, Editar, Deletar), cada um com `h-9 w-9`. Isso ocupa 180px+ de largura só em ações.

**Recomendação:** Agrupar ações secundárias em um dropdown "..." (menu de contexto), mantendo apenas 2-3 ações primárias visíveis:
- Sempre visível: Editar
- Dropdown: Renovar, Download Certificado, Upload Certificado, Deletar
- Ou usar `DropdownMenu` do shadcn/ui

### 4.3 Filtro de Status como dropdown multi-select sem indicador visual claro

**Arquivo:** `Qualificacoes.tsx` — O status dropdown multi-select não tem indicador de quantos filtros estão ativos, forçando o usuário a abrir o dropdown para ver.

**Recomendação:** Adicionar badge com contagem: `Status (3)` ou pills dos status selecionados abaixo do dropdown.

### 4.4 Summary chips nos Planejados — excelente padrão

**Arquivo:** `TreinamentosPlanejadosPage.tsx:1397-1428`

As pills de resumo com ícones são um exemplo de **bom design**: ícone + label + valor, cores semânticas, acessíveis (ícone + cor). ✅

---

## 5. Hierarquia Visual e Navegação 🟡

### 5.1 Tabs principais vs sub-tabs — hierarquia confusa

```
┌─ Qualificações e Treinamentos ─────────────────────────────┐
│ [Histórico] [Treinamentos Planejados] [Modelos] [Categorias] │  ← Tab principal
│                                                              │
│ ┌─ Planejamento e Gestão de Treinamentos ────────────────┐  │
│ │ [Calendário] [Quadro] [Auditoria]                       │  │  ← Sub-tab
│ └─────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**Problema:** Os sub-tabs (Calendário/Quadro/Auditoria) têm estilo **mais proeminente** que as tabs principais:
- Sub-tabs: `rounded-2xl`, `bg-primary-600 text-white`, `shadow-sm`, `font-semibold`, `min-h-[44px]`
- Tabs principais: `rounded-md`, `bg-blue-50 text-blue-600`, `text-sm`

Isso faz o sub-tab parecer mais importante que o tab principal.

**Recomendação:** Inverter hierarquia visual — tabs principais devem ter mais peso visual que sub-tabs. Ou usar underline tabs para sub-navegação (padrão GitHub/Linear).

### 5.2 Filtros com seção dedicada vs inline

| Aba | Estilo de filtro |
|-----|-----------------|
| Histórico | Chips de status inline no topo + search bar na tab bar |
| Categorias | Seção "Filtros" com card dedicado |
| Planejados | Grid de 4 campos inline (mês, status, instrutor, busca) |

**Recomendação:** Padronizar: usar filtros inline na barra superior (como Planejados) para todas as abas. O card "Filtros" do Categorias adiciona clutter desnecessário para 1 campo.

---

## 6. Tipografia 🟢

### 6.1 Mix de font-weight em cabeçalhos

- `HistoricoTab`: `font-semibold` no título "Filtros" (linha 151)
- `CategoriasTab`: `font-semibold` no título "Categorias (N)" (linha 71)
- `TreinamentosPlanejadosPage`: `font-semibold` + `uppercase tracking-[0.12em]` nos headers da tabela (linha 1678)

**Recomendação:** Padronizar headings — `font-semibold` para títulos de seção, `font-medium` para labels de filtro.

### 6.2 Tamanhos de fonte nos filtros

- `HistoricoTab`: labels `text-sm` (14px)
- `CategoriasTab`: labels `text-sm` (14px)
- `TreinamentosPlanejadosPage`: labels `text-sm font-medium` (14px medium)

Consistente ✅

---

## 7. Feedback e Estados 🟢

### 7.1 Loading states — cobertura boa

- Spinner centralizado: `HistoricoTab:131-134`, `CategoriasTab:46-52` ✅
- "Carregando turmas..." texto: `TreinamentosPlanejadosPage:1645` ✅
- Botões disabled durante operações assíncronas: `salvandoTurmaPlanejada` ✅
- Skeleton ausente — usa spinner em vez de skeleton

**Recomendação:** Para tabelas com dados conhecidos (ex: colunas fixas), usar skeleton rows em vez de spinner para reduzir percepção de latência.

### 7.2 Empty states — bem implementados

- `EmptyState` com ícone, título, descrição e ação CTA ✅
- Mensagens contextuais: "Nenhum registro encontrado com os filtros aplicados" vs "Nenhuma qualificação encontrada" ✅
- Diferencia entre "sem dados" e "filtros esconderam tudo" (linha 2886) ✅

### 7.3 Error states — cobertura parcial

- `TreinamentosPlanejadosPage` mostra erro com botão "Tentar novamente" ✅
- `Qualificacoes.tsx` captura `historicoError` mas o tratamento visual não está visível no código lido

**Verificar:** Se erros de API no Histórico mostram toast + estado visual na tabela.

---

## 8. Responsividade 🟢

### 8.1 Tabelas com scroll horizontal

Todas as tabelas têm `overflow-x-auto` ✅

### 8.2 Touch targets

- Botões de ação: `h-9 w-9` (36px) — ❌ Abaixo do mínimo recomendado de 44px
- Botões principais: `min-h-[44px]` nos Planejados ✅
- Sub-tabs: `min-h-[44px]` ✅

**Recomendação:** Aumentar botões de ação na tabela para `min-h-[44px] min-w-[44px]`.

### 8.3 Grid de filtros

- `grid-cols-1 md:grid-cols-2` ✅
- `lg:grid-cols-[1.2fr,0.9fr,0.9fr,1.1fr]` nos Planejados ✅

---

## 9. Performance Percebida 🟢

### 9.1 Bem implementado

- `VirtualTable` para >100 itens ✅
- `useDebounce` 300ms nos filtros ✅
- `lazyWithRetry` para modais ✅
- `useDeferredValue` para busca nos Planejados ✅
- `useMemo` para filtros e dados derivados ✅

---

## 10. Resumo de Ações Recomendadas

### 🔴 Imediatas (este sprint)

| # | Ação | Arquivo | Esforço |
|---|------|---------|---------|
| 1 | Corrigir padding horizontal dos botões do header | `QualificacoesHeader.tsx:58-91` | 5 min |
| 2 | Adicionar `aria-label` em todos icon buttons | `HistoricoTab.tsx`, tabela Quadro | 30 min |
| 3 | Trocar `RotateCcw` por `X` no botão Limpar Filtros | `HistoricoTab.tsx:188`, `CategoriasTab.tsx:118` | 5 min |
| 4 | Adicionar ícone/texto nos dias restantes (não só cor) | `HistoricoTab.tsx:324-337` | 15 min |

### 🟠 Curto prazo (próximo sprint)

| # | Ação | Esforço |
|---|------|---------|
| 5 | Padronizar gray → slate em todos os componentes | 2h |
| 6 | Unificar estilos de tabela (usar DataTable shared) | 4h |
| 7 | Padronizar KPI cards (usar StatCard) | 1h |
| 8 | Agrupar ações secundárias em dropdown menu | 3h |
| 9 | Adicionar badge de contagem no filtro de status | 1h |
| 10 | Inverter hierarquia visual tabs principais vs sub-tabs | 1h |

### 🟡 Médio prazo

| # | Ação | Esforço |
|---|------|---------|
| 11 | Skeleton loading para tabelas | 2h |
| 12 | Padronizar seção de filtros (inline, não card) | 3h |
| 13 | Aumentar touch targets para 44px mínimo | 1h |
| 14 | Verificar contraste de todos os status badges | 1h |

---

## 11. O Que Já Está Excelente ✅

1. **Performance**: VirtualTable, lazy loading, debounce, useDeferredValue — implementação de alto nível
2. **Empty states**: Contextuais, com ações, diferenciando "sem dados" de "filtrado"
3. **Persistência de preferências**: Tabs, filtros, ordenação salvos em localStorage
4. **Summary chips** nos Planejados: Ícones + cores semânticas + valores
5. **Calendário**: Navegação por mês, células com eventos, indicador de "hoje"
6. **Convocação flow**: Preview antes de enviar, reenvio com confirmação, gestores CC
7. **Edge cases**: URL params, migração de legacy tabs, highlightedHistoricoId
8. **Dark mode**: Suporte parcial no container principal (slate dark tokens)
9. **Form labels**: Sempre presentes (não dependem só de placeholder)
10. **Erro states**: Com botão "Tentar novamente" nos Planejados

---

*Relatório gerado com UI/UX Pro Max design intelligence + análise manual de código.*
