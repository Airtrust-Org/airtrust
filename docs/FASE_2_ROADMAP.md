# 🚀 FASE 2: FRONTEND OPTIMIZATION (ROADMAP)

**Status**: 📋 Planejado (Inicia após validação da Fase 1)  
**Estimativa**: 40-50 horas  
**Benefício**: +50-70% performance no frontend

---

## 🎯 OBJETIVO

**Migrar de 182 fetch calls diretos para React Query + implementar lazy loading + code splitting**

Resultado esperado:

- Dashboard: 2s → < 500ms
- Renderizações desnecessárias: -70%
- Cache hit rate: 0% → 80%+
- Bundle size otimizado

---

## 📊 SITUAÇÃO ATUAL (PRÉ-FASE 2)

### Frontend Stack

- React 18.3.1
- TypeScript 5.6.3
- Vite 6.4.1
- Tailwind CSS

### Problemas Atuais

```
❌ 182 fetch calls diretos (sem cache)
❌ Cada componente faz seu próprio fetch
❌ Sem reuso de dados entre componentes
❌ Sem paginação (carrega tudo)
❌ Bundle grande: 427KB (Dashboard)
❌ Re-renderizações desnecessárias
```

### Impacto Atual

```
- Múltiplas requisições iguais (desperdício)
- Network waterfall (lento)
- Cache miss 100% (sempre busca do servidor)
- Componentes pesados carregando tudo
```

---

## ✨ SOLUÇÃO: REACT QUERY + LAZY LOADING

### Arquitetura Final

```
┌─────────────────────────────────────────┐
│         React Application               │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────────────────────────┐  │
│  │    React Query (Cache Layer)     │  │
│  │  - 80% cache hit rate            │  │
│  │  - Shared queries                │  │
│  │  - Auto-refetch                  │  │
│  └──────────────────────────────────┘  │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │  Code Splitting + Lazy Loading   │  │
│  │  - Modal components              │  │
│  │  - Heavy tables                  │  │
│  │  - Charts                        │  │
│  └──────────────────────────────────┘  │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │  React.memo + Optimization       │  │
│  │  - Prevent re-renders            │  │
│  │  - List virtualization           │  │
│  └──────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
              ↓
        ┌──────────────┐
        │  API D1      │
        │ (w/ Indexes) │  ← Fase 1 (já otimizado!)
        └──────────────┘
```

---

## 📋 TAREFAS DA FASE 2

### Sprint 1: Setup React Query (8 horas)

#### Tarefa 1.1: Instalar dependências

```bash
npm install @tanstack/react-query
npm install --save-dev @tanstack/react-query-devtools

# Resultado esperado:
# - Package.json atualizado
# - node_modules/ incluindo React Query
```

#### Tarefa 1.2: Criar QueryClient

**Arquivo**: `src/client/lib/queryClient.ts`

```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutos
      gcTime: 10 * 60 * 1000, // 10 minutos (antes: cacheTime)
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
    },
    mutations: {
      retry: 1,
    },
  },
});
```

#### Tarefa 1.3: Setup em App.tsx

```typescript
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* App routes */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

**Status**: ⏳ Não iniciado

---

### Sprint 2: Custom Hooks (16 horas)

**Objetivo**: Criar hooks reutilizáveis para cada módulo

#### Tarefa 2.1: Hook useFuncionarios

**Arquivo**: `src/client/hooks/useFuncionarios.ts`

```typescript
import { useQuery } from '@tanstack/react-query';

interface UseFuncionariosOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}

export function useFuncionarios(options: UseFuncionariosOptions = {}) {
  return useQuery({
    queryKey: ['funcionarios', options],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options.search) params.set('search', options.search);
      if (options.page) params.set('page', String(options.page));
      if (options.limit) params.set('limit', String(options.limit));
      if (options.status) params.set('status', options.status);

      const response = await fetch(`/api/v2/funcionarios?${params}`);
      if (!response.ok) throw new Error('Failed to fetch');
      return response.json();
    },
  });
}
```

#### Tarefa 2.2: Hook useHabilitacoes

```typescript
// src/client/hooks/useHabilitacoes.ts
// Similar ao useFuncionarios, mas para habilitacoes
```

#### Tarefa 2.3: Hook useCertificados

```typescript
// src/client/hooks/useCertificados.ts
// Similar ao useFuncionarios, mas para certificados
```

#### Tarefa 2.4: Hook useQualificacoes

```typescript
// src/client/hooks/useQualificacoes.ts
// Similar ao useFuncionarios, mas para qualificacoes
```

**Benefício por hook**:

- Centralizar lógica de fetch
- Cache automático
- Retry automático
- Sincronização entre componentes

**Status**: ⏳ Não iniciado

---

### Sprint 3: Lazy Loading + Code Splitting (12 horas)

#### Tarefa 3.1: Lazy load de páginas pesadas

```typescript
// src/client/pages/index.ts
import { lazy, Suspense } from 'react';

