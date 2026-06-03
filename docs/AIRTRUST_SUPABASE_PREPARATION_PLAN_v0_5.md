# AirTrust Supabase Preparation Plan v0.5

**Date:** 2026-06-02
**Sprint:** J — Supabase Preparation
**Status:** Concluído
**Branch:** main
**HEAD:** bdbc200dc2664bada3657626bdccdb2ea14b5a1d

---

## 1. Objetivo

Transformar a decisão do Sprint I ("NÃO MIGRAR AGORA / HÍBRIDO FUTURO") em ações preparatórias concretas, sem iniciar migração para Supabase.

Este documento registra o que foi feito, o que ficou para próximos sprints, e o que continua proibido.

---

## 2. Decisões do Sprint I (relembrando)

| Decisão | Status |
|---|---|
| NÃO migrar para Supabase agora | Mantida |
| HÍBRIDO FUTURO (Workers + Supabase Postgres) como caminho | Mantida |
| Manter D1, R2, Workers, Auth custom | Mantida |
| Preparar código para swap futuro de database | Em progresso |
| Reavaliar em 2027-06 ou quando gatilhos forem atingidos | Mantida |

---

## 3. Ações preparatórias imediatas (do Sprint I)

| Ação | Status neste Sprint J |
|---|---|
| Repository pattern em mais domínios | ✅ **Feito** — `lmsRelatoriosRepository` criado (3 queries read-only) |
| Auditoria de tenant isolation em documentos | ✅ **Feito** — 14 gaps identificados, 7 críticos, 5 altos. Plano de correção para Sprint K. |
| Cloudflare Queues para domain_events | ✅ **Planejado** — arquitetura alvo, fases, tiers de eventos definidos. Implementação postergada para Sprint L+. |
| Metadata R2 com empresa_id | ✅ **Planejado** — política de metadata, call sites, backfill, validação definidos. Implementação depende de correções de tenant isolation (Sprint K). |

---

## 4. O que foi feito neste Sprint J

### 4.1 Repository Pattern — LMS Relatórios

**Arquivo criado:** `worker-airtrust/src/repositories/lmsRelatoriosRepository.ts`

Três queries read-only extraídas de `routes/lms-relatorios.ts`:
- `getConformidadeRows()` — conformidade por função
- `getCursosConformidadeRows()` — conformidade por curso e função
- `getExpiracaoRows()` — matrículas próximas da expiração

**Características:**
- ✅ Todas as queries têm `empresa_id` explícito
- ✅ Soft-delete preservado
- ✅ Sem mutations
- ✅ Sem dependência de Hono/c
- ✅ Testes criados (`lmsRelatoriosRepository.test.ts`)
- ✅ Contrato público preservado (rota original não foi alterada)

**Próximo passo:** Atualizar `lms-relatorios.ts` para usar o repository (Sprint K ou quando seguro).

### 4.2 Tenant Isolation Audit — Documentos e Assets

**Documento:** `docs/AIRTRUST_TENANT_ISOLATION_DOCUMENTS_AUDIT_v0_5.md`

14 gaps de tenant isolation identificados em rotas de documentos, certificados e assets:
- **7 críticos** — exfiltração de dados ou destruição cross-tenant
- **5 altos** — acesso indevido ou modificação cross-tenant
- **2 médios** — admin routes sem cross-tenant guard

**Correção planejada para Sprint K (GPT-5.5):** Adicionar JOIN `funcionarios.empresa_id` em queries que acessam `documentos` diretamente.

### 4.3 Cloudflare Queues Plan

**Documento:** `docs/AIRTRUST_DOMAIN_EVENTS_QUEUE_PLAN_v0_5.md`

Plano completo para migrar `domain_events` de D1 para Cloudflare Queues:
- 34 tipos de evento categorizados em 3 tiers
- Arquitetura com dual-write, consumer, retry, DLQ
- 5 fases de rollout (Setup → Dual-write → Consumer → Migrate → Cleanup)
- Idempotência via `idempotency_key`
- Observabilidade com métricas de publish/consume/latency

### 4.4 R2 Metadata Plan

