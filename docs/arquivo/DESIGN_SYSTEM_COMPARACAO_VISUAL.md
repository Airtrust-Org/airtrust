# 🎨 COMPARAÇÃO VISUAL: DESIGN SYSTEM AIRTRUST

**Data**: 01/12/2025  
**Objetivo**: Mostrar diferenças visuais entre os padrões

---

## 📊 FUNCIONÁRIOS (Design System Padrão) ✅

### **Layout:**
```
┌──────────────────────────────────────────────────────────────┐
│ 🏠 Dashboard / Funcionários            [+ Novo] [↑] [↓ CSV] │ ← HEADER STICKY
├──────────────────────────────────────────────────────────────┤
│ Gerencie informações, documentos e histórico                 │ ← Descrição
├──────────────────────────────────────────────────────────────┤
│                                                               │
│ [ Lista ] [ Cadastros ] [ Importação ]                       │ ← TABS (Design System)
│ ▔▔▔▔▔▔▔                                                      │
│                                                               │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐│
│ │👥 Total    │ │✅ Ativos   │ │⚠️  Afastado│ │🆕 Novos    ││ ← STATS GRID
│ │    142     │ │    135     │ │     5      │ │     2      ││   (4 colunas)
│ └────────────┘ └────────────┘ └────────────┘ └────────────┘│
│                                                               │
│ 🔍 Buscar...                     [🔽 Filtros] [⚙️ Colunas]  │ ← SEARCH BAR
│                                                               │
│ ╔═══════════════════════════════════════════════════════╗   │
│ ║ Nome          │ Matrícula │ Status   │ Ações         ║   │ ← TABLE
│ ╠═══════════════════════════════════════════════════════╣   │
│ ║ João Silva    │ 1001      │ ✅ Ativo │ [👁️] [✏️] [🗑️]║   │
│ ║ Maria Santos  │ 1002      │ ✅ Ativo │ [👁️] [✏️] [🗑️]║   │
│ ╚═══════════════════════════════════════════════════════╝   │
│                                                               │
│ [ ← ] 1 2 3 4 5 [ → ]                            10/página  │ ← PAGINATION
└──────────────────────────────────────────────────────────────┘

container mx-auto px-4 md:px-8
```

### **Código:**
```tsx
<div className="min-h-screen bg-background-light">
  {/* HEADER STICKY */}
  <div className="border-b border-slate-200 bg-white sticky top-0 z-10 shadow-sm">
    <div className="container mx-auto px-4 md:px-8 py-6">
      <PageHeader
        title="Funcionários"
        description="Gerencie informações, documentos e histórico dos funcionários"
        action={
          <div className="flex gap-2">
            <Button><Plus /> Novo Funcionário</Button>
            <Button variant="secondary"><Upload /> Importar</Button>
            <a href={exportUrl}><Download /> Exportar CSV</a>
          </div>
        }
      />
    </div>
  </div>

  {/* CONTEÚDO */}
  <main className="container mx-auto px-4 md:px-8 py-8">
    <Tabs value={activeTab}>
      <TabsList>
        <TabsTrigger value="lista">Lista</TabsTrigger>
        <TabsTrigger value="cadastros">Cadastros</TabsTrigger>
      </TabsList>
      <TabsContent value="lista">
        {/* Stats + Tabela */}
      </TabsContent>
    </Tabs>
  </main>
</div>
```

---

## 📊 QUALIFICAÇÕES (Padrão Híbrido) ⚠️

### **Layout:**
```
┌──────────────────────────────────────────────────────────────┐
│ Qualificações                          [Importar] [Gráficos] │ ← Sem PageHeader
├──────────────────────────────────────────────────────────────┤
│                                                               │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐│
│ │🏆 Total    │ │✅ Válidas  │ │⏰ Vencendo │ │❌ Vencidas ││ ← STATS INLINE
│ │    256     │ │    180     │ │    42      │ │    34      ││   (não usa componente)
│ └────────────┘ └────────────┘ └────────────┘ └────────────┘│
│                                                               │
│ [ Qualificações ] [ Licenças ] [ Categorias ] [ Histórico ] │ ← TABS (inline)
│ ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔                                            │
│                                                               │
│ ╔═══════════════════════════════════════════════════════╗   │
│ ║ Funcionário │ Qualificação │ Venc.   │ Status        ║   │
│ ╠═══════════════════════════════════════════════════════╣   │
│ ║ João Silva  │ PP-MLTE      │ 30/12/25│ ✅ Válida    ║   │
│ ╚═══════════════════════════════════════════════════════╝   │
└──────────────────────────────────────────────────────────────┘

Sem container, padding variável
```

### **Código:**
```tsx
<div className="space-y-6">
  {/* BOTÕES NO TOPO (não usa PageHeader) */}
  <div className="flex justify-end gap-2">
    <button className="bg-green-600 ...">Importar</button>
    <button className="bg-primary ...">Gráficos</button>
  </div>

  {/* STATS INLINE (não usa componente) */}
  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
    <div className="bg-white p-6 rounded-lg shadow border-l-4 border-primary">
      <Award className="w-8 h-8 text-primary mb-2" />
      <div className="text-2xl font-bold">{stats.total}</div>
      <p className="text-sm text-gray-600">Total</p>
    </div>
    {/* Repete para cada stat */}
  </div>

  {/* TABS INLINE */}
  <div>
    <div className="border-b">
      <button className={activeTab === 'quals' ? 'active' : ''}>
        Qualificações
      </button>
    </div>
    {activeTab === 'quals' && <div>...</div>}
  </div>
</div>
```

---

## 📊 SIMULADORES (Padrão Customizado) ⚠️

