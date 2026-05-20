# RELATÓRIO TÉCNICO COMPLETO — AirTrust SaaS

**Data do relatório:** 14 de abril de 2026  
**Versão analisada:** 1.0.0 (produção ativa)

---

## 1. VISÃO GERAL DO PRODUTO

### Nome e Propósito

**AirTrust** — Sistema de Gestão Aeronáutica SaaS multi-tenant.  
Público-alvo: operadores aéreos brasileiros (helicópteros/aviação executiva), como a empresa **Costa do Sol PTO** (empresa_id = 6, tenant principal em produção).

### Problema que Resolve

Gerencia o ciclo de vida completo de tripulantes e operações aéreas: qualificações regulatórias (ANAC), jornadas de trabalho e fadiga, escalas mensais/quinzenais, sessões de simulador, documentação digital, comunicação de ocorrências de segurança e compliance com regulações aeronáuticas brasileiras.

### Funcionalidades Implementadas (produção)

| Módulo                                                                           | Estado      |
| -------------------------------------------------------------------------------- | ----------- |
| Gestão de Funcionários (CRUD, pasta virtual, ficha 360°)                         | ✅ Produção |
| Qualificações e Certificados (histórico, alertas, vencimentos, emissão PDF)      | ✅ Produção |
| Simuladores (agendamento, fichas de sessão, manobras, check-ins)                 | ✅ Produção |
| FRMS — Flight & Rest Management System (jornadas, fadiga acumulada, alertas)     | ✅ Produção |
| Escalas Mensais / Quinzenais (planejamento, alocações, EVD)                      | ✅ Produção |
| SGSO — Segurança Operacional (relatos, FRAT, Bowtie, auditorias, KPI, NCs)       | ✅ Produção |
| Integração EdApp (LMS externo — sincronização automática a cada 10 min via cron) | ✅ Produção |
| Notificações WhatsApp (Twilio) + e-mail vencimento                               | ✅ Produção |
| Horas de Voo (caderneta digital, saldo, lançamentos)                             | ✅ Produção |
| Hospedagem de Tripulantes                                                        | ✅ Produção |
| Solicitações de Treinamento (workflow gestor→ops)                                | ✅ Produção |
| Backup automatizado para R2 (diário/semanal/mensal)                              | ✅ Produção |
| Importação XLSX de histórico de qualificações                                    | ✅ Produção |
| Exportação PDF (certificados, escalas, fichas, relatórios)                       | ✅ Produção |
| Admin: gestão de usuários, multi-tenant, migrações manuais                       | ✅ Produção |

### Funcionalidades Planejadas / TODOs encontrados

- `dashboardService.ts` → `TODO: implementar quando houver sistema de documentação`
- `dashboardService.ts` → `TODO: implementar quando houver sistema de exames médicos`
- `dashboardService.ts` → `TODO: calcular tendência` (analytics de compliance)
- `dashboardService.ts` → `TODO: implementar verificação de espaço usado no R2`
- `dashboardService.ts` → `TODO: implementar analytics` (requests última 1h)
- `dashboardService.ts` → `TODO: implementar por instrutor` (relatório simuladores)

---

## 2. ARQUITETURA GERAL

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLOUDFLARE NETWORK                          │
│                                                                 │
│  ┌──────────────────┐       ┌──────────────────────────────┐   │
│  │  Cloudflare Pages │       │  Cloudflare Workers          │   │
│  │  (frontend SPA)   │ HTTP  │  (airtrust-api-production)   │   │
│  │  airtrust.pages.. │──────▶│  api.airtrust.online         │   │
│  │  React 19 + Vite  │◀─────│  Hono v4 + TypeScript        │   │
│  └──────────────────┘  JSON  └──────────┬───────────────────┘   │
│                                         │                       │
│                              ┌──────────▼──────────────┐       │
│                              │  Cloudflare D1 (SQLite)  │       │
│                              │  airtrust-db (produção)  │       │
│                              │  airtrust-db-dev (dev)   │       │
│                              └──────────────────────────┘       │
│                                         │                       │
│                              ┌──────────▼──────────────┐       │
│                              │  Cloudflare R2 Storage   │       │
│                              │  airtrust-storage        │       │
│                              │  (PDFs, uploads, backups)│       │
│                              └──────────────────────────┘       │
│                                         │                       │
│                              ┌──────────▼──────────────┐       │
│                              │  Cloudflare Workers AI   │       │
│                              │  (assistente IA)          │       │
│                              └──────────────────────────┘       │
└──────────────────────────────────────────────────────────────┬──┘
                                                               │
                  Serviços Externos                            │
         ┌────────────────────────────────────────────────────┘
         │
  ┌──────▼──────┐  ┌────────────┐  ┌────────────────┐
  │   EdApp     │  │   Twilio   │  │  Cloudflare    │
  │  (LMS/cursos│  │  WhatsApp  │  │  Browser API   │
  │  via API)   │  │  (alertas) │  │  (HTML→PDF)    │
  └─────────────┘  └────────────┘  └────────────────┘
