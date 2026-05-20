# Layout Global / AppLayout - Estrutura de Componentes

## VISÃO GERAL

O `<AppLayout>` é o componente raiz que envolve TODAS as páginas internas do AirTrust. Ele fornece:

1. **Sidebar** fixa à esquerda com navegação
2. **Topbar** fixa no topo com breadcrumb/busca/perfil
3. **Main Content** área rolável para o conteúdo da página

## ANATOMIA DO APPLAYOUT

```tsx
<AppLayout
  title="Nome da Página" // Para <title> do HTML
  currentPath="/funcionarios" // Para destacar menu ativo
>
  {/* Conteúdo da página aqui */}
  <PageHeader ... />
  <SummaryCards ... />
  <FilterBar ... />
  <DataTable ... />
</AppLayout>
```

---

## COMPONENTES PRINCIPAIS

### 1. `<AppLayout>`

**Responsabilidade:**

- Renderizar estrutura base (Sidebar + Topbar + Main)
- Gerenciar estado de sidebar (aberta/fechada em mobile)
- Definir `<title>` da página
- Prover contexto de navegação

**Props:**

```tsx
interface AppLayoutProps {
  children: React.ReactNode;
  title: string; // Título da página para <title>
  currentPath?: string; // Path atual para destacar no menu
}
```

**Estrutura HTML:**

```tsx
<div className="min-h-screen bg-gray-100">
  <Sidebar currentPath={currentPath} />

  <div className="ml-0 lg:ml-72 transition-all">
    <Topbar />

    <main className="px-6 py-8">
      <div className="max-w-7xl mx-auto space-y-6">{children}</div>
    </main>
  </div>
</div>
```

---

### 2. `<Sidebar>`

**Responsabilidade:**

- Exibir logo AirTrust
- Lista de menus com ícones
- Destacar item ativo
- Perfil do usuário no rodapé
- Colapsar em mobile

**Props:**

```tsx
interface SidebarProps {
  currentPath: string; // Para destacar item ativo
}
```

**Estrutura HTML:**

```tsx
<aside className="fixed left-0 top-0 h-screen w-72 bg-white border-r border-gray-200 p-6 z-40 overflow-y-auto">
  {/* Logo */}
  <div className="mb-8">
    <h1 className="text-2xl font-bold text-primary-600">AirTrust</h1>
    <p className="text-xs text-slate-500 mt-1">Sistema de Gestão</p>
  </div>

  {/* Navegação */}
  <nav className="space-y-1">
    <SidebarItem
      icon="dashboard"
      label="Dashboard"
      path="/dashboard"
      active={currentPath === '/dashboard'}
    />
    <SidebarItem
      icon="person"
      label="Funcionários"
      path="/funcionarios"
      active={currentPath.startsWith('/funcionarios')}
    />
    <SidebarItem
      icon="badge"
      label="Qualificações"
      path="/qualificacoes"
      active={currentPath.startsWith('/qualificacoes')}
    />
    {/* ... outros itens */}
  </nav>

  {/* Perfil (rodapé) */}
  <div className="absolute bottom-6 left-6 right-6 border-t border-gray-200 pt-4">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
        <span className="text-primary-600 font-semibold">FD</span>
      </div>
      <div>
        <p className="text-sm font-medium text-slate-900">Filipe Daumas</p>
        <p className="text-xs text-slate-500">Administrador</p>
      </div>
    </div>
  </div>
</aside>
```

**SidebarItem:**

```tsx
<a
  href={path}
  className={cn(
    'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
    active ? 'bg-primary-50 text-primary-600 font-medium' : 'text-slate-700 hover:bg-gray-50',
  )}
>
  <span className="material-symbols-outlined text-xl">{icon}</span>
  {label}
</a>
```

---

### 3. `<Topbar>`

**Responsabilidade:**

- Breadcrumb/título da seção
- Barra de busca global (opcional)
- Notificações
- Avatar + menu do usuário

**Estrutura HTML:**

