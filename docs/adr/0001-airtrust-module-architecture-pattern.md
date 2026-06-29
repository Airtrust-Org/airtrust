# ADR 0001 — Padrão de arquitetura modular AirTrust

| Campo | Valor |
|---|---|
| **Status** | Aceito |
| **Data** | 2026-06-29 |
| **Decisores** | Equipe de arquitetura AirTrust |
| **Referência canônica** | `worker-airtrust/src/lib/frms/` |
| **Escopo desta ADR** | Backend Worker (Hono + D1). Frontend segue ADR complementar na Fase 5 do roadmap. |

---

## Contexto

O AirTrust cresceu com rotas monolíticas (`routes/lms-*.ts`, `routes/treinamentos-planejados.ts`, `routes/escalas-*.ts`) que concentram SQL inline, validação, orquestração e efeitos colaterais no mesmo arquivo. O módulo FRMS já foi modularizado em `lib/frms/` (~27 arquivos, ~6000+ linhas) com separação clara entre rotas finas, serviços de persistência, tipos e lógica pura.

Relatórios de arquitetura (H33, code audit, LMS architecture) identificam:

- Rotas LMS/Treinamentos somando **~13.450 LOC** com dezenas de `.prepare()` inline.
- Frontend com **duas árvores de componentes** (`src/components/` legado vs `src/react-app/components/` canônico), unidas pelo alias `@/` → `./src`.
- Duplicação de utilitários transversais (CPF, datas, helpers D1) espalhada entre `utils/` e lógica inline.

Qualquer refactor amplo em módulos operacionais (FRMS, EVD, SIGVOOS, auth, backup, certificados) é **proibido nesta trilha**. A modularização deve ser incremental, auditável e reversível.

---

## Decisão

Adotar o **padrão lib/frms** como contrato oficial para novos extractions e refactors incrementais em módulos de domínio (começando por LMS, depois Treinamentos Planejados, depois Escalas).

### Estrutura de diretório por módulo

```
worker-airtrust/src/lib/<modulo>/
├── types.ts                 # Tipos, constantes, enums, schemas de domínio
├── calculos.ts              # (opcional) Funções puras — sem I/O, sem DB
├── <nome>-service.ts        # (opcional) Orquestração de casos de uso complexos
├── db-service.ts            # Barrel re-export (retrocompatibilidade)
├── db-service-<sub>.ts      # Persistência D1 por subdomínio
└── __tests__/               # Testes unitários/integração próximos ao módulo
    └── *.test.ts
```

Rotas permanecem em `worker-airtrust/src/routes/` como **handlers finos**.

### Contrato de responsabilidades

| Camada | Local | Responsabilidade | Proibido |
|---|---|---|---|
| **Route handler** | `routes/<modulo>.ts` | Auth/RBAC já aplicados pelo middleware global; validação Zod de entrada; mapeamento HTTP ↔ domínio; chamada a `lib/<modulo>/`; resposta `{ success, data \| error }` | SQL grande inline; regra de negócio densa; INSERT direto em tabelas de auditoria |
| **Domínio / tipos** | `lib/<modulo>/types.ts` | Tipos, constantes, limites, enums | Acesso a `c.env.DB` |
| **Regra / cálculo** | `lib/<modulo>/calculos.ts` ou `*-policy.ts` | Funções puras, testáveis sem mock de DB | Side effects, fetch externo |
| **Persistência** | `lib/<modulo>/db-service-*.ts` | Queries D1; sempre `WHERE empresa_id = ?`; transações quando necessário | Lógica de apresentação HTTP; validação de request |
| **Orquestração** | `lib/<modulo>/*-service.ts` | Fluxos multi-step (upload → parse → persist → side effect) | Handlers HTTP |
| **Auditoria** | `lib/audit/audit-events-v2.ts` | Gravação canônica via API de audit v2 | `INSERT` direto em `audit_logs` / `audit_events_v2` a partir de routes ou db-services |

### Referência: padrão FRMS (estado atual desejado)

```
routes/frms.ts          → validação + HTTP + delegação
lib/frms/types.ts       → FrmsJornada, LimitesMap, NIVEIS_ALERTA
lib/frms/calculos.ts    → calcFatorizacao, calcEffectiveness (puro)
lib/frms/db-service-jornadas.ts → salvarJornada, pipeline completo
lib/frms/db-service.ts  → barrel re-export
```

