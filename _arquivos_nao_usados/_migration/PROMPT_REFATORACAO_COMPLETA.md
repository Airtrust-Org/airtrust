# PROMPT DE EXECUÇÃO: Refatoração Completa Layout Simuladores

**Status**: 🚀 Pronto para Executar  
**Progresso Atual**: 2/30 arquivos (6.7%)  
**Tempo Estimado**: 2-3 horas  
**Build Status**: ✅ 2.44s, 0 errors

---

## 🎯 OBJETIVO

Aplicar Design System AirTrust em **TODOS** os arquivos do módulo Simuladores.

**Arquivos já concluídos**:

- ✅ `index.tsx` (dashboard principal)
- ✅ Componentes Design System criados

**Pendentes**: 28 arquivos

---

## 📦 COMPONENTES DISPONÍVEIS

```tsx
import {
  SimuladoresLayout,
  SimuladoresCard,
  StatCard,
  Badge,
  EmptyState,
} from './components/SimuladoresLayout';
```

### 1. SimuladoresLayout

```tsx
<SimuladoresLayout
  title="Título da Página"
  subtitle="Descrição opcional"
  icon={<IconName className="w-8 h-8" />}
  loading={loading}
  backUrl="/path/to/back" // opcional
  actions={
    <div className="flex gap-3">
      <Button>Ação</Button>
    </div>
  }
>
  {/* conteúdo da página */}
</SimuladoresLayout>
```

### 2. StatCard (Estatísticas)

```tsx
<StatCard
  title="Nome da Métrica"
  value={valorNumerico}
  icon={<IconName className="w-6 h-6" />}
  variant="primary" | "success" | "warning" | "info" | "purple"
  trend={{ value: "+12%", isPositive: true }} // opcional
/>
```

**Variantes**:

- `primary`: Azul (total, geral)
- `success`: Verde (ativos, concluídos, aprovados)
- `warning`: Laranja (pendentes, aguardando)
- `info`: Ciano (agendados, em progresso)
- `purple`: Roxo (taxas, percentuais)

### 3. SimuladoresCard (Cards Genéricos)

```tsx
<SimuladoresCard
  padding="none" | "sm" | "md" | "lg"  // padrão: "md"
  hover={true}  // efeito hover
  onClick={() => navigate('/path')}  // opcional
  className="custom-classes"
>
  {/* conteúdo do card */}
</SimuladoresCard>
```

### 4. Badge (Status)

```tsx
<Badge
  variant="success" | "warning" | "error" | "info" | "neutral"
  size="sm" | "md"  // padrão: "md"
>
  Texto do Status
</Badge>
```

**Mapeamento típico**:

- `success`: ATIVO, CONCLUÍDO, APROVADO, ASSINADO
- `warning`: PENDENTE, AGUARDANDO, EM_PREENCHIMENTO
- `error`: INATIVO, CANCELADO, REPROVADO
- `info`: AGENDADO, EM_PROGRESSO
- `neutral`: OUTROS

### 5. EmptyState (Lista Vazia)

```tsx
<EmptyState
  icon={<IconName className="w-12 h-12" />}
  title="Nenhum item encontrado"
  description="Descrição opcional do que fazer"
  action={<Button onClick={() => {}}>Ação Principal</Button>}
/>
```

---

## 🔧 PADRÕES DE SUBSTITUIÇÃO

### Padrão 1: Header Manual → SimuladoresLayout

**ANTES**:

```tsx
return (
  <div className="p-8">
    <div className="flex justify-between items-center mb-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-gradient-to-r from-blue-500...">
          <Icon />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Título</h1>
          <p className="text-gray-600">Subtítulo</p>
        </div>
      </div>
      <div className="flex gap-3">
        <Button>Ação</Button>
      </div>
    </div>

    {/* conteúdo */}
  </div>
);
```

**DEPOIS**:

```tsx
return (
  <SimuladoresLayout
    title="Título"
    subtitle="Subtítulo"
    icon={<Icon className="w-8 h-8" />}
    actions={
      <div className="flex gap-3">
        <Button>Ação</Button>
      </div>
    }
  >
    {/* conteúdo */}
  </SimuladoresLayout>
);
```

### Padrão 2: Cards de Estatísticas → StatCard

**ANTES**:

```tsx
<div className="grid grid-cols-4 gap-4">
  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
    <div className="flex items-center gap-3">
      <Icon className="w-5 h-5 text-blue-600" />
      <div>
        <p className="text-sm text-blue-800">Total</p>
        <p className="text-2xl font-bold text-blue-900">{valor}</p>
      </div>
    </div>
  </div>
</div>
```

