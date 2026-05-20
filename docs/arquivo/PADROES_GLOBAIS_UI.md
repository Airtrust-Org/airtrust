# Padrões Globais de UI/UX - AirTrust

**Data:** 15 de novembro de 2025  
**Versão:** 2.0

## 📋 Componentes Reutilizáveis

### 1. **DataTable** (`/src/components/ui/DataTable.tsx`)

Tabela configurável com recursos avançados:

#### Recursos:

- ✅ **Ordenação por colunas** (clique no header)
- ✅ **Seleção de colunas visíveis**
- ✅ **Colunas configuráveis** (esconder/mostrar)
- ✅ **Loading states** com animação
- ✅ **Empty states** personalizáveis
- ✅ **Actions por linha** (editar/ver/deletar)
- ✅ **Renderização customizada** por coluna
- ✅ **Suporte a tipos** (string, number, date)

#### Uso Básico:

```tsx
import { DataTable, Column } from '@/components/ui/DataTable';

const columns: Column<Funcionario>[] = [
  {
    id: 'nome',
    label: 'Nome',
    accessor: (row) => row.nome,
    sortable: true,
    visible: true,
    render: (value) => <span className="font-medium">{value}</span>,
  },
  // ... mais colunas
];

<DataTable
  data={funcionarios}
  columns={columns}
  loading={loading}
  actions={(row) => (
    <>
      <button onClick={() => handleEdit(row)}>Editar</button>
      <button onClick={() => handleDelete(row)}>Deletar</button>
    </>
  )}
  emptyState={<EmptyState />}
/>;
```

#### Propriedades das Colunas:

- `id`: string - Identificador único
- `label`: string - Texto do header
- `accessor`: (row) => any - Função para extrair valor
- `sortable`: boolean - Habilita ordenação
- `visible`: boolean - Define se coluna está visível
- `render`: (value, row) => ReactNode - Renderização customizada
- `width`: string - Largura da coluna (ex: "200px")

### 2. **Modal** (`/src/components/ui/Modal.tsx`)

Modal padronizado com backdrop e animações:

#### Recursos:

- ✅ **Fechar com ESC**
- ✅ **Fechar clicando fora**
- ✅ **Bloqueio de scroll**
- ✅ **5 tamanhos** (sm, md, lg, xl, full)
- ✅ **Header fixo** com título
- ✅ **Footer customizável**
- ✅ **Content com scroll**

#### Uso:

```tsx
import { Modal } from '@/components/ui/Modal';

<Modal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  title="Editar Funcionário"
  size="lg"
  footer={<FormActions onCancel={() => setShowModal(false)} onSubmit={handleSave} />}
>
  {/* Conteúdo do modal */}
</Modal>;
```

### 3. **Form Components** (`/src/components/ui/Form.tsx`)

Componentes de formulário consistentes:

#### Componentes:

- `FormField` - Wrapper com label e erro
- `TextInput` - Input de texto
- `TextArea` - Textarea
- `Select` - Select dropdown
- `FormActions` - Botões de ação (Cancelar/Salvar)

#### Uso:

```tsx
import { FormField, TextInput, Select, FormActions } from '@/components/ui/Form';

<FormField label="Nome Completo" required error={errors.nome}>
  <TextInput
    placeholder="Digite o nome"
    value={nome}
    onChange={(e) => setNome(e.target.value)}
  />
</FormField>

<FormField label="Status">
  <Select
    options={[
      { value: 'ATIVO', label: 'Ativo' },
      { value: 'INATIVO', label: 'Inativo' },
    ]}
  />
</FormField>

<FormActions
  onCancel={handleCancel}
  onSubmit={handleSubmit}
  loading={saving}
  submitLabel="Salvar"
  cancelLabel="Cancelar"
/>
```

## 🎨 Padrões de Design

### Cores

```css
--primary-600: #0052cc    /* AirTrust Blue */
--success-600: #22c55e    /* Green */
--warning-600: #f59e0b    /* Orange */
--danger-600: #ef4444     /* Red */
--slate-50: #f9fafb       /* Background Light */
--slate-900: #0f172a      /* Text Dark */
```

### Tipografia

```css
font-family: 'Inter', sans-serif
font-weight: 400, 500, 600, 700, 800, 900

/* Títulos de Página */
.page-title {
  font-size: 2.25rem; /* 4xl */
  font-weight: 900; /* black */
  letter-spacing: -0.025em;
}

/* Subtítulos */
.page-subtitle {
  font-size: 1rem; /* base */
  font-weight: 400;
  color: #64748b; /* slate-500 */
}

/* Headers de Tabela */
.table-header {
  font-size: 0.75rem; /* xs */
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
```

### Espaçamento

```css
/* Containers */
padding: 1.5rem; /* p-6 */
gap: 1.5rem; /* gap-6 */

/* Cards */
padding: 1rem 1.5rem; /* px-6 py-4 */
border-radius: 0.5rem; /* rounded-lg */

/* Buttons */
padding: 0.5rem 1rem; /* px-4 py-2 */
gap: 0.5rem; /* gap-2 */
```

