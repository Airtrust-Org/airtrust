# AirTrust — Arquitetura do Frontend

> **Versão:** 1.0 | **Data:** 2026-06-12 | **HEAD:** `5be104893`
> **Stack:** React 19 + TypeScript 5.8 + Vite 6 + React Router DOM v7 + TanStack Query v5 + Zustand v5 + Tailwind CSS 3

## 1. Visão Geral do SPA

Frontend como **Single Page Application** em `src/react-app/` com path alias `@` → `./src`.

### Entry Point (`main.tsx`)

1. `initializeThemePreference()` — tema antes do primeiro render
2. `installChunkErrorListeners()` — handlers para falhas de chunk
3. `installGlobalApiFetch()` — monkey-patch de `window.fetch` com:
   - Deduplicação de GETs em voo
   - Cache curta duração (15s padrão, 30s dashboards, 60s health)
   - Backoff em 429/5xx
   - Failover produção → staging
4. Registro do Service Worker (apenas PROD)
5. `installTableWheelScrollLock()`
6. Bloqueio de DevTools hotkeys em desenvolvimento
7. `createRoot()` → `<ErrorBoundary>` → `<App />`

### Dependências principais

| Categoria | Biblioteca | Versão |
|---|---|---|
| Framework | `react`, `react-dom` | 19.0.0 |
| Roteamento | `react-router-dom` | ^7.9.3 |
| Server State | `@tanstack/react-query` | ^5.90.7 |
| Client State | `zustand` | ^5.0.11 |
| UI | `@headlessui/react`, `lucide-react`, `sonner` | ^2.2.8, ^0.510.0, ^2.0.7 |
| Forms | `react-hook-form`, `zod`, `@hookform/resolvers` | ^7.66.0, ^3.25.76, ^5.2.2 |
| Charts | `recharts` | ^2.15.4 |
| Documents | `jspdf`, `pdf-lib`, `pdfjs-dist`, `exceljs`, `xlsx` | vários |
| LMS | `scorm-again`, `h5p-standalone`, `@jvmr/pptx-to-html` | ^3.0.3, ^3.8.2, ^1.0.1 |

## 2. Hierarquia de Providers

```
QueryClientProvider
  → ThemeProvider
    → Toaster (sonner)
      → LanguageProvider
        → RuntimeTranslationBridge
          → AuthProvider
            → BrowserRouter
              → ErrorBoundary
                → Suspense (PageLoader)
                  → Routes
```

### QueryClientProvider

- **staleTime**: 5 min | **gcTime**: 30 min | **retry**: 1 | **refetchOnWindowFocus**: false

### ThemeProvider

Temas `light`/`dark` com classe `.dark` no `<html>`, persistência localStorage,
sincronização cross-tab.

### LanguageProvider

`pt-BR` (padrão) e `en-US`. ~200+ chaves de tradução tipadas.
Detecção: servidor (`/api/public/locale`) → browser.

### AuthProvider

Login/logout/refresh, restauração de sessão, troca de empresa com limpeza
de cache TanStack Query, dev auto-login.

## 3. Roteamento e Code Splitting

React Router DOM v7 com **lazy loading universal** via `lazyWithRetry()`:

```typescript
// 2 tentativas: re-fetch do chunk → hard reload da página
const Qualificacoes = lazyWithRetry(
  () => import('./pages/Qualificacoes'),
  'Qualificacoes'
);
```

**ProtectedRoute**: Verifica `user` → redireciona para `/login` se não autenticado.

**HomeRouter**: Role-based — ADMIN/GESTOR → `DashboardPrincipal`, ALUNO/INSTRUTOR → `HomePerfil`.

## 4. Gerenciamento de Estado

### TanStack Query v5 (Server State)

- Query hooks: 11 (useFuncionariosRQ, useQualificacoesRQ, etc.)
- Mutation hooks: 11 (useFuncionariosMutations, etc.)
- Query keys com prefixo `tenantQueryKey` (inclui `empresaId`)