**DEPOIS**:

```tsx
<div className="grid grid-cols-4 gap-4">
  <StatCard title="Total" value={valor} icon={<Icon className="w-6 h-6" />} variant="primary" />
</div>
```

### Padrão 3: Cards de Lista → SimuladoresCard + Badge

**ANTES**:

```tsx
<div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg">
  <div className="flex justify-between items-start">
    <h3 className="font-semibold">Nome</h3>
    <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs">ATIVO</span>
  </div>
  <p className="text-gray-600">Detalhes</p>
</div>
```

**DEPOIS**:

```tsx
<SimuladoresCard hover padding="md">
  <div className="flex justify-between items-start">
    <h3 className="font-semibold">Nome</h3>
    <Badge variant="success">ATIVO</Badge>
  </div>
  <p className="text-gray-600">Detalhes</p>
</SimuladoresCard>
```

### Padrão 4: Estado Vazio → EmptyState

**ANTES**:

```tsx
{
  items.length === 0 && (
    <div className="text-center py-12">
      <Icon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
      <p className="text-gray-500">Nenhum item encontrado</p>
      <Button onClick={() => {}}>Adicionar</Button>
    </div>
  );
}
```

**DEPOIS**:

```tsx
{
  items.length === 0 && (
    <EmptyState
      icon={<Icon className="w-12 h-12" />}
      title="Nenhum item encontrado"
      description="Descrição opcional"
      action={<Button onClick={() => {}}>Adicionar</Button>}
    />
  );
}
```

---

## 📋 ARQUIVOS PARA REFATORAR (ORDEM DE EXECUÇÃO)

### Grupo 1: Cadastros Simples (Prioridade ALTA)

#### 1.1. `cadastros/equipamentos/index.tsx`

```tsx
// Adicionar no topo (após imports existentes):
import {
  SimuladoresLayout,
  SimuladoresCard,
  StatCard,
  Badge,
  EmptyState,
} from '../components/SimuladoresLayout';

// Refatorar:
// - Header → SimuladoresLayout (title="Equipamentos", icon=<Plane />)
// - Estatísticas → StatCard (3-4 cards)
// - Lista → SimuladoresCard + Badge
// - Vazio → EmptyState
```

#### 1.2. `cadastros/modelos/index.tsx`

```tsx
// Adicionar imports
// Refatorar:
// - Header → SimuladoresLayout (title="Modelos de Aeronave")
// - Lista → SimuladoresCard
// - Vazio → EmptyState
```

#### 1.3. `cadastros/categorias/index.tsx`

```tsx
// Adicionar imports
// Refatorar:
// - Header → SimuladoresLayout (title="Categorias")
// - Cards → SimuladoresCard
// - Badges de tipo → Badge component
```

#### 1.4. `cadastros/manobras/index.tsx`

```tsx
// Adicionar imports
// Refatorar:
// - Header → SimuladoresLayout (title="Manobras")
// - Lista → SimuladoresCard com Badge para dificuldade
// - Estatísticas → StatCard (total, por categoria)
```

#### 1.5. `cadastros/tipos-sessao/index.tsx`

```tsx
// Adicionar imports
// Refatorar:
// - Header → SimuladoresLayout (title="Tipos de Sessão")
// - Grid → SimuladoresCard
// - Badge para duração/tipo
```

#### 1.6. `cadastros/instrutores/index.tsx`

```tsx
// Adicionar imports
// Refatorar:
// - Header → SimuladoresLayout (title="Instrutores")
// - Estatísticas → StatCard (total, ativos)
// - Lista → SimuladoresCard + Badge (status)
```

#### 1.7. `cadastros/templates/index.tsx`

```tsx
// Adicionar imports
// Refatorar:
// - Header → SimuladoresLayout (title="Templates de Ficha")
// - Cards → SimuladoresCard
// - Badge para tipo de template
```

#### 1.8. `cadastros/configuracoes/index.tsx`

```tsx
// Adicionar imports
// Refatorar:
// - Header → SimuladoresLayout (title="Configurações")
// - Seções → SimuladoresCard com padding="lg"
```

### Grupo 2: Dashboard Secundário (Prioridade ALTA)

#### 2.1. `dashboard/SimuladoresDashboard.tsx`

```tsx
// Similar a index.tsx já refatorado
// Refatorar:
// - Layout wrapper → SimuladoresLayout
// - Todos os cards de estatísticas → StatCard
// - Cards de ações → SimuladoresCard com gradientes
// - Gráficos mantêm wrapper com SimuladoresCard
```