```

### Padrão Arquitetural

**Feature-based + Service Layer** no backend. O worker está organizado por domínio (`routes/`, `services/`, `lib/`, `middleware/`). Não é Clean Architecture formal, mas segue a separação:

- **Routes** → controladores HTTP finos (Hono)
- **Services** → lógica de negócio (`lib/frms/`, `services/`)
- **Shared** → events, handlers cross-module (Domain Events via `domain_events` table)
- **Middlewares** → auth JWT, tenant isolation, RBAC, rate-limit, cors, cache

**Monorepo:** Sim. Uma única pasta com dois projetos:

- `/src/react-app/` → Frontend SPA
- `/worker-airtrust/` → Backend API (Worker)

### Estrutura Raiz

```
/Airtrust
├── src/                        → Frontend React (código-fonte)
│   ├── react-app/              → App principal (pages, components, hooks, services)
│   ├── pages/                  → Páginas standalone (ImportacaoPageV2, PaginaQualificacao)
│   └── components/             → Componentes legados/compartilhados
├── worker-airtrust/            → Backend Cloudflare Worker
│   ├── src/                    → Código TypeScript do worker
│   │   ├── routes/             → ~100 arquivos de rotas (Hono)
│   │   ├── middleware/         → cors, auth, tenant, rbac, rate-limit, cache
│   │   ├── services/           → business logic (backup, edapp, dashboard)
│   │   ├── lib/                → domínio fechado (frms/, pdf/)
│   │   ├── cron/               → scheduled jobs (notificações, FRMS, backup, EdApp)
│   │   ├── shared/             → domain events, handlers cross-module
│   │   ├── utils/              → db, security, logger, auditoria
│   │   └── types/              → TypeScript global types
│   └── migrations/             → ~334 arquivos SQL de migration
├── public/                     → Assets estáticos
├── dist/                       → Build de produção (gerado)
├── e2e/                        → Testes Playwright
├── scripts/                    → Utilitários de deploy e build
└── *.md, *.sh, *.sql           → Documentação e scripts operacionais
```

---

## 3. STACK TECNOLÓGICA COMPLETA

### Linguagens

- **TypeScript 5.8.3** (frontend + backend)
- **SQL** (migrations D1/SQLite)

### Frontend

| Tecnologia                     | Versão                         |
| ------------------------------ | ------------------------------ |
| React                          | 19.0.0                         |
| React DOM                      | 19.0.0                         |
| React Router DOM               | ^7.9.3                         |
| Vite                           | ^6.2.0                         |
| Tailwind CSS                   | ^3.4.17                        |
| @tailwindcss/forms             | ^0.5.10                        |
| @tailwindcss/container-queries | ^0.1.1                         |
| TanStack React Query           | ^5.90.7                        |
| TanStack React Virtual         | ^3.13.12                       |
| Zustand                        | ^5.0.11                        |
| React Hook Form                | ^7.66.0                        |
| Zod                            | ^3.25.76                       |
| @hookform/resolvers            | ^5.2.2                         |
| Recharts                       | ^2.15.4                        |
| Sonner (toasts)                | ^2.0.7                         |
| Lucide React (icons)           | ^0.510.0                       |
| DnD Kit (drag-and-drop)        | core ^6.3.1 / sortable ^10.0.0 |
| @hello-pangea/dnd              | ^18.0.1                        |
| @floating-ui/react             | ^0.27.19                       |
| @headlessui/react              | ^2.2.8                         |
| date-fns                       | ^4.1.0                         |
| DOMPurify                      | ^3.3.1                         |
| ExcelJS                        | ^4.4.0                         |
| PapaParse (CSV)                | ^5.5.3                         |
| pdf-lib                        | ^1.17.1                        |
| jsPDF                          | ^3.0.4                         |
| html2canvas                    | ^1.4.1                         |
| react-pdf                      | ^9.2.1                         |
| react-input-mask               | ^2.0.4                         |
| clsx + tailwind-merge          | ^2.1.1 / ^3.4.0                |

### Backend (Worker)

| Tecnologia                | Versão              |
| ------------------------- | ------------------- |
| Hono                      | ^4.10.1             |
| @hono/zod-validator       | ^0.5.0              |
| Zod                       | ^3.25.76 (re-usado) |
| jose (JWT)                | ^5.2.0              |
| bcryptjs                  | ^3.0.3              |
| pdf-lib                   | ^1.17.1             |
| pdfkit                    | ^0.17.2             |
| qrcode + qrcode-generator | ^1.5.4 / ^2.0.4     |
| fflate (compressão)       | ^0.8.2              |
| PapaParse                 | ^5.5.3              |
| ExcelJS                   | ^4.4.0              |
| unpdf                     | ^1.4.0              |

### Banco de Dados

| Recurso             | Detalhe                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Banco principal     | Cloudflare D1 (`airtrust-db`) — SQLite serverless                                                                 |
| Storage             | Cloudflare R2 (`airtrust-storage`) — blobs, PDFs, backups                                                         |
| ORM / Query Builder | Raw SQL direto via D1 binding (sem Drizzle em runtime — README menciona Drizzle mas o código usa queries manuais) |
| Migrations          | Arquivos SQL incrementais, numerados (0000 → 0334+), gerenciados via Wrangler                                     |

### Autenticação

- Biblioteca: `jose` (JWT) + `bcryptjs` (hash senha)
- Estratégia: JWT Bearer token + Refresh Token
- Armazenamento: `sessionStorage` (padrão) + `localStorage` (persistent login)
- Sessão identificada por: `Authorization: Bearer <jwt>`
- Tabelas: `usuarios`, `usuarios_empresas`, `convites_usuarios`, `refresh_tokens`

### Gerenciamento de Estado (Frontend)

- **Server state:** TanStack React Query v5
- **Auth state:** React Context (`AuthContext` + `AuthProvider`)
- **UI local state:** React `useState`/`useReducer`
- **Zustand v5:** Presente como dependência, uso pontual

### Estilização

- Tailwind CSS v3 com `tailwind-merge` e `clsx`
- CSS Modules (`.module.css`) para componentes específicos
- `postcss` + `autoprefixer`
- Design System próprio (ver seção 9)

### Testes

| Framework                      | Uso                           |
| ------------------------------ | ----------------------------- |
| Vitest ^4.0.8                  | Unit + integration (frontend) |
| Vitest ^2.1.9                  | Unit (worker)                 |
| @testing-library/react ^16.3.0 | Testes de componentes React   |
| Playwright ^1.57.0             | E2E (pasta `/e2e/`)           |
| MSW ^2.12.10                   | Mock de API                   |

### Infraestrutura e Deploy

| Serviço               | Uso                                                 |
| --------------------- | --------------------------------------------------- |
| Cloudflare Pages      | Frontend SPA (`airtrust.pages.dev`, domínio custom) |
| Cloudflare Workers    | Backend API (`api.airtrust.online`)                 |
| Cloudflare D1         | Banco de dados SQLite serverless                    |
| Cloudflare R2         | Object storage (PDFs, uploads, backups)             |
| Cloudflare Workers AI | Assistente IA (binding `AI`)                        |
| Wrangler CLI ^4.33.0  | Deploy, migrations, secrets                         |

### Serviços Externos

| Serviço                          | Propósito                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| EdApp                            | LMS — sincroniza cursos concluídos com qualificações (webhook + cron reconciliação) |
| Twilio (WhatsApp)                | Alertas de vencimento de qualificações via WhatsApp                                 |
| Cloudflare Browser Rendering API | Conversão HTML → PDF para certificados                                              |
| SendGrid                         | E-mail transacional (configurado no env, uso opcional)                              |

---

## 4. ESTRUTURA DE DIRETÓRIOS

```
/Airtrust/
├── src/
│   ├── react-app/
│   │   ├── App.tsx                    → Router principal (BrowserRouter + lazy routes)
│   │   ├── main.tsx                   → Entry point React
│   │   ├── navigation.config.ts       → Definição tipada do menu de navegação
│   │   ├── pages/                     → ~55 páginas (+ subpastas)
│   │   │   ├── Funcionarios.tsx       → CRUD funcionários
│   │   │   ├── Qualificacoes.tsx      → Gestão qualificações
│   │   │   ├── DashboardPrincipal.tsx → Dashboard com métricas
│   │   │   ├── Simuladores.tsx        → Área de simuladores
│   │   │   ├── escalas/               → 3 páginas de escalas + EVD
│   │   │   ├── frms/                  → 12 páginas FRMS
│   │   │   ├── sgso/                  → 3 páginas SGSO
│   │   │   ├── simuladores/           → 8 subpastas/páginas
│   │   │   ├── qualificacoes/         → Alertas
│   │   │   ├── funcionarios/          → PerfilFuncionario
│   │   │   ├── admin/                 → UsuariosPage
│   │   │   ├── relatorios/            → Dashboard relatórios
│   │   │   └── Configuracoes/         → Configurações + integrações
│   │   ├── components/
│   │   │   ├── ui/                    → Design System (~22 componentes)
│   │   │   ├── layout/                → Layout, sidebar, header
│   │   │   └── ProtectedRoute.tsx     → Guard de autenticação
│   │   ├── context/
│   │   │   └── AuthContext.tsx        → Provider de autenticação
│   │   ├── hooks/                     → useAuth, useQuery wrappers
│   │   ├── lib/
│   │   │   └── apiFetch.ts            → Cliente HTTP autenticado
│   │   ├── services/                  → Serviços de API por módulo
│   │   ├── config/
│   │   │   ├── api.ts                 → URL base + token management
│   │   │   └── systemSettings.ts     → Configurações dinâmicas do sistema
│   │   ├── i18n/                      → Internacionalização (pt-BR / en)
│   │   └── utils/                     → lazyWithRetry, helpers
│   ├── pages/                         → Páginas standalone (fora do react-app)
│   ├── components/                    → Componentes legados/compartilhados
│   └── client/                        → Hooks e lib do cliente (pequena)
├── worker-airtrust/
│   ├── src/
│   │   ├── index.ts                   → Entry point Hono + montagem de todas as rotas
│   │   ├── routes/                    → ~100 arquivos de rota
│   │   ├── middleware/
│   │   │   ├── auth.ts                → JWT Bearer validation
│   │   │   ├── tenant.ts              → empresa_id injection (multi-tenant)
│   │   │   ├── rbac.ts                → Role-Based Access Control
│   │   │   ├── rate-limit.ts          → Rate limiting (D1-backed)
│   │   │   ├── cors.ts                → CORS dinâmico por origem
│   │   │   ├── cache.ts               → Cache-Control headers
│   │   │   └── error-handler.ts       → Global error handler
│   │   ├── services/
│   │   │   ├── backup/orchestrator.ts → Backup diário/semanal/mensal para R2
│   │   │   ├── edapp-course-progress-reconciliation.ts
│   │   │   └── dashboardService.ts
│   │   ├── lib/
│   │   │   ├── frms/                  → Engine de cálculo FRMS (fadiga, limites, alertas)
│   │   │   └── pdf/                   → Geração de PDF de certificados
│   │   ├── cron/
│   │   │   ├── scheduled-handler.ts   → Orquestrador de crons
│   │   │   ├── notificacoes.ts        → Alertas diários de vencimento
│   │   │   ├── frms-daily-check.ts    → Check FRMS diário
│   │   │   └── sgso-notificacoes.ts   → Alertas SLA do SGSO
│   │   ├── shared/
│   │   │   ├── domainEvents.ts        → Publicação de domain events
│   │   │   └── handlers/             → Handlers cross-domain
│   │   ├── utils/
│   │   │   ├── security.ts            → JWT, bcrypt, sanitização, validação CPF/email
│   │   │   ├── db.ts                  → Helpers D1 (softDelete, pagination, etc.)
│   │   │   └── auditoria.ts           → Registro de auditoria
│   │   └── types/index.ts             → Env, ApiResponse, entidades
│   └── migrations/                    → 334+ arquivos SQL
├── scripts/                           → build-and-deploy.sh, deploy-worker-only.sh
├── e2e/                               → Testes Playwright
├── public/                            → favicon, assets estáticos
├── dist/                              → Build produção (gerado)
├── vite.config.ts                     → Config Vite + proxy dev
├── tailwind.config.js                 → Config Tailwind
├── tsconfig.json                      → Config TS raiz
├── wrangler-pages.json                → Config Pages deploy
└── package.json                       → Scripts e dependências raiz
```

---

## 5. BANCO DE DADOS E MODELOS DE DADOS

### Engine

**Cloudflare D1** (SQLite), sem ORM em runtime — toda interação é SQL raw via `c.env.DB.prepare(sql).bind(...).first/all/run()`.

### Estratégia de Migrations

Arquivos SQL numerados sequencialmente em `worker-airtrust/migrations/` (0000 → 0334+). Aplicação manual via `wrangler d1 execute`. **Não há tracking automático de migrations aplicadas** — estado gerenciado manualmente.

### Principais Entidades (tabelas confirmadas via migrations e código)

| Tabela                           | Propósito                                                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `empresas`                       | Tenants (multi-tenant) — `id, nome, codigo, ativo, deleted_at`                                                                                |
| `usuarios`                       | Usuários do sistema com autenticação JWT                                                                                                      |
| `usuarios_empresas`              | Relacionamento N:N usuário↔empresa + `is_primary, role`                                                                                       |
| `funcionarios`                   | Colaboradores/tripulantes — `nome, cpf, matricula, empresa_id, modelo_aeronave_id, status, deleted_at`                                        |
| `qualificacoes_tipos`            | Catálogo de tipos de qualificação — `codigo, nome, validade (meses), tipo_treinamento`                                                        |
| `qualificacoes_historico`        | Histórico de qualificações por funcionário — `funcionario_id, qualificacao_id, data_conclusao, data_vencimento, status, renovada, empresa_id` |
| `certificados_templates`         | Templates HTML de certificados por empresa                                                                                                    |
| `arquivos`                       | Metadados de arquivos no R2 (`bucket_key, nome_original, mime_type`)                                                                          |
| `simuladores`                    | Cadastro de simuladores de voo                                                                                                                |
| `sessoes_simulador`              | Sessões de treinamento em simulador                                                                                                           |
| `fichas_sessao`                  | Fichas de avaliação de sessão                                                                                                                 |
| `fichas_sessao_manobras`         | Manobras avaliadas por sessão                                                                                                                 |
| `modelos_sessao`                 | Templates de sessões de treinamento                                                                                                           |
| `frms_jornadas`                  | Jornadas de trabalho dos tripulantes                                                                                                          |
| `frms_limites`                   | Limites regulatórios de fadiga por empresa                                                                                                    |
| `frms_alertas`                   | Alertas de violação de limites FRMS                                                                                                           |
| `frms_escalas`                   | Escalas futuras para validação FRMS                                                                                                           |
| `frms_fadiga_checkin_diario`     | Check-in diário de fadiga                                                                                                                     |
| `escalas`                        | Planejamento de escala mensal                                                                                                                 |
| `escala_alocacoes`               | Alocações de tripulante/aeronave por dia                                                                                                      |
| `escala_quinzenas`               | Períodos quinzenais para cálculo de jornada                                                                                                   |
| `escala_tipos_evento`            | Tipos de evento do calendário de escala                                                                                                       |
| `escala_situacao_tipos`          | Situações de alocação (folga, licença, etc.)                                                                                                  |
| `escala_confirmacoes`            | Confirmações do tripulante para ciência da escala                                                                                             |
| `sgso_relatos`                   | Relatos de segurança operacional                                                                                                              |
| `sgso_acoes`                     | Ações CAPA vinculadas a relatos                                                                                                               |
| `sgso_auditorias`                | Auditorias de segurança                                                                                                                       |
| `sgso_nao_conformidades`         | Não-conformidades detectadas                                                                                                                  |
| `sgso_frat`                      | FRAT (Flight Risk Assessment Tool) por relato                                                                                                 |
| `hospedagem`                     | Acomodações de tripulantes                                                                                                                    |
| `horas_voo_saldo`                | Saldos de horas de voo                                                                                                                        |
| `horas_voo_lancamentos`          | Lançamentos individuais de voo                                                                                                                |
| `solicitacoes_treinamento`       | Workflow de solicitações de treinamento                                                                                                       |
| `notificacoes_sistema`           | Notificações in-app                                                                                                                           |
| `alertas_whatsapp_log`           | Auditoria de alertas WhatsApp enviados                                                                                                        |
| `domain_events`                  | Barramento de eventos entre domínios                                                                                                          |
| `admin_actions_audit`            | Log de ações administrativas                                                                                                                  |
| `api_latency_samples`            | Métricas de latência de rotas                                                                                                                 |
| `security_rate_limit`            | Estado de rate limiting por IP/usuário                                                                                                        |
| `token_blocklist`                | Tokens JWT revogados                                                                                                                          |
| `edapp_usuarios_mapeamento`      | Mapeamento funcionário ↔ usuário EdApp                                                                                                        |
| `edapp_cursos_mapeamento`        | Mapeamento curso EdApp ↔ qualificacao_codigo                                                                                                  |
| `importacoes_log`                | Log de importações XLSX                                                                                                                       |
| `aeronaves` / `modelos_aeronave` | Frota da empresa                                                                                                                              |
| `funcoes` / `setores`            | Cargos e setores organizacionais                                                                                                              |
| `licencas`                       | Licenças ANAC dos tripulantes                                                                                                                 |

### Soft Delete

**Universal** — todas as entidades têm coluna `deleted_at DATETIME NULL` e `WHERE deleted_at IS NULL` em todas as queries.

### Seeds

Arquivos SQL de seed em `worker-airtrust/seeds/` e `worker-airtrust/migrations/` (migrations com `_seed_` no nome). Dados demonstrativos para AW139, SK76, manobras, tipos de sessão.

---

## 6. ROTAS E API

### Base URL

- Desenvolvimento: `http://localhost:8787/api`
- Produção: `https://api.airtrust.online/api`

