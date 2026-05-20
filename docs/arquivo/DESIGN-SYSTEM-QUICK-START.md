# AirTrust Design System - Developer Quick Start

## 🚀 5-Minute Setup

### 1. Import Design System

```typescript
// In your component
import { designSystem, getSpacing, getColor } from '@/styles/design-system';

// Access tokens
const padding = designSystem.spacing.md; // "16px"
const primaryBlue = designSystem.colors.primary[500]; // "#0066cc"
const typoBold = designSystem.typography.h1; // { fontSize: '28px', ... }

// Use helpers
const spacing = getSpacing('lg'); // "24px"
const color = getColor('success', ''); // "#22c55e"
```

### 2. Import Global Styles

```typescript
// In your main app file (App.tsx or main.tsx)
import '@/styles/globals.css';
```

**Result**: All base styles, form elements, and utilities available globally.

### 3. Use Button Component

```typescript
import { Button } from '@/components/UI';

export function MyComponent() {
  return (
    <Button variant="primary" size="md" onClick={() => console.log('Clicked')}>
      Click Me
    </Button>
  );
}
```

### 4. Use Templates

```typescript
import { DashboardTemplate } from '@/components/Templates';

export function Dashboard() {
  const stats = [
    { label: 'Users', value: '1,234', change: 12, icon: <UserIcon /> },
    { label: 'Revenue', value: '$42k', change: -5, icon: <DollarIcon /> },
  ];

  return (
    <DashboardTemplate title="Dashboard" stats={stats}>
      <YourContent />
    </DashboardTemplate>
  );
}
```

---

## 📚 Component Catalog

### Button Component

**Import**: `import { Button } from '@/components/UI';`

```typescript
// Variants: primary | secondary | danger | success
// Sizes: sm (12px) | md (16px) | lg (18px)

<Button variant="primary" size="md">Save</Button>
<Button variant="secondary" disabled>Disabled</Button>
<Button variant="danger" loading={true}>Deleting...</Button>
<Button variant="success" icon={<CheckIcon />}>Complete</Button>
```

**Props**:

- `variant?: 'primary' | 'secondary' | 'danger' | 'success'`
- `size?: 'sm' | 'md' | 'lg'`
- `onClick?: () => void`
- `disabled?: boolean`
- `loading?: boolean`
- `icon?: React.ReactNode`
- `type?: 'button' | 'submit' | 'reset'`
- `className?: string`

---

### DashboardTemplate

**Import**: `import { DashboardTemplate } from '@/components/Templates';`

```typescript
<DashboardTemplate
  title="Performance"
  stats={[
    {
      label: 'Total Orders',
      value: '2,543',
      change: 12,
      icon: <ShoppingBagIcon />,
    },
  ]}
>
  <div>Your dashboard content here</div>
</DashboardTemplate>
```

**Stat Properties**:

- `label: string` - Stat label
- `value: string | number` - Main value
- `change?: number` - Percentage change (positive/negative)
- `icon?: React.ReactNode` - Icon before label

---

### TableTemplate

**Import**: `import { TableTemplate } from '@/components/Templates';`

```typescript
const columns = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'email', label: 'Email' },
  { key: 'status', label: 'Status' },
];

const data = [
  { name: 'John', email: 'john@example.com', status: 'Active' },
  { name: 'Jane', email: 'jane@example.com', status: 'Active' },
];

<TableTemplate
  title="Users"
  columns={columns}
  data={data}
  searchable={true}
  onRowClick={(row) => console.log(row)}
  actions={(row) => <Button size="sm">Edit</Button>}
/>;
```

**Features**:

- Search/filter across all columns
- Click column headers to sort
- Clickable rows
- Per-row actions
- Empty state handling

---

### FormTemplate

**Import**: `import { FormTemplate } from '@/components/Templates';`

```typescript
const [values, setValues] = useState({
  name: '',
  email: '',
  message: '',
});

const fields = [
  { name: 'name', label: 'Full Name', type: 'text', required: true },
  { name: 'email', label: 'Email', type: 'email', required: true },
  { name: 'message', label: 'Message', type: 'textarea' },
];

<FormTemplate
  title="Contact Us"
  description="Send us your feedback"
  fields={fields}
  values={values}
  onChange={(name, value) => setValues({ ...values, [name]: value })}
  onSubmit={(e) => {
    e.preventDefault(); /* submit */
  }}
  submitLabel="Send"
  cancelLabel="Clear"
  onCancel={() => setValues({})}
/>;
```

**Field Types**: text, email, password, number, textarea, select, checkbox

---

### ListTemplate

**Import**: `import { ListTemplate } from '@/components/Templates';`

```typescript
const items = [
  {
    id: 1,
    title: 'Completed Training',
    description: 'Finished on Nov 15, 2024',
    icon: <CheckCircleIcon />,
    badge: 'Done',
  },
];

<ListTemplate
  title="My Activities"
  items={items}
  onItemClick={(item) => navigate(`/activity/${item.id}`)}
/>;
```

**List Item Properties**:

