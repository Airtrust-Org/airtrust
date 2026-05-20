# RELATÓRIO TÉCNICO — AIRTRUST v1.0

_Gerado em: 14/04/2026 | Auditoria completa do código-fonte real_

---

## 1. VISÃO GERAL DO PRODUTO

**Nome:** AirTrust
**Versão:** 1.0.0 (package.json) | `APP_VERSION` gerenciado pelo script de deploy
**Propósito:** Sistema SaaS de gestão operacional aeronáutica para empresas de aviação brasileiras. Centraliza tripulações, certificações, simuladores, escalas, segurança e conformidade regulatória.
**Público-alvo:** Operadores aéreos brasileiros (helicópteros / aviação executiva). Tenant principal em produção: **Costa do Sol PTO** (empresa_id = 6).

**Problema que resolve:** Empresas de aviação civil no Brasil controlam validades de habilitações, agendamentos de simuladores, escalas de tripulação com restrições FRMS, auditorias SGSO e documentação regulatória ANAC/DECEA em planilhas, sistemas legados ou papel. O Airtrust unifica tudo em uma plataforma web multi-tenant.

### Funcionalidades Implementadas (produção)

| Módulo                                                                        | Status       |
| ----------------------------------------------------------------------------- | ------------ |
| Gestão de Funcionários (CRUD, pasta virtual, ficha 360°)                      | Produção     |
| Qualificações e certificados (histórico, alertas, vencimentos, PDF)           | Produção     |
| Habilitações ANAC (módulo separado de qualificações)                          | Produção     |
| Licenças ANAC dos tripulantes                                                 | Produção     |
| Simuladores (agendamento, fichas de sessão, manobras, relatórios)             | Produção     |
| FRMS — Flight & Rest Management System (jornadas, fadiga, alertas)            | Produção     |
| Escalas Mensais / Quinzenais (planejamento, alocações, EVD, diff por revisão) | Produção     |
| SGSO — Segurança Operacional (relatos, FRAT, Bowtie, auditorias, KPI)         | Produção     |
| Compliance (score por tripulante, ficha 360°, recalculate)                    | Produção     |
| Integração EdApp (LMS — webhook + cron reconciliação a cada 10 min)           | Produção     |
| Notificações WhatsApp (Twilio) + e-mail                                       | Produção     |
| Horas de Voo (caderneta digital, saldo, lançamentos)                          | Produção     |
| Hospedagem de Tripulantes                                                     | Produção     |
| Solicitações de Treinamento (workflow gestor→ops)                             | Produção     |
| Backup automatizado para R2 (diário 3h / semanal dom 4h / mensal dia-1 5h)    | Produção     |
| Importação XLSX e CSV de histórico de qualificações                           | Produção     |
| Exportação PDF (certificados, escalas, fichas, relatórios)                    | Produção     |
| Admin: gestão de usuários, multi-tenant, migrações manuais                    | Produção     |
| Assistente IA (Cloudflare Workers AI)                                         | Produção     |
| Internacionalização (i18n pt-BR / en-US)                                      | Implementado |

### Funcionalidades Pendentes / TODOs reais encontrados no código

| Arquivo                                                           | TODO                                                                                           | Impacto                                                             |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `services/backup/orchestrator.ts:115`                             | Fluxo principal salva manifesto de metadados do R2, mas não executa cópia integral dos objetos | Recuperação depende do bucket primário para o conteúdo dos arquivos |
| `routes/funcionarios.ts:567`                                      | Habilitar stats de qualificação por funcionário                                                | Stats desabilitadas (tabela de relação inexistente)                 |
| `src/react-app/pages/simuladores/cadastros/modelos/index.tsx:363` | Implementar importação de relações modelo-manobra                                              | Relações devem ser criadas manualmente                              |
| `vite.config.ts` + build atual                                    | Chunk `excel` continua muito grande mesmo isolado                                              | Warning de bundle acima de 600 kB após minificação                  |

---

## 2. ARQUITETURA GERAL

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLOUDFLARE NETWORK                          │
│                                                                 │
│  ┌──────────────────┐       ┌──────────────────────────────┐   │
│  │  Cloudflare Pages │       │  Cloudflare Workers          │   │
│  │  (frontend SPA)   │ HTTP  │  airtrust-api-production     │   │
│  │  airtrust.pages.. │──────▶│  api.airtrust.online         │   │
│  │  React 19 + Vite  │◀─────│  Hono v4 + TypeScript        │   │
│  └──────────────────┘  JSON  └──────────┬───────────────────┘   │
│                                         │                       │
│               ┌─────────────────────────┼───────────────┐      │
│               │                         │               │      │
│    ┌──────────▼──────────┐  ┌───────────▼───────┐  ┌────▼───┐ │
│    │  Cloudflare D1      │  │  Cloudflare R2    │  │  CF AI │ │
│    │  airtrust-db (prod) │  │  airtrust-storage │  │  (IA)  │ │
│    │  301 migrations     │  │  PDFs/backups     │  └────────┘ │
│    └─────────────────────┘  └───────────────────┘             │
└─────────────────────────────────────────────────────────────────┘

Serviços Externos:
  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  ┌──────────┐
  │  EdApp   │  │  Twilio  │  │  CF Browser      │  │ SendGrid │
  │  LMS     │  │ WhatsApp │  │  Rendering API   │  │  (email) │
  │  webhook │  │ alertas  │  │  HTML → PDF      │  │          │
  └──────────┘  └──────────┘  └──────────────────┘  └──────────┘
  ┌──────────┐  ┌──────────┐
  │  Sentry  │  │  Redis   │
  │  (erros) │  │ (Upstash)│
  └──────────┘  └──────────┘