```tsx
<header className="sticky top-0 h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between z-30">
  {/* Lado esquerdo: Breadcrumb */}
  <div className="flex items-center gap-2 text-sm text-slate-500">
    <span>Dashboard</span>
    <span className="material-symbols-outlined text-sm">chevron_right</span>
    <span className="text-slate-900 font-medium">Funcionários</span>
  </div>

  {/* Lado direito: Ações */}
  <div className="flex items-center gap-4">
    {/* Busca global (opcional) */}
    <div className="relative hidden md:block">
      <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-lg">
        search
      </span>
      <input
        type="text"
        placeholder="Buscar..."
        className="w-64 h-10 pl-10 pr-3 border border-gray-300 rounded-lg text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
      />
    </div>

    {/* Notificações */}
    <button className="relative p-2 text-slate-400 hover:text-slate-600 hover:bg-gray-50 rounded-lg">
      <span className="material-symbols-outlined">notifications</span>
      <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
    </button>

    {/* Avatar */}
    <button className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded-lg">
      <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
        <span className="text-primary-600 text-sm font-semibold">FD</span>
      </div>
      <span className="material-symbols-outlined text-slate-400">expand_more</span>
    </button>
  </div>
</header>
```

---

### 4. `<PageHeader>`

**Responsabilidade:**

- Título principal da página
- Subtítulo/descrição
- Botões de ação (Novo, Exportar, etc.)
- Breadcrumb (opcional, se não estiver no Topbar)

**Props:**

```tsx
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode; // Botões de ação
  breadcrumb?: string[]; // Ex: ["Dashboard", "Funcionários"]
}
```

**Estrutura HTML:**

```tsx
<div className="flex items-start justify-between">
  <div>
    {breadcrumb && (
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
        {breadcrumb.map((item, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="material-symbols-outlined text-sm">chevron_right</span>}
            <span className={i === breadcrumb.length - 1 ? 'text-slate-900 font-medium' : ''}>
              {item}
            </span>
          </React.Fragment>
        ))}
      </div>
    )}

    <h1 className="text-3xl font-bold text-slate-900">{title}</h1>

    {subtitle && <p className="text-sm text-slate-600 mt-2">{subtitle}</p>}
  </div>

  {actions && <div className="flex items-center gap-3">{actions}</div>}
</div>
```

---

### 5. `<SummaryCards>` / `<KPICard>`

**Responsabilidade:**

- Exibir métricas/KPIs importantes
- Grid responsivo (4 cols desktop → 1 col mobile)

**Props KPICard:**

```tsx
interface KPICardProps {
  label: string; // Ex: "Total Ativos"
  value: number | string; // Ex: 142 ou "94%"
  icon?: string; // Material Symbol
  color?: 'default' | 'success' | 'warning' | 'danger';
  trend?: string; // Ex: "+5% vs mês passado"
  trendDirection?: 'up' | 'down';
}
```

**Estrutura HTML:**

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
  <KPICard label="Total Funcionários" value={157} icon="person" />
  <KPICard
    label="Ativos"
    value={142}
    icon="check_circle"
    color="success"
    trend="+5%"
    trendDirection="up"
  />
  {/* ... mais cards */}
</div>
```

---

### 6. `<FilterBar>`

**Responsabilidade:**

- Inputs de filtro (texto, select, date)
- Botões Aplicar/Limpar
- Chips com filtros ativos (opcional)

**Props:**

```tsx
interface FilterBarProps {
  onApply: () => void;
  onClear: () => void;
  children: React.ReactNode; // Inputs de filtro
}
```

**Estrutura HTML:**

```tsx
<div className="bg-white border border-gray-200 rounded-lg p-4">
  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
    {/* Inputs de filtro */}
    <div className="relative">
      <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400">
        search
      </span>
      <input
        type="text"
        placeholder="Buscar por nome..."
        className="w-full h-10 pl-10 pr-3 border border-gray-300 rounded-lg"
      />
    </div>

    <select className="h-10 px-3 border border-gray-300 rounded-lg">
      <option>Todos os status</option>
      <option>Ativo</option>
      <option>Inativo</option>
    </select>

    <select className="h-10 px-3 border border-gray-300 rounded-lg">
      <option>Todos os cargos</option>
      <option>Piloto</option>
      <option>Mecânico</option>
    </select>

    <div className="flex items-center gap-2">
      <button
        onClick={onApply}
        className="h-10 px-4 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700"
      >
        Aplicar
      </button>
      <button onClick={onClear} className="h-10 px-4 text-slate-700 hover:bg-gray-50 rounded-lg">
        Limpar
      </button>
    </div>
  </div>

  {/* Chips de filtros ativos (opcional) */}
  <div className="flex items-center gap-2 mt-3">
    <span className="text-xs text-slate-500">Filtros ativos:</span>
    <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary-50 text-primary-700 text-xs rounded-full">
      Status: Ativo
      <button className="material-symbols-outlined text-sm">close</button>
    </span>
  </div>
