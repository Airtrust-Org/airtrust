# AirTrust Supabase Feasibility Audit v0.5

**Date:** 2026-06-02
**Status:** Sprint I — Feasibility Audit Complete
**Branch:** main
**HEAD:** 871a140e47ec8eb53a21b169956c7fdd5d149179

---

## 1. Sumário executivo

O AirTrust é uma plataforma SaaS multi-tenant para gestão de tripulação aeronáutica, operando sobre **Cloudflare Workers + D1 (SQLite) + R2 (object storage)**. Esta auditoria avalia a viabilidade técnica de migração para Supabase.

**Conclusão:** A migração completa para Supabase **não se justifica agora**. O custo de reescrita (200+ arquivos com SQL direto, 357 migrations, auth custom profundo) supera os benefícios imediatos. A plataforma atual é estável, funcional e bem adaptada ao ecossistema Cloudflare.

**Recomendação:** Adotar estratégia de preparação para **modelo híbrido futuro** (Workers como API gateway + Supabase Postgres como database), com migração por fases quando gatilhos de escala forem atingidos. Executar agora: criação de Repository pattern, auditoria de tenant isolation, e migração do domain_events para Cloudflare Queues.

---

## 2. Stack atual

```
┌─────────────────────────────────────────────────────┐
│                 Cloudflare Platform                   │
│                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  Workers API  │  │  D1 (SQLite) │  │  R2 (Obj)  │ │
│  │  Hono v4      │  │  357 migs    │  │  3 buckets  │ │
│  │  130+ routes  │  │  ~140 tables │  │  assets/    │ │
│  │  JWT auth     │  │  863 indexes │  │  docs/      │ │
│  │  tenant mid.  │  │  66 triggers │  │  backups/   │ │
│  └──────┬───────┘  └──────────────┘  └────────────┘ │
│         │                                              │
│  ┌──────┴───────┐  5 cron slots                       │
│  │  Cron jobs   │  (*/10, 8h, 3h, dom 4h, dia 1 5h)  │
│  └──────────────┘                                     │
│                                                       │
│  Frontend: React 19 SPA → Cloudflare Pages            │
│  Auth: Custom JWT (jose + bcryptjs)                   │
│  Tenant: Middleware + SQL WHERE empresa_id            │
└─────────────────────────────────────────────────────┘
```

### Detalhamento por camada

| Camada | Tecnologia | Arquivos afetados | Complexidade |
|---|---|---|---|
| Runtime | Cloudflare Workers + Hono v4 | 1 worker principal, ~130 rotas | Alta |
| Database | D1 (SQLite), raw SQL via DB.prepare() | 200+ arquivos com queries | Muito alta |
| Storage | R2, acesso via c.env.BUCKET | 49 arquivos | Média |
| Auth | JWT custom (jose), bcryptjs, refresh tokens, blocklist | ~8 arquivos core | Alta |
| Tenant isolation | Middleware + SQL WHERE empresa_id manual | 108 arquivos | Média |
| Cron/Jobs | Cloudflare cron triggers, handler monolítico | 1 handler de 1129 linhas | Alta |
| Frontend | React 19, Vite 6, React Router v7, TanStack Query | ~200 componentes/páginas | Média |

---

## 3. O que seria reaproveitado

### Reaproveitável com pouco esforço

| Componente | % Reaproveitável | Observação |
|---|---|---|
| **Modelo de dados** | 90% | Schema bem normalizado, FKs consistentes. Estrutura conceitual é portável. |
| **Índices** | 85% | Composite indexes sobre (empresa_id, ...) são padrão Postgres. |
| **Frontend React** | 100% | Totalmente independente do backend. Substituir fetchWithAuth por supabase-js. |
| **Module gating** | 100% | Lógica frontend-only. Só muda a fonte de dados (D1 → Postgres). |
| **Middleware patterns** | 70% | Auth, tenant, CORS, rate-limit são patterns portáveis para qualquer runtime. |
| **Notificações (Brevo/Twilio)** | 100% | APIs externas. Independem do backend. |
| **Tipos TypeScript** | 80% | Interfaces de dados são portáveis. Tipos de binding Cloudflare-specific não. |
| **Testes** | 60% | Testes de lógica de negócio são portáveis. Testes de integração D1 precisam ser reescritos. |