```

**Padrão Arquitetural:** Feature-based + Service Layer. Separação por camadas: Routes (controllers finos) → Middleware → Services/Lib (negócio) → Utils → DB.

**Comunicação Cross-Domain:** Tabela `domain_events` como barramento interno. Módulos publicam via `publishDomainEvent()` (`shared/domainEvents.ts`) e handlers processam assincronamente.

**Monorepo:** Repositório único com dois projetos:

- `/src/react-app/` — Frontend SPA
- `/worker-airtrust/` — Backend API (Cloudflare Worker)
- `/worker-frontend/` — Worker auxiliar para servir o frontend (~8KB)

---

## 3. STACK TECNOLÓGICA COMPLETA

### Frontend (package.json raiz — v0.0.0)

| Categoria          | Tecnologia                     | Versão        |
| ------------------ | ------------------------------ | ------------- |
| Linguagem          | TypeScript                     | 5.8.3         |
| Framework UI       | React + React DOM              | 19.0.0        |
| Build Tool         | Vite                           | ^6.2.0        |
| Roteamento         | React Router DOM               | ^7.9.3        |
| Estado servidor    | TanStack React Query           | ^5.90.7       |
| Query DevTools     | @tanstack/react-query-devtools | ^5.90.2       |
| Estado cliente     | Zustand                        | ^5.0.11       |
| Formulários        | React Hook Form                | ^7.66.0       |
| Resolvers          | @hookform/resolvers            | ^5.2.2        |
| Validação          | Zod                            | ^3.25.76      |
| Estilização        | Tailwind CSS                   | ^3.4.17       |
| Tailwind Forms     | @tailwindcss/forms             | ^0.5.10       |
| Tailwind Container | @tailwindcss/container-queries | ^0.1.1        |
| Merge classes      | tailwind-merge                 | ^3.4.0        |
| Utilitário classes | clsx                           | ^2.1.1        |
| Componentes        | Headless UI                    | ^2.2.8        |
| Ícones             | Lucide React                   | ^0.510.0      |
| Ícones             | Material Symbols               | ^0.40.2 (npm) |
| Toasts             | Sonner                         | ^2.0.7        |
| Gráficos           | Recharts                       | ^2.15.4       |
| PDF (client)       | jsPDF                          | ^3.0.4        |
| PDF (client)       | html2canvas                    | ^1.4.1        |
| PDF (client)       | pdf-lib                        | ^1.17.1       |
| PDF viewer         | react-pdf                      | ^9.2.1        |
| Virtualização      | TanStack React Virtual         | ^3.13.12      |
| Drag & Drop        | @dnd-kit/core                  | ^6.3.1        |
| Drag & Drop alt    | @hello-pangea/dnd              | ^18.0.1       |
| Floating UI        | @floating-ui/react             | ^0.27.19      |
| Data               | date-fns                       | ^4.1.0        |
| Máscara de input   | react-input-mask               | ^2.0.4        |
| CSV                | PapaParse                      | ^5.5.3        |
| Excel export       | ExcelJS                        | ^4.4.0        |
| Sanitização        | DOMPurify                      | ^3.3.1        |
| S3 upload          | @aws-sdk/client-s3             | ^3.888.0      |
| Framework HTTP     | Hono                           | ^4.10.1       |
| Validação Hono     | @hono/zod-validator            | ^0.5.0        |

### DevDependencies (frontend, seleção)

| Tecnologia                  | Versão   |
| --------------------------- | -------- |
| @vitejs/plugin-react        | 4.4.1    |
| @cloudflare/vite-plugin     | ^1.12.0  |
| Vitest (frontend)           | ^4.0.8   |
| @playwright/test            | ^1.57.0  |
| @testing-library/react      | ^16.3.0  |
| @testing-library/user-event | ^14.5.2  |
| MSW (mock HTTP)             | ^2.12.10 |
| ESLint                      | ^9.39.1  |
| typescript-eslint           | 8.31.0   |
| jscpd (dup detector)        | ^4.0.5   |
| Wrangler CLI                | ^4.33.0  |
| concurrently                | ^9.2.1   |

### Backend (worker-airtrust/package.json — v1.0.0)

| Tecnologia                | Versão        |
| ------------------------- | ------------- |
| Hono                      | ^4.10.1       |
| @hono/zod-validator       | ^0.5.0        |
| Zod                       | ^3.25.76      |
| jose (JWT)                | ^5.2.0        |
| bcryptjs                  | ^3.0.3        |
| pdfkit                    | ^0.17.2       |
| pdf-lib                   | ^1.17.1       |
| qrcode                    | ^1.5.4        |
| qrcode-generator          | ^2.0.4        |
| unpdf                     | ^1.4.0        |
| PapaParse                 | ^5.5.3        |
| fflate                    | ^0.8.2        |
| Vitest (worker)           | ^2.1.9        |
| Wrangler CLI              | ^4.46.0       |
| @cloudflare/workers-types | ^4.20241127.0 |

> **Importante:** O README menciona Drizzle ORM, mas o código usa **SQL raw direto via D1**: `c.env.DB.prepare(sql).bind(...).first<T>()` / `.all<T>()` / `.run()`. Não há ORM em runtime.

> **Dois Vitest:** Frontend usa `^4.0.8`, Worker usa `^2.1.9`. São configurações independentes.

### Infraestrutura

| Serviço               | Detalhe                                                          |
| --------------------- | ---------------------------------------------------------------- |
| Cloudflare Pages      | Frontend SPA — `airtrust.pages.dev`                              |
| Cloudflare Workers    | Backend API — `api.airtrust.online`                              |
| Cloudflare D1         | `airtrust-db` (prod) / `airtrust-db-staging` / `airtrust-db-dev` |
| Cloudflare R2         | `airtrust-storage` (shared entre ambientes)                      |
| Cloudflare Workers AI | Binding `AI` — assistente integrado                              |
| GitHub Actions        | 9 workflows de CI/CD                                             |

### Serviços Externos

| Serviço                          | Uso                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------- |
| Twilio                           | WhatsApp Business — alertas de vencimento                                     |
| EdApp                            | LMS — sincroniza cursos com qualificações (webhook + cron 10 min)             |
| Cloudflare Browser Rendering API | Conversão HTML→PDF (`CF_BROWSER_API_TOKEN`)                                   |
| SendGrid                         | Convites e e-mails transacionais do fluxo administrativo (`SENDGRID_API_KEY`) |
| Sentry                           | Monitoramento de erros (`SENTRY_DSN`)                                         |
| Redis (Upstash)                  | Cache externo (`REDIS_URL` + `REDIS_TOKEN`)                                   |
| ANAC API                         | Dados regulatórios (`ANAC_API_KEY`)                                           |
| DECEA API                        | Dados de espaço aéreo (`DECEA_API_KEY`)                                       |

---

## 4. ESTRUTURA DE DIRETÓRIOS

```
Airtrust/                                    # Monorepo raiz (~258MB com histórico git)
│
├── .github/
│   └── workflows/                           # 9 pipelines CI/CD
│       ├── deploy.yml                       # Deploy completo (Worker + Pages)
│       ├── deploy-pages.yml                 # Deploy só do Pages
│       ├── ci.yml                           # Lint + Test + Build
│       ├── test.yml                         # Vitest + Playwright
│       ├── lint.yml                         # ESLint + Prettier
│       ├── pr-check.yml                     # Validação de PR
│       ├── auto-fix.yml                     # Auto-fix e formatação
│       ├── validate-secrets.yml             # Scan de secrets no código
│       └── demo-data-prevention.yml         # Proteção de dados de demo
│
├── worker-airtrust/                         # Backend — Cloudflare Worker (~3.4MB)
│   ├── src/
│   │   ├── index.ts                         # Entry point (1185 linhas) — Hono + middlewares + rotas
│   │   ├── routes/                          # 123 arquivos de rotas
│   │   │   ├── auth.ts                      # Login, refresh, logout, convites
│   │   │   ├── funcionarios.ts              # CRUD + ficha 360° + compliance
│   │   │   ├── qualificacoes-*.ts           # Histórico, tipos, alertas, dashboard
│   │   │   ├── habilitacoes.ts              # Habilitações ANAC (módulo separado)
│   │   │   ├── licencas.ts                  # Licenças ANAC
│   │   │   ├── certificados.ts              # Geração e validação de certs (QR público)
│   │   │   ├── simuladores*.ts              # CRUD + agendamentos + fichas + manobras
│   │   │   ├── escalas*.ts                  # Planejamento + alocações + EVD + diff
│   │   │   ├── frms*.ts                     # Jornadas + fadiga + alertas + check-in
│   │   │   ├── sgso*.ts                     # Relatos + FRAT + Bowtie + auditorias
│   │   │   ├── compliance-*.ts              # Score + recalculate
│   │   │   ├── hospedagem.ts                # Acomodações de tripulantes
│   │   │   ├── horas-voo.ts                 # Caderneta digital
│   │   │   ├── treinamentos.ts              # Solicitações de treinamento
│   │   │   ├── importacao.ts                # Import CSV/XLSX
│   │   │   ├── importacao-xlsx.ts           # Import XLSX específico
│   │   │   ├── exportacao.ts                # Export dados
│   │   │   ├── backup.ts                    # Backup e restore
│   │   │   ├── admin-usuarios.ts            # Gestão de usuários + convites com SendGrid
│   │   │   ├── fix-renovadas.ts             # Fix de qualificações renovadas (protegido por auth + role)
│   │   │   ├── dashboard.ts                 # Agregação dashboard
│   │   │   ├── assistente.ts                # Assistente IA (Workers AI)
│   │   │   ├── empresas.ts                  # Multi-tenant
│   │   │   ├── notificacoes.ts              # Notificações in-app
│   │   │   └── assets.ts                    # CRUD R2
│   │   ├── middleware/                      # 12 middlewares
│   │   │   ├── auth.ts                      # JWT Bearer + dev bypass
│   │   │   ├── cors.ts                      # CORS dinâmico por origem
│   │   │   ├── error-handler.ts             # Handler global + helpers
│   │   │   ├── cache.ts                     # Cache-Control headers
│   │   │   ├── no-cache.ts                  # Disable cache (staging/dev + rotas críticas)
│   │   │   ├── rate-limit.ts                # Rate limiting (presets: strict/moderate/lenient)
│   │   │   ├── rbac.ts                      # requireRole() factory
│   │   │   ├── tenant.ts                    # Injeta empresaId no contexto
│   │   │   ├── requestId.ts                 # X-Request-ID para rastreamento
│   │   │   ├── response.ts                  # Padronização de resposta
│   │   │   ├── domainEventProcessor.ts      # Intercepta e enfileira domain events
│   │   │   └── processarEventos.ts          # Processa domain events (handlers)
│   │   ├── services/
│   │   │   ├── backup/
│   │   │   │   └── orchestrator.ts          # Backup diário/semanal/mensal → R2 (TODO: async)
│   │   │   ├── edapp-course-progress-reconciliation.ts
│   │   │   └── dashboardService.ts          # Agregação dashboard (6 TODOs ativos)
│   │   ├── lib/
│   │   │   ├── frms/                        # Engine FRMS (18 arquivos)
│   │   │   │   └── calculos.ts              # Acúmulos rolling 7d/28d/365d/mensal
│   │   │   └── pdf/                         # Geração de PDF de certificados
│   │   ├── cron/
│   │   │   ├── scheduled-handler.ts         # Orquestrador de crons
│   │   │   ├── notificacoes.ts              # Alertas diários 08h UTC
│   │   │   ├── frms-daily-check.ts          # Check FRMS diário
│   │   │   └── sgso-notificacoes.ts         # Alertas SLA SGSO
│   │   ├── shared/
│   │   │   ├── domainEvents.ts              # publishDomainEvent()
│   │   │   └── handlers/                    # Handlers cross-domain
│   │   ├── utils/
│   │   │   ├── security.ts                  # JWT, bcrypt, sanitização, CPF/e-mail
│   │   │   ├── db.ts                        # softDelete(), calculatePagination(), buildSearchWhere()
│   │   │   ├── logger.ts                    # createLogger() + createStructuredConsole()
│   │   │   ├── auditoria.ts                 # Registro em admin_actions_audit
│   │   │   ├── dates.ts                     # Utilitários de data BR
│   │   │   ├── escala-engine.ts             # Motor de cálculo de escalas
│   │   │   ├── errors.ts                    # Classes de erro customizadas
│   │   │   ├── whatsapp*.ts                 # Integração WhatsApp
│   │   │   └── twilio*.ts                   # Integração Twilio
│   │   └── types/
│   │       └── index.ts                     # Env, Variables, ApiResponse<T>
│   ├── migrations/                          # 301 arquivos SQL (0000 → 0334 + legacy)
│   ├── seeds/                               # Seeds: AW139, SK76, manobras, tipos sessão
│   ├── package.json
│   ├── wrangler.toml                        # Config Cloudflare (bindings, cron, envs)
│   └── tsconfig.json
│
├── src/
│   ├── react-app/                           # Aplicação React SPA (~7.4MB)
│   │   ├── App.tsx                          # Router principal + lazy routes
│   │   ├── main.tsx                         # ReactDOM entry
│   │   ├── navigation.config.ts             # Definição tipada do menu
│   │   ├── pages/                           # 61 páginas (+ subpastas)
│   │   │   ├── Funcionarios.tsx
│   │   │   ├── Qualificacoes.tsx
│   │   │   ├── DashboardPrincipal.tsx       # Em modificação (git status)
│   │   │   ├── Simuladores.tsx
│   │   │   ├── LicencasPage.tsx
│   │   │   ├── HospedagemPage.tsx
│   │   │   ├── FichaFuncionarioPage.tsx
│   │   │   ├── AceitarConvite.tsx
│   │   │   ├── TrocarSenhaPage.tsx
│   │   │   ├── funcionarios/PerfilFuncionario.tsx
│   │   │   ├── qualificacoes/Alertas.tsx
│   │   │   ├── escalas/EscalasMensais.tsx
│   │   │   ├── escalas/MinhaEscalaPage.tsx
│   │   │   ├── escalas/EvdPage.tsx
│   │   │   ├── frms/FrmsDashboard.tsx
│   │   │   ├── simuladores/agenda/
│   │   │   ├── simuladores/fichas/
│   │   │   └── admin/UsuariosPage.tsx
│   │   ├── components/                      # ~220 componentes
│   │   │   ├── ui/                          # 25+ componentes do Design System
│   │   │   ├── layout/                      # Layout, sidebar, header
│   │   │   └── ProtectedRoute.tsx
│   │   ├── context/
│   │   │   └── AuthContext.tsx              # Auth + multi-tenant + dev auto-login
│   │   ├── hooks/                           # useAuth, wrappers React Query
│   │   ├── lib/
│   │   │   └── apiFetch.ts                  # Cliente HTTP autenticado
│   │   ├── services/
│   │   │   └── pdf-ficha-client.ts          # Em modificação (git status)
│   │   ├── config/
│   │   │   ├── api.ts                       # URL base + token
│   │   │   └── systemSettings.ts
│   │   └── i18n/                            # pt-BR / en-US com LanguageProvider
│   ├── pages/                               # Páginas standalone (fora do react-app)
│   │   └── ImportacaoPageV2.tsx
│   ├── components/                          # Componentes legados/compartilhados
│   ├── __tests__/                           # Testes unitários
│   └── shared/                              # Código compartilhado FE + BE
│
├── worker-frontend/                         # Worker auxiliar para servir frontend (~8KB)
├── docs/                                    # 65 arquivos de documentação
├── scripts/                                 # Scripts de deploy e setup
│   ├── build-and-deploy.sh
│   ├── deploy-worker-only.sh                # Injeta APP_VERSION automaticamente
│   ├── setup-local-db.sh
│   └── init-db.sh
├── e2e/                                     # Testes Playwright
├── public/                                  # Assets estáticos
├── dist/                                    # Build de produção (gerado)
├── _arquivos_nao_usados/                    # Código morto pendente de remoção
│
├── .env.example                             # Template de variáveis frontend
├── package.json                             # Scripts raiz (26 scripts) + deps frontend
├── vite.config.ts                           # Config Vite (code split, proxy)
├── tailwind.config.js                       # Config Tailwind customizada
├── tsconfig.json                            # TS config raiz (references)
├── tsconfig.app.json                        # TS config frontend
├── tsconfig.node.json                       # TS config Node.js
├── tsconfig.worker.json                     # TS config Worker
├── eslint.config.js                         # ESLint 9 flat config
├── .prettierrc.json                         # Regras Prettier
├── playwright.config.ts                     # Config E2E
├── vitest.config.ts                         # Config unit tests (frontend)
└── README.md
```

> **Atenção:** A raiz contém dezenas de arquivos `.sh`, `.sql`, `.py`, `.md` de auditoria e scripts ad-hoc que deveriam ser removidos ou movidos para `docs/` ou `scripts/`. A pasta `_arquivos_nao_usados/` contém código morto.

---

## 5. BANCO DE DADOS E MODELOS DE DADOS

**Engine:** Cloudflare D1 (SQLite serverless)
**Acesso:** SQL raw via binding `DB` — `c.env.DB.prepare(sql).bind(...).first<T>()` / `.all<T>()` / `.run()`
**Helpers disponíveis:** `softDelete()`, `calculatePagination()`, `buildSearchWhere()` em `utils/db.ts`

### Migrations

**Total:** 301 arquivos SQL em `worker-airtrust/migrations/`
**Numeração:** `0000_` → `0334_` (com gaps e alguns arquivos com numeração legacy como `132_` e `9999_`)
**Aplicação:** Manual via `wrangler d1 execute airtrust-db --remote --file=./migrations/NNNN.sql`

> **Problema:** Sem tracking automático de migrations aplicadas. Há numeração duplicada em alguns intervalos (`0062_*`, `0092_*`, `0107_*`). Risco de inconsistência entre ambientes.

### Principais Tabelas (inferidas das migrations e código)

| Tabela                                | Propósito                                                                                                |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `empresas`                            | Tenants — `id, nome, codigo, ativo, deleted_at`                                                          |
| `usuarios`                            | Usuários — `id, email, senha_hash, role (ADMIN/SUPERVISOR/USER), deleted_at`                             |
| `usuarios_empresas`                   | N:N usuário↔empresa + `is_primary`                                                                       |
| `convites_usuarios`                   | Tokens de convite para onboarding                                                                        |
| `refresh_tokens`                      | Refresh tokens JWT com expiração (30d)                                                                   |
| `token_blocklist`                     | Tokens JWT revogados                                                                                     |
| `funcionarios`                        | Tripulantes — `nome, cpf, matricula, empresa_id, funcao_id, setor_id, status, deleted_at`                |
| `funcoes`                             | Cargos organizacionais                                                                                   |
| `setores`                             | Setores organizacionais                                                                                  |
| `aeronaves`                           | Frota da empresa                                                                                         |
| `modelos_aeronave`                    | Modelos de aeronave                                                                                      |
| `licencas`                            | Licenças ANAC dos tripulantes                                                                            |
| `habilitacoes`                        | Habilitações ANAC (módulo separado de qualificações)                                                     |
| `qualificacoes_tipos`                 | Catálogo — `codigo, nome, validade_meses, vencimento_fim_mes, tipo_treinamento`                          |
| `qualificacoes_historico`             | Histórico — `funcionario_id, qualificacao_id, data_conclusao, data_vencimento, renovada, deleted_at`     |
| `qualificacoes_historico_stats_v`     | View materializada — counts de qualificações                                                             |
| `qualificacoes_historico_stats_daily` | Snapshot diário de stats                                                                                 |
| `certificados_templates`              | Templates HTML de certificados por empresa                                                               |
| `arquivos`                            | Metadados de arquivos no R2 (`bucket_key, nome_original, mime_type`)                                     |
| `simuladores`                         | Cadastro de simuladores de voo                                                                           |
| `simulador_agendamentos`              | Agendamentos — `data, status (CONCLUIDO/PENDENTE), deleted_at`                                           |
| `sessoes_simulador`                   | Sessões de treinamento                                                                                   |
| `fichas_sessao`                       | Fichas de avaliação de sessão                                                                            |
| `fichas_sessao_manobras`              | Manobras avaliadas (nota, comentários)                                                                   |
| `modelos_sessao`                      | Templates de sessão — `gera_qualificacao (boolean)`                                                      |
| `manobras`                            | Catálogo de manobras                                                                                     |
| `manobras_categorias`                 | Categorias de manobras                                                                                   |
| `frms_jornadas`                       | Jornadas — `tripulante_id, data, status (ES/TS/TV/RE...), duracao, horas_voo, repouso`                   |
| `frms_configuracoes`                  | Limites regulatórios por empresa (FDP, horas de voo, repouso)                                            |
| `frms_alertas`                        | Alertas — nível CRITICO/ALTO/MEDIO/BAIXO                                                                 |
| `frms_escalas`                        | Escalas futuras para validação FRMS preventiva                                                           |
| `frms_fadiga_checkin_diario`          | Check-in diário de fadiga                                                                                |
| `escalas`                             | Planejamento — `data_inicio, data_fim, numero_revisao, published_at, status (ATIVA/PUBLICADA/ARQUIVADA)` |
| `escala_alocacoes`                    | Alocações — `escala_id, tripulante_id, dia, evento_tipo_id, modelo_aeronave_id`                          |
| `escala_quinzenas`                    | Períodos quinzenais para cálculo de jornada                                                              |
| `escala_tipos_evento`                 | Tipos de evento do calendário + `sigla`                                                                  |
| `escala_situacao_tipos`               | Situações de alocação (folga, licença, sobreaviso...)                                                    |
| `escala_confirmacoes`                 | Confirmações de ciência do tripulante                                                                    |
| `sgso_relatos`                        | Relatos de segurança operacional                                                                         |
| `sgso_acoes`                          | Ações CAPA vinculadas a relatos                                                                          |
| `sgso_auditorias`                     | Auditorias de segurança                                                                                  |
| `sgso_nao_conformidades`              | Não-conformidades detectadas                                                                             |
| `sgso_frat`                           | FRAT (Flight Risk Assessment Tool) por relato                                                            |
| `hospedagem`                          | Acomodações de tripulantes                                                                               |
| `horas_voo_saldo`                     | Saldos de horas de voo                                                                                   |
| `horas_voo_lancamentos`               | Lançamentos individuais de voo                                                                           |
| `solicitacoes_treinamento`            | Workflow gestor→ops                                                                                      |
| `pasta_virtual_documentos`            | Documentos digitais — `funcionario_id, arquivo_tipo, data_upload`                                        |
| `alertas`                             | Alertas in-app — `funcionario_id, tipo, mensagem, data_criacao, lido_em`                                 |
| `notificacoes_sistema`                | Notificações do sistema                                                                                  |
| `alertas_whatsapp_log`                | Auditoria de alertas WhatsApp enviados                                                                   |
| `domain_events`                       | Barramento de eventos cross-domain                                                                       |
| `admin_actions_audit`                 | Log de ações administrativas                                                                             |
| `api_latency_samples`                 | Métricas de latência de rotas                                                                            |
| `security_rate_limit`                 | Estado de rate limiting por IP/usuário                                                                   |
| `edapp_usuarios_mapeamento`           | Mapeamento funcionário ↔ usuário EdApp                                                                   |
| `edapp_cursos_mapeamento`             | Mapeamento curso EdApp ↔ qualificacao_codigo                                                             |
| `importacoes_log`                     | Log de importações XLSX/CSV                                                                              |
| `backup_controle`                     | Controle de backups — `tipo (DIARIO/SEMANAL/MENSAL), status, escopo (INCREMENTAL/COMPLETO)`              |

**Soft Delete:** Universal — `deleted_at DATETIME NULL` em todas as entidades. Nunca usar `DELETE` SQL.

**Índices de Performance:** Criados na migration `0334_performance_indexes.sql` para `qualificacoes_historico` (por `funcionario_id`, `qualificacao_id`, `data_conclusao`) e `escala_alocacoes`.

**Seeds:** `worker-airtrust/seeds/` + migrations com `_seed_` no nome. Dados demo: AW139, SK76, manobras, tipos de sessão.

---

## 6. ROTAS E API

**Prefixo:** `/api`
**URL produção:** `https://api.airtrust.online/api`
**URL dev:** `http://localhost:8787/api`
**Versionamento:** Não implementado (sem `/v1/`).

