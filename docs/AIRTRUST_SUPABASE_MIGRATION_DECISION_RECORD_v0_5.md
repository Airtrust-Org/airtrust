# AirTrust Supabase Migration Decision Record v0.5

**Date:** 2026-06-02
**Status:** Decisão técnica fundamentada
**Sprint:** I — Supabase Feasibility Audit
**Branch:** main
**HEAD:** 871a140e47ec8eb53a21b169956c7fdd5d149179

---

## 1. Contexto

O AirTrust opera atualmente sobre Cloudflare Workers + D1 (SQLite) + R2 (object storage). A plataforma está estável, com auth custom robusta, tenant isolation via middleware + SQL `WHERE empresa_id`, e ~130 rotas de API.

A avaliação de migração para Supabase surge de preocupações futuras com:
- Escalabilidade do D1 (limite 5GB, 1M statements/dia no tier gratuito)
- Ausência de Row-Level Security nativa no SQLite
- Complexidade crescente do schema (357 migrations, ~140 tabelas)
- D1 usado como message queue (domain_events) — padrão não ideal
- Desejo de queries mais complexas (analytics, reporting) que Postgres suporta melhor

**Premissa:** Nenhuma migração foi iniciada. Esta é uma avaliação de viabilidade, sem execução.

---

## 2. Decisão

### NÃO MIGRAR AGORA

**Decisão secundária:** Recomendar modelo **HÍBRIDO FUTURO** (Workers + Supabase Postgres) como caminho de migração quando os gatilhos forem atingidos.

---

## 3. Alternativas consideradas

| Alternativa | Avaliação |
|---|---|
| **Migrar agora (full Supabase)** | Rejeitada. Custo de reescrita de 200+ arquivos, 357 migrations, auth custom. ROI negativo no momento. |
| **Não migrar nunca** | Rejeitada. D1 tem limites que serão atingidos com crescimento. Postgres oferece capacidades que D1 nunca terá. |
| **Híbrido agora** | Rejeitada. Complexidade de dois bancos simultâneos sem ganho proporcional. |
| **Híbrido futuro** | ✅ Recomendada. Workers como API gateway + Supabase Postgres como database. Menor risco, migração por fases. |
| **Migrar só DB (D1→Postgres), manter Workers+R2+Auth** | ✅ Componente principal do híbrido. Maximiza ganho, minimiza disrupção. |

---

## 4. Recomendação

### O que fazer agora (2026 Q2-Q3)

1. **Criar camada de abstração de banco** — Repository pattern sobre D1 atual, sem mudar runtime. Preparar o código para swap futuro de database.
2. **Auditar e fechar gaps de tenant isolation** — ~5 endpoints de download de documentos sem verificação explícita de `empresa_id`.
3. **Migrar `domain_events` para Cloudflare Queues** — Substituir D1 como fila de mensagens. Já está no ecossistema Cloudflare.
4. **Adicionar `empresa_id` como metadata nos objetos R2** — Defense-in-depth para storage.
5. **Manter D1, manter R2, manter Auth custom, manter Workers.**

### O que NÃO fazer agora

- NÃO iniciar migração de schema D1 → Postgres
- NÃO criar projeto Supabase
- NÃO conectar Workers em Supabase
- NÃO reescrever auth para Supabase Auth
- NÃO migrar R2 para Supabase Storage
- NÃO alterar runtime
- NÃO deployar mudanças estruturais

---

## 5. Gatilhos futuros para reavaliar

Reavaliar migração quando **QUALQUER** destes ocorrer:

| Gatilho | Severidade |
|---|---|
| D1 atinge 80% do limite de 5GB | Alta — reavaliar imediatamente |
| D1 atinge 80% do limite de 1M statements/dia | Alta — reavaliar imediatamente |
| Necessidade de queries analíticas complexas (window functions, CTE recursivas) que D1 não suporta bem | Média |
| Expansão para 3+ empresas com dados significativos | Média |
| Necessidade de real-time (substituir polling por Supabase Realtime) | Média |
| Incidente de tenant isolation que RLS teria prevenido | Alta — reavaliar imediatamente |
| Cloudflare deprecation risk ou price increase significativo | Baixa |
| Contratação de time com experiência em Postgres/Supabase | Média |
| 12 meses desde esta decisão (2027-06) — reavaliação programada | Baixa |

---

## 6. Plano hipotético de migração (se um dia for decidido migrar)

### Fase 0 — Preparação (agora, sem migrar)
- Criar Repository pattern sobre D1
- Migrar domain_events para Cloudflare Queues
- Auditar tenant isolation
- Documentar schema atual em formato portável

### Fase 1 — Database (3-4 semanas)
- Traduzir 357 migrations D1 → Postgres (schema only, sem dados)
- Adaptar SQLite-specific SQL (datetime(), AUTOINCREMENT, PRAGMA, etc.)
- Implementar RLS policies por tabela (~110 tabelas com empresa_id)
- Conectar Workers ao Supabase Postgres via HTTP client
- Shadow run: escrever em D1 e Postgres, ler de D1

### Fase 2 — Storage (1-2 semanas)
- Migrar R2 → Supabase Storage com preservação de paths
- Adaptar asset serving (assets.ts, pasta-virtual.ts)
- Manter R2 como fallback por 30 dias
- Migrar backup strategy: pg_dump → Supabase Storage

### Fase 3 — Auth (2-3 semanas)
- Manter auth custom (JWT próprio)
- Opcional: migrar só password hashing para Supabase Auth
- Sincronizar `auth.users` ↔ `usuarios` table
- NÃO remover auth custom — manter compatibilidade

### Fase 4 — Jobs (1-2 semanas)
- Migrar jobs batch (backup, alerts, notificações) para pg_cron
- Manter jobs que dependem de APIs externas (SIGVOOS) nos Workers
- Manter HTML-to-PDF no Cloudflare Browser Rendering

### Fase 5 — Real-time e Edge Functions (2-3 semanas, opcional)
- Adotar Supabase Realtime para escalas e notificações
- Migrar rotas não-críticas para Edge Functions (opcional)

---

## 7. Resumo da evidência coletada

| Dimensão | Situação atual | Impacto de migrar |
|---|---|---|
| **Database** | D1 SQLite, 357 migrations, 200+ arquivos com SQL direto | Muito alto — sem abstraction layer |
| **Auth** | Custom JWT com jose + bcryptjs, multi-empresa, impersonation | Alto — muito customizado, difícil de portar |
| **Storage** | R2 com asset gateway, tenant-scoped, bem integrado | Médio — factível mas sem ganho proporcional |
| **Tenant isolation** | Application-level WHERE empresa_id, 108 arquivos | Médio — RLS seria ganho real de segurança |
| **Cron/Jobs** | 5 slots Cloudflare, handler monolítico de 1129 linhas | Alto — Supabase não tem cron nativo |
| **Frontend** | React 19 + custom fetchWithAuth | Baixo — substituível por supabase-js |
| **Module gating** | Frontend-enforced, JSON em empresas_config | Baixo — permanece igual |
| **Escala** | 1 empresa principal, ~140 tabelas, ~2300 colunas | Baixo agora, crescerá |

---

## 8. Assinatura técnica

**Avaliado por:** Claude Code (DeepSeek v4 Pro) + exploração automatizada do codebase
**Data da avaliação:** 2026-06-02
**Decisão:** NÃO MIGRAR AGORA. Recomendar HÍBRIDO FUTURO.
**Próxima reavaliação:** 2027-06-02 ou quando gatilho de severidade alta for atingido.
