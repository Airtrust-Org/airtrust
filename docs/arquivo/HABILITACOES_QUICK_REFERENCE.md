# 🎯 Quick Reference - Habilitações Dashboard v1.0.1

## Dashboard Cards (5 Cards)

### Card 1: Total (Blue)

```tsx
<PageCard className="bg-blue-50 border-2 border-blue-600">
  <CheckCircle className="w-8 h-8 text-blue-600" />
  <p className="text-3xl font-bold text-blue-600">{totalHab}</p>
</PageCard>
```

### Card 2: Válidas (Green)

```tsx
<PageCard className="bg-green-50 border-2 border-green-600">
  <CheckCircle className="w-8 h-8 text-green-600" />
  <p className="text-3xl font-bold text-green-600">{validas}</p>
</PageCard>
```

### Card 3: Vencendo (Orange)

```tsx
<PageCard className="bg-orange-50 border-2 border-orange-600">
  <AlertCircle className="w-8 h-8 text-orange-600" />
  <p className="text-3xl font-bold text-orange-600">{vencendo}</p>
</PageCard>
```

### Card 4: Vencidas (Red)

```tsx
<PageCard className="bg-red-50 border-2 border-red-600">
  <XCircle className="w-8 h-8 text-red-600" />
  <p className="text-3xl font-bold text-red-600">{vencidas}</p>
</PageCard>
```

### Card 5: Renovadas (Gray)

```tsx
<PageCard className="bg-neutral-100 border-2 border-neutral-400">
  <RotateCcw className="w-8 h-8 text-neutral-600" />
  <p className="text-3xl font-bold text-neutral-600">{renovadas}</p>
</PageCard>
```

## Dashboard Container

```tsx
<PageSection>
  <PageGrid columns={5}>{/* 5 cards go here */}</PageGrid>
</PageSection>
```

## Table Headers (with Sort Indicators)

```tsx
<thead>
  <tr className="border-b border-neutral-200 bg-neutral-50">
    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 uppercase tracking-wider whitespace-nowrap">
      Ações
    </th>
    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 uppercase tracking-wider whitespace-nowrap">
      Funcionário ↑↓
    </th>
    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 uppercase tracking-wider whitespace-nowrap">
      Categoria ↑↓
    </th>
    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 uppercase tracking-wider whitespace-nowrap">
      Qualificação ↑↓
    </th>
    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 uppercase tracking-wider whitespace-nowrap">
      Status ↑↓
    </th>
    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 uppercase tracking-wider whitespace-nowrap">
      Vencimento ↑↓
    </th>
    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 uppercase tracking-wider whitespace-nowrap">
      Validade
    </th>
    <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-700 uppercase tracking-wider whitespace-nowrap">
      Conclusão ↑↓
    </th>
  </tr>
</thead>
```

## Table Layout

```tsx
<div className="overflow-x-auto -mx-6 px-6">
  <table className="w-full min-w-max">{/* Table content */}</table>
</div>
```

## Color Reference

| Status    | CSS Class   | Hex     | Usage                                                |
| --------- | ----------- | ------- | ---------------------------------------------------- |
| Total     | blue-600    | #2563eb | bg-blue-50, border-blue-600, text-blue-600           |
| Válidas   | green-600   | #16a34a | bg-green-50, border-green-600, text-green-600        |
| Vencendo  | orange-600  | #ea580c | bg-orange-50, border-orange-600, text-orange-600     |
| Vencidas  | red-600     | #dc2626 | bg-red-50, border-red-600, text-red-600              |
| Renovadas | neutral-600 | #4b5563 | bg-neutral-100, border-neutral-400, text-neutral-600 |

## Imports Required

```typescript
import { CheckCircle, AlertCircle, XCircle, RotateCcw } from 'lucide-react';

import {
  PageLayout,
  PageSection,
  PageGrid,
  PageCard,
} from '@/react-app/components/layout/PageLayout';

import { classHelpers } from '@/react-app/styles/design-tokens';
```

## Responsive Breakpoints

```css
/* PageGrid columns={5} */
grid-cols-1           /* Mobile: < 768px */
md:grid-cols-2        /* Tablet: 768px - 1024px */
lg:grid-cols-3        /* Laptop: 1024px - 1280px */
xl:grid-cols-5        /* Wide: >= 1280px */
```

## File Locations

- **Dashboard Page**: `src/react-app/pages/Habilitacoes.tsx`
- **Layout Component**: `src/react-app/components/layout/PageLayout.tsx`
- **Design Tokens**: `src/react-app/styles/design-tokens.ts`
- **Full Documentation**: `HABILITACOES_DASHBOARD_ENHANCEMENT_v1.0.md`
- **Final Report**: `HABILITACOES_ENHANCEMENT_FINAL_REPORT.md`

## Build & Deploy

```bash
# Build
npm run build

# Deploy
wrangler deploy

# Current Version
41791eae-fb2a-4b75-91bd-8246e85498d4
```

## Key Features

✅ 5 color-coded cards  
✅ Status-specific icons  
✅ Sort indicators on table  
✅ Responsive grid layout  
✅ 10 AdvancedDataTable features maintained  
✅ Design system compliant  
✅ Zero breaking changes  
✅ Production ready (0 errors)

---

**Last Updated**: November 4, 2025  
**Status**: ✅ LIVE IN PRODUCTION
