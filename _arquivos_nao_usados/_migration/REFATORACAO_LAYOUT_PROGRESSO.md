# Refatoração Layout Simuladores - Progresso

**Última Atualização**: 2025-11-13 | **Status**: 🚧 Em Andamento

---

## 📊 RESUMO EXECUTIVO

| Métrica             | Valor       |
| ------------------- | ----------- |
| **Arquivos Totais** | ~30 páginas |
| **Concluídos**      | 2 (6.7%)    |
| **Em Progresso**    | 1           |
| **Pendentes**       | ~27         |
| **Build Time**      | 2.44s ✅    |
| **Errors**          | 0 ✅        |

---

## ✅ FASE 1: COMPONENTES (100% COMPLETO)

### Componentes Criados

- [x] **SimuladoresLayout** - Wrapper principal com header
- [x] **SimuladoresCard** - Card padronizado com hover
- [x] **StatCard** - Cards de estatísticas (5 variantes)
- [x] **Badge** - Badges de status (5 variantes)
- [x] **EmptyState** - Estado vazio padronizado

### Commit

```
e6919d29 - feat(simuladores): cria Design System components
990bf46d - docs(simuladores): relatório execução Fase 2
```

---

## 🚧 FASE 2: APLICAÇÃO (6.7% COMPLETO)

### ✅ 1. Dashboard Principal - `index.tsx` (COMPLETO)

**Status**: ✅ Concluído  
**Commit**: `1d59f5f1`  
**Linhas**: 444 (antes: 482)  
**Redução**: -38 linhas (-7.9%)

#### Mudanças Aplicadas

- ✅ Wrapper: `SimuladoresLayout` com title, subtitle, icon, actions, loading
- ✅ Estatísticas: 5 `StatCard` (total, ativos, sessões, fichas, taxa)
- ✅ Filtros: `SimuladoresCard` com padding="md"
- ✅ Grid: `SimuladoresCard` com `Badge` para status
- ✅ Estado vazio: `EmptyState` com ação
- ✅ Ações rápidas: 4 `SimuladoresCard` com gradientes
- ✅ Limpeza: Removido `getStatusColor`, import `Eye`

#### Build

```bash
✓ built in 2.44s
Simuladores-BxzVJTGz-minh51mv.js: 129.34 kB │ gzip: 38.66 kB
```

#### Antes vs Depois

```tsx
// ANTES: Manual, sem padronização
<div className="w-full py-8 max-w-7xl">
  <div className="flex flex-col sm:flex-row...">
    <Card className="p-6 bg-gradient-to-br from-blue-50...">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-blue-700">Total</p>
        <div className="p-3 bg-primary/100 rounded-lg">...</div>
      </div>
    </Card>
  </div>
</div>

// DEPOIS: Design System, padronizado
<SimuladoresLayout title="Simuladores" icon={...} actions={...} loading={loading}>
  <StatCard
    title="Total Simuladores"
    value={estatisticas.total_simuladores}
    icon={<Gamepad2 />}
    variant="primary"
  />
  <SimuladoresCard hover padding="md">
    <Badge variant="success">ATIVO</Badge>
  </SimuladoresCard>
</SimuladoresLayout>
```

---

### 🔄 2. Tabs Principal - `tabs/Simuladores.tsx` (EM PROGRESSO)

**Status**: 🔄 Em Progresso  
**Linhas**: 1029 (arquivo grande)  
**Complexidade**: Alta (3 tabs, múltiplos componentes internos)

#### Estrutura do Arquivo

```
Lines 1-100: Imports, Types (Simulador, Sessao, Ficha, Manobra)
Lines 101-199: Component TabSessoes
Lines 200-260: Component SessionCard
Lines 261-363: Component TabGestao
Lines 364-399: Component StatsCards
Lines 400-447: Component ManageCards
Lines 448-541: Component TabFichas
Lines 542-690: FichasTab com estatísticas
Lines 691-800: FichaCard component
Lines 801-900: Modal components
Lines 901-1029: Main render com tabs
```

#### Plano de Refatoração

**Etapa 1**: Header e Tabs (linhas 901-950)

- [ ] Adicionar imports dos componentes Design System
- [ ] Substituir AppLayout manual por template
- [ ] Usar `SimuladoresCard` para tab container

**Etapa 2**: TabSessoes (linhas 101-260)

- [ ] Estatísticas → `StatCard` (4 cards)
- [ ] SessionCard → `SimuladoresCard` com `Badge`
- [ ] Estado vazio → `EmptyState`

**Etapa 3**: TabFichas (linhas 448-690)

- [ ] Estatísticas → `StatCard` (4 cards: preenchimento, aguardando, concluídas, taxa)
- [ ] FichaCard → `SimuladoresCard` com `Badge`
- [ ] Estado vazio → `EmptyState`

**Etapa 4**: TabGestao (linhas 261-447)

- [ ] StatsCards → `StatCard` (simuladores, instrutores, alunos)
- [ ] ManageCards → `SimuladoresCard` com gradientes
- [ ] Padronizar botões e ícones

#### Complexidade Identificada

- **3 tabs distintas** (Sessões, Fichas, Gestão)
- **Múltiplos componentes internos** (SessionCard, FichaCard, StatsCards, ManageCards)
- **State management complexo** (loadings, filtros, modais)
- **Integração com AdvancedDataTable**
- **Modais de cadastro/edição**

---

### 📋 3. Pendentes (93.3%)

#### Prioridade Alta (críticas)

- [ ] `dashboard/SimuladoresDashboard.tsx` - Dashboard secundário
- [ ] `cadastros/equipamentos/index.tsx` - Lista equipamentos
- [ ] `cadastros/equipamentos/novo.tsx` - Novo equipamento
- [ ] `cadastros/equipamentos/[id].tsx` - Detalhes equipamento