**Formato de resposta padrão:**

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string; // SNAKE_CASE
  message?: string;
}
// Paginado: { success: true, data: [...], total: N, page: P, limit: L }
```

**Cache desabilitado** (no-cache forçado) para: escalas, FRMS, SGSO, EVD, qualificações histórico, certificados — dados operacionais críticos.

### Rotas Públicas (sem autenticação)

```
POST /api/auth/login                     Login email + senha → JWT + refresh token
POST /api/auth/refresh                   Renovar access token
POST /api/auth/aceitar-convite           Aceitar convite + criar senha
GET  /api/certificados/validar/:hash     Validar certificado (QR code)
POST /api/integracoes/edapp/webhook      Webhook EdApp (sem auth, com HMAC)
POST /api/alertas/whatsapp/status-callback  Status callback Twilio
GET  /api/health                         Health check
GET  /api/version                        Informações de versão
GET  /api/assets/*                       Download de assets R2
GET  /api/public/*                       Endpoints públicos gerais
```

### Autenticação — Protegidas

```
GET  /api/auth/me                        Dados do usuário autenticado
GET  /api/auth/empresas                  Empresas do usuário (multi-tenant)
POST /api/auth/trocar-senha              Alterar senha
POST /api/auth/logout                    Revogar token (adiciona à blocklist)
```

### Funcionários — Protegidas

```
GET    /api/funcionarios                 Lista paginada + busca
GET    /api/funcionarios/:id             Detalhe completo
POST   /api/funcionarios                 Criar
PUT    /api/funcionarios/:id             Atualizar
DELETE /api/funcionarios/:id             Soft delete
GET    /api/funcionarios/:id/ficha-360   Ficha 360° (overview completo do tripulante)
GET    /api/funcionarios/:id/compliance  Score de compliance
```

### Qualificações — Protegidas

```
GET|POST|PUT|DELETE /api/qualificacoes/historico
GET|POST|PUT|DELETE /api/qualificacoes/tipos
POST                /api/qualificacoes/reclass        Reclassificação
GET                 /api/qualificacoes/alertas
GET                 /api/qualificacoes/dashboard
POST                /api/qualificacoes/certificados   Emitir PDF → R2
GET                 /api/qualificacoes/certificados/:id
```

### Habilitações e Licenças — Protegidas

```
GET|POST|DELETE /api/habilitacoes
GET|POST        /api/licencas
```

### Simuladores — Protegidas

```
GET|POST|PUT|DELETE /api/simuladores
GET|POST            /api/simulador/agendamentos
GET|POST|PATCH      /api/simuladores/sessoes
GET|POST            /api/simuladores/fichas
GET|POST            /api/simuladores/tipos-sessao
GET|POST            /api/simuladores/modelos-sessao
GET|POST            /api/simuladores/manobras
GET|POST            /api/simuladores/categorias
GET                 /api/simuladores/relatorios
```

### FRMS — Protegidas

```
GET|POST|PUT|DELETE /api/frms/jornadas
GET                 /api/frms/painel                  Dashboard FRMS
GET                 /api/frms/alertas
POST                /api/frms/checkin                 Check-in diário fadiga
```

### Escalas — Protegidas

```
GET|POST|PUT|DELETE /api/escalas
GET|POST            /api/escalas/:id/alocacoes        Motor de alocação
POST                /api/escalas/:id/publicar         Publicar escala
GET                 /api/escalas/:id/diff             Diff entre revisões
GET                 /api/escalas/evd                  Escala de Voo Diária
GET                 /api/escalas/:id/conflitos
GET|POST            /api/escalas/templates
POST                /api/escalas/confirmacoes
```

### SGSO — Protegidas

```
GET    /api/sgso                         Dashboard SGSO
GET    /api/sgso/kpi                     KPIs de segurança
POST   /api/sgso/notificacoes            Criar notificação SGSO
GET|POST /api/sgso/relatos
GET|PATCH /api/sgso/relatos/:id
POST   /api/sgso/relatos/:id/avaliacao-risco
POST   /api/sgso/relatos/:id/acoes
GET|POST /api/sgso/auditorias
GET|POST /api/sgso/nao-conformidades
GET|POST /api/sgso/frat
GET|POST /api/sgso/bowtie
```

### Compliance — Protegidas

```
POST /api/compliance/recalculate         Recalcular scores (TODO: userId hardcoded como 1)
```

### Demais módulos — Protegidas

```
GET|POST|DELETE /api/horas-voo/:id/saldo
GET|POST        /api/horas-voo/:id/lancamentos
GET|POST|PUT|DELETE /api/hospedagem
GET|POST        /api/treinamentos/solicitacoes
POST            /api/importacao                       CSV
POST            /api/importacao-xlsx                  XLSX
GET             /api/importacao/template              Template CSV ou XLS compatível com Excel/LibreOffice
GET             /api/exportacao/funcionarios
GET             /api/exportacao/qualificacoes
GET             /api/exportacao/escalas
POST            /api/backup/create
GET             /api/backup/list
POST            /api/backup/restore/:id
GET             /api/dashboard
GET             /api/dashboard/alertas
GET|POST        /api/notificacoes
PUT             /api/notificacoes/:id/ler
GET             /api/aeronaves
GET             /api/modelos-aeronave
GET             /api/funcoes
GET             /api/setores
GET             /api/lookup                           Dados de lookup consolidados
GET             /api/assistente                       Assistente IA (Workers AI)
GET|POST        /api/empresas
GET             /api/empresas/:id/usuarios
GET             /api/integracoes/edapp/status
GET             /api/auditoria
```

### Rotas Administrativas — `admin only`

```
GET  /api/notificacoes/processar
POST /api/backup/create
POST /api/backup/restore/:id
GET  /api/auditoria
```

---

## 7. AUTENTICAÇÃO E AUTORIZAÇÃO

### Fluxo de Autenticação

1. `POST /api/auth/login` — `{ email, password }`
2. Backend verifica com `bcryptjs.compare()` contra `usuarios.senha_hash`
3. Retorna `{ token (JWT 7d), refreshToken (30d), user: { id, email, role } }`
4. Frontend armazena em `sessionStorage` (padrão) com fallback para `localStorage` (persistent login)
5. Todas as requests incluem `Authorization: Bearer <token>`
6. Middleware `auth.ts` verifica via `jose.jwtVerify()` com `JWT_SECRET`
7. Em 401, frontend chama `POST /api/auth/refresh`

### Constantes de Storage (AuthContext.tsx)

```typescript
const TOKEN_KEY = 'airtrust_token';
const REFRESH_TOKEN_KEY = 'airtrust_refresh_token';
const USER_KEY = 'airtrust_user';
// readAuthStorage: sessionStorage || localStorage
// writeAuthStorage: sessionStorage (remove do localStorage)
```

### Roles (RBAC — confirmados no código real)

| Role         | Acesso                                   |
| ------------ | ---------------------------------------- |
| `ADMIN`      | Acesso total + operações destrutivas     |
| `SUPERVISOR` | Supervisão de operações                  |
| `USER`       | Acesso padrão / leitura + ações próprias |

Verificação via `middleware/rbac.ts` com `requireRole()`. O JWT payload inclui o role.

### Dev Auth Bypass

Em desenvolvimento, se `ENABLE_DEV_AUTH_BYPASS=true` no `.dev.vars`:

- Desativa validação JWT completamente
- Hardcoded: `userId = 1`, `role = 'ADMIN'`
- Middleware `auth.ts` lança erro se ativado em ambiente não-development

### Multi-tenancy

- Usuários pertencem a múltiplas empresas via `usuarios_empresas`
- `tenantMiddleware` injeta `empresaId` no contexto Hono via `getTenantContext(c)` / `getEmpresaId(c)`
- Resolve empresa do JWT ou faz fallback via `funcionarios`
- Todas as queries filtram por `empresa_id` — responsabilidade da aplicação (D1 sem row-level security)

### Segurança Adicional

- `token_blocklist`: tokens revogados em logout
- Rate limiting D1-backed: `10 req/s` global, `5 req/s` em login
- Headers: `X-Frame-Options: DENY`, CSP completo, `HSTS` (produção), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`
- Sanitização: `DOMPurify` (frontend) + `sanitizeString()` + validação CPF/e-mail (backend)

---

## 8. FLUXOS DE NEGÓCIO PRINCIPAIS

### Fluxo 1: Login e Troca de Tenant

```
Usuário → /login → POST /api/auth/login
→ Recebe JWT + lista de empresas vinculadas
→ AuthContext: token em sessionStorage, empresa ativa definida
→ Se múltiplas empresas → seletor na navbar
→ Todas as telas filtram dados da empresa selecionada automaticamente
```

### Fluxo 2: Ciclo de Vida de Qualificações

```
Admin cadastra tipo (qualificacoes_tipos) com validade em meses
→ Conclui treinamento → POST /api/qualificacoes/historico
→ data_vencimento = data_conclusao + validade_meses
  (trigger SQL: 0323_smart_trigger_data_vencimento.sql)
→ Cron diário 08h UTC → verifica vencimentos → cria alertas
→ WhatsApp via Twilio (30/15/7 dias antes do vencimento)
→ Certificado: CF Browser Rendering API (HTML→PDF) → R2
→ QR code → /certificado/:hash (validação pública sem auth)
→ Renovação: nova linha em qualificacoes_historico + renovada = 1 na anterior
→ Integração EdApp: curso concluído no LMS → webhook → qualificação automática
```

### Fluxo 3: Escalas

```
Gestor cria escala (POST /api/escalas) → numero_revisao = 1
→ Aloca tripulantes (POST /api/escalas/:id/alocacoes)
  → Motor verifica conflitos automáticos (disponibilidade, FRMS, qualificações)
  → GET /api/escalas/:id/conflitos em tempo real
→ Visualização em calendário quinzenal (EVD)
→ FRMS valida limites de fadiga antes de publicar
→ Publica (POST /api/escalas/:id/publicar) → status = PUBLICADA
  → Domain event publicado → notificações
→ Tripulante confirma ciência (POST /api/escalas/confirmacoes)
→ Diff entre revisões disponível: GET /api/escalas/:id/diff
```

### Fluxo 4: Sessão de Simulador

```
Instrutor agenda (POST /api/simulador/agendamentos)
→ No dia: abre sessão + preenche ficha manobra a manobra
→ Cada manobra: nota + comentários
→ Conclui sessão:
  → Se modelo.gera_qualificacao = 1 → qualificação criada automaticamente
  → Domain event → handler sincroniza horas_voo_lancamentos
  → PDF da ficha → R2 → pasta_virtual_documentos do tripulante
```

### Fluxo 5: FRMS — Gestão de Fadiga

```
Jornadas inseridas manualmente ou importadas (APUS/planilha)
→ lib/frms/calculos.ts: acúmulos rolling 7d / 28d / 365d / mensal
→ Compara com frms_configuracoes (limites por empresa)
→ Violações → frms_alertas (CRITICO/ALTO/MEDIO/BAIXO)
→ Cron diário verifica todos os tripulantes
→ Check-in diário de fadiga: POST /api/frms/checkin
→ Relatório individual + compliance sob demanda
→ Antes de publicar escala: validarEscalaFutura() bloqueia se viola limites
```

---

## 9. COMPONENTES E PÁGINAS (FRONTEND)

### Rotas do Frontend (React Router v7 — App.tsx)

```
/                           DashboardPrincipal
/login                      Login
/trocar-senha               TrocarSenhaPage
/aceitar-convite            AceitarConvite
/certificado/:hash          VerificarCertificado  ← PÚBLICO
/funcionarios               Funcionarios
/funcionarios/:id           PerfilFuncionario (ficha 360°)
/pasta-virtual              PastaVirtual
/qualificacoes              Qualificacoes
/qualificacoes/dashboard    DashboardQualificacoes
/qualificacoes/alertas      QualificacoesAlertas
/qualificacoes/reclass      ReclassificacaoQualificacoes
/licencas                   LicencasPage
/hospedagem                 HospedagemPage
/importacao                 ImportacaoPageV2
/simuladores                SimuladoresDashboard
/simuladores/agenda         AgendaCalendario
/simuladores/fichas         FichasSessao
/simuladores/fichas/:id     FichaDetalhe
/simuladores/configuracoes  CrudSimuladores
/simuladores/manobras       CrudManobras
/simuladores/modelos        CrudModelos
/simuladores/categorias     CrudCategorias
/simuladores/tipos-sessao   CrudTiposSessao
/simuladores/instrutores    CrudInstrutores
/simuladores/modelos-sessao CrudModelosSessao
/simuladores/relatorios     RelatoriosSimuladores
/escalas                    EscalasMensais
/escalas/configuracao       ConfiguracaoEscala
/escalas/minha              MinhaEscala
/escalas/evd                EvdPage
/frms                       FrmsDashboard
/frms/ficha/:id             FrmsFichaTripulante
/frms/alertas               FrmsAlertasPainel
/frms/relatorios            FrmsRelatorios
/frms/configuracoes         FrmsConfiguracoes
/frms/fadiga-acumulada      FrmsFadigaAcumulada
/frms/checkin               FrmsCheckinFadiga
/frms/fadiga-painel         FrmsFadigaPainel
/frms/fadiga-historico      FrmsFadigaHistorico
/sgso                       Sgso
/sgso/relato                SgsoRelato
/sgso/relprev               SgsoRelprevPage
/sgso/bowtie                SgsoBowtiePage
/sgso/frat                  SgsoFratPage
/hospedagem                 HospedagemPage
/minhas-assinaturas         MinhasAssinaturas
/relatorios                 RelatoriosDashboard
/configuracoes              Configuracoes (layout)
/configuracoes/empresa      ConfiguracaoEmpresa
/configuracoes/aeronaves    Aeronaves (CrudSimuladores reusado)
/configuracoes/funcoes      ConfiguracoesCadastrosGerais
/configuracoes/integracoes/edapp  IntegracoesEdApp
/configuracoes/compliance   ComplianceSettings
/configuracoes/certificados ConfiguracaoCertificado
/admin/usuarios             AdminUsuarios
```

Todas as páginas: `lazyWithRetry(() => import('./pages/X'), 'NomePagina')` no `App.tsx`.

### Design System (`src/react-app/components/ui/` — 25+ componentes)

| Componente                | Propósito                              |
| ------------------------- | -------------------------------------- |
| `Button.tsx`              | Variantes: primary, ghost, destructive |
| `Card.tsx`                | Container padrão                       |
| `Badge.tsx`               | Badge colorido                         |
| `StatusBadge.tsx`         | Badge com mapeamento de status         |
| `StatCard.tsx`            | Card de métrica com ícone e tendência  |
| `Input.tsx`               | Input com label e erro                 |
| `FormField.tsx`           | Field com validação integrada          |
| `DataTable.tsx`           | Tabela paginada                        |
| `AdvancedDataTable.tsx`   | Tabela com busca avançada              |
| `VirtualTable.tsx`        | Tabela virtualizada (TanStack Virtual) |
| `GlobalTableEnhanced.tsx` | Tabela global com busca avançada       |
| `PageHeader.tsx`          | Header com breadcrumb                  |
| `Spinner.tsx`             | Loading spinner                        |
| `Skeleton.tsx`            | Skeleton loading                       |
| `EmptyState.tsx`          | Estado vazio com ação                  |
| `Tabs.tsx`                | Navegação por abas                     |
| `Calendar.tsx`            | Calendário                             |
| `ColumnSelector.tsx`      | Seletor de colunas visíveis            |

**Estilo:** Apple-inspired — bordas suaves, espaçamento generoso, tipografia clean.
**Documentado em:** `DESIGN_SYSTEM_REFACTORING_GUIDE.md`

### Estado Global

| Mecanismo                         | Uso                                           |
| --------------------------------- | --------------------------------------------- |
| **TanStack React Query**          | Estado de servidor — cache, sync, invalidação |
| **AuthContext + AuthProvider**    | Usuário, empresa ativa, permissões            |
| **React useState/useReducer**     | Estado de UI local                            |
| **Zustand**                       | Presente como dep, uso pontual                |
| **React Hook Form + Zod**         | Estado de formulários                         |
| **sessionStorage / localStorage** | Tokens JWT (duplo storage com fallback)       |

### Contexto Global no App.tsx

```tsx
<QueryClientProvider>       // TanStack Query
  <AuthProvider>            // Auth + multi-tenant
    <LanguageProvider>      // i18n (pt-BR, en-US)
      <BrowserRouter>       // React Router v7
        <ErrorBoundary>
          <Routes />
          <Toaster />       // Sonner notifications
```

---

## 10. VARIÁVEIS DE AMBIENTE

### Frontend (`.env.local` — prefixo `VITE_`)

| Variável                      | Tipo    | Uso                           |
| ----------------------------- | ------- | ----------------------------- |
| `VITE_API_URL`                | URL     | URL base da API               |
| `VITE_AUTH_ENABLED`           | boolean | Habilitar autenticação JWT    |
| `VITE_ENABLE_DEV_AUTO_LOGIN`  | boolean | Login automático em dev       |
| `VITE_DEFAULT_LOGIN_EMAIL`    | string  | E-mail padrão para auto-login |
| `VITE_DEFAULT_LOGIN_PASSWORD` | string  | Senha padrão para auto-login  |
| `VITE_ENABLE_DEBUG`           | boolean | Logs extras no console        |
| `VITE_ENABLE_ANALYTICS`       | boolean | Habilitar analytics           |
| `DISABLE_TRACKING`            | boolean | Desativar rastreamento        |

### Backend — Worker (`.dev.vars` / Wrangler Secrets)

| Variável                       | Tipo             | Uso                                                                 |
| ------------------------------ | ---------------- | ------------------------------------------------------------------- |
| `JWT_SECRET`                   | string (256-bit) | Assinatura JWT — **OBRIGATÓRIO**                                    |
| `JWT_EXPIRES_IN`               | string           | Duração access token (ex: `7d`)                                     |
| `ENVIRONMENT`                  | enum             | `development` / `staging` / `production`                            |
| `APP_VERSION`                  | string           | Injetado pelo `deploy-worker-only.sh`                               |
| `ENABLE_DEV_AUTH_BYPASS`       | `'true'`         | Bypass auth em dev (bloqueado em prod)                              |
| `USE_QUALIFICACOES_VIEW`       | `'true'`         | Feature flag (view removida — legacy)                               |
| `CORS_ALLOWED_ORIGINS`         | string (CSV)     | Origins CORS permitidas                                             |
| `CF_ACCOUNT_ID`                | string           | Account ID Cloudflare (Browser Rendering)                           |
| `CF_BROWSER_API_TOKEN`         | string           | Token para HTML→PDF                                                 |
| `EDAPP_API_TOKEN`              | string           | Token da API EdApp                                                  |
| `EDAPP_WEBHOOK_SECRET`         | string           | HMAC secret dos webhooks EdApp                                      |
| `TWILIO_ACCOUNT_SID`           | string           | SID conta Twilio                                                    |
| `TWILIO_AUTH_TOKEN`            | string           | Auth token Twilio                                                   |
| `TWILIO_WHATSAPP_FROM`         | string           | Número remetente WhatsApp                                           |
| `TWILIO_MESSAGING_SERVICE_SID` | string           | Messaging Service SID                                               |
| `SENDGRID_API_KEY`             | string           | Chave SendGrid usada no envio de convites e e-mails administrativos |
| `SENDGRID_FROM_EMAIL`          | string           | Remetente padrão dos convites enviados pelo worker                  |
| `RESEND_API_KEY`               | string           | Chave Resend para e-mails                                           |
| `ANAC_API_KEY`                 | string           | API ANAC (dados regulatórios)                                       |
| `DECEA_API_KEY`                | string           | API DECEA (espaço aéreo)                                            |
| `REDIS_URL`                    | URL              | Redis Upstash URL                                                   |
| `REDIS_TOKEN`                  | string           | Redis Upstash token                                                 |
| `SENTRY_DSN`                   | string           | DSN Sentry para monitoramento de erros                              |
| `LOG_LEVEL`                    | enum             | `debug` / `info` / `warn` / `error`                                 |
| `SESSION_TIMEOUT_HOURS`        | number           | Timeout de sessão                                                   |
| `TOKEN_EXPIRY_SECONDS`         | number           | Expiração de token                                                  |
| `PASSWORD_MIN_LENGTH`          | number           | Mínimo de caracteres na senha                                       |
| `PASSWORD_REQUIRE_*`           | boolean          | Políticas de senha                                                  |
| `DISABLE_RATE_LIMITING`        | boolean          | Desativar rate limit (dev)                                          |
| `SKIP_SECRET_VALIDATION`       | boolean          | Pular validação de secrets (dev)                                    |

### Bindings Wrangler (não são env vars — definidos em `wrangler.toml`)

| Binding  | Recurso                                                      | Ambiente |
| -------- | ------------------------------------------------------------ | -------- |
| `DB`     | D1 `airtrust-db-dev` / `airtrust-db-staging` / `airtrust-db` | Por env  |
| `BUCKET` | R2 `airtrust-storage`                                        | Shared   |
| `AI`     | Cloudflare Workers AI                                        | Todos    |

### Cron Triggers (produção — `wrangler.toml`)

| Cron           | Horário          | Ação                              |
| -------------- | ---------------- | --------------------------------- |
| `*/10 * * * *` | A cada 10 min    | Reconciliação EdApp (fallback)    |
| `0 8 * * *`    | 08h UTC (5h BRT) | Notificações diárias + stats FRMS |
| `0 3 * * *`    | 03h UTC          | Backup diário                     |
| `0 4 * * SUN`  | 04h UTC domingo  | Backup semanal                    |
| `0 5 1 * *`    | 05h UTC dia 1    | Backup mensal                     |

---

## 11. COMO RODAR LOCALMENTE

### Pré-requisitos

- **Node.js v22+** (obrigatório — build usa `/opt/homebrew/opt/node@22/bin`)
- **npm 10+**
- **Wrangler CLI:** `npm i -g wrangler && wrangler login`
- Conta Cloudflare com acesso ao projeto

### Instalação

```bash
# 1. Clonar
git clone <repo-url>
cd Airtrust