### Versionamento

**Não há versionamento de API** (`/v1/`, `/v2/`). Todas as rotas são `GET|POST|PUT|DELETE /api/{recurso}`.

### Formato de Resposta Padrão

```json
{ "success": true, "data": {...} }
{ "success": false, "error": "mensagem", "code": "ERROR_CODE" }
```

Paginado: `{ "success": true, "data": [...], "total": N, "page": P, "limit": L }`

### Rotas Principais (agrupadas por módulo)

#### Auth (`/api/auth/*`) — Pública

```
POST /api/auth/login                → Login (email + senha) → JWT + refresh token
POST /api/auth/refresh              → Renovar token
POST /api/auth/logout               → Logout (revoga token)
GET  /api/auth/me                   → Dados do usuário autenticado
GET  /api/auth/empresas             → Empresas do usuário
POST /api/auth/trocar-senha         → Trocar senha
POST /api/auth/aceitar-convite      → Aceitar convite de onboarding
```

#### Certificados — Público (validação)

```
GET  /api/certificados/validar/:hash → Validar certificado (sem auth, via QR code)
```

#### Funcionários — Protegidas

```
GET    /api/funcionarios             → Lista paginada + busca
GET    /api/funcionarios/:id         → Detalhes
POST   /api/funcionarios             → Criar
PUT    /api/funcionarios/:id         → Atualizar
DELETE /api/funcionarios/:id         → Soft delete
GET    /api/funcionarios/:id/ficha360 → Ficha 360° (overview completo)
```

