# 🛣️ FASE 2 - PROMPT 5/7: ATUALIZAR ROTAS

**Módulo**: Simuladores  
**Etapa**: Criar rotas consolidadas  
**Tempo**: 1 hora  
**Dependências**: PROMPT_02_MIGRACAO_PAGINAS.md

---

## 🎯 OBJETIVO

Criar arquivo de rotas consolidado com lazy loading e estrutura RESTful.

---

## 📋 CHECKLIST

- [ ] Criar `simuladores.routes.tsx`
- [ ] Definir lazy imports
- [ ] Configurar rotas RESTful
- [ ] Integrar em App.tsx
- [ ] Testar navegação

---

## 🔨 CRIAR ARQUIVO DE ROTAS

```tsx
// src/react-app/routes/simuladores.routes.tsx

/**
 * ✅ ROTAS CONSOLIDADAS - MÓDULO SIMULADORES
 */

import { lazy } from 'react';
import { Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

// Lazy imports
const Dashboard = lazy(() => import('@/pages/simuladores/dashboard'));
const ListaSimuladores = lazy(() => import('@/pages/simuladores/cadastros/simuladores'));
const NovaSessao = lazy(() => import('@/pages/simuladores/sessoes/nova'));
const DetalhesSessao = lazy(() => import('@/pages/simuladores/sessoes/[id]'));
const ExecutarSessao = lazy(() => import('@/pages/simuladores/sessoes/[id]/executar'));
const AprovarSessao = lazy(() => import('@/pages/simuladores/sessoes/[id]/aprovar'));
const ListaFichas = lazy(() => import('@/pages/simuladores/fichas'));
const FichaDetalhe = lazy(() => import('@/pages/simuladores/fichas/[id]'));
const AgendaCalendario = lazy(() => import('@/pages/simuladores/agenda'));
const AgendaMensal = lazy(() => import('@/pages/simuladores/agenda/mensal'));
const AgendaSemanal = lazy(() => import('@/pages/simuladores/agenda/semanal'));
const Relatorios = lazy(() => import('@/pages/simuladores/relatorios'));

export function SimuladoresRoutes() {
  return (
    <>
      <Route index element={<Navigate to="dashboard" replace />} />

      <Route
        path="dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      <Route path="cadastros">
        <Route
          path="simuladores"
          element={
            <ProtectedRoute>
              <ListaSimuladores />
            </ProtectedRoute>
          }
        />
        <Route
          path="manobras"
          element={
            <ProtectedRoute>
              <ListaManobras />
            </ProtectedRoute>
          }
        />
        <Route
          path="templates"
          element={
            <ProtectedRoute>
              <ListaTemplates />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="sessoes">
        <Route
          path="nova"
          element={
            <ProtectedRoute>
              <NovaSessao />
            </ProtectedRoute>
          }
        />
        <Route
          path=":id"
          element={
            <ProtectedRoute>
              <DetalhesSessao />
            </ProtectedRoute>
          }
        />
        <Route
          path=":id/executar"
          element={
            <ProtectedRoute>
              <ExecutarSessao />
            </ProtectedRoute>
          }
        />
        <Route
          path=":id/aprovar"
          element={
            <ProtectedRoute>
              <AprovarSessao />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="fichas">
        <Route
          index
          element={
            <ProtectedRoute>
              <ListaFichas />
            </ProtectedRoute>
          }
        />
        <Route
          path=":id"
          element={
            <ProtectedRoute>
              <FichaDetalhe />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="agenda">
        <Route
          index
          element={
            <ProtectedRoute>
              <AgendaCalendario />
            </ProtectedRoute>
          }
        />
        <Route
          path="mensal"
          element={
            <ProtectedRoute>
              <AgendaMensal />
            </ProtectedRoute>
          }
        />
        <Route
          path="semanal"
          element={
            <ProtectedRoute>
              <AgendaSemanal />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route
        path="relatorios"
        element={
          <ProtectedRoute>
            <Relatorios />
          </ProtectedRoute>
        }
      />
    </>
  );
}
```

---

## 🔧 INTEGRAR EM APP.TSX

```tsx
// Em src/react-app/App.tsx

import { SimuladoresRoutes } from './routes/simuladores.routes';

// Nas rotas:
<Route path="/simuladores/*">
  <SimuladoresRoutes />
</Route>;
```

---

## ✅ VALIDAÇÃO

```bash
# Build
npm run build

# Dev e testar navegação
npm run dev

# Testar:
# - /simuladores → redireciona para /simuladores/dashboard
# - /simuladores/dashboard → carrega
# - /simuladores/cadastros/simuladores → carrega
# - /simuladores/sessoes/nova → carrega
# - /simuladores/fichas → carrega
```

---

**Próximo**: `PROMPT_05_VALIDACAO.md`
