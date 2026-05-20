# 🔧 Global Tables Standard - Migration Guide for Developers

**Version**: 1.0  
**Date**: November 4, 2025  
**Status**: ✅ PRODUCTION READY

---

## 📋 Step-by-Step Migration Guide

### Step 1: Understand the Current Table

```bash
# Open the table page you want to migrate
# Example: src/react-app/pages/Aeronaves.tsx

# Look for:
# - Current table structure (<table>, <thead>, <tbody>)
# - Column definitions (headers)
# - Data structure (what fields are available)
# - Current features (sorting, pagination, search)
# - Status/color logic (if any)
```

### Step 2: Plan Your Column Structure

```typescript
// Define your columns with GlobalTable structure
const columns = [
  {
    key: 'codigo', // Data field name
    label: 'Código', // Display label
    sortable: true, // Allow sorting
    searchable: true, // Include in search
    width: 'w-24', // Optional width
    align: 'left', // Text alignment
    // render: (value, item) => { }  // Optional custom render
  },
  {
    key: 'nome',
    label: 'Nome',
    sortable: true,
    searchable: true,
  },
  {
    key: 'fabricante',
    label: 'Fabricante',
    sortable: true,
    searchable: true,
  },
];
```

### Step 3: Determine Status Logic (If Applicable)

```typescript
// For expiry-based tables (Habilitações, Certificações, etc)
// Use getGlobalRowStatus with a date field:
getRowStatus={(item) => getGlobalRowStatus(item, 'data_vencimento')}

// For other status logic:
getRowStatus={(item) => {
  if (item.ativo) return 'valid';
  if (item.arquivado) return 'revoked';
  return undefined;
}}

// Possible status values: 'valid' | 'expiring' | 'expired' | 'revoked' | 'total'
```

### Step 4: Replace Table Component

```typescript
// OLD CODE (REMOVE THIS):
<table className="w-full">
  <thead>
    <tr>
      <th>Código</th>
      <th>Nome</th>
      {/* ... */}
    </tr>
  </thead>
  <tbody>
    {data.map((item) => (
      <tr key={item.id}>
        <td>{item.codigo}</td>
        <td>{item.nome}</td>
        {/* ... */}
      </tr>
    ))}
  </tbody>
</table>

// NEW CODE (REPLACE WITH THIS):
<GlobalTable
  columns={columns}
  data={data}
  idKey="id"
  title="Aeronaves"
  enableSearch={true}
  enablePagination={true}
  getRowStatus={(item) => {
    // Add status logic if needed
  }}
/>
```

### Step 5: Handle Custom Rendering (If Needed)

```typescript
// If you had custom rendering for specific columns, use render function:
const columns = [
  {
    key: 'data_fabricacao',
    label: 'Data Fabricação',
    sortable: true,
    render: (value, item) => {
      // Custom date formatting
      return new Date(value).toLocaleDateString('pt-BR');
    },
  },
  {
    key: 'status',
    label: 'Status',
    sortable: true,
    render: (value, item) => {
      // Custom status badge
      return (
        <span
          className={`px-2 py-1 rounded text-sm ${
            value === 'ativo' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
          }`}
        >
          {value === 'ativo' ? 'Ativo' : 'Inativo'}
        </span>
      );
    },
  },
];
```

### Step 6: Handle Row Clicks (If Applicable)

```typescript
// If you had click handlers on rows:
<GlobalTable
  columns={columns}
  data={data}
  onRowClick={(item) => {
    // Navigate to detail page
    navigate(`/aeronaves/${item.id}`);
  }}
/>
```

### Step 7: Handle Export (If Desired)

```typescript
<GlobalTable
  columns={columns}
  data={data}
  enableExport={true}
  onExport={(data, format) => {
    // Implement export logic
    if (format === 'csv') {
      exportToCSV(data, 'aeronaves.csv');
    } else if (format === 'pdf') {
      exportToPDF(data, 'aeronaves.pdf');
    }
  }}
/>
```

### Step 8: Test the Migration