### **Layout:**
```
┌──────────────────────────────────────────────────────────────┐
│ ← 🎮 Simuladores                                             │ ← SimuladoresLayout
│   Gerencie simuladores e sessões de treinamento              │   (customizado)
├──────────────────────────────────────────────────────────────┤
│                                                               │
│ [ Sessões ] [ Fichas ] [ Gestão ]                            │ ← TABS CUSTOM
│ ▔▔▔▔▔▔▔▔▔                                                   │
│                                                               │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ SimuladoresCard (padding customizado)                   │  │ ← SimuladoresCard
│ │                                                          │  │
│ │ Conteúdo da tab                                         │  │
│ │                                                          │  │
│ └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘

max-w-7xl mx-auto px-4 sm:px-6 lg:px-8
```

### **Código:**
```tsx
<SimuladoresLayout
  title="Simuladores"
  subtitle="Gerencie simuladores e sessões de treinamento"
  icon={Plane}
  backUrl="/dashboard"
  loading={loading}
>
  {/* Tabs customizadas */}
  <div className="mb-6">
    <div className="border-b border-slate-200">
      <nav className="flex space-x-8">
        <button className={tab === 'sessoes' ? 'border-b-2 border-primary' : ''}>
          Sessões
        </button>
      </nav>
    </div>
  </div>

  {/* Conteúdo */}
  <SimuladoresCard padding="lg">
    {children}
  </SimuladoresCard>
</SimuladoresLayout>
```

---

## 🔍 DIFERENÇAS PRINCIPAIS

### **1. Container**
```css
✅ Funcionários:  container mx-auto px-4 md:px-8
⚠️  Qualificações: sem container (padding variável)
⚠️  Simuladores:   max-w-7xl mx-auto px-4 sm:px-6 lg:px-8
```

### **2. Header**
```tsx
✅ Funcionários:  <PageHeader title="..." description="..." action={...} />
❌ Qualificações: <div>Título inline</div>
⚠️  Simuladores:   <SimuladoresLayout title="..." subtitle="..." icon={...} />
```

### **3. Tabs**
```tsx
✅ Funcionários:  <Tabs><TabsList><TabsTrigger>...</Tabs>
❌ Qualificações: <div className="border-b"><button>...</div>
⚠️  Simuladores:   <div className="flex space-x-8"><button>...</div>
```

### **4. Stats Cards**
```tsx
✅ Funcionários:  (não usa stats, mas usaria StatCard)
❌ Qualificações: <div className="bg-white p-6 rounded-lg...">...</div>
⚠️  Simuladores:   (não usa stats na principal)
```

### **5. Tipografia**
```css
✅ Funcionários:  text-3xl font-bold (título)
⚠️  Qualificações: text-lg font-semibold (título inline)
⚠️  Simuladores:   text-2xl font-bold (título)
```

---

## 📐 GRID DE STATS - COMPARAÇÃO

### **FUNCIONÁRIOS (se usasse StatCard):**
```tsx
<div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
  <StatCard label="Total" value={142} icon={Users} color="blue" />
  <StatCard label="Ativos" value={135} icon={CheckCircle} color="green" />
  <StatCard label="Afastados" value={5} icon={Clock} color="orange" />
  <StatCard label="Novos" value={2} icon={Plus} color="purple" />
</div>
```

### **QUALIFICAÇÕES (inline):**
```tsx
<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
  <div className="bg-white p-6 rounded-lg shadow border-l-4 border-primary">
    <div className="flex justify-between items-start">
      <div>
        <p className="text-sm text-gray-600">Total</p>
        <p className="text-2xl font-bold">{stats.total}</p>
      </div>
      <Award className="w-8 h-8 text-primary" />
    </div>
  </div>
  {/* Repete 3x */}
</div>
```

### **SIMULADORES (se usasse - FUTURO):**
```tsx
<div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
  <StatCard label="Simuladores" value={8} icon={Plane} color="blue" />
  <StatCard label="Sessões" value={142} icon={Calendar} color="green" />
  <StatCard label="Fichas" value={256} icon={FileText} color="purple" />
  <StatCard label="Horas" value="1.2k" icon={Clock} color="orange" />
</div>
```

---

## ✅ PADRÃO UNIFICADO (FUTURO)

### **Template para TODAS as páginas:**

```
┌──────────────────────────────────────────────────────────────┐
│ 🏠 Breadcrumb / Título da Página      [Botões de Ação]      │ ← PageHeader
├──────────────────────────────────────────────────────────────┤
│ Descrição breve do que a página faz                          │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│ [ Tab 1 ] [ Tab 2 ] [ Tab 3 ]                                │ ← Tabs (Design System)
│ ▔▔▔▔▔▔▔                                                      │
│                                                               │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│ │ Stat 1   │ │ Stat 2   │ │ Stat 3   │ │ Stat 4   │        │ ← StatCard
│ │   ###    │ │   ###    │ │   ###    │ │   ###    │        │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
│                                                               │
│ Conteúdo da tab (lista, cards, forms, etc)                   │
│                                                               │
└──────────────────────────────────────────────────────────────┘

✅ container mx-auto px-4 md:px-8
✅ bg-background-light
✅ Sticky header (top-0 z-10)
✅ Responsivo (md:, lg:)
```

---

## 🎯 CONCLUSÃO

**Padrão Atual:**
- ✅ **Funcionários**: 100% alinhado com Design System
- ⚠️ **Qualificações**: 50% alinhado (usa componentes mas não estrutura)
- ⚠️ **Simuladores**: Customizado (funcional mas diferente)

**Objetivo:**
🎯 **Unificar todos os módulos no padrão de Funcionários**

**Benefícios:**
- ✅ UX consistente
- ✅ Código reutilizável
- ✅ Manutenção facilitada
- ✅ Onboarding mais rápido

---

**Próximo passo:** Migrar Simuladores + Qualificações para padrão unificado! 🚀