#### Prioridade Média (cadastros)

- [ ] `cadastros/aeronaves/index.tsx`
- [ ] `cadastros/aeronaves/novo.tsx`
- [ ] `cadastros/bases/index.tsx`
- [ ] `cadastros/bases/novo.tsx`
- [ ] `cadastros/instrutores/index.tsx`
- [ ] `cadastros/instrutores/novo.tsx`
- [ ] `cadastros/alunos/index.tsx`
- [ ] `cadastros/alunos/novo.tsx`
- [ ] `cadastros/manobras/index.tsx`

#### Prioridade Baixa (outros)

- [ ] `sessoes/index.tsx`
- [ ] `sessoes/nova.tsx`
- [ ] `sessoes/[id].tsx`
- [ ] `fichas/index.tsx`
- [ ] `fichas/[id].tsx`
- [ ] `fichas/preencher/[id].tsx`
- [ ] `fichas/assinar/[id].tsx`
- [ ] `agenda/index.tsx`
- [ ] `relatorios/index.tsx`
- [ ] `relatorios/utilizacao.tsx`
- [ ] `relatorios/instrutor.tsx`
- [ ] `configuracoes/index.tsx`

---

## 📈 MÉTRICAS DE QUALIDADE

### Code Reduction

```
index.tsx:        -38 linhas (-7.9%)
Total esperado:   -500 linhas (-15% média)
```

### Build Performance

```
Antes:  2.42s
Agora:  2.44s (+0.02s, variação normal)
Bundle: 129.34 kB (sem mudança significativa)
```

### TypeScript Errors

```
Antes: 16 errors (Card não encontrado, JSX tags, CSS conflitos)
Depois: 0 errors ✅
```

### Design System Adoption

```
SimuladoresLayout:  1 uso ✅
SimuladoresCard:    7 usos ✅
StatCard:           5 usos ✅
Badge:              3 usos ✅
EmptyState:         1 uso ✅
```

---

## 🎯 PRÓXIMOS PASSOS

### Imediato (hoje)

1. ✅ ~~Refatorar `index.tsx`~~ (COMPLETO)
2. 🔄 Refatorar `tabs/Simuladores.tsx` (EM PROGRESSO)
   - Começar por imports e header
   - Depois TabSessoes
   - Depois TabFichas
   - Por último TabGestao

### Curto Prazo (esta semana)

3. Refatorar `dashboard/SimuladoresDashboard.tsx`
4. Refatorar cadastros principais (equipamentos, aeronaves)
5. Testar visualmente no browser

### Médio Prazo (próxima semana)

6. Refatorar cadastros secundários
7. Refatorar sessões e fichas
8. Refatorar agenda e relatórios

---

## 🔧 PADRÕES ESTABELECIDOS

### 1. Wrapper de Página

```tsx
<SimuladoresLayout
  title="Título"
  subtitle="Descrição"
  icon={<Icon className="w-8 h-8" />}
  actions={<Button>...</Button>}
  loading={loading}
  backUrl="/path" // opcional
>
  {/* conteúdo */}
</SimuladoresLayout>
```

### 2. Cards de Estatísticas

```tsx
<StatCard
  title="Título"
  value={numero}
  icon={<Icon className="w-6 h-6" />}
  variant="primary" | "success" | "warning" | "info" | "purple"
  trend={{ value: "+12%", isPositive: true }} // opcional
/>
```

### 3. Cards Genéricos

```tsx
<SimuladoresCard
  padding="none" | "sm" | "md" | "lg"
  hover={true}
  onClick={() => {}}
  className="custom-classes"
>
  {/* conteúdo */}
</SimuladoresCard>
```

### 4. Badges de Status

```tsx
<Badge
  variant="success" | "warning" | "error" | "info" | "neutral"
  size="sm" | "md"
>
  Texto
</Badge>
```

### 5. Estado Vazio

```tsx
<EmptyState
  icon={<Icon className="w-12 h-12" />}
  title="Título"
  description="Descrição opcional"
  action={<Button>Ação</Button>} // opcional
/>
```

---

## 📝 CHECKLIST DE REFATORAÇÃO

Para cada arquivo:

- [ ] Adicionar imports dos componentes Design System
- [ ] Substituir header manual por `SimuladoresLayout`
- [ ] Substituir cards de estatísticas por `StatCard`
- [ ] Substituir cards genéricos por `SimuladoresCard`
- [ ] Substituir badges inline por componente `Badge`
- [ ] Adicionar `EmptyState` quando aplicável
- [ ] Remover código duplicado (classes CSS, funções de cor)
- [ ] Testar build: `npm run build`
- [ ] Verificar TypeScript: 0 errors
- [ ] Commit: `refactor(simuladores): [arquivo] com Design System ✅`

---

## 🚀 COMANDOS ÚTEIS

### Build e Test

```bash
npm run build                    # Build completo
npm run dev:all                  # Dev mode (web + api)
```

### Git

```bash
git add -A
git commit -m "refactor(simuladores): [arquivo] com Design System ✅"
git push origin fix/importacao-completa-limpeza
```

### Verificar Componentes

```bash
# Ver estrutura do arquivo
wc -l src/react-app/pages/simuladores/tabs/Simuladores.tsx

# Buscar padrões antigos
grep -n "className=\".*bg-.*\"" src/react-app/pages/simuladores/tabs/Simuladores.tsx
grep -n "Card" src/react-app/pages/simuladores/tabs/Simuladores.tsx
```

---

**Gerado em**: 2025-11-13  
**Autor**: GitHub Copilot  
**Objetivo**: "termine tudo" - Refatoração completa do módulo Simuladores com Design System