```bash
# Run the dev server
npm run dev

# Navigate to the page in browser
# Test:
# - [ ] Table displays correctly
# - [ ] Sort indicators appear on headers (↑↓)
# - [ ] Clicking sort works
# - [ ] Search filters rows
# - [ ] Pagination works
# - [ ] Pagination options (10/25/50/100) work
# - [ ] Status row colors appear (if applicable)
# - [ ] Responsive on mobile
# - [ ] Export buttons work (if enabled)
```

### Step 9: Deploy

```bash
# Build
npm run build

# Verify 0 errors
# Expected output: "✓ built in ~3.4s (0 ERRORS)"

# Deploy
wrangler deploy

# Expected output: "✨ Success! Uploaded 89 files"
```

---

## 🎯 Migration Examples by Table

### Example 1: Aeronaves (Simple Table - No Status)

**Before (Old Code)**

```tsx
const [sortBy, setSortBy] = useState('nome');
const [sortOrder, setSortOrder] = useState('asc');
const [searchTerm, setSearchTerm] = useState('');
const [page, setPage] = useState(1);

const filteredData = aeronaves.filter((a) =>
  a.nome.toLowerCase().includes(searchTerm.toLowerCase()),
);

const sortedData = [...filteredData].sort((a, b) => {
  const aVal = a[sortBy];
  const bVal = b[sortBy];
  return sortOrder === 'asc'
    ? String(aVal).localeCompare(String(bVal))
    : String(bVal).localeCompare(String(aVal));
});

const pageSize = 25;
const totalPages = Math.ceil(sortedData.length / pageSize);
const paginatedData = sortedData.slice((page - 1) * pageSize, page * pageSize);

return (
  <div>
    <input
      type="text"
      placeholder="Buscar..."
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
    />
    <table>
      <thead>
        <tr>
          <th onClick={() => setSortBy('codigo')}>
            Código {sortBy === 'codigo' && (sortOrder === 'asc' ? '↑' : '↓')}
          </th>
          <th onClick={() => setSortBy('nome')}>
            Nome {sortBy === 'nome' && (sortOrder === 'asc' ? '↑' : '↓')}
          </th>
          <th onClick={() => setSortBy('fabricante')}>
            Fabricante {sortBy === 'fabricante' && (sortOrder === 'asc' ? '↑' : '↓')}
          </th>
        </tr>
      </thead>
      <tbody>
        {paginatedData.map((a) => (
          <tr key={a.id}>
            <td>{a.codigo}</td>
            <td>{a.nome}</td>
            <td>{a.fabricante}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <div>
      Page {page} of {totalPages}
      <button onClick={() => setPage((p) => p - 1)} disabled={page === 1}>
        Previous
      </button>
      <button onClick={() => setPage((p) => p + 1)} disabled={page === totalPages}>
        Next
      </button>
    </div>
  </div>
);
```

**After (New GlobalTable)**

```tsx
import { GlobalTable } from '@/react-app/components/UI';

const columns = [
  { key: 'codigo', label: 'Código', sortable: true, searchable: true },
  { key: 'nome', label: 'Nome', sortable: true, searchable: true },
  { key: 'fabricante', label: 'Fabricante', sortable: true, searchable: true },
];

return (
  <GlobalTable
    columns={columns}
    data={aeronaves}
    idKey="id"
    title="Aeronaves"
    enableSearch={true}
    enablePagination={true}
  />
);
```

### Example 2: Certificacoes (With Status & Expiry)

**Before (Old Code with Status Logic)**