### Grupo 3: Sessões (Prioridade MÉDIA)

#### 3.1. `sessoes/index.tsx`

```tsx
// Adicionar imports
// Refatorar:
// - Header → SimuladoresLayout (title="Sessões")
// - Estatísticas → StatCard (agendadas, concluídas, canceladas)
// - Lista → SimuladoresCard + Badge (status)
// - Vazio → EmptyState
```

#### 3.2. `sessoes/nova.tsx`

```tsx
// Refatorar:
// - Header → SimuladoresLayout (title="Nova Sessão", backUrl)
// - Formulário → SimuladoresCard padding="lg"
```

#### 3.3. `sessoes/[id].tsx`

```tsx
// Refatorar:
// - Header → SimuladoresLayout (title="Detalhes da Sessão", backUrl)
// - Seções → SimuladoresCard
// - Status → Badge
```

### Grupo 4: Fichas (Prioridade MÉDIA)

#### 4.1. `fichas/index.tsx`

```tsx
// Adicionar imports
// Refatorar:
// - Header → SimuladoresLayout (title="Fichas de Avaliação")
// - Estatísticas → StatCard (4 cards como em tabs/Simuladores.tsx linha 542-641)
// - Lista → SimuladoresCard + Badge
// - Vazio → EmptyState
```

#### 4.2. `fichas/[id].tsx`

```tsx
// Refatorar:
// - Header → SimuladoresLayout (backUrl)
// - Seções → SimuladoresCard
// - Status assinatura → Badge
```

#### 4.3. `fichas/preencher/[id].tsx`

```tsx
// Refatorar:
// - Header → SimuladoresLayout
// - Form wrapper → SimuladoresCard padding="lg"
// - Status manobras → Badge
```

#### 4.4. `fichas/assinar/[id].tsx`

```tsx
// Refatorar:
// - Header → SimuladoresLayout
// - Visualização → SimuladoresCard
// - Status → Badge
```

### Grupo 5: Agenda e Relatórios (Prioridade BAIXA)

#### 5.1. `agenda/index.tsx`

```tsx
// Adicionar imports
// Refatorar:
// - Header → SimuladoresLayout (title="Agenda", icon=<Calendar />)
// - Filtros → SimuladoresCard
// - Cards de evento → SimuladoresCard + Badge
```

#### 5.2. `relatorios/index.tsx`

```tsx
// Adicionar imports
// Refatorar:
// - Header → SimuladoresLayout (title="Relatórios", icon=<BarChart3 />)
// - Cards de relatório → SimuladoresCard hover com ícone
```

#### 5.3. `relatorios/utilizacao.tsx`

```tsx
// Refatorar:
// - Header → SimuladoresLayout
// - Métricas → StatCard
// - Gráficos → SimuladoresCard
```

#### 5.4. `relatorios/instrutor.tsx`

```tsx
// Refatorar:
// - Header → SimuladoresLayout
// - Métricas do instrutor → StatCard
// - Detalhes → SimuladoresCard
```

### Grupo 6: Complexos (Prioridade BAIXA - Por Último)

#### 6.1. `tabs/Simuladores.tsx` (1029 linhas)

**ESTRATÉGIA**: Refatorar por seções

**Seção 1: TabSessoes (linhas 101-260)**

```tsx
// Estatísticas (4 cards) → StatCard
<div className="grid grid-cols-4 gap-4 mb-6">
  <StatCard title="Agendadas" value={X} icon={<Calendar />} variant="info" />
  <StatCard title="Concluídas" value={X} icon={<CheckCircle />} variant="success" />
  <StatCard title="Canceladas" value={X} icon={<AlertCircle />} variant="error" />
  <StatCard title="Taxa Sucesso" value={`${X}%`} icon={<TrendingUp />} variant="purple" />
</div>

// SessionCard → SimuladoresCard + Badge
<SimuladoresCard hover padding="md">
  <Badge variant={status === 'AGENDADO' ? 'info' : status === 'CONCLUIDO' ? 'success' : 'error'}>
    {status}
  </Badge>
</SimuladoresCard>

// Vazio → EmptyState
```

**Seção 2: TabFichas (linhas 448-690)**

```tsx
// Estatísticas (4 cards) → StatCard
<div className="grid grid-cols-4 gap-4 mb-6">
  <StatCard title="Em Preenchimento" value={X} icon={<Clock />} variant="warning" />
  <StatCard title="Aguardando Instrutor" value={X} icon={<UserCheck />} variant="info" />
  <StatCard title="Concluídas" value={X} icon={<CheckCircle />} variant="success" />
  <StatCard title="Taxa Aprovação" value={`${X}%`} icon={<TrendingUp />} variant="purple" />
</div>

// FichaCard → SimuladoresCard + Badge
```