### Zustand v5 (Client State)

Apenas 2 stores, ambas no módulo de escalas:
- **useEscalaConfigStore**: Persistido (localStorage), config de cores/labels/exibição
- **useEscalaUIStore**: Efêmero, filtros visuais, modo de visão, modal state (15 variantes)

### Forms

`react-hook-form` + `zod` para validação.

## 5. Comunicação com a API

### fetchWithAuth

```typescript
async function fetchWithAuth(url, options) {
  const token = getAccessToken();  // memory → sessionStorage → localStorage
  const res = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    const newToken = await refreshAccessToken();  // com debounce
    if (newToken) return fetch(url, { ...options, headers: { Authorization: `Bearer ${newToken}` } });
  }
  return res;
}
```

### Global fetch interceptor (`installGlobalApiFetch`)

- Deduplicação de GET requests idênticos
- Cache de respostas (15s/30s/60s)
- Backoff progressivo (1s, 2s, 4s)
- Failover automático produção → staging

### Resolução de API base

```
localhost → /api (Vite proxy)
main.airtrust.pages.dev → airtrust-api-staging
produção → api.airtrust.online/api
```

## 6. Service Worker e PWA

- **Versão**: `airtrust-v9`
- **Registro**: Apenas em `import.meta.env.PROD`
- **PWA**: Manifest `public/app.webmanifest`, display `standalone`, start URL `/escalas/minha-escala`

### Estratégias

| Recurso | Estratégia | Cache |
|---|---|---|
| HTML / navegação | Network-first | `airtrust-v9-runtime` |
| Assets com hash | Cache-first | `airtrust-v9-assets` |
| API | Network-only (bypass) | — |
| LMS Player | Network-only (bypass) | — |
| Minha Escala | Offline-first (app shell) | `airtrust-v9-runtime` |

### Validação de MIME type JS

Detecta HTML servido como JS → deleta cache inválido → busca na rede.
Network response inválida → retorna 503 com `Content-Type: application/javascript`.

## 7. Build e Otimização

| Parâmetro | Valor |
|---|---|
| Target | `es2020` |
| Out dir | `dist/client` |
| Source maps | Apenas dev |
| Minify | Apenas produção |
| Manifest | `manifest.json` |
| Chunk size warning | 600 KB |

### Manual Chunks