### Reaproveitável com esforço moderado

| Componente | % Reaproveitável | Esforço |
|---|---|---|
| **Rotas de API (lógica)** | 60% | Lógica de negócio é portável. SQL precisa ser reescrito. |
| **Auth custom (manter)** | 90% | Se mantiver auth custom com Postgres, quase tudo se aproveita. |
| **Asset serving** | 50% | Padrão público/privado/tenant-scoped se mantém. Implementação muda. |

---

## 4. O que teria que ser refeito

### Refação completa necessária

| Componente | Motivo | Estimativa |
|---|---|---|
| **200+ arquivos com SQL** | `DB.prepare()` → cliente Postgres. SQLite-specific SQL (`datetime()`, `AUTOINCREMENT`, `PRAGMA`, `json_object()`, `randomblob()`) precisa ser convertido. | 3-4 semanas |
| **357 migrations** | Traduzir de SQLite DDL para Postgres DDL. ~230 CREATE TABLE, 863 indexes, 66 triggers, 49 views. Remover `AUTOINCREMENT`, converter `hex(randomblob())` → `gen_random_uuid()`, `datetime('now')` → `NOW()`, `TEXT` timestamps → `TIMESTAMPTZ`. | 2-3 semanas |
| **66 triggers** | SQLite triggers → PL/pgSQL functions. Sintaxe similar mas diferente. `json_object()` → `jsonb_build_object()`. | 1 semana |
| **49 views** | SQLite views usando `json_object()`, `CAST(... AS TEXT)`, `sqlite_master` → reescrita Postgres. | 3-5 dias |
| **Runtime DDL** | 5+ arquivos TypeScript executam `CREATE TABLE` em runtime. Precisam ser convertidos para SQL Postgres ou eliminados. | 3-5 dias |
| **Auth (se migrar para Supabase Auth)** | JWT custom com claims multi-empresa, impersonation, token blocklist → Supabase Auth + custom claims + edge functions. | 2-3 semanas |
| **API client frontend** | fetchWithAuth com token storage, auto-refresh, 401 retry → supabase-js client. | 2-3 dias |

### Estimativa total de refação

| Cenário | Esforço estimado | Risco |
|---|---|---|
| **Só DB (D1→Postgres, manter Workers+Auth+R2)** | 6-8 semanas | Médio |
| **DB + Storage (D1+R2→Postgres+Supabase Storage)** | 8-10 semanas | Médio-Alto |
| **Full Supabase (DB+Storage+Auth+Edge Functions)** | 14-18 semanas | Alto |
| **Híbrido faseado (recomendado)** | 10-14 semanas (em 4-5 fases) | Médio (diluído) |

---

## 5. Banco: D1 → Postgres

### O que D1 faz bem hoje

- **Latência zero entre Worker e DB** — mesma região Cloudflare
- **Zero egress cost** — D1 é gratuito até 5GB/1M statements/dia
- **Simplicidade** — sem connection pooling, sem pgBouncer
- **Migrations via CLI** — `wrangler d1 execute --file=...`
- **Backup integrado** — D1 snapshots automáticos

### O que Postgres traria de ganho

- **Row-Level Security nativa** — tenant isolation no DB, não só na aplicação
- **JSONB** — queries indexadas sobre campos JSON (substitui TEXT com JSON.parse)
- **Full-text search** — substitui LIKEX% no D1
- **Window functions** — análises temporais (qualificações, FRMS)
- **CTE recursivas** — queries hierárquicas (SGSO bowtie, organograma)
- **pg_cron** — jobs batch no próprio banco
- **Supabase Realtime** — substitui polling do domain_events
- **Sem limite de 5GB** — escala horizontal com read replicas
- **Sem limite de 1M statements/dia** — sem throttling

### Principais incompatibilidades SQLite → Postgres