O arquivo `routes/frms.ts` ainda é grande (~3800 LOC) por handlers acumulados — **não é meta replicar esse tamanho**. Novas extrações devem reduzir rotas progressivamente; FRMS operacional permanece congelado até fase posterior explícita.

### Regras transversais (obrigatórias)

1. **Multi-tenant**: toda query em dados de tenant inclui `empresa_id = ?` (ou JOIN equivalente).
2. **Contrato HTTP estável**: paths, métodos, status codes e shape `{ success, data }` não mudam durante extração — apenas movem implementação.
3. **Sem novo client HTTP**: `fetchWithAuth()` (frontend) e `fetch` nativo (worker) permanecem; troca de cliente exige suite de testes dedicada.
4. **Sem novo componente duplicado**: frontend não cria variantes de Modal/Button/DataTable; consolida antes de expandir.
5. **Sem direct INSERT em auditoria**: usar `recordAuditEventV2()` / helpers em `lib/audit/`.
6. **Sem SQL grande inline em route**: limiar orientativo — bloco `.prepare()` com >15 linhas ou reutilizado em >1 handler → mover para `db-service-*.ts`.
7. **Testes antes de mover**: cada extração exige teste de contrato ou unitário que falhe se comportamento mudar.
8. **Patches pequenos**: uma extração por PR; diff revisável (<300 LOC preferencial, <600 LOC máximo por PR de extração).

### Frontend (escopo complementar — Fase 5)

Canônico: `src/react-app/**`. Legado coexistindo: `src/components/**`, `src/lib/sw-manager.tsx`.

- Alias `@/` aponta para `./src` (Vite + tsconfig).
- Imports `@/components/ui/*` resolvem para árvore legada — **dívida conhecida**.
- Meta: convergir imports para `src/react-app/components/` sem apagar legado até Fase 5 concluída.

---

## Alternativas consideradas

| Alternativa | Motivo de rejeição |
|---|---|
| Big-bang refactor LMS + frontend + Escalas | Risco operacional; viola regras de congelamento FRMS/SIGVOOS/auth |
| ORM (Drizzle/Prisma) sobre D1 | Mudança de stack; 378+ migrations raw SQL; fora de escopo |
| Monorepo packages `@airtrust/lms` | Overhead de build/publicação; prematuro para equipe atual |
| Manter status quo indefinidamente | Rotas LMS >2800 LOC cada; custo de manutenção e regressão crescente |

---

## Consequências

### Positivas

- Extrações pequenas e reversíveis com rollback por revert de PR.
- Testes colocalizados aumentam confiança sem exigir refactor de FRMS.
- Novos contribuidores têm um único padrão documentado (FRMS como north star).

### Negativas / trade-offs

- Período de coexistência: rotas chamam tanto código inline quanto `lib/lms/` até Fase 4 completar.
- Duas árvores frontend persistem até Fase 5.
- Barrel `db-service.ts` pode mascarar dependências circulares — revisar imports em PRs.

---

## Módulos congelados (fora desta ADR até decisão explícita)

| Módulo | Motivo |
|---|---|
| `middleware/auth.ts`, `tenant.ts`, `rbac.ts` | Fronteira de segurança |
| `routes/frms*.ts`, `lib/frms/*` (operacional) | Fadiga / SIGVOOS / produção crítica |
| `services/sigvoos-frms.ts`, `lib/frms/frms-source-policy.ts` | Integração SIGVOOS |
| `routes/backup.ts`, certificados automáticos | Dados regulados |
| `routes/importacao.ts` | Legado + sensibilidade operacional |
| Contrato SCORM/xAPI público (`lms-progresso`, launch/assets) | Players e LMS externos |

---

## Critérios de aceite desta ADR

- [ ] `docs/CONTEXT.md` referencia este ADR como padrão oficial.
- [ ] `docs/ARCHITECTURE_REFACTOR_ROADMAP.md` detalha fases 0–6 com GO/NO-GO.
- [ ] Primeira extração LMS (Fase 4) segue estrutura `lib/lms/` sem alterar contrato HTTP.
- [ ] Nenhum deploy ou migration executado como parte da adoção desta ADR.

---

## Referências

- `FRMS_ARCHITECTURE.md` — documentação do módulo referência
- `LMS_ARCHITECTURE.md` — contratos LMS/SCORM a preservar
- `docs/AIRTRUST_ARCHITECTURE_MODULARIZATION_PLAN_H33_v0_5.md` — diagnóstico H33
- `worker-airtrust/src/__tests__/architecture/*` — guards existentes