#### Qualificações — Protegidas

```
GET|POST|PUT|DELETE /api/qualificacoes/tipos       → Catálogo de tipos
GET|POST|PUT|DELETE /api/qualificacoes/historico   → Histórico por funcionário
POST                /api/qualificacoes/atribuir    → Atribuir/renovar qualificação
GET                 /api/qualificacoes/stats       → Dashboard de qualificações
GET                 /api/qualificacoes/alertas     → Alertas de vencimento
POST                /api/qualificacoes/certificados → Emitir certificado
GET                 /api/qualificacoes/certificados/:id → Detalhe de certificado
```

#### Simuladores — Protegidas

```
GET|POST|PUT|DELETE /api/simuladores              → Equipamentos CRUD
GET|POST            /api/simuladores/sessoes       → Sessões
GET|PATCH           /api/simuladores/sessoes/:id   → Detalhe/update sessão
GET|POST            /api/simuladores/fichas        → Fichas de sessão
GET|POST            /api/simuladores/tipos-sessao  → Tipos de sessão
GET|POST            /api/simuladores/modelos-sessao → Modelos de sessão
GET|POST            /api/simuladores/manobras      → Catálogo de manobras
GET|POST            /api/simuladores/categorias    → Categorias de manobras
GET                 /api/simuladores/relatorios    → Relatórios de desempenho
GET|POST            /api/simuladores/agendamentos  → Agendamentos
```

#### FRMS — Protegidas

```
GET|POST|PUT|DELETE /api/frms/jornadas           → Jornadas de trabalho
GET                 /api/frms/score-atual/:id     → Score de fadiga atual
GET                 /api/frms/acumulo/:id         → Acúmulo por tripulante
GET                 /api/frms/acumulo/frota       → Acúmulo toda frota
GET|PATCH           /api/frms/alertas             → Alertas de fadiga
GET|POST|PUT|DELETE /api/frms/escalas             → Escalas futuras
POST                /api/frms/importar/apus       → Importar APUS
GET                 /api/frms/relatorios/individual/:id → Relatório individual
GET                 /api/frms/relatorios/compliance     → Relatório compliance
POST                /api/frms/configuracoes       → Atualizar limites FRMS
GET|POST            /api/frms/fadiga-checkin      → Check-in diário fadiga
GET                 /api/frms/fadiga-acumulada    → Painel fadiga acumulada
```

#### Escalas — Protegidas