```tsx
const [sortBy, setSortBy] = useState('data_conclusao');
const [searchTerm, setSearchTerm] = useState('');

const getRowStatus = (cert) => {
  const now = new Date();
  const vencimento = new Date(cert.data_vencimento);
  const daysDiff = (vencimento - now) / (1000 * 60 * 60 * 24);

  if (daysDiff < 0) return 'expired';
  if (daysDiff <= 30) return 'expiring';
  return 'valid';
};

const getRowClasses = (cert) => {
  const status = getRowStatus(cert);
  switch (status) {
    case 'expired':
      return 'bg-red-50 border-l-4 border-red-600';
    case 'expiring':
      return 'bg-orange-50 border-l-4 border-orange-600';
    case 'valid':
      return 'bg-green-50 border-l-4 border-green-600';
    default:
      return '';
  }
};

return (
  <div>
    <input
      type="text"
      placeholder="Buscar certificação..."
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
    />
    <table>
      <thead>
        <tr>
          <th>Funcionário</th>
          <th>Treinamento</th>
          <th onClick={() => setSortBy('data_conclusao')}>
            Data Conclusão {sortBy === 'data_conclusao' && '↑'}
          </th>
          <th onClick={() => setSortBy('data_vencimento')}>
            Vencimento {sortBy === 'data_vencimento' && '↑'}
          </th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {certificacoes.map((cert) => (
          <tr key={cert.id} className={getRowClasses(cert)}>
            <td>{cert.funcionario_nome}</td>
            <td>{cert.treinamento_nome}</td>
            <td>{new Date(cert.data_conclusao).toLocaleDateString()}</td>
            <td>{new Date(cert.data_vencimento).toLocaleDateString()}</td>
            <td>{getRowStatus(cert)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
```

**After (New GlobalTable with Status)**

```tsx
import { GlobalTable, getGlobalRowStatus } from '@/react-app/components/UI';

const columns = [
  { key: 'funcionario_nome', label: 'Funcionário', sortable: true, searchable: true },
  { key: 'treinamento_nome', label: 'Treinamento', sortable: true, searchable: true },
  {
    key: 'data_conclusao',
    label: 'Data Conclusão',
    sortable: true,
    render: (value) => new Date(value).toLocaleDateString('pt-BR'),
  },
  {
    key: 'data_vencimento',
    label: 'Vencimento',
    sortable: true,
    render: (value) => new Date(value).toLocaleDateString('pt-BR'),
  },
  {
    key: 'status',
    label: 'Status',
    render: (value, item) => getGlobalRowStatus(item, 'data_vencimento'),
  },
];

return (
  <GlobalTable
    columns={columns}
    data={certificacoes}
    idKey="id"
    title="Certificações"
    enableSearch={true}
    enablePagination={true}
    getRowStatus={(item) => getGlobalRowStatus(item, 'data_vencimento')}
  />
);
```

---

## 🎨 Customization Examples

### Custom Column Width

```typescript
const columns = [
  { key: 'nome', label: 'Nome', width: 'w-48', sortable: true },
  { key: 'email', label: 'Email', width: 'w-64', sortable: true },
  { key: 'status', label: 'Status', width: 'w-20', sortable: true },
];
```

### Custom Text Alignment

```typescript
const columns = [
  { key: 'nome', label: 'Nome', align: 'left' },
  { key: 'total', label: 'Total', align: 'right' },
  { key: 'acoes', label: 'Ações', align: 'center' },
];
```

### Custom Rendering with Components

```typescript
const columns = [
  {
    key: 'status',
    label: 'Status',
    render: (value, item) => (
      <BadgeComponent
        color={value === 'ativo' ? 'green' : 'red'}
        text={value === 'ativo' ? 'Ativo' : 'Inativo'}
      />
    ),
  },
  {
    key: 'acoes',
    label: 'Ações',
    render: (value, item) => (
      <div className="flex gap-2">
        <button onClick={() => handleEdit(item.id)}>Editar</button>
        <button onClick={() => handleDelete(item.id)}>Deletar</button>
      </div>
    ),
  },
];
```

### Callback Examples

```typescript
<GlobalTable
  columns={columns}
  data={data}
  onSort={(column, direction) => {
    console.log(`Sorted by ${column} (${direction})`);
  }}
  onRowClick={(item) => {
    console.log('Row clicked:', item);
    navigate(`/detail/${item.id}`);
  }}
  onSearch={(query) => {
    console.log('Search query:', query);
  }}
  onPageChange={(page) => {
    console.log('Page changed to:', page);
  }}
  onExport={(data, format) => {
    console.log(`Exporting ${data.length} items as ${format}`);
  }}
/>
```

