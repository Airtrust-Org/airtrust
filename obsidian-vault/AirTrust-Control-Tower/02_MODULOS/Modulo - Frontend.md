---
status: ativo
tipo: contexto-modulo
fonte_canonica: repo
ultimo_sha_verificado: ""
risco: medio
modulo: "Frontend"
ultima_revisao: "2026-07-05"
nao_assumir_sem_verificar_codigo: true
tags:
  - modulo
  - frontend
  - risco/medio
---

# Frontend

## Função do módulo
SPA React 19 com Vite 6, React Router v7, TanStack Query v5, Zustand v5 e Tailwind CSS 3. Design System estilo Apple. Lazy loading universal, i18n pt-BR/en-US, Service Worker em produção.

## Arquivos principais
| Arquivo | Função |
|---|---|
| `src/react-app/main.tsx` | Entry point: tema, chunk errors, fetch patch, SW, DevTools block |
| `src/react-app/config/api.ts` | `fetchWithAuth()` com token e auto-refresh |
| `src/react-app/i18n/` | `useLanguage()` hook, ~200+ chaves |
| `src/react-app/App.tsx` | Rotas com `lazyWithRetry()` |

## Providers (ordem)
```
QueryClientProvider → ThemeProvider → Toaster (sonner)
→ LanguageProvider → RuntimeTranslationBridge → AuthProvider
→ BrowserRouter → ErrorBoundary → Suspense → Routes
```

## QueryClient config
- staleTime: 5 min
- gcTime: 30 min
- retry: 1
- refetchOnWindowFocus: false

## Estados
- **TanStack Query**: server state (cache, refetch, invalidação)
- **Zustand**: client state (persistido localStorage ou efêmero)
- **AuthProvider**: login/logout/refresh, troca de empresa limpa cache

## Páginas (50+)
Ver `src/react-app/pages/`:
- `escalas/`, `frms/`, `lms/`, `qualificacoes/`, `sgso/`, `simuladores/`
- `dashboard/`, `funcionarios/`, `compliance/`, `controle-voos/`, `mro/`, `relatorios/`
- + páginas raiz: `Funcionarios.tsx`, `Simuladores.tsx`, `Qualificacoes.tsx`, etc.

## Dependências críticas
| Lib | Versão | Uso |
|---|---|---|
| scorm-again | ^3.0.3 | Player SCORM |
| h5p-standalone | ^3.8.2 | Player H5P |
| @jvmr/pptx-to-html | ^1.0.1 | Player PPTX |
| pdfjs-dist | ^4.8.69 | Player PDF |
| recharts | ^2.15.4 | Gráficos |

## Regras de negócio críticas
1. Lazy loading com `lazyWithRetry()` — 2 tentativas: re-fetch → hard reload
2. `fetchWithAuth()` injeta token + refresh automático em 401
3. Service Worker apenas em PROD
4. Tema `light`/`dark` persistido com sync cross-tab
5. i18n com detecção: servidor → browser

## Riscos conhecidos
| Risco | Severidade | Status |
|---|---|---|
| Chunk load failure em deploy (cache desatualizado) | 🟡 MÉDIO | lazyWithRetry mitiga |
| Service Worker pode servir versão antiga | 🟡 MÉDIO | skipWaiting + clients.claim |
| Zustand persist pode corromper com mudança de schema | 🟢 BAIXO | Migrations manuais |

## O que agentes de IA NÃO podem fazer sem validação
- [ ] Alterar lógica de `fetchWithAuth` (auth + refresh)
- [ ] Modificar ordem dos providers
- [ ] Remover `lazyWithRetry` de páginas
- [ ] Alterar config do QueryClient (staleTime, gcTime)
- [ ] Modificar Service Worker sem testar em produção