- `id: string | number` - Unique ID
- `title: string` - Main title
- `description?: string` - Subtitle
- `icon?: React.ReactNode` - Icon (40x40px)
- `badge?: string` - Status badge
- `actions?: React.ReactNode` - Action buttons

---

### DetailTemplate

**Import**: `import { DetailTemplate } from '@/components/Templates';`

```typescript
<DetailTemplate
  title="John Doe"
  subtitle="Pilot - Boeing 737"
  headerImage="/path/to/avatar.jpg"
  fields={[
    { label: 'License Number', value: 'LIC-12345' },
    { label: 'Status', value: 'Active', badge: 'Licensed' },
    { label: 'Expiry Date', value: 'Dec 31, 2025' },
  ]}
  actions={
    <div style={{ display: 'flex', gap: '8px' }}>
      <Button size="sm" variant="secondary">
        Edit
      </Button>
      <Button size="sm" variant="danger">
        Delete
      </Button>
    </div>
  }
/>
```

---

## 🎨 CSS Variables for Global Styling

All CSS variables are available in `globals.css`:

```css
/* Colors */
--color-primary: #0066cc;
--color-success: #22c55e;
--color-error: #ef4444;
--color-warning: #f59e0b;

/* Spacing */
--spacing-xs: 4px;
--spacing-sm: 8px;
--spacing-md: 16px;
--spacing-lg: 24px;

/* Typography */
--font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-size-h1: 28px;
--font-size-body: 16px;

/* Shadows */
--shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.1);
--shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);

/* Radius */
--border-radius-md: 8px;
--border-radius-lg: 12px;

/* Transitions */
--transition-base: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
```

**Usage in CSS**:

```css
.myComponent {
  padding: var(--spacing-md);
  background: var(--color-primary);
  border-radius: var(--border-radius-md);
  transition: var(--transition-base);
}
```

**Usage in JavaScript**:

```typescript
const spacing = getComputedStyle(document.documentElement).getPropertyValue('--spacing-md').trim();
```

---

## 🎯 Common Patterns

### Button Group

```typescript
<div style={{ display: 'flex', gap: '8px' }}>
  <Button variant="secondary">Cancel</Button>
  <Button variant="primary">Save</Button>
</div>
```

### Card Layout

```typescript
<div className="card">
  <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Title</h2>
  <p>Content</p>
</div>
```

### Responsive Grid

```typescript
<div
  style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '16px',
  }}
>
  {items.map((item) => (
    <Card key={item.id}>{item}</Card>
  ))}
</div>
```

### Loading State

```typescript
const [loading, setLoading] = useState(false);

<Button
  loading={loading}
  onClick={async () => {
    setLoading(true);
    await saveData();
    setLoading(false);
  }}
>
  Save
</Button>;
```

---

## 🔍 Troubleshooting

### Button styles not applying?

✅ Make sure `Button.module.css` is in the same directory as `Button.tsx`
✅ Import Button component: `import { Button } from '@/components/UI'`

### Form template not working?

✅ Pass all required props: `title`, `fields`, `values`, `onChange`, `onSubmit`
✅ Update `values` object when fields change via `onChange`

### Template styles not showing?

✅ Make sure `templates.module.css` is imported in each template file
✅ Verify CSS module file is in same directory as template components

### Colors not consistent?

✅ Use `designSystem.colors.primary[500]` for primary color
✅ Use CSS variables: `background: var(--color-primary);`
✅ Don't hardcode colors - always use design system

### Spacing looks off?

✅ Use `designSystem.spacing` object or CSS grid helpers
✅ Follow 8px base unit (4, 8, 16, 24, 32, 48px)
✅ Use utility classes: `.mb-md`, `.p-lg`, etc.

---

## ✨ Best Practices

1. **Always use design system tokens** - Never hardcode colors or spacing
2. **Prefer templates over raw components** - Faster development
3. **Use Button component** - Consistency across app
4. **Mobile-first approach** - All templates are responsive
5. **Type everything** - Strong TypeScript prevents bugs
6. **Use CSS modules** - Avoid style conflicts
7. **Follow 8px grid** - Professional appearance
8. **Lazy-load templates** - Code-split for performance

---

## 📖 Additional Resources

- **Design System File**: `src/react-app/styles/design-system.ts` (285 lines)
- **Global Styles**: `src/react-app/styles/globals.css` (250 lines)
- **Component Docs**: `src/react-app/components/UI/Button.tsx`
- **Template Docs**: `src/react-app/components/Templates/`
- **Complete Guide**: `DESIGN-SYSTEM-COMPLETE.md`

---

## 🚀 Performance Notes

- **Bundle size**: Design system adds ~1KB (gzipped)
- **CSS modules**: Prevent unused CSS in bundle
- **TypeScript**: Tree-shaking removes unused tokens
- **Lazy loading**: Templates loaded only when needed
- **No runtime**: All design tokens compile away

---

## ❓ Questions?

Refer to:

1. Component files for TypeScript interfaces
2. CSS module files for styling details
3. Template implementations for usage examples
4. `DESIGN-SYSTEM-COMPLETE.md` for architecture

Built with ❤️ for AirTrust. Happy coding! 🎨