# 2. Instalar dependências
npm install
cd worker-airtrust && npm install && cd ..

# 3. Configurar variáveis de ambiente
cp .env.example .env.local
# Editar VITE_API_URL para apontar ao worker local ou produção

cp worker-airtrust/.dev.vars.example worker-airtrust/.dev.vars
# Preencher obrigatoriamente: JWT_SECRET
# Opcional em dev: ENABLE_DEV_AUTH_BYPASS=true

# 4. Setup do banco local (opcional — ver aviso abaixo)
npm run setup:local      # scripts/setup-local-db.sh
# ou
npm run db:init          # scripts/init-db.sh

# 5. Iniciar
npm start                # Worker :8787 + Frontend :3000 (parallel)
# ou
npm run dev              # Apenas frontend
# ou
npm run dev:worker:local # Apenas worker com D1 local
```

> **CRÍTICO:** Por padrão, `wrangler dev` (sem `--local`) usa o banco de **produção/staging real**. Risco alto de corrupção acidental de dados. Para ambiente isolado, usar `npm run dev:worker:local` com `wrangler.dev.toml` configurado.

### Todos os Scripts Disponíveis (26 scripts no package.json raiz)

| Script                     | Descrição                      |
| -------------------------- | ------------------------------ |
| `npm start`                | Worker + Frontend em paralelo  |
| `npm run dev`              | Só frontend (porta 3000)       |
| `npm run dev:worker`       | Só worker (remoto)             |
| `npm run dev:worker:local` | Só worker com D1 local         |
| `npm run build`            | Build de produção              |
| `npm run build:clean`      | Limpa dist + fresh build       |
| `npm run deploy`           | Build + deploy completo        |
| `npm run deploy:pages`     | Deploy só Pages                |
| `npm run deploy:worker`    | Build + deploy worker          |
| `npm run deploy:all`       | `build-and-deploy.sh`          |
| `npm run test`             | Vitest watch                   |
| `npm run test:run`         | Vitest CI (sem watch)          |
| `npm run test:worker`      | Tests do worker                |
| `npm run test:all`         | Frontend + worker              |
| `npm run test:coverage`    | Coverage report                |
| `npm run test:e2e`         | Playwright headless            |
| `npm run test:e2e:ui`      | Playwright UI                  |
| `npm run test:e2e:headed`  | Playwright com browser visível |
| `npm run setup:local`      | Setup banco local              |
| `npm run db:init`          | Inicializar banco              |
| `npm run db:status`        | Listar tabelas                 |
| `npm run health`           | Health check                   |
| `npm run smoke:core:prod`  | Smoke tests em produção        |
| `npm run logs:tail`        | Tail logs produção             |

---

## 12. DECISÕES TÉCNICAS E PADRÕES ADOTADOS

### Convenções de Código

- **Arquivos:** `kebab-case` (`funcionarios-mutations.ts`, `frms-fadiga-checkin.ts`)
- **Funções:** `camelCase` (`getTenantContext`, `softDelete`, `calcularDataVencimento`)
- **Tipos/Interfaces:** `PascalCase` (`ApiResponse<T>`, `Env`, `TenantContext`)
- **Banco de dados:** `snake_case` para tabelas e colunas
- **Componentes React:** `PascalCase` (`DashboardPrincipal.tsx`)
- **Domínio em português:** Tabelas, campos, rotas e variáveis de negócio em PT-BR

### Qualidade de Código

- **TypeScript strict mode:** `noImplicitAny`, `strictNullChecks` — 0 erros TS
- **ESLint 9** flat config com `typescript-eslint`, `eslint-plugin-react-hooks`
- **Prettier** (`.prettierrc.json`) — aspas simples, ponto-e-vírgula obrigatório, `"no-console": "warn"`
- **jscpd** para detecção de duplicação de código
- **Zod** em formulários (frontend) e em todas as requests (backend)

### Tratamento de Erros

- **Backend:** `errorHandler` global Hono; helpers `badRequest()`, `notFound()`, `unauthorized()`, `forbidden()`, `internalError()` → `ApiResponse` padronizado
- **Frontend:** `ErrorBoundary` global; handler no `apiFetch`; Sonner toasts
- **Logging:** `createLogger()` + `createStructuredConsole()` no worker; nível configurável via `LOG_LEVEL`
- **Auditoria:** mutações registradas em `admin_actions_audit` via `utils/auditoria.ts`

### Segurança de Headers (index.ts)

```
Content-Security-Policy: default-src 'self'; ...
Strict-Transport-Security: max-age=31536000 (prod only)
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### Domain Events