### Ícones

Usar **Material Symbols Outlined**:

```html
<span class="material-symbols-outlined">icon_name</span>
```

Ícones comuns:

- `add` - Adicionar
- `edit` - Editar
- `delete` - Deletar
- `visibility` - Visualizar
- `search` - Buscar
- `filter_list` - Filtrar
- `refresh` - Atualizar
- `download` - Baixar
- `upload` - Upload
- `close` - Fechar

## 📝 Padrões de Páginas

### Estrutura Básica

```tsx
<TopNavLayout title="Título da Página">
  <PageHeader
    title="Título Principal"
    subtitle="Descrição da página"
    action={
      <button onClick={handleNew}>
        <span className="material-symbols-outlined">add</span>
        Novo
      </button>
    }
  />

  {/* KPI Cards (se aplicável) */}
  <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
    <KPICardNew label="Total" value={total} />
    <KPICardNew label="Ativos" value={ativos} variant="success" />
  </div>

  {/* Conteúdo Principal */}
  <div className="rounded-lg border border-slate-200 bg-white p-6">
    <DataTable
      data={data}
      columns={columns}
      loading={loading}
      actions={renderActions}
      emptyState={<EmptyState />}
    />
  </div>

  {/* Modais */}
  <Modal isOpen={showModal} onClose={handleClose} title="Título">
    {/* Formulário */}
  </Modal>
</TopNavLayout>
```

### Estados de UI

#### Loading State

```tsx
<div className="text-center py-12">
  <span className="material-symbols-outlined text-6xl text-slate-300 mb-4 block animate-pulse">
    hourglass_empty
  </span>
  <p className="text-slate-500">Carregando dados...</p>
</div>
```

#### Empty State

```tsx
<div className="text-center py-12">
  <span className="material-symbols-outlined text-6xl text-slate-300 mb-4 block">inbox</span>
  <h3 className="text-lg font-semibold text-slate-900 mb-2">Nenhum registro encontrado</h3>
  <p className="text-sm text-slate-600 mb-6">Comece adicionando o primeiro item</p>
  <button className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white">
    <span className="material-symbols-outlined">add</span>
    Adicionar
  </button>
</div>
```

#### Error State

```tsx
<div className="text-center py-12">
  <span className="material-symbols-outlined text-6xl text-danger-600 mb-4 block">error</span>
  <h3 className="text-lg font-semibold text-slate-900 mb-2">Erro ao carregar dados</h3>
  <p className="text-sm text-slate-600 mb-6">{errorMessage}</p>
  <button className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white">
    <span className="material-symbols-outlined">refresh</span>
    Tentar Novamente
  </button>
</div>
```

## 🔲 Status Badges

```tsx
// Status Badge Component
<span
  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
    status === 'ATIVO'
      ? 'bg-success-600/10 text-success-600'
      : status === 'PENDENTE'
      ? 'bg-warning-600/10 text-warning-600'
      : 'bg-slate-200 text-slate-600'
  }`}
>
  <span
    className={`h-2 w-2 rounded-full ${status === 'ATIVO' ? 'bg-success-600' : 'bg-slate-600'}`}
  />
  {status}
</span>
```

## 🚀 Boas Práticas

### 1. Sempre use TypeScript

```tsx
interface Funcionario {
  id: number;
  nome: string;
  status: 'ATIVO' | 'INATIVO';
}
```

### 2. Loading States

Sempre forneça feedback visual durante carregamento.

### 3. Empty States

Sempre forneça mensagens claras quando não houver dados.

### 4. Confirmações

Use modais para ações destrutivas (deletar, desativar).

### 5. Feedback de Ações

Use toasts/notifications para confirmar ações bem-sucedidas.

### 6. Responsividade

Sempre teste em mobile, tablet e desktop.

### 7. Acessibilidade

- Use labels adequados
- Forneça titles em ícones
- Mantenha contraste adequado
- Suporte navegação por teclado

## 📱 Responsividade

### Breakpoints

```css
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
2xl: 1536px
```

### Grid Responsivo

```tsx
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
  {/* Cards */}
</div>
```

## ✅ Checklist de Implementação

Ao criar uma nova página, verifique:

- [ ] Layout TopNavLayout aplicado
- [ ] PageHeader com título e ação
- [ ] KPI Cards (se aplicável)
- [ ] DataTable configurável com ordenação
- [ ] Loading state implementado
- [ ] Empty state implementado
- [ ] Modais para CRUD seguem padrão
- [ ] Formulários usam componentes Form
- [ ] Ícones Material Symbols
- [ ] Cores do design system
- [ ] Responsivo em todos os tamanhos
- [ ] Feedback visual em ações
- [ ] Confirmação em ações destrutivas

## 🎯 Resultado

Com esses padrões, todas as páginas mantêm:

- ✅ **Consistência visual** em todo o sistema
- ✅ **Experiência de usuário** profissional
- ✅ **Código reutilizável** e manutenível
- ✅ **Performance** otimizada
- ✅ **Acessibilidade** adequada
- ✅ **Responsividade** completa