```
GET|POST|PUT|DELETE /api/escalas                        → CRUD escalas
GET|POST            /api/escalas/:id/alocacoes          → Alocações na escala
GET|POST            /api/escalas/:id/eventos            → Eventos da escala
GET                 /api/escalas/:id/calendario         → Calendário
GET                 /api/escalas/:id/conflitos          → Conflitos detectados
GET                 /api/escalas/:id/export             → Exportar PDF
PATCH               /api/escalas/:id/status             → Publicar/arquivar escala
GET                 /api/escalas/quinzenas              → Quinzenas
GET                 /api/escalas/disponibilidade        → Disponibilidade tripulantes
GET                 /api/escalas/tripulantes-operacionais → Tripulantes habilitados
GET                 /api/escalas/tipos-evento-config    → Configuração de tipos de evento
GET|POST            /api/escalas/templates              → Templates de tripulação
POST                /api/escalas/confirmacoes           → Confirmar ciência do tripulante
```

#### SGSO — Protegidas

```
GET|POST       /api/sgso/relatos                  → Relatos de segurança
GET|PATCH      /api/sgso/relatos/:id              → Detalhe/atualizar relato
POST           /api/sgso/relatos/:id/avaliacao-risco
POST           /api/sgso/relatos/:id/acoes
GET|POST       /api/sgso/auditorias
GET|POST       /api/sgso/nao-conformidades
GET            /api/sgso/kpi/spi
GET            /api/sgso/kpi/tendencias
GET|POST       /api/sgso/frat
GET|POST       /api/sgso/bowtie
```

#### Outros — Protegidas

```
GET|POST|DELETE /api/horas-voo/:id/saldo
GET|POST        /api/horas-voo/:id/lancamentos
GET|POST|PUT|DELETE /api/hospedagem
GET|POST        /api/treinamentos/solicitacoes
GET|POST|DELETE /api/licencas
POST            /api/importacao/xlsx             → Importação XLSX qualificações
GET             /api/dashboard/qualificacoes     → Stats dashboard
GET             /api/aeronaves
GET             /api/modelos-aeronave
GET             /api/funcoes
GET             /api/setores
GET             /api/lookup                      → Dados de lookup
GET|POST        /api/notificacoes
POST            /api/notificacoes/processar      → admin only
GET|POST        /api/integracoes/edapp/webhook
GET             /api/integracoes/edapp/status
GET             /api/backup/exportar             → admin only
POST            /api/backup/restaurar            → admin only
GET             /api/auditoria                   → Logs de auditoria
GET             /api/compliance
GET             /api/assistente                  → IA assistente (Workers AI)
GET             /api/health                      → Health check público
```

### Proteção de Rotas

- **Todas as rotas `/api/*`** exceto `/api/auth/login`, `/api/auth/refresh`, `/api/auth/aceitar-convite`, `/api/certificados/validar/:hash` e `/api/health` exigem `Authorization: Bearer <jwt>`.
- RBAC granular por role: `admin`, `manager`, `instructor`, `editor`, `student`/`viewer`.

---

## 7. AUTENTICAÇÃO E AUTORIZAÇÃO

### Fluxo de Autenticação

1. `POST /api/auth/login` com `{ email, password }`
2. Backend valida senha com `bcryptjs.compare()`
3. Retorna `{ accessToken (JWT 7d), refreshToken (30d), user, empresas }`
4. Frontend armazena em `sessionStorage` (padrão) ou `localStorage` (persistent)
5. Todas as requisições subsequentes incluem `Authorization: Bearer <token>`
6. O middleware `auth()` verifica via `jose.jwtVerify()` com `JWT_SECRET`

### Estrutura do JWT Payload

```typescript
{
  userId: number,
  email: string,
  role: 'admin' | 'manager' | 'instructor' | 'editor' | 'student',
  empresaId: number,
  empresas: number[]
}
```

### Sessão / Multi-empresa

- Um usuário pode pertencer a múltiplas empresas (`usuarios_empresas`)
- Frontend usa `AuthContext` com `empresaAtualId` e `setEmpresaAtual()`
- Todas as queries do backend são filtradas por `empresa_id` (isolamento obrigatório)
- `tenantMiddleware` injeta o `empresaId` no contexto Hono

### Roles / RBAC

| Role                       | Nível | Acesso                               |
| -------------------------- | ----- | ------------------------------------ |
| `admin`                    | 100   | Acesso total + operações destrutivas |
| `manager` / `gestor`       | 80    | Gestão operacional                   |
| `instructor` / `instrutor` | 60    | Fichas, sessões, manobras            |
| `editor`                   | 50    | Leitura + edição                     |
| `student` / `usuario`      | 20    | Leitura própria + check-in           |
| `viewer`                   | 10    | Somente leitura                      |

### Multi-Tenancy

- **Isolamento por `empresa_id`**: cada tabela relevante tem `empresa_id` com FK para `empresas`
- O `tenantMiddleware` resolve a empresa ativa do JWT e a injeta em `c.get('empresaId')`
- Não existe row-level security automática no D1 — a aplicação é responsável pelo filtro

### Segurança Adicional

- `token_blocklist` table: tokens revogados (logout/expiração forçada)
- `security_rate_limit` table: rate limiting 10 req/s globais, 5 req/s em login
- Cabeçalhos de segurança: `X-Frame-Options: DENY`, `CSP`, `X-Content-Type-Options: nosniff`
- Sanitização de inputs via `DOMPurify` (frontend) e `sanitizeString()` (backend)
- Validação de CPF, email e formato de dados via funções customizadas

---

## 8. FLUXOS DE NEGÓCIO PRINCIPAIS

### Fluxo 1 — Login e Troca de Tenant

1. Usuário acessa `/login` → `POST /api/auth/login`
2. Recebe JWT + lista de empresas vinculadas
3. `AuthContext` armazena token e empresa ativa
4. Se múltiplas empresas → seletor de empresa na navbar
5. `POST /api/auth/empresas/selecionar` troca empresa ativa (novo JWT ou apenas contexto)
6. Todas as telas filtram automaticamente dados da empresa selecionada

### Fluxo 2 — Ciclo de Vida de Qualificações

1. Admin cadastra tipo de qualificação (`qualificacoes_tipos`) com validade em meses
2. Ao concluir treinamento → atribuir via `POST /api/qualificacoes/atribuir`
3. Sistema calcula `data_vencimento = data_conclusao + validade meses`
4. Cron diário (08h UTC) verifica vencimentos e cria alertas
5. Alertas WhatsApp enviados por Twilio (30/15/7 dias antes)
6. Certificado PDF gerado via `CF_BROWSER_API_TOKEN` (HTML→PDF) e armazenado no R2
7. QR code no certificado aponta para `/certificado/:hash` (validação pública)
8. Renovação: nova linha em `qualificacoes_historico` + `renovada = 1` na anterior
9. Integração EdApp: conclusão de curso no LMS → webhook → cria qualificação automaticamente

### Fluxo 3 — Planejamento de Escala Mensal