| Padrão SQLite | Frequência | Substituição Postgres |
|---|---|---|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | ~90 tabelas | `SERIAL PRIMARY KEY` ou `BIGINT GENERATED BY DEFAULT AS IDENTITY` |
| `hex(randomblob(16))` | ~40 tabelas | `gen_random_uuid()` |
| `datetime('now')` | Pervasivo | `NOW()` ou `CURRENT_TIMESTAMP` |
| `TEXT` para datas | Universal | `TIMESTAMPTZ` |
| `INSERT OR IGNORE` | Frequente | `INSERT ... ON CONFLICT DO NOTHING` |
| `INSERT OR REPLACE` | Ocasional | `INSERT ... ON CONFLICT DO UPDATE` |
| `json_object()` / `json_extract()` | Views e triggers | `jsonb_build_object()` / `->` / `->>` |
| `PRAGMA table_info()` | Runtime DDL | `information_schema.columns` |
| `BOOLEAN` (0/1) | ~30 tabelas | `BOOLEAN` (true/false) — conversão necessária |

### Estratégia de migração de schema

1. **Dump schema** → extrair todos os CREATE TABLE/INDEX/TRIGGER/VIEW
2. **Tradução automatizada** → script de conversão SQLite→Postgres (80% dos casos)
3. **Revisão manual** → triggers complexos, views com SQLite-specific
4. **Validação** → criar DB Postgres vazio, aplicar schema, verificar constraints
5. **Shadow run** → escrever em D1 e Postgres simultaneamente, comparar resultados

---

## 6. Auth: Atual vs Supabase Auth

### Auth atual (manter)

**Vantagens de manter:**
- Totalmente funcional e testado em produção
- Multi-empresa com per-company role (usuário admin na empresa A, viewer na B)
- Impersonation com audit trail
- Token blocklist para revogação imediata
- Dev bypass para desenvolvimento local
- Sem dependência externa para auth

**Desvantagens:**
- Código custom para manter (mas já está escrito e estável)
- Password hashing, reset, invite — tudo custom

### Migrar para Supabase Auth

**Vantagens:**
- Password hashing gerenciado
- Email verification nativo
- OAuth providers (Google, Microsoft)
- MFA built-in
- Refresh token rotation automático

**Desvantagens críticas:**
- **Multi-empresa com per-company role** não mapeia bem para Supabase Auth (que tem role global por usuário)
- **Custom claims size limit (~1KB)** — insuficiente para múltiplas empresas com roles e permissões
- **Impersonation** não é nativo no Supabase
- **Token blocklist** precisa ser substituído por session revocation
- **Migração de hashes bcrypt** existentes é complexa (Supabase usa formato próprio)

### Recomendação sobre Auth

**MANTER AUTH CUSTOM.** É o componente mais customizado e mais bem adaptado ao modelo multi-tenant do AirTrust. Migrar para Supabase Auth criaria mais problemas do que resolveria.

Se um dia migrar DB para Supabase Postgres, manter o auth custom — apenas trocar as queries de `c.env.DB.prepare()` para o cliente Postgres. O auth é essencialmente database-agnostic (JWT com jose + bcryptjs).

---

## 7. Storage: R2 vs Supabase Storage

### R2 atual

- **3 buckets** (dev/staging/prod), acesso via `c.env.BUCKET`
- **Prefixos com classificação de acesso** implementada em `assets.ts`:
  - `empresas/{id}/logo*` — público (CDN)
  - `fira/{empresa_id}/*` — tenant-scoped (auth + verificação)
  - `certificados/`, `funcionarios/`, `qualificacoes/` — bloqueados no gateway público
- **Documentos** servidos via rotas autenticadas dedicadas (pasta-virtual.ts)
- **Zero egress cost** (R2→Workers é gratuito na mesma conta Cloudflare)
- **Latência <5ms** entre Worker e R2
- **Sem signed URLs** — downloads passam pelo Worker

### Supabase Storage

**Ganhos reais:**
- RLS on storage objects (política `empresa_id` no bucket)
- Presigned URLs para download direto (reduz carga do Worker)
- Validação MIME server-side
- Image transformations nativas

**Perdas:**
- Egress cost ($0.09/GB após 25GB free tier)
- Latência adicional (chamada HTTP externa do Worker → Supabase)
- PDF generation pipeline (Cloudflare Browser Rendering → R2) precisaria de redesign
- SCORM HTML rewriting (lms-assets.ts) fica mais lento (fetch do Supabase → rewrite → serve)
- Backup orchestration integrada D1+R2 → redesign completo

### Recomendação sobre Storage