Tabela `domain_events` como barramento interno. Exemplos de fluxos:

- Conclusão de ficha de sessão → `horas_voo_lancamentos`
- Publicação de escala → notificações + pasta virtual

### Feature Flags

| Flag                         | Onde         | Efeito                     |
| ---------------------------- | ------------ | -------------------------- |
| `USE_QUALIFICACOES_VIEW`     | Worker env   | Legado — view foi removida |
| `ENABLE_DEV_AUTH_BYPASS`     | Worker env   | Bypass JWT em dev          |
| `VITE_ENABLE_DEBUG`          | Frontend env | Logs extras                |
| `VITE_ENABLE_DEV_AUTO_LOGIN` | Frontend env | Login automático em dev    |

### Padrão de Commits

Conventional Commits informais em português no histórico (`feat:`, `fix:`, `chore:`, `refactor:`). Sem `commitlint` formal configurado.

---

## 13. DÍVIDAS TÉCNICAS E PROBLEMAS CONHECIDOS

### TODOs Ativos Confirmados no Código

| Arquivo                                                           | Problema                                                                            | Risco                                                       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `services/backup/orchestrator.ts:115`                             | Fluxo principal gera manifesto de metadados R2, mas não copia os corpos dos objetos | Recuperação completa de arquivos depende do bucket primário |
| `routes/funcionarios.ts:567`                                      | Stats de qualificação por funcionário desabilitadas                                 | Funcionalidade incompleta                                   |
| `src/react-app/pages/simuladores/cadastros/modelos/index.tsx:363` | Importação de relações modelo-manobra ainda não implementada                        | Operação manual necessária                                  |
| Build frontend atual                                              | Chunk `excel-C97XakYJ.js` saiu com ~939.64 kB minificado                            | Warning recorrente de bundle grande                         |

