# 🎨 DESIGN SYSTEM AIRTRUST - ANÁLISE COMPLETA

**Data**: 01/12/2025 17:30  
**Objetivo**: Documentar o design system existente e aplicá-lo em Simuladores

---

## 📊 SUMÁRIO EXECUTIVO

✅ **DESIGN SYSTEM ENCONTRADO**: AirTrust possui um design system completo em `/src/react-app/components/UI/`

### **Padrão Atual:**

- **Funcionários**: ✅ Usa Design System completo
- **Qualificações**: ⚠️ Usa padrão antigo (cards inline, sem componentes)
- **Simuladores**: ⚠️ Usa padrão customizado (SimuladoresLayout, SimuladoresCard)

### **Recomendação:**

🎯 **Migrar Simuladores para usar os componentes UI existentes** (mesmo padrão de Funcionários)

---

## 🔍 COMPONENTES DO DESIGN SYSTEM

### **1. Tailwind Config** (`/tailwind.config.js`)

```javascript
// CORES PRINCIPAIS
colors: {
  primary: {
    DEFAULT: '#0052cc',    // Azul AirTrust
    600: '#0052cc',
    500: '#0066ff',
  },
  success: {
    DEFAULT: '#16a34a',    // Verde
    600: '#16a34a',
  },
  warning: {
    DEFAULT: '#f59e0b',    // Amarelo/Laranja
  },
  danger: {
    600: '#ef4444',        // Vermelho
  },
  critical: {
    DEFAULT: '#dc2626',    // Vermelho crítico
  }
}

// FAMÍLIA DE FONTES
fontFamily: {
  display: ['Inter', 'sans-serif'],
  sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
}

// BORDER RADIUS
borderRadius: {
  DEFAULT: '0.5rem',       // 8px padrão
  lg: '0.75rem',           // 12px
  xl: '1rem',              // 16px
}
```

---

### **2. Componentes UI** (`/src/react-app/components/UI/`)

#### **A) PageHeader** ✅ (usado em Funcionários)

```tsx
import { PageHeader } from '@/react-app/components/UI';

<PageHeader
  title="Funcionários"
  description="Gerencie informações, documentos e histórico"
  action={
    <div className="flex gap-2">
      <UIButton onClick={...}>
        <Plus size={16} className="mr-2" />
        Novo Funcionário
      </UIButton>
    </div>
  }
/>
```

**Características:**

- Título h1 com `text-3xl font-bold text-slate-900`
- Descrição com `text-sm text-slate-600`
- Suporta breadcrumbs
- Ações à direita (botões, dropdowns)

---

#### **B) Tabs** ✅ (usado em Funcionários)

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/react-app/components/UI';

<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList className="mb-6 border-b">
    <TabsTrigger value="lista">Lista</TabsTrigger>
    <TabsTrigger value="cadastros">Cadastros</TabsTrigger>
  </TabsList>

  <TabsContent value="lista">{/* Conteúdo */}</TabsContent>
</Tabs>;
```

---

#### **C) Button** ✅

```tsx
import { Button } from '@/react-app/components/UI';

// Variantes disponíveis
<Button variant="primary">Salvar</Button>
<Button variant="secondary">Cancelar</Button>
<Button variant="success">Aprovar</Button>
<Button variant="warning">Atenção</Button>
<Button variant="error">Excluir</Button>
<Button variant="ghost">Link</Button>

// Tamanhos
<Button size="sm">Pequeno</Button>
<Button size="lg">Grande</Button>
```

---

#### **D) Card** ✅

```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/react-app/components/UI';

<Card>
  <CardHeader>
    <CardTitle>Título do Card</CardTitle>
  </CardHeader>
  <CardContent>{/* Conteúdo */}</CardContent>
</Card>;
```

---

#### **E) Badge** ✅

```tsx
import { Badge } from '@/react-app/components/UI';

<Badge variant="success">Ativo</Badge>
<Badge variant="warning">Vencendo</Badge>
<Badge variant="error">Vencido</Badge>
<Badge variant="info">Info</Badge>
```

---

#### **F) StatCard** ⚠️ (existe mas não é usado)

```tsx
import { StatCard } from '@/react-app/components/UI';

<StatCard label="Total de Simuladores" value={42} icon={Plane} color="blue" />;
```

**Status:** Componente existe em `/src/react-app/components/UI/StatCard.tsx` mas **não está exportado** no `index.ts`

---

#### **G) Table** ✅

```tsx
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/react-app/components/UI';

<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Nome</TableHead>
      <TableHead>Status</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>João</TableCell>
      <TableCell>
        <Badge variant="success">Ativo</Badge>
      </TableCell>
    </TableRow>
  </TableBody>