**MANTER R2.** Para o perfil do AirTrust (documentos, certificados, SCORM), R2 é superior em latência, custo e integração. Supabase Storage só traria ganho se houvesse necessidade de presigned URLs em escala ou RLS sobre objetos — o que hoje é adequadamente tratado pelo asset gateway em `assets.ts`.

**Melhoria imediata:** Adicionar `empresa_id` como custom metadata nos objetos R2 para defense-in-depth.

---

## 8. Tenant isolation: Atual vs RLS

### Situação atual

- **100% application-level** — `WHERE empresa_id = ?` em 108 arquivos
- **Nenhuma proteção no DB** — D1 (SQLite) não tem RLS
- **Middleware robusto** — valida associação usuário-empresa, injeta `tenantContext`
- **Gaps identificados:** ~5 rotas de download de documentos sem verificação explícita de `empresa_id`
- **Platform admin bypass:** userId=1 hardcoded + empresaCodigo='airtrust'

### O que RLS traria

- **Defense-in-depth** — proteção no DB além da aplicação
- **Impossibilidade de leak por query mal escrita** — Postgres recusa acesso sem política
- **Simplificação de código** — remover `WHERE empresa_id = ?` manual
- **Políticas por operação** — SELECT diferente de INSERT/UPDATE/DELETE

### Riscos do RLS mal configurado

- **Falsa sensação de segurança** — RLS não substitui autorização de aplicação (roles, permissões, module gating)
- **Platform admin bypass** — se `empresaCodigo='airtrust'` não for tratado nas políticas, quebra o suporte
- **Performance** — políticas complexas com subqueries podem degradar queries
- **Debug mais difícil** — erro de RLS é silencioso (row não aparece), difícil de diagnosticar

### Recomendação sobre Tenant Isolation

**RLS seria o maior ganho arquitetural de uma migração para Postgres**, mas só faz sentido junto com a migração do banco. Não justifica migrar só por RLS.

**Agora:** Auditar e fechar os ~5 gaps de verificação de `empresa_id` nas rotas de documentos e certificados. Adicionar `empresa_id` como metadata R2.

---

## 9. Audit / LGPD

### Situação atual

- **Tabela `audit_logs`** — nullable `empresa_id`, cobre eventos da empresa e do sistema
- **Tabela `auditoria_avancada_v2`** — auditoria detalhada
- **Tabela `logs_acesso_dados`** — log de acesso a dados
- **Tabela `consentimentos_lgpd`** — consentimentos LGPD
- **Tabela `solicitacoes_lgpd`** — solicitações de titulares
- **Soft-delete universal** — `deleted_at TEXT` em todas as tabelas

### Impacto da migração

- Auditoria atual é application-level (triggers + inserções manuais). Com Postgres, poderia ser complementada com `pgaudit` extension (auditoria no nível do banco).
- Soft-delete se mantém (padrão portável).
- LGPD: consentimentos e solicitações são tabelas padrão, migram sem alteração.
- **Risco:** Durante migração de dados, os audit logs precisam ser preservados com integridade (timestamps, empresa_id, user_id).

### Recomendação

Padrão atual de auditoria é adequado. Em migração futura, adotar `pgaudit` como camada adicional (não substituta) à auditoria de aplicação.

---

## 10. Jobs / Cron / Workers

### Situação atual

- **5 cron slots** no Cloudflare Workers
- **Handler monolítico** de 1129 linhas (`scheduled-handler.ts`)
- **Domain events** usam D1 como fila (padrão inadequado para produção)
- **Jobs executados:** SIGVOOS sync, alertas diários, backup, FRMS, SGSO, LMS, notificações

### Trabalhos que ficam melhores nos Workers

- **SIGVOOS sync** — chama API externa brasileira, depende de fetch + processamento
- **Notificações (Brevo/Twilio)** — chamadas HTTP para APIs externas
- **HTML-to-PDF** — Cloudflare Browser Rendering é exclusivo da plataforma

### Trabalhos que ficariam melhores no Postgres

- **Backup** — pg_dump é nativo e mais eficiente
- **Qualification stats** — queries analíticas que Postgres faz melhor
- **FRMS accumulation** — cálculos batch que poderiam ser stored procedures
- **Soft-delete purge** — pg_cron rodando DELETE diretamente

### Recomendação sobre Jobs