### Problemas Arquiteturais

1. **Sem banco local isolado por padrão** — `npm run dev:worker` (sem `:local`) aponta para banco real. Risco crítico de corrupção de dados de produção/staging em desenvolvimento.
2. **301 migrations sem squash** — sem tracking automático de quais foram aplicadas. Numeração com inconsistências (`132_`, `9999_`, duplicatas).
3. **ORM discrepância** — README menciona Drizzle ORM, código usa SQL raw. Sem type-safety nas queries do backend.
4. **Bundle Excel ainda pesado** — o build atual está verde, mas o chunk `excel` continua muito acima do limite configurado.
5. **`console.log` em produção** — ESLint configurado com `"no-console": "warn"` mas ainda há ocorrências.
6. **Páginas monolíticas** — `Qualificacoes.tsx`, `Sgso.tsx`, `DashboardPrincipal.tsx` com milhares de linhas. Dificulta manutenção.

### Limpeza Pendente

- Raiz com dezenas de arquivos `.sh`, `.sql`, `.py`, `.md` de auditoria e scripts ad-hoc
- Pasta `_arquivos_nao_usados/` com código morto

### Limitações da Plataforma

- Cloudflare Workers: limite de CPU por request — crítico em geração de PDF complexo
- D1 não suporta `RETURNING` em todas as operações — SELECTs adicionais após INSERT/UPDATE são necessários
- Cron mínimo no Workers: `*/10 * * * *` (10 min) — impossível trigger menor que isso