// Heavy pages
export const Dashboard = lazy(() => import('./Dashboard'));
export const CertificacoesList = lazy(() => import('./CertificacoesList'));
export const Simuladores = lazy(() => import('./Simuladores'));
export const Habilitacoes = lazy(() => import('./Habilitacoes'));

// Loading fallback
const PageLoader = () => <div>Carregando...</div>;

export function LazyPage({ Component }: { Component: React.ComponentType }) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}
```

#### Tarefa 3.2: Lazy load de modals

```typescript
// src/client/components/modals/index.ts
export const AddCertificacaoModal = lazy(() => import('./AddCertificacaoModal'));
export const ImportarCSVModal = lazy(() => import('./ImportarCSVModal'));
export const FormSimulador = lazy(() => import('./FormSimulador'));
```

#### Tarefa 3.3: Verificar bundle size

```bash
npm run build

# Antes (estimado):
# Dashboard: 427KB
# Total: 2.2MB

# Depois (esperado):
# Dashboard: ~300KB
# Total: ~1.8MB
# Redução: ~15-20%
```

**Status**: ⏳ Não iniciado

---

### Sprint 4: React.memo + Optimization (8 horas)

#### Tarefa 4.1: Identificar componentes pesados

```bash
# Componentes para otimizar:
- Dashboard (427KB) ← PRIORIDADE 1
- Simuladores (113KB) ← PRIORIDADE 2
- CertificacoesList (56KB) ← PRIORIDADE 3
- Habilitacoes (51KB) ← PRIORIDADE 3
```

#### Tarefa 4.2: Aplicar React.memo

**Antes:**

```typescript
export function FuncionarioRow({ func, onSelect }) {
  return (
    <tr onClick={() => onSelect(func.id)}>
      <td>{func.nome}</td>
      <td>{func.matricula}</td>
    </tr>
  );
}
```

**Depois:**

```typescript
export const FuncionarioRow = React.memo(
  function FuncionarioRow({ func, onSelect }) {
    return (
      <tr onClick={() => onSelect(func.id)}>
        <td>{func.nome}</td>
        <td>{func.matricula}</td>
      </tr>
    );
  },
  (prev, next) => {
    // Custom comparison para otimizar
    return prev.func.id === next.func.id && prev.onSelect === next.onSelect;
  },
);
```

#### Tarefa 4.3: List Virtualization (tabelas grandes)

```typescript
// Usar react-window ou react-virtual
import { FixedSizeList } from 'react-window';

<FixedSizeList height={600} itemCount={habilitacoes.length} itemSize={50} width="100%">
  {({ index, style }) => <div style={style}>{/* Render habilitacao[index] */}</div>}
</FixedSizeList>;
```

**Benefício:**

- Renderizar apenas itens visíveis
- Suporta milhares de itens
- Scroll suave

**Status**: ⏳ Não iniciado

---

## 📊 ESTIMATIVA DE IMPACTO

### Antes (Fase 1 + sem otimizações frontend)

```
Dashboard: 2s
- Backend: 300ms (com índices)
- Frontend: 1.7s
  - Fetch 182 endpoints: 800ms
  - Parse/render: 900ms

Problema: 182 fetch calls = overhead imenso
```

### Depois (Fase 1 + Fase 2)

```
Dashboard: < 500ms
- Backend: 300ms (com índices)
- Frontend: 150ms
  - Fetch 5 hooks (cache hit): 50ms
  - Parse/render (memoized): 100ms