</Table>;
```

---

#### **H) EmptyState** ✅

```tsx
import { EmptyState } from '@/react-app/components/UI';

<EmptyState
  icon={FolderOpen}
  title="Nenhum resultado encontrado"
  description="Tente ajustar os filtros ou adicionar novos dados"
  action={<Button>Adicionar</Button>}
/>;
```

---

## 🆚 COMPARAÇÃO: FUNCIONÁRIOS vs QUALIFICAÇÕES vs SIMULADORES

### **FUNCIONÁRIOS** (Padrão Moderno - FASE 2) ✅

**Arquivo:** `/src/react-app/pages/funcionarios/FuncionariosWrapper.tsx`

**Imports:**

```tsx
import {
  PageHeader,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Button as UIButton,
} from '@/react-app/components/UI';
```

**Estrutura:**

```tsx
<div className="min-h-screen bg-background-light">
  {/* Header fixo */}
  <div className="border-b border-slate-200 bg-white sticky top-0 z-10">
    <div className="container mx-auto px-4 md:px-8 py-6">
      <PageHeader title="..." description="..." action={...} />
    </div>
  </div>

  {/* Conteúdo */}
  <main className="container mx-auto px-4 md:px-8 py-8">
    <Tabs>
      <TabsList>
        <TabsTrigger value="lista">Lista</TabsTrigger>
      </TabsList>
      <TabsContent value="lista">
        {/* Conteúdo da tab */}
      </TabsContent>
    </Tabs>
  </main>
</div>
```

**Características:**

- ✅ Usa `PageHeader` do Design System
- ✅ Usa `Tabs` do Design System
- ✅ Usa `Button` do Design System
- ✅ Container responsivo (`container mx-auto px-4 md:px-8`)
- ✅ Header sticky (`sticky top-0 z-10`)
- ✅ Background light (`bg-background-light`)

---

### **QUALIFICAÇÕES** (Padrão Antigo) ⚠️

**Arquivo:** `/src/react-app/pages/qualificacoes/Dashboard.tsx`

**Imports:**

```tsx
import { Award, CheckCircle, Clock, XCircle } from 'lucide-react';
// NÃO importa componentes do Design System
```

**Estrutura:**

```tsx
<div className="space-y-6">
  {/* Stats Cards - INLINE (não usa componente) */}
  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
    <div className="bg-white p-6 rounded-lg shadow border-l-4 border-primary">
      <Award className="w-8 h-8 text-primary mb-2" />
      <div className="text-2xl font-bold">{stats.total}</div>
      <p className="text-sm text-gray-600">Total</p>
    </div>
  </div>
</div>
```

**Características:**

- ❌ NÃO usa `PageHeader`
- ❌ Cards inline (não usa componente `Card`)
- ❌ Estilos Tailwind diretos
- ⚠️ Funciona mas não é reutilizável

---

### **SIMULADORES** (Padrão Customizado) ⚠️

**Arquivo:** `/src/react-app/components/layout/SimuladoresLayout.tsx`

**Imports:**

```tsx
import { ArrowLeft } from 'lucide-react';
// Componentes customizados próprios
```

**Estrutura:**

```tsx
<div className="min-h-screen bg-slate-50">
  {/* Header customizado */}
  <div className="bg-white border-b border-slate-200 shadow-sm">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center gap-4">
        {backUrl && (
          <button onClick={() => navigate(backUrl)}>
            <ArrowLeft className="w-6 h-6" />
          </button>
        )}
        {typeof icon === 'function' && React.createElement(icon)}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="text-sm text-slate-600">{subtitle}</p>}
        </div>
      </div>
    </div>
  </div>

  {/* Conteúdo */}
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</div>
</div>
```

**Características:**

- ⚠️ Layout funcional mas diferente do padrão
- ⚠️ Usa `max-w-7xl` ao invés de `container`
- ⚠️ Usa `sm:px-6 lg:px-8` ao invés de `md:px-8`
- ⚠️ Título `text-2xl` ao invés de `text-3xl`
- ✅ Bom suporte a loading e ícones
- ❌ NÃO tem suporte a breadcrumbs ou actions complexas

---

## 🎯 ESTRATÉGIA DE MIGRAÇÃO

### **OPÇÃO 1: Migração Completa (RECOMENDADO)** ✅

**Substituir componentes de Simuladores pelos componentes UI:**

```tsx
// ANTES (Simuladores customizado)
import { SimuladoresLayout } from '@/components/layout/SimuladoresLayout';

<SimuladoresLayout
  title="Simuladores"
  subtitle="Gerencie simuladores e sessões"
  icon={Plane}
  backUrl="/dashboard"
>
  {/* conteúdo */}
</SimuladoresLayout>