**Híbrido é o ideal para jobs também:**
- Manter Workers para jobs que dependem de APIs externas e fetch
- Migrar jobs puramente batch/DB para pg_cron quando o DB migrar
- Migrar domain_events para Cloudflare Queues AGORA (sem esperar migração de DB)

---

## 11. Custo e risco

### Comparação de custos (estimativa)

| Item | Cloudflare (atual) | Supabase (full) | Híbrido (Workers+Postgres) |
|---|---|---|---|
| Database | $0 (D1 free tier) | $25/mo (Pro) | $25/mo (Supabase Pro) |
| Storage | $0 (R2 free tier) | $0 (25GB free) | $0 (mantém R2) |
| Workers | $0 (free tier) | N/A | $0 (free tier) |
| Edge Functions | N/A | Incluso no Pro | N/A |
| Auth | $0 (custom) | Incluso no Pro | $0 (mantém custom) |
| Egress | $0 (dentro CF) | $0.09/GB | $0 (R2→Worker) |
| **Total mensal** | **$0** | **~$25-75** | **~$25-50** |

### Risco de regressão

| Módulo | Risco de regressão | Complexidade de teste |
|---|---|---|
| Auth/Login | Alto | 3-4 cenários por fluxo |
| Multi-empresa | Alto | 5+ combinações de tenant |
| Qualificações | Alto | 12+ tipos de qualificação |
| Simuladores | Alto | Sessões, fichas, manobras |
| FRMS | Muito alto | Cálculos de fadiga, acumulação |
| SGSO | Alto | Relatos, workflow, bowtie |
| Escalas/EVD | Alto | Alocações, publicações |
| LMS | Médio | SCORM, H5P, matrículas |
| Documentos | Médio | Upload/download/stream |

### Matriz comparativa completa

| Critério | Cloudflare atual | Supabase (full) | Híbrido (Workers+Postgres) | Observação |
|---|---|---|---|---|
| **Tenant isolation** | Application-level WHERE empresa_id. Funcional mas frágil (108 arquivos). Sem proteção DB. | RLS nativa. Proteção no DB. Defense-in-depth. | RLS nativa. Workers mantêm middleware como camada adicional. | RLS é o maior ganho arquitetural do Postgres. |
| **SQL complexo** | SQLite limitado. Sem window functions, CTE recursivas, JSONB. | Postgres completo. Window functions, CTE, JSONB, FTS. | Postgres completo. | Ganho real para analytics e reporting. |
| **Migrations** | 357 arquivos SQL. Via CLI wrangler. Sem version tracking. | Migrations versionadas. Supabase CLI. | Migrations versionadas. | Postgres migrations são mais maduras. |
| **Auth** | Custom JWT funcional. Multi-empresa nativo. Sem custo. | Supabase Auth built-in. Não suporta per-company role nativamente. | Manter auth custom. Zero mudança. | Auth custom é database-agnostic. Manter. |
| **Storage** | R2 integrado. Zero egress. Latência <5ms. | Supabase Storage. Egress $0.09/GB. Presigned URLs. | Manter R2. Zero mudança. | R2 é superior para o perfil AirTrust. |
| **Audit/LGPD** | Application-level. Soft-delete universal. Funcional. | pgaudit extension no DB. Complementar à aplicação. | pgaudit + application-level. | pgaudit é ganho marginal. Não justifica migração. |
| **Performance** | Latência zero Worker→D1. Single-region. | Latência de rede Worker→Postgres. Conexão HTTP. | Latência de rede Worker→Postgres. | D1 tem vantagem de latência. Mitigável com connection pooling. |
| **Custo** | $0/mês (free tier). | $25-75/mês (Pro + egress). | $25-50/mês (Pro, sem egress de storage). | Custo atual é imbatível. $25-50 é aceitável. |
| **Observabilidade** | Cloudflare Analytics. Limitado. | Supabase Dashboard + Logs. Melhor. | Supabase Dashboard para DB + Cloudflare para Workers. | Ganho marginal. |
| **Developer velocity** | SQL direto sem ORM. Rápido para features simples. | SQL direto ou ORM. Mesma velocidade. | SQL direto ou ORM. Mesma velocidade. | Neutro. ORM é opcional em ambos. |
| **Risco de regressão** | Zero (não há migração). | Muito alto (14-18 semanas de refação). | Alto (6-8 semanas de refação). | Risco proporcional ao escopo da migração. |
| **Rollback** | N/A. | Quase impossível (D1→Postgres é one-way). | Difícil mas factível (shadow run com D1 primary). | Shadow run é essencial para qualquer migração. |
| **Vendor lock-in** | Cloudflare only. | Supabase only. | Dois vendors (Cloudflare + Supabase). | Repository pattern mitiga lock-in de DB. |
| **Operar 2 empresas** | Suporta. Tenant isolation funcional. | Suporta. RLS facilita. | Suporta. RLS facilita. | Escala atual é adequada em qualquer cenário. |
| **Operar 5+ empresas** | Possível. Carga de tenant isolation no código cresce. | RLS reduz risco de leak entre tenants. | RLS reduz risco. Workers escalam horizontalmente. | Postgres ganha relevância com mais tenants. |