1. Gestor cria escala (`POST /api/escalas`) para um mês/empresa
2. Importa padrões de tripulação de templates
3. Aloca tripulantes por dia (`POST /api/escalas/:id/alocacoes`)
4. Sistema detecta conflitos automáticos (disponibilidade, FRMS, CMA)
5. Visualização em calendário quinzenal
6. Gestor publica escala (`PATCH status = 'PUBLICADA'`)
7. Tripulante confirma ciência (`POST /api/escalas/confirmacoes`)
8. FRMS valida automaticamente se escala viola limites de fadiga
9. Exportação PDF via `GET /api/escalas/:id/export`

### Fluxo 4 — Sessão de Simulador

1. Instrutor agenda sessão (`POST /api/simuladores/agendamentos`)
2. No dia: inicia sessão, preenche ficha de avaliação por manobra
3. Cada manobra recebe nota e comentários
4. Ao concluir sessão → sistema verifica se gera qualificação automaticamente (`gera_qualificacao = 1` no modelo)
5. Ficha arquivada na pasta virtual do funcionário
6. Domain event publicado → handler sincroniza em `horas_voo_lancamentos`
7. PDF da ficha gerado e salvo no R2

### Fluxo 5 — FRMS (Gestão de Fadiga)

1. Jornadas inseridas manualmente ou importadas via APUS/planilha
2. Engine `lib/frms/calculos.ts` calcula acúmulos rolling (7d, 28d, 365d, mensal)
3. Compara com limites configurados por empresa (`frms_limites`)
4. Violações geram alertas (`frms_alertas`) com nível CRITICO/ALTO/MEDIO/BAIXO
5. Cron diário verifica todos tripulantes e processa alertas
6. Check-in diário de fadiga via `POST /api/frms/fadiga-checkin`
7. Relatório individual e de compliance gerados sob demanda
8. Validação de escala futura (`validarEscalaFutura()`) antes de publicar

---

## 9. COMPONENTES E PÁGINAS (FRONTEND)

### Rotas do Frontend (React Router)

```
/                        → DashboardPrincipal
/login                   → LoginSimple
/funcionarios            → Funcionarios
/funcionarios/:id        → PerfilFuncionario
/pasta-virtual           → PastaVirtual
/pasta-virtual/geral     → PastaVirtualGeral
/treinamentos            → (seção)
/qualificacoes           → Qualificacoes
/qualificacoes/dashboard → DashboardQualificacoes
/qualificacoes/alertas   → QualificacoesAlertas
/qualificacoes/reclass   → ReclassificacaoQualificacoes
/licencas                → LicencasPage
/importacao              → ImportacaoPageV2
/escalas                 → EscalasMensais
/escalas/configuracao    → ConfiguracaoEscala
/escalas/minha           → MinhaEscala
/escalas/evd             → EvdPage
/frms                    → FrmsDashboard
/frms/ficha/:id          → FrmsFichaTripulante
/frms/alertas            → FrmsAlertasPainel
/frms/relatorios         → FrmsRelatorios
/frms/configuracoes      → FrmsConfiguracoes
/frms/fadiga-acumulada   → FrmsFadigaAcumulada
/frms/checkin            → FrmsCheckinFadiga
/frms/fadiga-painel      → FrmsFadigaPainel
/frms/fadiga-historico   → FrmsFadigaHistorico
/simuladores             → SimuladoresDashboard
/simuladores/agenda      → AgendaCalendario
/simuladores/fichas      → FichasSessao
/simuladores/fichas/:id  → FichaDetalhe
/simuladores/configuracoes → CrudSimuladores
/sgso                    → Sgso
/sgso/relato             → SgsoRelato
/sgso/relprev            → SgsoRelprevPage
/sgso/bowtie             → SgsoBowtiePage
/sgso/frat               → SgsoFratPage
/hospedagem              → HospedagemPage
/minhas-assinaturas      → MinhasAssinaturas
/configuracoes           → Configuracoes (layout)
/configuracoes/empresa   → ConfiguracaoEmpresa
/configuracoes/aeronaves → Aeronaves
/configuracoes/funcoes   → ConfiguracoesFuncoes
/configuracoes/integracoes/edapp → IntegracoesEdApp
/configuracoes/compliance → ComplianceSettings
/configuracoes/certificados → ConfiguracaoCertificado
/admin/usuarios          → AdminUsuarios
/certificado/:hash       → VerificarCertificado (público)
/aceitar-convite         → AceitarConvite
/trocar-senha            → TrocarSenhaPage
```

### Componentes Reutilizáveis (Design System próprio em `src/react-app/components/ui/`)

| Componente                                | Propósito                                                   |
| ----------------------------------------- | ----------------------------------------------------------- |
| `Button.tsx`                              | Botão universal com variantes (primary, ghost, destructive) |
| `Card.tsx`                                | Container de card padrão                                    |
| `Badge.tsx`                               | Badge colorido de status                                    |
| `StatusBadge.tsx`                         | Badge com mapeamento de status                              |
| `StatCard.tsx`                            | Card de métrica com ícone e tendência                       |
| `Input.tsx`                               | Input estilizado com label e erro                           |
| `FormField.tsx`                           | Field de formulário com validação                           |
| `DataTable.tsx` / `AdvancedDataTable.tsx` | Tabelas paginadas com ordenação/filtro                      |
| `VirtualTable.tsx`                        | Tabela virtualizada (TanStack Virtual)                      |
| `GlobalTableEnhanced.tsx`                 | Tabela global com busca avançada                            |
| `PageHeader.tsx`                          | Header de página com breadcrumb                             |
| `Spinner.tsx` / `Skeleton.tsx`            | Indicadores de loading                                      |
| `EmptyState.tsx`                          | Estado vazio com ação                                       |
| `Tabs.tsx`                                | Navegação por abas                                          |
| `Calendar.tsx`                            | Calendário                                                  |
| `ColumnSelector.tsx`                      | Seletor de colunas visíveis                                 |

### Design System

- Estilo **Apple-inspired**: bordas suaves, espaçamento generoso, tipografia clean
- Paleta baseada em Tailwind CSS (customizada via `tailwind.config.js`)
- Arquivo `DESIGN_SYSTEM_REFACTORING_GUIDE.md` documenta convenções

### Estado Global

- **Auth:** `AuthContext` + `AuthProvider` (React Context)
- **Server state:** TanStack React Query com cache automático
- **UI state:** `useState` local por componente
- **Zustand:** presente como dependência, uso pontual

### Internacionalização

- Sistema i18n próprio em `src/react-app/i18n/` com `LanguageProvider` e `useLanguage()`
- Suporte a `pt-BR` e `en` com `runtimeTranslator`

---

## 10. VARIÁVEIS DE AMBIENTE

### Frontend (prefixo `VITE_` — `src/.env.local`)