---

## ⚠️ Common Migration Issues & Solutions

### Issue 1: "GlobalTable is not defined"

**Problem**: Import statement missing
**Solution**:

```typescript
import { GlobalTable } from '@/react-app/components/UI';
```

### Issue 2: "Cannot find module '@/react-app/components/UI'"

**Problem**: File not found or path incorrect
**Solution**: Verify files exist:

```bash
ls -la src/react-app/components/UI/TablesStandard.tsx
ls -la src/react-app/components/UI/TableUtils.ts
```

### Issue 3: Sort not working

**Problem**: Column not marked as sortable
**Solution**:

```typescript
{ key: 'nome', label: 'Nome', sortable: true } // Add sortable: true
```

### Issue 4: Search not finding items

**Problem**: Column not marked as searchable
**Solution**:

```typescript
{ key: 'nome', label: 'Nome', searchable: true } // Add searchable: true
```

### Issue 5: Status colors not showing

**Problem**: Missing `getRowStatus` prop
**Solution**:

```typescript
<GlobalTable
  // ... other props
  getRowStatus={(item) => getGlobalRowStatus(item, 'data_vencimento')}
/>
```

### Issue 6: TypeScript errors about types

**Problem**: Type mismatches in render function
**Solution**:

```typescript
render: (value, item) => {
  // Cast value if needed
  return String(value || '-');
};
```

---

## 📊 Migration Checklist

For each table you migrate:

### Pre-Migration

- [ ] Backup existing table code
- [ ] Document current functionality
- [ ] List all columns
- [ ] List custom rendering
- [ ] Identify status logic
- [ ] Check for row click handlers

### During Migration

- [ ] Define columns array
- [ ] Add sortable flags
- [ ] Add searchable flags
- [ ] Add custom render functions
- [ ] Add getRowStatus logic
- [ ] Replace old table code

### Post-Migration

- [ ] Build without errors
- [ ] Test table displays
- [ ] Test sort functionality
- [ ] Test search
- [ ] Test pagination
- [ ] Test responsive design
- [ ] Test custom rendering
- [ ] Test status colors (if applicable)
- [ ] Deploy to production

---

## 🚀 Migration Roadmap

### Phase 1 (Next) - Quick Wins

- [ ] Aeronaves - Simple, no status
- [ ] Empresas - Simple, no status

### Phase 2 (Following Week)

- [ ] Certificacoes - With expiry status
- [ ] Habilitações - Verify compliance

### Phase 3 (Following 2 Weeks)

- [ ] Funcionários - Status & filtering
- [ ] Treinamentos - With sorting
- [ ] Other tables - Full audit

### Phase 4 (Future)

- [ ] Manobras - Complex data
- [ ] VisualizarFicha - Nested data
- [ ] All remaining tables

---

## 📞 Support & Questions

### Common Questions

**Q: Do I need to implement all features?**
A: No! You can enable/disable search, pagination, export individually.

**Q: Can I keep custom sorting logic?**
A: Yes! Override with `onSort` callback if needed.

**Q: What if my data structure is different?**
A: Use `render` function to transform data or custom status logic.

**Q: Is responsive included?**
A: Yes! GlobalTable is fully responsive.

**Q: What about accessibility?**
A: Built-in! WCAG 2.1 AA compliant.

---

## 🎓 Best Practices

✅ **DO:**

- Use GlobalTable for ALL data tables
- Define columns with proper types
- Use `searchable: true` for text fields
- Use `sortable: true` for comparable fields
- Set proper `idKey` (usually 'id')
- Test on mobile before deploying

❌ **DON'T:**

- Create custom tables with HTML
- Duplicate sorting logic
- Mix GlobalTable with custom tables
- Forget to enable search/pagination
- Ignore status coloring for expiry dates
- Skip testing after migration

---

**Happy migrating! 🎉**