### Maiores riscos de migração

1. **Perda de tenant isolation durante migração** — CRÍTICO. Dados de empresa A expostos para empresa B.
2. **Regressão em FRMS** — cálculos de fadiga são complexos e sensíveis a mudanças de SQL.
3. **Quebra de auth multi-empresa** — login, switch de empresa, refresh token.
4. **Perda de dados em migração de schema** — 357 migrations com histórico de 2+ anos.
5. **Downtime** — D1 → Postgres requer janela de cutover.
6. **Rollback difícil** — uma vez migrado, voltar para D1 é quase impossível.

---

## 12. Plano hipotético de migração por fases

```
Fase 0 (AGORA) ─────────────────────────────────────── 1-2 semanas
├── Repository pattern sobre D1
├── Auditoria tenant isolation (fechar 5 gaps)
├── Migrar domain_events → Cloudflare Queues
├── Adicionar empresa_id como metadata R2
└── Documentar schema atual para portabilidade

Fase 1 (FUTURO, quando gatilho atingido) ──────────── 3-4 semanas
├── Traduzir 357 migrations D1 → Postgres
├── Implementar RLS policies (~110 tabelas)
├── Conectar Workers ao Supabase Postgres
└── Shadow run D1 + Postgres

Fase 2 (FUTURO) ───────────────────────────────────── 1-2 semanas
├── Migrar R2 → Supabase Storage
├── Adaptar asset serving
└── Manter R2 como fallback 30 dias

Fase 3 (FUTURO) ───────────────────────────────────── 2-3 semanas
├── Manter auth custom com Postgres
├── (Opcional) Sincronizar auth.users ↔ usuarios
└── Validar multi-empresa, impersonation

Fase 4 (FUTURO) ───────────────────────────────────── 1-2 semanas
├── Migrar jobs batch → pg_cron
├── Manter API-heavy jobs nos Workers
└── Validar backup/restore

Fase 5 (FUTURO, opcional) ─────────────────────────── 2-3 semanas
├── Supabase Realtime para escalas/notificações
└── Edge Functions para rotas não-críticas
```

---

## 13. Recomendação final

### Decisão: NÃO MIGRAR AGORA

### Estratégia: HÍBRIDO FUTURO

### Ações imediatas (próximo sprint):

1. **Criar Repository pattern** sobre D1 — isolar `DB.prepare()` atrás de interfaces. Preparar código para swap futuro de database sem reescrever lógica de negócio.
2. **Auditar e fechar gaps de tenant isolation** — rotas de documentos sem verificação de `empresa_id`.
3. **Migrar `domain_events` para Cloudflare Queues** — remover uso de D1 como message queue.
4. **Adicionar `empresa_id` como metadata nos objetos R2** — defense-in-depth para storage.
5. **Manter tudo como está** — D1, R2, Workers, Auth custom.

### O que NÃO fazer:

- Não iniciar migração de schema
- Não criar projeto Supabase
- Não reescrever auth
- Não migrar storage
- Não alterar runtime

### Quando reavaliar:

- D1 atingir 80% de qualquer limite (5GB, 1M statements/dia)
- Incidente de tenant isolation que RLS teria prevenido
- Necessidade real de queries analíticas complexas
- Expansão para 3+ empresas com dados significativos
- **Ou em 2027-06-02 (12 meses) — reavaliação programada**