| Variável                      | Tipo         | Propósito                    |
| ----------------------------- | ------------ | ---------------------------- |
| `VITE_API_URL`                | string (URL) | URL base do Worker API       |
| `VITE_AUTH_ENABLED`           | boolean      | Habilitar autenticação JWT   |
| `VITE_ENABLE_DEV_AUTO_LOGIN`  | boolean      | Login automático em dev      |
| `VITE_DEFAULT_LOGIN_EMAIL`    | string       | Email padrão para auto-login |
| `VITE_DEFAULT_LOGIN_PASSWORD` | string       | Senha padrão para auto-login |
| `VITE_ENABLE_DEBUG`           | boolean      | Logs extras no console       |
| `VITE_ENABLE_ANALYTICS`       | boolean      | Habilitar analytics          |
| `VITE_DEV_PROXY_TARGET`       | string (URL) | Target do proxy dev (Vite)   |

### Backend — Worker (`worker-airtrust/.dev.vars` / Wrangler Secrets)

| Variável                       | Tipo            | Propósito                                      |
| ------------------------------ | --------------- | ---------------------------------------------- |
| `JWT_SECRET`                   | string (secret) | Chave para assinatura de JWT — **OBRIGATÓRIO** |
| `ENVIRONMENT`                  | enum            | `development` / `staging` / `production`       |
| `APP_VERSION`                  | string          | Versão do build (injetada pelo deploy script)  |
| `ENABLE_DEV_AUTH_BYPASS`       | `'true'`        | Bypass de auth em desenvolvimento              |
| `USE_QUALIFICACOES_VIEW`       | `'true'`        | Flag de view integrada                         |
| `CORS_ORIGINS`                 | string (CSV)    | Origins CORS permitidas                        |
| `EDAPP_API_TOKEN`              | string (secret) | Token da API EdApp                             |
| `EDAPP_WEBHOOK_SECRET`         | string (secret) | Secret para validar webhooks EdApp             |
| `CF_ACCOUNT_ID`                | string (secret) | Account ID Cloudflare (Browser API)            |
| `CF_BROWSER_API_TOKEN`         | string (secret) | Token para HTML→PDF (Browser Rendering)        |
| `WHATSAPP_API_URL`             | string (URL)    | Endpoint gateway WhatsApp genérico             |
| `WHATSAPP_API_TOKEN`           | string (secret) | Token gateway WhatsApp                         |
| `TWILIO_ACCOUNT_SID`           | string (secret) | SID da conta Twilio                            |
| `TWILIO_AUTH_TOKEN`            | string (secret) | Auth token Twilio                              |
| `TWILIO_WHATSAPP_FROM`         | string          | Número remetente WhatsApp Twilio               |
| `TWILIO_MESSAGING_SERVICE_SID` | string (secret) | Messaging Service SID Twilio                   |
| `SENDGRID_API_KEY`             | string (secret) | Chave SendGrid para e-mails                    |
| `SENDGRID_FROM_EMAIL`          | string          | E-mail remetente                               |
| `LOG_LEVEL`                    | enum            | `debug` / `info` / `warn` / `error`            |
| `CACHE_TTL_SECONDS`            | string (number) | TTL de caches voláteis                         |

### Configurado via `wrangler.toml` (bindings — não são env vars)

| Binding  | Recurso                         |
| -------- | ------------------------------- |
| `DB`     | D1 Database (`airtrust-db`)     |
| `BUCKET` | R2 Storage (`airtrust-storage`) |
| `AI`     | Cloudflare Workers AI           |

---

## 11. COMO RODAR LOCALMENTE

### Pré-requisitos

- **Node.js v22+** (obrigatório — o build usa `PATH=/opt/homebrew/opt/node@22/bin`)
- **npm 10+**
- **Wrangler CLI**: `npm i -g wrangler && wrangler login`
- Conta Cloudflare com acesso ao projeto

### Passo a Passo

```bash
# 1. Clone
git clone https://github.com/fp-daumas/airtrust-v1.git
cd airtrust-v1

# 2. Instalar dependências (raiz + worker)
npm install
cd worker-airtrust && npm install && cd ..

# 3. Configurar variáveis de ambiente
cp .env.example .env.local
# Edite VITE_API_URL para apontar ao worker local ou produção
# Para usar produção diretamente:
# VITE_API_URL=https://airtrust-api-production.airtrust.workers.dev/api

cp worker-airtrust/.env.example worker-airtrust/.dev.vars
# Preencha JWT_SECRET e opcionalmente ENABLE_DEV_AUTH_BYPASS=true

# 4. Banco de dados
# ⚠️ ATENÇÃO: Por padrão, o wrangler.toml aponta para o banco de PRODUÇÃO
# Para usar banco local, configure wrangler.dev.toml com database_id local
# e execute: npm run dev:worker:local

# 5. Iniciar ambiente completo (worker + frontend)
npm start        # Worker :8787 + Frontend :3000

# Ou apenas frontend (proxy para worker remoto/produção):
npm run dev      # Frontend :3000 apenas

# 6. Acessar
# http://localhost:3000
```

> **CRÍTICO**: O projeto **não possui banco local separado por padrão**. Todo `wrangler dev` usa o banco de produção/dev real. Veja `wrangler.dev.toml` para configuração isolada.

### Scripts Disponíveis

| Script                     | Descrição                                          |
| -------------------------- | -------------------------------------------------- |
| `npm start`                | Worker local + Frontend (desenvolvimento completo) |
| `npm run dev`              | Só frontend (porta 3000)                           |
| `npm run dev:worker:local` | Só worker com DB local                             |
| `npm run build`            | Build de produção                                  |
| `npm run deploy:all`       | Deploy completo (worker + frontend)                |
| `npm run test`             | Testes unitários (Vitest)                          |
| `npm run test:e2e`         | Testes E2E (Playwright)                            |

---

## 12. DECISÕES TÉCNICAS E PADRÕES ADOTADOS

### Convenções de Código

- **Arquivos:** kebab-case (`funcionarios-mutations.ts`, `frms-fadiga-checkin.ts`)
- **Funções:** camelCase (`getTenantContext`, `softDelete`, `calcularDataVencimento`)
- **Tipos/Interfaces:** PascalCase (`TenantContext`, `ApiResponse<T>`, `Env`)
- **Banco de dados:** snake_case para tabelas e colunas
- **Componentes React:** PascalCase (`DashboardPrincipal.tsx`, `StatCard.tsx`)
- **Rotas Hono:** Sub-módulos separados por domínio + "core" como orquestrador thin

### Linting / Formatting

- **ESLint 9.39.1** com config flat (`eslint.config.js`), `typescript-eslint`, `eslint-plugin-react-hooks`
- **Prettier** (`.prettierrc.json`) para formatação uniforme
- **`jscpd`** configurado para detectar duplicações

### Tratamento de Erros

- Backend: `errorHandler` global Hono captura todos os erros não tratados
- Helpers: `badRequest()`, `notFound()`, `unauthorized()`, `forbidden()`, `internalError()` retornam JSON padrão
- Frontend: `ErrorBoundary` global + handler de erros no `apiFetch`
- Auditoria: todas as mutações autenticadas registradas em `admin_actions_audit`
- Logs estruturados via `createStructuredConsole()` e `createLogger()` com níveis