---

## 14. ESTADO ATUAL DO PROJETO

### 100% Funcional em Produção

- Autenticação JWT + multi-tenant
- CRUD Funcionários + Ficha 360° + Compliance
- Qualificações (histórico, alertas, certificados, EdApp)
- Habilitações e Licenças ANAC
- Simuladores (agendamento, fichas, manobras, relatórios)
- FRMS (jornadas, fadiga rolling, alertas, relatórios)
- Escalas (planejamento, alocações, EVD, diff, publicação)
- SGSO (relatos, FRAT, Bowtie, auditorias, KPIs)
- Horas de Voo
- Hospedagem de Tripulantes
- Solicitações de Treinamento
- Notificações WhatsApp (Twilio)
- Backup automático R2 (diário/semanal/mensal)
- Importação CSV/XLSX
- Convites administrativos por e-mail via SendGrid (criação e reenvio)
- Exportação de dados
- Assistente IA (Workers AI)

### Em Desenvolvimento / Incompleto

- **Backup completo de corpos R2** — fluxo principal hoje salva manifesto de metadados, não uma cópia integral dos objetos
- **Stats de qualificação por funcionário** — tabela de relação inexistente
- **Importação de relações modelo-manobra** — ainda manual no cadastro de modelos
- **Chunk Excel** — isolado do bundle principal, mas ainda acima do limite de warning no build