**Documento:** `docs/AIRTRUST_R2_METADATA_TENANT_PLAN_v0_5.md`

Plano para adicionar `empresa_id` como custom metadata em objetos R2:
- Mapeamento de call sites de `BUCKET.put()` (8-12 locais)
- Estratégia de backfill para objetos existentes
- Validação via `BUCKET.head()` sem download
- Restrições LGPD (NUNCA armazenar PII em metadata)

---

## 5. O que ficou para próximos sprints

| Ação | Sprint | Modelo | Dependências |
|---|---|---|---|
| Corrigir gaps de tenant isolation (14 endpoints) | K | GPT-5.5 Alta | Nenhuma |
| Atualizar lms-relatorios.ts para usar repository | K | GPT-5.4 Alta | Repository criado |
| Implementar Cloudflare Queues — Fase 0 (setup) | L | GPT-5.5 Alta | wrangler.toml update |
| Adicionar metadata empresa_id em uploads R2 | L | GPT-5.5 Alta | Tenant isolation fixes (Sprint K) |
| Implementar Queues — Fase 1 (dual-write) | M | GPT-5.5 Alta | Fase 0 |
| Backfill metadata R2 objetos existentes | N | GPT-5.5 Alta | Metadata em novos uploads validado |

---

## 6. O que continua proibido

- ❌ Criar projeto Supabase
- ❌ Conectar Workers em Supabase Postgres
- ❌ Iniciar tradução de schema D1 → Postgres
- ❌ Migrar auth para Supabase Auth
- ❌ Migrar R2 para Supabase Storage
- ❌ Alterar wrangler.toml para adicionar bindings (até Sprint L)
- ❌ Executar migration ou alterar schema D1
- ❌ Alterar dados reais ou objetos R2 reais
- ❌ Deploy de mudanças estruturais

---

## 7. Gatilhos para reavaliar Supabase

| Gatilho | Severidade |
|---|---|
| D1 atinge 80% do limite de 5GB | Alta — reavaliar imediatamente |
| D1 atinge 80% do limite de 1M statements/dia | Alta — reavaliar imediatamente |
| Incidente de tenant isolation que RLS teria prevenido | Alta — reavaliar imediatamente |
| Expansão para 3+ empresas com dados significativos | Média |
| Necessidade de real-time (Supabase Realtime) | Média |
| 12 meses desde Sprint I (2027-06-02) | Programada |

---

## 8. Próximos passos

1. **Sprint K (GPT-5.5 Alta):** Corrigir os 14 gaps de tenant isolation em documentos/assets. Atualizar `lms-relatorios.ts` para usar o novo repository.
2. **Sprint L (GPT-5.5 Alta):** Setup Cloudflare Queues (dev). Adicionar metadata `empresa_id` em novos uploads R2.
3. **Continuar monitorando:** Uso de D1 (tamanho, statements/dia). Sem ação até atingir 80% de qualquer limite.

---

## 9. Documentos produzidos neste sprint

| Documento | Conteúdo |
|---|---|
| `AIRTRUST_TENANT_ISOLATION_DOCUMENTS_AUDIT_v0_5.md` | 14 gaps, 7 críticos, plano de correção |
| `AIRTRUST_DOMAIN_EVENTS_QUEUE_PLAN_v0_5.md` | Arquitetura, fases, tiers, retry/DLQ |
| `AIRTRUST_R2_METADATA_TENANT_PLAN_v0_5.md` | Política, call sites, backfill, LGPD |
| `AIRTRUST_SUPABASE_PREPARATION_PLAN_v0_5.md` | Este documento |
| `AIRTRUST_REMEDIATION_ROADMAP_v0_5.md` | Atualizado |
| `AIRTRUST_NEXT_SPRINTS_PLAN_v0_5.md` | Atualizado |

### Código produzido

| Arquivo | Descrição |
|---|---|
| `worker-airtrust/src/repositories/lmsRelatoriosRepository.ts` | Repository read-only LMS (3 queries) |
| `worker-airtrust/src/__tests__/repositories/lmsRelatoriosRepository.test.ts` | 8 testes de contrato |