### Pattern de Resposta API

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  message?: string;
}
```

### Domain Events

O sistema usa `domain_events` table como barramento interno. Módulos publicam via `publishDomainEvent()` e handlers processam assincronamente (ex: ficha sessão → horas de voo; escala publicada → pasta virtual).

### Feature Flags

- `USE_QUALIFICACOES_VIEW` — controla uso de view SQL integrada
- `ENABLE_DEV_AUTH_BYPASS` — bypass de auth em desenvolvimento
- `VITE_ENABLE_DEBUG` — logs extras no frontend

### Padrão de Commits

Sem `commitlint` configurado. Commits seguem mensagens descritivas informais em português.

---

## 13. DÍVIDAS TÉCNICAS E PROBLEMAS CONHECIDOS

### TODOs Confirmados no Código

- `dashboardService.ts` (4 TODOs): sistema de documentação, exames médicos, tendência de compliance, analytics de requests e verificação de espaço R2 **não implementados** — retornam valores hardcoded (0 ou 100%)
- `dashboardService.ts` → relatório de simuladores por instrutor retorna array vazio

### Problemas Arquiteturais

1. **Sem banco local isolado por padrão** — dev usa banco de produção. Risco alto de corrupção acidental de dados reais em desenvolvimento.
2. **334+ migrations sem squash** — acúmulo crítico de arquivos SQL sem mecanismo de tracking automático. Vários arquivos com numeração duplicada (ex.: `0062_*`, `0092_*`, `0107_*`).
3. **ORM discrepância**: README menciona Drizzle ORM, mas o código usa SQL raw com D1. Sem type-safety nas queries.
4. **Console.log em produção**: alguns handlers têm `console.log()` direto em vez do logger estruturado.

### Limpeza Pendente

- Raiz do projeto contém dezenas de arquivos `.sh`, `.sql`, `.py`, `.md` de auditoria e scripts ad-hoc que deveriam estar em outro repositório ou removidos
- Pasta `_arquivos_nao_usados/` sugere código morto pendente de remoção

### Limitações Conhecidas

- Cloudflare Workers: limite de CPU por request (crítico em geração de PDF complexo)
- D1 não suporta `RETURNING` em todas as operações — SELECTs adicionais após INSERT/UPDATE são necessários
- Cron mínimo no Workers é `*/10 * * * *` — não é possível cron menor que 1 minuto no plano atual

---

## 14. ESTADO ATUAL DO PROJETO

### 100% Funcional em Produção

- Autenticação JWT + multi-tenant
- CRUD completo de Funcionários
- Ciclo de vida de Qualificações (CRUD, alertas, certificados, integração EdApp)
- Simuladores (agendamento, fichas, manobras, relatórios)
- FRMS (jornadas, fadiga, alertas, relatórios)
- Escalas Mensais/Quinzenais (planejamento, alocações, EVD, conflitos, publicação)
- SGSO (relatos, FRAT, Bowtie, auditorias, KPIs)
- Notificações WhatsApp (Twilio)
- Backup automático R2
- Importação XLSX de histórico
- Horas de Voo (caderneta digital)
- Hospedagem de Tripulantes
- Solicitações de Treinamento

### Em Desenvolvimento / Parcialmente Implementado

- **Dashboard avançado** — analytics de compliance e tendências com valores hardcoded
- **Sistema de Documentação** — mencionado em TODOs, sem tabelas ou rotas implementadas
- **Exames Médicos** — mencionado em TODOs, sem implementação
- **Relatório simuladores por instrutor** — retorna array vazio

### Próximo Passo Prioritário (inferido dos TODOs)

Com base nos TODOs ativos, o próximo foco natural é **completar o dashboard de compliance** (documentação digital, exames médicos, tendências analíticas) e possivelmente um módulo de **gestão de documentos regulatórios** (requisito ANAC não implementado).

---

## CONTEXTO PARA IA

10 bullets essenciais para um agente de IA continuar este projeto sem perder contexto:

1. **Stack core imutável**: React 19 + TypeScript 5.8 + Vite 6 no frontend; Hono v4 + Cloudflare Workers + D1 SQLite no backend. Toda nova rota deve seguir o padrão `Hono<{Bindings:Env}>` com `auth()` e `getTenantContext()` obrigatórios.

2. **Multi-tenant obrigatório**: TODAS as queries devem filtrar por `empresa_id`. Nunca retornar dados sem `WHERE empresa_id = ?`. O `tenantMiddleware` injeta automaticamente o `empresaId` via `getTenantContext(c)` ou `getEmpresaId(c)`.

3. **Resposta padrão**: `{ success: true, data: ... }` ou `{ success: false, error: "...", code: "SNAKE_CASE" }`. Usar os helpers `badRequest()`, `notFound()`, `unauthorized()`, `internalError()` do `middleware/error-handler.ts`.

4. **Soft delete universal**: NUNCA `DELETE FROM`. Sempre `UPDATE tabela SET deleted_at = datetime('now') WHERE id = ?`. Toda query de leitura inclui `AND deleted_at IS NULL`.

5. **Migrations**: Criar arquivo SQL numerado sequencialmente em `worker-airtrust/migrations/`. Aplicar via `wrangler d1 execute airtrust-db --remote --file=./migrations/NNNN_descricao.sql`. Não existe auto-apply — é manual.

6. **Auth JWT**: Token Bearer em todas as rotas (exceto `/api/auth/login`, `/api/auth/refresh`, `/api/auth/aceitar-convite`, `/api/certificados/validar/:hash`, `/api/health`). JWT gerado com `jose`, verificado pelo middleware `auth()`. Refresh token de 30 dias em tabela `refresh_tokens`.

7. **RBAC**: `requireRole('admin')` ou `requireRole('admin', 'manager')` após `auth()`. Roles: `admin > manager/instructor > editor > student/viewer`. Importar de `middleware/rbac.ts`.

8. **Banco de dados**: D1 com SQL raw — sem Drizzle ORM em runtime. Pattern: `c.env.DB.prepare(sql).bind(...).first<TipoRetorno>()` para um resultado, `.all<T>()` para lista. Usar `calculatePagination()`, `buildSearchWhere()` de `utils/db.ts`.

9. **Frontend — lazy loading**: Toda nova página deve usar `lazyWithRetry(() => import('./pages/NovaPagina'), 'NomePagina')` no `App.tsx`. Dados do servidor via TanStack React Query. Formulários via React Hook Form + Zod schema.

10. **Deploy**: `npm run deploy:all` executa build + deploy Pages + deploy Worker. Segredos gerenciados via `wrangler secret put NOME --env production`. O `APP_VERSION` é injetado automaticamente pelo script `scripts/deploy-worker-only.sh`. Nunca commitar `.dev.vars` com valores reais.