| Chunk | Dependências |
|---|---|
| `vendor` | react + react-dom (~130 KB) |
| `router` | react-router-dom (~60 KB) |
| `query` | @tanstack/react-query (~80 KB) |
| `charts` | recharts (~432 KB) |
| `pdf` | jspdf (~180 KB) |
| `capture` | html2canvas (~80 KB) |
| `excel` | xlsx (~500 KB) |
| `forms` | react-hook-form + zod (~40 KB) |
| `dnd` | @dnd-kit/* (~60 KB) |

### Métricas

- 287 chunks JS, 2 CSS, ~12 MB total
- Maior chunk: `charts-<hash>.js` (432 KB)
- Build time: ~5.73s

## 8. Internacionalização (i18n)

- **Provider**: `LanguageProvider`
- **Hook**: `useLanguage()` → `{ language, setLanguage, t }`
- **Chaves**: ~200+ tipadas em `translations.ts`
- **Idiomas**: `pt-BR` (padrão), `en-US`

### Tradução runtime

MutationObserver traduz PT→EN automaticamente no DOM.
`POST /api/public/translate` (cache localStorage).
Skip: `<script>`, `<style>`, `<code>`, `<pre>`, contenteditable, ALL CAPS.

## 9. Tema e Design System

Design tokens em `styles/` (CSS custom properties + JS).
Tailwind CSS como framework principal.
Componentes: @headlessui/react (acessível), lucide-react (272+ ícones), sonner (toasts).

## 10. Feature Flags Frontend

```typescript
const DEFAULT_FLAGS = {
  ENABLE_CATALOG_MANAGEMENT: true,
  ENABLE_ADVANCED_REPORTING: false,
  ENABLE_NOTIFICATION_SYSTEM: false,
  ENABLE_EXPORT_FUNCTIONS: true,
  ENABLE_BULK_OPERATIONS: false,
  ENABLE_AUDIT_TRAIL_UI: false,
};
```

**FeatureFlagsManager**: localStorage + rollout progressivo por hash(userId) + hook `useFeatureFlag()`.

## 11. Catálogo de Páginas (35+)

**Públicas**: `/login`, `/aceitar-convite`, `/verificar-certificado/:hash`, `/validar/:hash`, `/c/:hash`

**Principais**: `/`, `/home`, `/funcionarios`, `/funcionarios/:id`, `/funcionarios/:id/perfil`, `/perfil/trocar-senha`

**Qualificações** (4): `/qualificacoes`, `/qualificacoes/dashboard`, `/qualificacoes/reclassificacao`, `/qualificacoes/alertas`

**FRMS** (13): `/frms`, `/frms/tripulante/:id`, `/frms/alertas`, `/frms/relatorios`, `/frms/escalas`, `/frms/configuracoes`, `/frms/importacao/fira`, `/frms/importacao/fira/historico`, `/frms/conceitos`, `/frms/fadiga-acumulada`, `/frms/checkin`, `/frms/fadiga-painel`, `/frms/controle-operacional`

**Escalas** (5): `/escalas`, `/escalas/configuracoes`, `/escalas/minha-escala` (PWA), `/escalas/visao-mensal`, `/escalas/diaria` = `/escalas/evd`

**LMS** (10): `/lms`, `/lms/cursos`, `/lms/cursos/:id`, `/lms/admin/cursos`, `/lms/player/:matriculaId`, `/lms/player/preview/:cursoId`, `/lms/player/h5p/:matriculaId`, `/lms/player/pdf/:matriculaId`, `/lms/player/pptx/:matriculaId`, `/lms/relatorios`, `/lms/matriculas`

**Simuladores** (14): `/simuladores`, `/simuladores/dashboard`, `/simuladores/desempenho/:funcionarioId`, `/simuladores/fichas`, `/simuladores/fichas/:id`, `/simuladores/configuracoes`, 7× `/simuladores/cadastros/*`, `/simuladores/relatorios`

**SGSO** (4): `/sgso`, `/sgso/relatos/:id`, `/sgso/relprev`, `/sgso/bowtie`, `/sgso/frat`

**Admin & Config** (12+): `/admin/usuarios`, `/admin/permissoes`, `/configuracoes`, `/sistema`, `/configuracoes/cadastros`, `/configuracoes/integracoes/*`, `/configuracoes/compliance`, `/importacao`, `/licencas`, `/hospedagem`, `/horas-voo`, `/treinamentos/planejados`, `/treinamentos/solicitacoes`, `/relatorios`

## 12. Hooks e Serviços

### Query Hooks (11)
useFuncionariosRQ, useQualificacoesRQ, useAgendamentosRQ, useFichasRQ, useCertificadosRQ,
useEmpresasRQ, useFuncoesRQ, useSetoresRQ, useSimuladoresRQ, useTreinamentosRQ, useAeronavesRQ

### Mutation Hooks (11)
useFuncionariosMutations, useQualificacoesMutations, useAgendamentosMutations, etc.

### Domain Hooks (40+)
useAuth, useApi, useLms, useFrms, useEscalas, useDashboard* (5), useCompliance,
useImportacao, usePastaVirtual, useSessoes, useConfirm, useDebounce, usePermissions,
useFadigaCheckin, useHorasVoo, etc.

### Services (14)
funcionarios.service, qualificacoes.service, agendamentos.service, fichasApi,
apiClient, http-client, lmsService, pdf-ficha-client, pdf-lista-presenca, etc.