**Seção 3: TabGestao (linhas 261-447)**

```tsx
// StatsCards → StatCard
// ManageCards → SimuladoresCard com gradientes (similar a index.tsx ações rápidas)
```

**Seção 4: Main Render (linhas 901-1029)**

```tsx
// Wrapper com tabs permanece AppLayout (não mudar)
// Apenas ajustar conteúdo interno de cada tab
```

#### 6.2. `cadastros/simuladores/crud-completo.tsx`

```tsx
// Refatorar:
// - Header → SimuladoresLayout
// - Tabela → mantém AdvancedDataTable
// - Wrapper da tabela → SimuladoresCard padding="none"
// - Estatísticas → StatCard
```

---

## ⚡ EXECUÇÃO AUTOMATIZADA

### Método 1: Um Arquivo Por Vez (Recomendado)

```bash
# Para cada arquivo da lista acima:

1. Abra o arquivo
2. Adicione imports (se não existir):
   import {
     SimuladoresLayout,
     SimuladoresCard,
     StatCard,
     Badge,
     EmptyState,
   } from '../components/SimuladoresLayout';  # ajuste .. conforme profundidade

3. Substitua padrões conforme descrito
4. Build test:
   npm run build

5. Se build OK, commit:
   git add -A
   git commit -m "refactor(simuladores): [nome-arquivo] com Design System ✅"
   git push origin fix/importacao-completa-limpeza
```

### Método 2: Batch (Grupos)

```bash
# Refatorar Grupo 1 (cadastros simples)
# ... aplicar refatorações em todos os 8 arquivos
npm run build
git commit -m "refactor(simuladores): cadastros com Design System (8 arquivos) ✅"

# Refatorar Grupo 2 (dashboard)
# ...
git commit -m "refactor(simuladores): dashboard secundário com Design System ✅"

# E assim por diante
```

---

## ✅ CHECKLIST POR ARQUIVO

Para cada arquivo refatorado, verificar:

- [ ] Imports dos componentes Design System adicionados
- [ ] Header convertido para `SimuladoresLayout`
- [ ] Estatísticas convertidas para `StatCard`
- [ ] Cards genéricos convertidos para `SimuladoresCard`
- [ ] Status inline convertidos para `Badge`
- [ ] Estado vazio convertido para `EmptyState`
- [ ] `npm run build` passa sem erros
- [ ] TypeScript 0 errors
- [ ] Commit feito e pushed

---

## 🎯 META FINAL

- **30 arquivos refatorados**
- **100% Design System adoption**
- **~500 linhas removidas** (código duplicado)
- **0 TypeScript errors**
- **Build time < 3s**
- **Todos commits pushed para GitHub**

---

## 📊 TRACKING

Ao completar cada arquivo, marcar aqui:

### Grupo 1: Cadastros Simples

- [ ] cadastros/equipamentos/index.tsx
- [ ] cadastros/modelos/index.tsx
- [ ] cadastros/categorias/index.tsx
- [ ] cadastros/manobras/index.tsx
- [ ] cadastros/tipos-sessao/index.tsx
- [ ] cadastros/instrutores/index.tsx
- [ ] cadastros/templates/index.tsx
- [ ] cadastros/configuracoes/index.tsx

### Grupo 2: Dashboard

- [ ] dashboard/SimuladoresDashboard.tsx

### Grupo 3: Sessões

- [ ] sessoes/index.tsx
- [ ] sessoes/nova.tsx
- [ ] sessoes/[id].tsx

### Grupo 4: Fichas

- [ ] fichas/index.tsx
- [ ] fichas/[id].tsx
- [ ] fichas/preencher/[id].tsx
- [ ] fichas/assinar/[id].tsx

### Grupo 5: Agenda e Relatórios

- [ ] agenda/index.tsx
- [ ] relatorios/index.tsx
- [ ] relatorios/utilizacao.tsx
- [ ] relatorios/instrutor.tsx

### Grupo 6: Complexos

- [ ] tabs/Simuladores.tsx (seção por seção)
- [ ] cadastros/simuladores/crud-completo.tsx

---

**PRONTO PARA EXECUTAR!** 🚀

Comece pelo Grupo 1 (cadastros simples), são arquivos pequenos e rápidos.
Cada arquivo leva ~5-10 minutos para refatorar.

**Tempo total estimado**: 2-3 horas para completar todos os 28 arquivos pendentes.