// DEPOIS (Design System padrão)
import { PageHeader, Tabs, TabsList, TabsTrigger } from '@/react-app/components/UI';

<div className="min-h-screen bg-background-light">
  <div className="border-b border-slate-200 bg-white sticky top-0 z-10">
    <div className="container mx-auto px-4 md:px-8 py-6">
      <PageHeader
        title="Simuladores"
        description="Gerencie simuladores e sessões de treinamento"
        breadcrumbs={
          <nav className="flex items-center gap-2 text-sm text-slate-600">
            <a href="/dashboard">Dashboard</a>
            <span>/</span>
            <span className="text-slate-900">Simuladores</span>
          </nav>
        }
        action={
          <Button onClick={...}>
            <Plus size={16} className="mr-2" />
            Nova Sessão
          </Button>
        }
      />
    </div>
  </div>

  <main className="container mx-auto px-4 md:px-8 py-8">
    <Tabs value={activeTab}>
      <TabsList>
        <TabsTrigger value="sessoes">Sessões</TabsTrigger>
        <TabsTrigger value="gestao">Gestão</TabsTrigger>
      </TabsList>
      <TabsContent value="sessoes">
        {/* conteúdo */}
      </TabsContent>
    </Tabs>
  </main>
</div>
```

---

### **OPÇÃO 2: Manter Compatibilidade** ⚠️

**Manter SimuladoresLayout mas alinhar estilos:**

```tsx
// Atualizar SimuladoresLayout para usar mesmos estilos
<div className="min-h-screen bg-background-light">
  <div className="border-b border-slate-200 bg-white sticky top-0 z-10">
    <div className="container mx-auto px-4 md:px-8 py-6">
      {/* usar mesmos estilos que PageHeader */}
      <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
    </div>
  </div>
