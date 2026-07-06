---
status: ativo
tipo: mapa
fonte_canonica: repo
ultimo_sha_verificado: ""
risco: baixo
ultima_revisao: "2026-07-05"
tags:
  - mapa
  - stack
---

# Mapa: Stack Tecnológico

## Backend (Worker)
| Categoria | Tecnologia | Versão |
|---|---|---|
| Runtime | Cloudflare Workers | — |
| Framework | Hono | ^4.10.1 |
| Validação | Zod + @hono/zod-validator | ^3.25.76 |
| Auth | JWT (jose, HS256) | — |
| Banco | D1 (SQLite, raw SQL) | — |
| Storage | R2 | — |
| AI | Workers AI (Llama 3.1 8B) | — |
| PDF | Browser Rendering | — |

## Frontend (React SPA)
| Categoria | Tecnologia | Versão |
|---|---|---|
| Framework | React | 19.0.0 |
| Build | Vite | 6.x |
| Roteamento | React Router DOM | ^7.9.3 |
| Server State | TanStack React Query | ^5.90.7 |
| Client State | Zustand | ^5.0.11 |
| UI | Headless UI, Lucide React, Sonner | ^2.2.8, ^0.510.0, ^2.0.7 |
| Forms | React Hook Form + Zod | ^7.66.0 |
| Charts | Recharts | ^2.15.4 |
| Documents | jsPDF, pdf-lib, pdfjs-dist, exceljs, xlsx | vários |
| LMS | scorm-again, h5p-standalone, @jvmr/pptx-to-html | ^3.0.3, ^3.8.2, ^1.0.1 |

## Dev & Deploy
| Categoria | Tecnologia |
|---|---|
| CLI | Wrangler 4.75 |
| Runtime | Node.js v26 |
| TypeScript | 5.8.3 |
| CSS | Tailwind CSS 3 |
| Lint | ESLint + guards (api-base, secrets, auth-boundaries) |
| Test | Vitest (unit), Playwright (e2e) |
| CI/CD | GitHub Actions |

## Path alias
`@` → `./src` (vite.config.ts + tsconfig.json)

## Providers hierarchy (frontend)
```
QueryClientProvider → ThemeProvider → Toaster → LanguageProvider
→ RuntimeTranslationBridge → AuthProvider → BrowserRouter
→ ErrorBoundary → Suspense → Routes
```