</div>
```

---

### 7. `<DataTable>`

**Responsabilidade:**

- Renderizar tabela com dados
- Ações por linha (editar, excluir, visualizar)
- Paginação
- Ordenação (opcional)
- Estado vazio

**Props:**

```tsx
interface DataTableProps<T> {
  columns: Column<T>[]; // Definição de colunas
  data: T[]; // Array de dados
  pagination: PaginationInfo;
  onPageChange: (page: number) => void;
  emptyMessage?: string;
  loading?: boolean;
}

interface Column<T> {
  key: string;
  label: string;
  render?: (item: T) => React.ReactNode;
  sortable?: boolean;
}
```

**Estrutura HTML:**

```tsx
<div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
  <div className="overflow-x-auto">
    <table className="w-full">
      <thead className="bg-gray-50 border-b border-gray-200">
        <tr>
          <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
            Nome
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
            Matrícula
          </th>
          {/* ... outras colunas */}
          <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
            Ações
          </th>
        </tr>
      </thead>

      <tbody className="bg-white divide-y divide-gray-200">
        {data.map((item) => (
          <tr key={item.id} className="hover:bg-gray-50 transition-colors">
            <td className="px-6 py-4 text-sm text-slate-700">{item.nome}</td>
            <td className="px-6 py-4 text-sm text-slate-700">{item.matricula}</td>
            {/* ... outras células */}
            <td className="px-6 py-4 text-right">
              <div className="flex items-center justify-end gap-2">
                <button className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg">
                  <span className="material-symbols-outlined text-lg">edit</span>
                </button>
                <button className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                  <span className="material-symbols-outlined text-lg">delete</span>
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>

  {/* Paginação */}
  <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
    <p className="text-sm text-slate-600">
      Mostrando {pagination.offset + 1}-
      {Math.min(pagination.offset + pagination.limit, pagination.total)} de {pagination.total}{' '}
      resultados
    </p>

    <div className="flex items-center gap-2">
      <button
        disabled={pagination.page === 1}
        className="h-9 px-3 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Anterior
      </button>

      {[1, 2, 3, 4, 5].map((num) => (
        <button
          key={num}
          className={cn(
            'h-9 w-9 rounded-lg text-sm',
            num === pagination.page
              ? 'bg-primary-600 text-white'
              : 'border border-gray-300 hover:bg-gray-50',
          )}
        >
          {num}
        </button>
      ))}

      <button
        disabled={pagination.page === pagination.totalPages}
        className="h-9 px-3 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Próximo
      </button>
    </div>
  </div>
</div>
```

---

## PADRÃO DE COMPOSIÇÃO DE PÁGINA

### Página de Lista Completa

```tsx
// src/pages/Funcionarios.tsx
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { SummaryCards, KPICard } from '@/components/layout/SummaryCards';
import { FilterBar } from '@/components/layout/FilterBar';
import { DataTable } from '@/components/layout/DataTable';

export default function FuncionariosPage() {
  // ... hooks de dados, filtros, paginação

  return (
    <AppLayout title="Funcionários" currentPath="/funcionarios">
      <PageHeader
        title="Funcionários"
        subtitle="Gerencie todos os tripulantes e suas qualificações"
        actions={
          <>
            <button className="h-10 px-4 border border-gray-300 text-slate-700 font-medium rounded-lg hover:bg-gray-50 flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">download</span>
              Exportar
            </button>
            <button className="h-10 px-4 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">add</span>
              Novo Funcionário
            </button>
          </>
        }
      />

      <SummaryCards>
        <KPICard label="Total" value={157} icon="person" />
        <KPICard label="Ativos" value={142} icon="check_circle" color="success" />
        <KPICard label="Inativos" value={15} icon="block" color="danger" />
        <KPICard label="Vencimentos" value={8} icon="warning" color="warning" />
      </SummaryCards>

      <FilterBar onApply={handleApplyFilters} onClear={handleClearFilters}>
        {/* Inputs de filtro aqui */}
      </FilterBar>

      <DataTable
        columns={columns}
        data={funcionarios}
        pagination={pagination}
        onPageChange={setPage}
      />
    </AppLayout>
  );
}
```

---

## COMPONENTES AUXILIARES

### Modal

```tsx
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

<Modal isOpen={isOpen} onClose={onClose} title="Editar Funcionário">
  {/* Conteúdo do modal */}
</Modal>;
```

### Toast

```tsx
interface ToastProps {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  onClose: () => void;
}

<Toast type="success" message="Funcionário salvo com sucesso!" onClose={...} />
```

### Loading Skeleton

```tsx
<div className="animate-pulse space-y-4">
  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
</div>
```

---

## MAPEAMENTO DE PÁGINAS PARA COMPONENTES

### Páginas de Lista

- **Funcionários** → PageHeader + SummaryCards + FilterBar + DataTable
- **Qualificações** → PageHeader + FilterBar + DataTable
- **Simuladores** → PageHeader + SummaryCards + FilterBar + DataTable
- **Pasta Virtual** → PageHeader + FilterBar + Grid de Cards (não tabela)

### Páginas de Formulário

- **Novo/Editar Funcionário** → PageHeader + Form com Cards por seção
- **Nova Qualificação** → PageHeader + Form
- **Configurações** → PageHeader + Tabs + Forms

### Páginas de Dashboard

- **Dashboard Principal** → PageHeader + SummaryCards + Grid de Charts/Cards

### Páginas de Detalhe

- **Perfil Funcionário** → PageHeader + Grid de Info Cards + Tabs (Qualificações, Documentos, Histórico)

---

## ESTRUTURA DE ARQUIVOS SUGERIDA

```
src/
├── components/
│   ├── layout/
│   │   ├── AppLayout.tsx
│   │   ├── Sidebar.tsx
│   │   ├── SidebarItem.tsx
│   │   ├── Topbar.tsx
│   │   ├── PageHeader.tsx
│   │   ├── SummaryCards.tsx
│   │   ├── KPICard.tsx
│   │   ├── FilterBar.tsx
│   │   └── DataTable.tsx
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Select.tsx
│   │   ├── Badge.tsx
│   │   ├── Modal.tsx
│   │   ├── Toast.tsx
│   │   └── Card.tsx
│   └── forms/
│       ├── FormField.tsx
│       ├── FormSection.tsx
│       └── ValidationMessage.tsx
├── pages/
│   ├── Dashboard.tsx
│   ├── Funcionarios.tsx
│   ├── FuncionarioForm.tsx
│   ├── Qualificacoes.tsx
│   ├── Simuladores.tsx
│   └── ...
└── hooks/
    ├── useFilters.ts
    ├── usePagination.ts
    └── useToast.ts
```

---

## RESUMO

O **AppLayout** fornece a estrutura consistente para todas as páginas:

1. **Sidebar** com menu de navegação
2. **Topbar** com breadcrumb e ações globais
3. **Main** com área de conteúdo padronizada

Cada página interna segue o padrão:

```
<AppLayout>
  <PageHeader /> {/* Título + ações */}
  <SummaryCards /> {/* KPIs (opcional) */}
  <FilterBar /> {/* Filtros (opcional) */}
  <DataTable /> {/* Conteúdo principal */}
</AppLayout>
```

Todos os componentes seguem o **Design System** definido no documento anterior (cores, tipografia, espaçamentos, etc.).

Não há suporte a **dark mode** - todos os estilos são otimizados para tema claro.
