# Design System Refactoring Guide

## Overview

All pages in `src/react-app/pages` should follow these patterns for consistent visual design and spacing.

## Key Components to Use

### 1. PageLayout

```tsx
import {
  PageLayout,
  PageSection,
  PageGrid,
  PageCard,
} from '@/react-app/components/layout/PageLayout';

// Usage:
<PageLayout
  title="Page Title"
  subtitle="Optional subtitle"
  description="Optional description"
  action={<Button>Action</Button>}
>
  {/* content */}
</PageLayout>;
```

### 2. PageSection

- For grouping related content
- Always has left-aligned title and optional description
- White background with border and shadow

### 3. PageGrid

- Responsive grid layout (1, 2, 3, or 4 columns)
- Automatically adjusts for mobile/tablet/desktop
- Gap of 6 (24px) between items

### 4. PageCard

- Individual content container
- Supports hover states
- Configurable padding (sm/md/lg)
- Uses design system colors and borders

## Design Tokens

Access from `@/react-app/styles/design-tokens`:

```tsx
import {
  colorTokens,
  spacingScale,
  classHelpers,
  statusColors,
} from '@/react-app/styles/design-tokens';
```

### Colors

- `colorTokens.primary.*` - Primary brand colors
- `colorTokens.neutral.*` - Grays (0-900)
- `colorTokens.success/warning/error/info` - Status colors

### Spacing

- `xs: 4px`, `sm: 8px`, `md: 16px`, `lg: 24px`, `xl: 32px`, `xxl: 48px`

### Class Helpers

- Use predefined classes for consistency:
  - `classHelpers.container` - Max-width container with padding
  - `classHelpers.card` - Card styling
  - `classHelpers.heading` - Heading text
  - `classHelpers.badge*` - Status badges

## Common Page Patterns

### Pattern 1: Header with Stats Grid

```tsx
<PageLayout title="Dashboard">
  <PageSection>
    <PageGrid columns={4}>
      {stats.map((stat) => (
        <PageCard key={stat.id}>
          <div className={classHelpers.spaceBetween}>
            <div>
              <p className={classHelpers.muted}>Métrica</p>
              <p className="text-2xl font-bold mt-2">{stat.value}</p>
            </div>
            <IconWrapper>{icon}</IconWrapper>
          </div>
        </PageCard>
      ))}
    </PageGrid>
  </PageSection>
</PageLayout>
```

### Pattern 2: Data Table with Filters

```tsx
<PageLayout title="Data Management">
  <PageSection title="Filters" description="Filter options">
    <div className="p-6 flex gap-4">{/* Filter controls */}</div>
  </PageSection>

  <PageSection title="Results">
    <div className="p-6">{/* Table content */}</div>
  </PageSection>
</PageLayout>
```

### Pattern 3: Form Layout

```tsx
<PageLayout title="Create Item">
  <PageSection title="Basic Information">
    <div className="p-6 space-y-6">{/* Form fields */}</div>
  </PageSection>
</PageLayout>
```

## Tailwind Classes to Replace

### Spacing

- Replace hardcoded `p-4`, `p-6`, `p-8` with `PageCard padding="sm/md/lg"`
- Replace `gap-4`, `gap-6` with `PageGrid` or `gap-X` classes
- Use spacing scale from tokens

### Colors

- Replace `bg-blue-50` with `colorTokens.primary[50]` or use className
- Replace `text-gray-600` with `classHelpers.muted`
- Use status badges: `classHelpers.badge*` instead of inline colors

### Borders

- Replace `border border-gray-200` with `classHelpers.border`
- Replace `rounded-lg` with consistent `PageCard`

### Typography

- Use `classHelpers.heading` for h3 headings
- Use `classHelpers.label` for form labels
- Use `classHelpers.muted` for secondary text

### Cards

- Replace inline `bg-white rounded-lg border shadow` with `<PageCard>`
- Use `PageSection` for grouped content
- Use `PageGrid` for multi-column layouts

## Refactoring Checklist

For each page file, verify:

- [ ] Uses `PageLayout` as root wrapper
- [ ] Title, subtitle, action in header
- [ ] Content organized with `PageSection`
- [ ] Related items grouped in `PageCard` or `PageGrid`
- [ ] All spacing uses design tokens (6, 4, 2 units)
- [ ] Colors from `colorTokens` or helpers
- [ ] Typography follows scale (h1, h2, h3, body, small)
- [ ] Hover states consistent (card hover, button hover)
- [ ] Empty states use `EmptyState` component
- [ ] Loading states use `LoadingSpinner` component
- [ ] Status badges use `classHelpers.badge*`
- [ ] No inline `style={}` attributes
- [ ] All classNames from design system

## Before/After Example

### Before

```tsx
<div className="bg-gray-50 min-h-screen">
  <div className="max-w-7xl mx-auto px-6 py-6">
    <h1 className="text-2xl font-bold text-gray-900">Title</h1>
    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white rounded-lg border border-gray-200 shadow p-6">
        <p className="text-gray-600">Subtitle</p>
        <p className="text-2xl font-bold mt-2 text-gray-900">Value</p>
      </div>
    </div>
  </div>
</div>
```

### After

```tsx
import {
  PageLayout,
  PageSection,
  PageGrid,
  PageCard,
} from '@/react-app/components/layout/PageLayout';
import { classHelpers } from '@/react-app/styles/design-tokens';

<PageLayout title="Title">
  <PageSection>
    <PageGrid columns={2}>
      <PageCard>
        <p className={classHelpers.muted}>Subtitle</p>
        <p className="text-2xl font-bold mt-2 text-neutral-900">Value</p>
      </PageCard>
    </PageGrid>
  </PageSection>
</PageLayout>;
```

## Files to Refactor (Priority Order)

### Phase 1 - Core Pages (High Impact)

1. Dashboard.tsx - Main dashboard, many stats cards
2. Habilitacoes.tsx - Qualifications management
3. Manobras.tsx - Maneuvers list
4. Treinamentos.tsx - Training management

### Phase 2 - Management Pages

1. Empresas.tsx - Company management
2. Funcoes.tsx - Functions management
3. Aeronaves.tsx - Aircraft management
4. Certificacoes.tsx - Certificates

### Phase 3 - Utility Pages

1. Sistema.tsx - System settings
2. Configuracoes.tsx - App configuration
3. AuditoriaDatas.tsx - Audit view
4. BackupRestore.tsx - Backup management

### Phase 4 - Specialized Pages

1. PastaVirtual.tsx - Virtual folder
2. SimuladoresTemplates.tsx - Simulator templates
3. DashboardTreinamentos.tsx - Training dashboard
4. Compliance pages and reports

## Tips

1. **Start with PageLayout** - Ensures consistent header
2. **Use PageGrid** - For responsive layouts
3. **Prefer PageCard** - Over raw divs for content
4. **Token consistency** - Import and use design tokens
5. **Empty states** - Always show when no data
6. **Loading states** - Use LoadingSpinner during async
7. **Test responsive** - Verify mobile/tablet/desktop
8. **Colors** - Use status colors for badges/status indicators

## Quality Checklist

- All pages use consistent spacing (multiples of 4/8/16/24)
- All borders use neutral-200
- All shadows are from shadow scale
- All typography follows design scale
- All status indicators use badge system
- No hardcoded colors except via design tokens
- No breakpoint-specific hacks (use Tailwind responsive)
- Hover states work on all interactive elements
- Focus states work for accessibility