</div>
```

---

## ✅ PLANO DE AÇÃO

### **FASE 1: Exportar StatCard** (5 min)

```typescript
// src/react-app/components/UI/index.ts
export { StatCard } from './StatCard';
```

### **FASE 2: Migrar página principal Simuladores** (30 min)

**Arquivo:** `/src/react-app/pages/simuladores/index.tsx`

**Mudanças:**

1. Trocar `SimuladoresLayout` por estrutura padrão + `PageHeader`
2. Usar `Tabs` do Design System
3. Criar grid de stats com cards inline (como Qualificações) OU usar `StatCard`

### **FASE 3: Migrar sub-páginas** (1-2h)

**Páginas a migrar:**

- `/simuladores/cadastros/configuracoes/index.tsx`
- `/simuladores/sessoes/nova.tsx` (já parcialmente feito)
- `/simuladores/fichas/*`

### **FASE 4: Deprecar SimuladoresLayout** (opcional)

Mover para pasta `_deprecated` ou remover após migração completa.

---

## 📝 TEMPLATE PADRÃO AIRTRUST

### **Estrutura Base para TODAS as páginas:**

```tsx
import {
  PageHeader,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Button,
  Card,
  CardContent,
} from '@/react-app/components/UI';
import { Plus, Upload, Download } from 'lucide-react';

export default function MinhaPage() {
  const [activeTab, setActiveTab] = useState('lista');

  return (
    <div className="min-h-screen bg-background-light">
      {/* HEADER FIXO */}
      <div className="border-b border-slate-200 bg-white sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 md:px-8 py-6">
          <PageHeader
            title="Título da Página"
            description="Descrição breve do que a página faz"
            breadcrumbs={
              <nav className="flex items-center gap-2 text-sm text-slate-600">
                <a href="/dashboard" className="hover:text-primary">Dashboard</a>
                <span>/</span>
                <span className="text-slate-900">Título</span>
              </nav>
            }
            action={
              <div className="flex gap-2">
                <Button onClick={...}>
                  <Plus size={16} className="mr-2" />
                  Novo Item
                </Button>
                <Button variant="secondary">
                  <Upload size={16} className="mr-2" />
                  Importar
                </Button>
              </div>
            }
          />
        </div>
      </div>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="container mx-auto px-4 md:px-8 py-8">
        {/* STATS CARDS (opcional) */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Total</p>
                  <p className="text-2xl font-bold text-slate-900">42</p>
                </div>
                <Plus className="w-8 h-8 text-primary" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* TABS */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="lista">Lista</TabsTrigger>
            <TabsTrigger value="cadastros">Cadastros</TabsTrigger>
          </TabsList>

          <TabsContent value="lista">
            {/* Conteúdo da lista */}
          </TabsContent>

          <TabsContent value="cadastros">
            {/* Conteúdo dos cadastros */}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
```

---

## 🎨 CLASSES TAILWIND PADRÃO

### **Espaçamentos:**

```css
/* Container principal */
.container mx-auto px-4 md:px-8 py-6

/* Seções */
py-8        /* Padding vertical: 32px */
space-y-6   /* Gap vertical entre elementos: 24px */
gap-4       /* Gap em grid: 16px */

/* Cards */
p-6         /* Padding: 24px */
rounded-lg  /* Border radius: 12px */
shadow-sm   /* Sombra suave */
```

### **Tipografia:**

```css
/* Título principal */
text-3xl font-bold text-slate-900 tracking-tight

/* Subtítulo */
text-sm text-slate-600 mt-1

/* Labels */
text-sm font-medium text-slate-700 mb-2

/* Valores (stats) */
text-2xl font-bold text-slate-900
```

### **Cores:**

```css
/* Texto */
text-slate-900    /* Texto principal escuro */
text-slate-600    /* Texto secundário */
text-slate-500    /* Texto terciário */

/* Background */
bg-white          /* Cards, header */
bg-background-light /* #f9fafb - Fundo da página */
bg-slate-50       /* Alternativa ao background-light */

/* Bordas */
border-slate-200  /* Bordas suaves */
border-slate-300  /* Bordas inputs */
```

---

## 📊 COMPARAÇÃO VISUAL

### **Funcionários (Design System)** ✅

```
┌─────────────────────────────────────────────────────┐
│ 🏠 Dashboard / Funcionários                    [+] │ ← PageHeader
├─────────────────────────────────────────────────────┤
│ [ Lista ] [ Cadastros ] [ Importação ]              │ ← Tabs
├─────────────────────────────────────────────────────┤
│ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐            │
│ │ Total │ │ Ativos│ │Afastd │ │ Novos │            │ ← Stats Grid
│ │  142  │ │  135  │ │   5   │ │   2   │            │
│ └───────┘ └───────┘ └───────┘ └───────┘            │
├─────────────────────────────────────────────────────┤
│ 🔍 Buscar...              [🔽 Filtros] [⚙️ Colunas]│
├─────────────────────────────────────────────────────┤
│ Tabela com dados...                                 │
└─────────────────────────────────────────────────────┘
```

### **Simuladores (Atual - Customizado)** ⚠️

```
┌─────────────────────────────────────────────────────┐
│ ← 🎮 Simuladores                                    │ ← SimuladoresLayout
│   Gerencie simuladores e sessões                    │
├─────────────────────────────────────────────────────┤
│ [ Sessões ] [ Fichas ] [ Gestão ]                   │ ← Custom Tabs
├─────────────────────────────────────────────────────┤
│ Conteúdo específico da tab                          │
└─────────────────────────────────────────────────────┘
```

### **Simuladores (Futuro - Migrado)** ✅

```
┌─────────────────────────────────────────────────────┐
│ 🏠 Dashboard / Simuladores                     [+] │ ← PageHeader
├─────────────────────────────────────────────────────┤
│ [ Sessões ] [ Fichas ] [ Gestão ]                   │ ← Tabs (Design System)
├─────────────────────────────────────────────────────┤
│ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐            │
│ │Simuls │ │Sessões│ │Fichas │ │ Horas │            │ ← Stats Grid
│ │   8   │ │  142  │ │  256  │ │ 1.2k  │            │
│ └───────┘ └───────┘ └───────┘ └───────┘            │
├─────────────────────────────────────────────────────┤
│ Conteúdo da tab (lista, cards, etc)                 │
└─────────────────────────────────────────────────────┘
```

---

## ✅ CHECKLIST DE MIGRAÇÃO

### **Para cada página de Simuladores:**

- [ ] Trocar `SimuladoresLayout` por estrutura padrão
- [ ] Adicionar `PageHeader` com title, description, breadcrumbs, action
- [ ] Usar `Tabs` do Design System (se aplicável)
- [ ] Usar `Button` do Design System
- [ ] Usar `Card` do Design System para cards
- [ ] Usar `Badge` do Design System para status
- [ ] Aplicar classes Tailwind padrão (container, px-4 md:px-8, etc)
- [ ] Testar responsividade (mobile, tablet, desktop)
- [ ] Verificar header sticky (scroll comportamento)

---

## 🚀 PRÓXIMO PASSO

**Quer que eu execute a migração?**

**Opções:**

1. **Migração completa de Simuladores** (2-3 horas)

   - Migrar página principal `/simuladores`
   - Migrar todas sub-páginas
   - Deprecar SimuladoresLayout

2. **Migração incremental** (30 min cada)

   - Começar só pela página principal
   - Manter SimuladoresLayout para sub-páginas (por enquanto)

3. **Análise adicional**
   - Ver como outras páginas (Aeronaves, etc) estão estruturadas
   - Criar guia de migração mais detalhado

**Qual opção você prefere?** 🎯
