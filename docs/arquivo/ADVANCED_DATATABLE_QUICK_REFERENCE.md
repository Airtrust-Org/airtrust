# ⚡ QUICK REFERENCE - AdvancedDataTable

## 🚀 Iniciar em 2 Minutos

### 1. Import

```typescript
import { AdvancedDataTable } from '@/react-app/components/UI';
```

### 2. Setup Básico

```typescript
<AdvancedDataTable
  columns={[
    { key: 'name', label: 'Nome', sortable: true, searchable: true },
    { key: 'status', label: 'Status', sortable: true },
  ]}
  data={dados}
/>
```

✅ **Pronto!** Tabela com busca, sort e paginação automática.

---

## 📋 Props Essenciais

| Prop               | Tipo                | Default      | Descrição              |
| ------------------ | ------------------- | ------------ | ---------------------- |
| `columns`          | `DataTableColumn[]` | **required** | Definição das colunas  |
| `data`             | `any[]`             | **required** | Array de dados         |
| `idKey`            | `string`            | `'id'`       | Campo único por linha  |
| `pageSize`         | `number`            | `25`         | Linhas por página      |
| `loading`          | `boolean`           | `false`      | Mostrar loading state  |
| `enableSearch`     | `boolean`           | `true`       | Ativar busca           |
| `enablePagination` | `boolean`           | `true`       | Ativar paginação       |
| `enableCheckboxes` | `boolean`           | `true`       | Ativar seleção         |
| `enableExport`     | `boolean`           | `true`       | Ativar exportação      |
| `columnResizable`  | `boolean`           | `true`       | Permitir redimensionar |

---

## 🎯 Callbacks

```typescript
onEdit = (id) => {}; // Editar linha
onDelete = (id) => {}; // Deletar linha
onView = (id) => {}; // Visualizar linha
onBulkDelete = (ids) => {}; // Deletar múltiplas
onExport = (data, format) => {}; // Quando exportar
onPageChange = (page) => {}; // Mudança de página
getRowStatus = (item) => 'valid'; // Calcular cor da linha
```

---

## 🎨 Status Colors

```typescript
getRowStatus={(item) => {
  // Retornar um destes:
  // 'valid'    → Verde 🟢
  // 'expiring' → Amarelo 🟡
  // 'expired'  → Vermelho 🔴
  // 'revoked'  → Cinza ⚫
  // 'total'    → Azul 🔵
}}
```

---

## 📊 DataTableColumn

```typescript
interface DataTableColumn {
  key: string; // Campo do objeto
  label: string; // Título visível
  sortable?: boolean; // Permitir sort
  searchable?: boolean; // Pesquisável
  width?: number; // Largura (px)
  render?: (value, item) => JSX; // Custom render
}
```

---

## 💾 Export Formatos

```typescript
// CSV
<button onClick={() => handleExport(data, 'csv')}>
  CSV
</button>

// Excel
<button onClick={() => handleExport(data, 'excel')}>
  Excel
</button>

// PDF
<button onClick={() => handleExport(data, 'pdf')}>
  PDF
</button>
```

---

## 📝 Exemplos Rápidos

### Com Status Coloring

```typescript
<AdvancedDataTable
  columns={columns}
  data={habilitacoes}
  getRowStatus={(item) => {
    const dias = Math.floor((new Date(item.dataVencimento) - new Date()) / (1000 * 60 * 60 * 24));
    return dias < 0 ? 'expired' : dias < 30 ? 'expiring' : 'valid';
  }}
/>
```

### Com Custom Render

```typescript
{
  key: 'status',
  label: 'Status',
  render: (value) => (
    <span className="px-2 py-1 bg-green-100 rounded">
      {value}
    </span>
  )
}
```

### Com Bulk Actions

```typescript
<AdvancedDataTable
  columns={columns}
  data={data}
  enableCheckboxes={true}
  onBulkDelete={(ids) => {
    fetch('/api/delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  }}
/>
```

---

## ⌨️ Keyboard Shortcuts

| Tecla    | Ação                      |
| -------- | ------------------------- |
| `Tab`    | Navegar headers           |
| `Enter`  | Ativar sort               |
| `Space`  | Toggle checkbox           |
| `Delete` | Deletar (com confirmação) |
| `Ctrl+F` | Focus search              |

---

## 🎓 Dicas de Performance

✅ **DO:**

- Use `pageSize={25}` ou menor
- Limite `searchableColumns` às colunas realmente usadas
- Memoize `data` se vir de props
- Use `idKey` matching com chave real única

❌ **DON'T:**

- Não renderize componentes pesados em `render` callback
- Não mude `columns` toda renderização
- Não use `any` types
- Não esqueça handlers necessários

---

## 🐛 Troubleshooting

### Tabela não filtra

```typescript
// Verificar searchableColumns
enableSearch={true}
searchableColumns={['nome', 'categoria']}
```

### Redimensionamento não funciona

```typescript
// Limpar localStorage
localStorage.removeItem('advancedDataTableColumnWidths');
```

### Exportação vazia

```typescript
// Verificar enableExport
enableExport={true}
onExport={(data) => console.log(data)}
```

### Sorting não funciona

```typescript
// Verificar sortable na coluna
{ key: 'nome', label: 'Nome', sortable: true }
```

---

## 🚀 Deployment

### Build

```bash
npm run build
# ✓ built in 3.37s
```

### Deploy

```bash
wrangler deploy
# ✨ Success! Uploaded 89 files
```

### Live URL

```
https://airtrust.workers.dev
```

---

## 📚 Documentação Completa

- **API Reference**: `ADVANCED_DATATABLE_GUIDE.md`
- **Code Examples**: `ADVANCED_DATATABLE_EXAMPLES.tsx`
- **Deploy Details**: `ADVANCED_DATATABLE_DEPLOYMENT_COMPLETE.md`
- **Final Report**: `ADVANCED_DATATABLE_FINAL_REPORT.md`

---

## 🎉 Status

```
✅ Production Ready
✅ 10 Features
✅ 0 Errors
✅ Type Safe
✅ Documented
```

**Let's go! 🚀**
