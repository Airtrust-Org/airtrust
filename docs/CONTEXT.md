# AirTrust — Contexto de arquitetura (agentes e contribuidores)

> Documento vivo para orientar agentes de IA, revisores e novos contribuidores.
> **Última atualização:** 2026-06-29 | **ADR vigente:** [0001 — Padrão modular](adr/0001-airtrust-module-architecture-pattern.md)

---

## O que é o AirTrust

SaaS multi-tenant para gestão de tripulações na aviação civil brasileira: qualificações, escalas, FRMS, LMS nativo, simuladores, SGSO, certificados e compliance regulatório.

**Produção real** — nunca deploy, migration remota ou alteração de dados sem autorização explícita.

---

## Stack e entry points

| Camada | Tech | Entry |
|---|---|---|
| Frontend SPA | React 19, Vite 6, React Router 7, TanStack Query 5 | `src/react-app/main.tsx` |
| Backend API | Cloudflare Workers, Hono 4, D1, R2 | `worker-airtrust/src/index.ts` |
| Alias TS | `@/` → `./src` | `vite.config.ts`, `tsconfig.app.json` |

Comandos locais seguros (sem efeito em produção):

```bash
npm start              # worker :8787 + frontend :3000
npm run lint           # api-base + secret guard + auth boundary
npm run test:run       # testes frontend (Vitest)
npm run test:worker    # testes worker
npm run build          # build frontend
npx tsc --noEmit       # typecheck
```

---

## Multi-tenancy (regra #1)

Todo request autenticado passa por `auth` + `tenantMiddleware` → `c.get('empresaId')`.

**Toda query** em dados de tenant **deve** incluir `WHERE empresa_id = ?` (ou JOIN equivalente). Sem exceção.

Rotas públicas: whitelist em `index.ts` (`isPublicPath`).

---

## Padrão modular oficial

**Referência canônica:** `worker-airtrust/src/lib/frms/`

```
routes/<modulo>.ts     → handler fino (HTTP + Zod + delegação)
lib/<modulo>/types.ts  → tipos e constantes
lib/<modulo>/calculos.ts → regra pura (opcional)
lib/<modulo>/db-service-*.ts → SQL D1
lib/<modulo>/db-service.ts → barrel re-export
lib/<modulo>/__tests__/ → testes colocalizados
```

### Anti-patterns proibidos

- SQL grande inline em `routes/`
- INSERT direto em tabelas de auditoria (usar `lib/audit/audit-events-v2.ts`)
- Novo client HTTP sem suite de testes
- Novo componente UI duplicado (Modal, Button, DataTable…)
- Refactor amplo em módulos congelados (ver abaixo)

Detalhes completos: [ADR 0001](adr/0001-airtrust-module-architecture-pattern.md)

---

## Mapa de módulos

| Módulo | Backend routes | Lib existente | Frontend | Estado modular |
|---|---|---|---|---|
| FRMS | `routes/frms*.ts` | `lib/frms/` ✅ | `pages/frms/` | **Referência** — congelado para refactor |
| LMS | `routes/lms-*.ts` (~13k LOC) | ❌ (parcial: `repositories/lmsRelatoriosRepository`) | `pages/lms/` | **Alvo Fase 3–4** |
| Treinamentos | `routes/treinamentos-planejados.ts` (~3.5k LOC) | ❌ | `TreinamentosPlanejadosPage.tsx` (~3.7k LOC) | Após LMS |
| Escalas/EVD | `routes/escalas-*.ts` | `lib/escalas/active-fortnight.ts` (pontual) | `pages/escalas/` | Após Treinamentos |
| Qualificações | `routes/qualificacoes/` | parcial em routes | `pages/Qualificacoes.tsx` (~5k LOC) | Fase 6 |
| Simuladores | `routes/simuladores-*.ts` | `routes/simuladores-shared.ts` | `pages/simuladores/` | Estável |
| SGSO | `routes/sgso*.ts` | `lib/sgso-next-gen.ts` | `pages/sgso/` | Parcial |
| Audit | — | `lib/audit/` | — | Canônico para eventos |

---

## Dívida arquitetural conhecida

### 1. Árvore frontend duplicada (prioridade roadmap Fase 5)

| Árvore | Path | Papel |
|---|---|---|
| **Canônica** | `src/react-app/**` | SPA principal; incluída no `tsconfig.app.json` |
| **Legada** | `src/components/**` (~25 arquivos) | UI primitivos (Modal, Button, DataTable, layout) |
| **Legada** | `src/lib/sw-manager.tsx` | Service Worker helper |