### Correções Recentes Confirmadas na Auditoria

- `fix-renovadas.ts` agora exige autenticação e role administrativa
- `admin-usuarios.ts` envia convite por SendGrid quando configurado
- `importacao.ts` e `QualificacaoHistoricoImportacao.ts` persistem `qualificacao_id` no INSERT
- `/api/compliance/recalculate` registra auditoria com `c.get('userId')`
- `/api/importacao/template/:entidade?format=xlsx` já entrega XLS compatível
- Páginas de PDF carregam geradores por `import()` dinâmico; o build separou `pdf`, `capture` e `excel`

### Próximo Passo Prioritário

1. Decidir se o backup de R2 ficará somente em manifesto ou se haverá cópia integral assíncrona dos objetos
2. Implementar as stats reais de qualificação no módulo de funcionários
3. Fechar a importação de relações modelo-manobra no cadastro de simuladores
4. Reduzir o peso do chunk `excel` se o warning de bundle for relevante para produção

---

## CONTEXTO PARA IA

10 bullets essenciais para um agente de IA continuar este projeto sem perder contexto:

1. **Stack imutável:** React 19 + TypeScript 5.8 + Vite 6 (frontend) / Hono v4 + Cloudflare Workers + D1 SQLite (backend). Dois Vitest: `^4.0.8` (frontend), `^2.1.9` (worker). Sem Drizzle ORM em runtime — usar SQL raw com `c.env.DB.prepare(sql).bind(...)`.

2. **Multi-tenant obrigatório:** TODA query deve filtrar por `empresa_id`. O `tenantMiddleware` injeta via `getTenantContext(c)` / `getEmpresaId(c)`. Nunca retornar dados de outra empresa.

3. **Resposta padrão:** `{ success: true, data: ... }` ou `{ success: false, error: "...", code: "SNAKE_CASE" }`. Usar helpers `badRequest()`, `notFound()`, `unauthorized()`, `internalError()` do `middleware/error-handler.ts`.

4. **Soft delete universal:** NUNCA `DELETE FROM`. Sempre `UPDATE tabela SET deleted_at = datetime('now') WHERE id = ?`. Toda query inclui `AND deleted_at IS NULL`. Usar `softDelete()` de `utils/db.ts`.

5. **Migrations são manuais:** Criar SQL numerado em `worker-airtrust/migrations/`. Aplicar via `wrangler d1 execute airtrust-db --remote --file=./migrations/NNNN.sql`. Não há auto-apply.

6. **RBAC 3 roles reais:** `ADMIN > SUPERVISOR > USER`. Usar `requireRole('ADMIN')` após `auth()`. Importar de `middleware/rbac.ts`.

7. **Frontend — lazy obrigatório:** Nova página usa `lazyWithRetry(() => import('./pages/X'), 'X')` no `App.tsx`. Dados do servidor via TanStack React Query. Formulários via React Hook Form + Zod.

8. **Domain Events:** Usar `publishDomainEvent()` de `shared/domainEvents.ts` para comunicação cross-domain. Nunca chamar serviços de outro módulo diretamente na rota.

9. **Banco local vs produção:** `npm run dev:worker:local` usa D1 local isolado. `npm run dev:worker` usa banco real — **nunca usar em desenvolvimento com dados reais**. `ENABLE_DEV_AUTH_BYPASS=true` desativa JWT completamente (apenas dev).

10. **Deploy:** `npm run deploy:all` executa `build-and-deploy.sh`. `APP_VERSION` injetado por `scripts/deploy-worker-only.sh`. Secrets via `wrangler secret put NOME --env production`. Nunca commitar `.dev.vars`.