Ganho: -75% tempo frontend!
```

### Métricas Finais Esperadas

| Métrica                  | Antes      | Depois    | Ganho    |
| ------------------------ | ---------- | --------- | -------- |
| **Dashboard Load**       | 2-5s       | < 500ms   | **-80%** |
| **List Render**          | 500-1000ms | 100-200ms | **-80%** |
| **Interaction Response** | 300-500ms  | < 100ms   | **-70%** |
| **Bundle Size**          | 2.2MB      | 1.8MB     | **-18%** |
| **Cache Hit Rate**       | 0%         | 80%+      | **+∞**   |
| **Network Requests**     | 182+       | 10-15     | **-90%** |

---

## 🏗️ ESTRUTURA DE DIRETÓRIOS

```
src/client/
├── hooks/                    ← NOVO
│   ├── useFuncionarios.ts
│   ├── useHabilitacoes.ts
│   ├── useCertificados.ts
│   ├── useQualificacoes.ts
│   └── index.ts
├── lib/
│   ├── queryClient.ts       ← NOVO
│   └── api.ts
├── components/
│   ├── FuncionarioRow.tsx   ← MEMO
│   ├── HabilitacaoRow.tsx   ← MEMO
│   └── ...
├── pages/
│   ├── Dashboard.tsx        ← LAZY
│   ├── CertificacoesList/   ← LAZY
│   └── ...
└── App.tsx                   ← MODIFICADO (QueryClient)
```

---

## 📋 CHECKLIST DE VALIDAÇÃO

### Após Sprint 1 (Setup)

- [ ] React Query instalado
- [ ] QueryClient criado
- [ ] DevTools funcionando
- [ ] Zero warnings de build

### Após Sprint 2 (Hooks)

- [ ] 4+ hooks customizados criados
- [ ] Todos os endpoints cobertos
- [ ] Cache funcionando
- [ ] Zero warnings TypeScript

### Após Sprint 3 (Lazy Loading)

- [ ] Lazy loading implementado em 5+ páginas
- [ ] Suspense fallback funcionando
- [ ] Bundle size reduzido (verificar com `npm run build`)
- [ ] Performance melhorada (medir com DevTools)

### Após Sprint 4 (Optimization)

- [ ] React.memo em 10+ componentes
- [ ] List virtualization em tabelas grandes
- [ ] Dashboard < 500ms
- [ ] Sem re-renders desnecessários (React DevTools Profiler)

---

## ⚠️ RISCOS E MITIGAÇÕES

| Risco                    | Probabilidade | Mitigation           |
| ------------------------ | ------------- | -------------------- |
| React Query incompatível | Baixa         | Usar versão LTS      |
| Performance regrediu     | Baixa         | Medir antes/depois   |
| Complexidade aumentou    | Média         | Documentação clara   |
| Bundle size cresceu      | Baixa         | Tree-shake agressivo |

---

## 📞 DECISÃO: COMEÇAR FASE 2?

### ✅ **COMECE SE:**

- Fase 1 passou todas as validações (24-48h)
- Performance está dentro do esperado (+85%)
- 0 bugs críticos em produção
- Time tem 40-50 horas disponíveis

### ❌ **ESPERE SE:**

- Fase 1 tem problemas não resolvidos
- Usuários reportando bugs
- Performance não atingiu meta
- Recursos limitados

---

## 🎯 TIMELINE SUGERIDA

**Se começar hoje:**

- Semana 1: Sprint 1-2 (Setup + Hooks)
- Semana 2: Sprint 3-4 (Lazy Loading + Optimization)
- Semana 3: Testes e validação
- Semana 4: Deploy Fase 2

**Resultado esperado em 1 mês: +70% performance frontend!**

---

## 📚 RECURSOS

- [React Query Docs](https://tanstack.com/query/latest)
- [React Profiler](https://react.dev/reference/react/Profiler)
- [Web Vitals](https://web.dev/vitals/)
- [Code Splitting Best Practices](https://webpack.js.org/guides/code-splitting/)

---

## 🎉 CONCLUSÃO

Fase 2 pode trazer **+70% de melhoria de performance frontend**, mas **SÓ se Fase 1 estiver 100% estável**.

Recomendação: **Validar Fase 1 por 1-2 semanas, depois considerar Fase 2.**

---

**Preparado por:** GitHub Copilot  
**Data:** 11 de Novembro de 2025  
**Status:** 📋 Planejado