O alias `@/` resolve para `./src`, então `@/components/ui/Modal` importa da árvore **legada**, não de `react-app`. ~24 arquivos em `react-app` usam `@/components/*`.

**Regra:** não apagar `src/components/` até Fase 5 concluída com inventário e redirects de import.

### 2. Rotas monolíticas (prioridade roadmap Fase 3–4)

| Arquivo | LOC (approx) | `.prepare()` inline |
|---|---|---|
| `lms-cursos.ts` | 2.889 | muitos |
| `lms-matriculas.ts` | 3.225 | muitos |
| `lms-assets.ts` | 2.399 | muitos |
| `treinamentos-planejados.ts` | 3.507 | muitos |

Testes LMS existentes: 13 arquivos em `worker-airtrust/src/__tests__/routes/lms-*` — baseline a expandir antes de extrações.

### 3. Utilitários compartilhados dispersos (Fase 2)

| Util | Local atual | Notas |
|---|---|---|
| CPF | `worker-airtrust/src/utils/cpf.ts`, `utils/security.ts` | `normalizeCPF`, `isValidCPF` |
| Datas | `worker-airtrust/src/utils/dates.ts` | consolidar uso |
| DB helpers | `worker-airtrust/src/utils/db.ts`, `utils/db-schema.ts` | helpers genéricos |
| Frontend validação | `src/react-app/lib/validations/schemas.ts` | CPF format regex |

---

## Zona congelada (NÃO alterar nesta trilha de refactor)

- RBAC, auth, multi-tenant middleware
- Backup e certificados automáticos
- FRMS operacional, fadiga check-in, SIGVOOS, `frms-source-policy.ts`
- Contrato público LMS/SCORM/xAPI (paths, cookies JWT asset, launch)
- Comportamento de endpoints existentes (extração move código, não muda resposta)
- Deploy, migrations remotas, scripts de produção

---

## Guards de arquitetura existentes

`worker-airtrust/src/__tests__/architecture/`:

- `no-internal-error-details.test.ts`
- `no-runtime-ddl-hot-paths.test.ts`
- `no-sensitive-audit-payloads.test.ts`
- `no-temporary-production-endpoints.test.ts`
- `architecture-performance-guard.test.ts`
- `beta-module-public-surface.test.ts`
- `sigvoos-no-runtime-ddl.test.ts`

Novos guards devem ser adicionados na Fase 1 do roadmap.

---

## Roadmap de refactor

Plano incremental completo: **[ARCHITECTURE_REFACTOR_ROADMAP.md](ARCHITECTURE_REFACTOR_ROADMAP.md)**

Ordem aprovada:

1. Fase 0 — Segurança e blockers
2. Fase 1 — Guards de arquitetura
3. Fase 2 — Shared utils (CPF, dates, db)
4. Fase 3 — Skeleton `lib/lms`
5. Fase 4 — Extração incremental LMS
6. Fase 5 — Árvore frontend duplicada
7. Fase 6 — Páginas gigantes

**Não executar fases fora de ordem** sem GO explícito da fase anterior.

---

## Documentação relacionada

| Documento | Conteúdo |
|---|---|
| [ADR 0001](adr/0001-airtrust-module-architecture-pattern.md) | Padrão modular oficial |
| [ARCHITECTURE_REFACTOR_ROADMAP.md](ARCHITECTURE_REFACTOR_ROADMAP.md) | Fases, GO/NO-GO, métricas |
| `ARCHITECTURE_OVERVIEW.md` | Topologia Cloudflare |
| `FRMS_ARCHITECTURE.md` | Módulo referência |
| `LMS_ARCHITECTURE.md` | Contratos LMS/SCORM |
| `FRONTEND_ARCHITECTURE.md` | SPA, providers, fetch |
| `CLAUDE.md` / `.cursorrules` | Regras operacionais do repo |
| `docs/AIRTRUST_ARCHITECTURE_MODULARIZATION_PLAN_H33_v0_5.md` | Diagnóstico H33 (read-only) |

---

## Checklist rápido para PRs de arquitetura

- [ ] Escopo limitado a uma extração/fase
- [ ] Sem alteração de contrato HTTP ou SCORM
- [ ] `empresa_id` preservado em queries movidas
- [ ] Testes adicionados ou existentes passando
- [ ] `npm run lint` + testes relevantes verdes
- [ ] Sem deploy, migration, ou toque em zona congelada
- [ ] Sem mudanças cosméticas misturadas
