# AIRTRUST — Tenant Isolation Architecture Audit

> **Data:** 2026-06-08 · **Modo:** auditoria read-only · **Modelo:** Opus 4.8
> **Escopo:** tenant isolation, arquitetura de dados, risco multiempresa
> **Restrições honradas:** sem migration, sem deploy, sem commit, sem `git add`, sem INSERT/UPDATE/DELETE em dados reais. Este documento é um novo artefato de auditoria (não altera código nem dados existentes).

---

## 1. Sumário executivo

**Diagnóstico:** Modelo de *banco único compartilhado (Cloudflare D1/SQLite) com coluna `empresa_id`*, isolamento aplicado por disciplina de aplicação. A espinha dorsal de tenancy é **sólida e server-side** (tenant vem do JWT, middleware global em `/api/*`, a maioria das rotas operacionais filtra `empresa_id`), mas há **defeitos de isolamento confirmados e enumeráveis** em rotas de catálogo/notificações, além de um **vício estrutural de `DEFAULT 1`** que vem contaminando dados (Costa do Sol em `empresa_id=1`).

**Risco atual:** ALTO em pontos específicos (vazamento/edição cross-tenant confirmados), porém **concentrado e recuperável** — não é colapso estrutural generalizado.

**Pode lançar multiempresa hoje?** **Não.** Há ≥2 vazamentos cross-tenant confirmados (F1, F2) e 1 vício estrutural de default (F3) que mistura dados silenciosamente. Lançar uma 2ª empresa real hoje exporia dados entre tenants.

**Recomendação principal:** **MANTER E ENDURECER** (não migrar agora). Gaps enumeráveis; custo/risco de migrar produção para Postgres+RLS é desproporcional.

**Classificação final (§13):** **NÃO SEGURO AINDA, MAS RECUPERÁVEL.**

---

## 2. Estado inicial

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `acaa3e23058fdb0aaa1b1de58c541fba73970891` |
| origin/main | `acaa3e2…` (idêntico — em sincronia) |
| Working tree | 5 arquivos modificados (treinamentos planejados — não relacionados a tenancy); artefatos untracked de sanitização Lotes 1-3 |
| API produção (`/api/version`) | `2026-06-08T13:26:32Z-acaa3e2` |
| API health | `healthy` (DB ok 361ms, storage ok 168ms, região BR) |
| Frontend (`build-version`) | `2026-06-08T13:25:27Z-acaa3e2` |
| Alinhamento | ✅ Frontend, Worker e API todos em `acaa3e2` |

---

## 3. Modelo atual de tenancy

**Como funciona** (`worker-airtrust/src/middleware/auth.ts`, `tenant.ts`, `index.ts:249`):

1. `auth()` valida JWT (`jose`), checa `token_blocklist`, injeta `empresaId = payload.empresa_id`. **Tenant nunca vem do cliente no fluxo normal.**
2. `tenantMiddleware()` confirma o vínculo `usuarios_empresas (empresa_id, usuario_id)` e monta `tenantContext`. Sem vínculo → `403 TENANT_ACCESS_DENIED`.
3. Aplicados **globalmente** em `/api/*` exceto whitelist pública explícita (`index.ts:251`).
4. Helpers: `getEmpresaId(c)`, `withTenantFilter()`, `verifyRecordOwnership()` (whitelist anti-injection).

**Pontos fortes:**
- Tenant resolvido server-side a partir do JWT.
- Middleware global, não opt-in por rota.
- ~100 de 129 arquivos de rota referenciam `getEmpresaId`/`empresaId`.
- Frontend limpa `queryClient.clear()` + `sessionStorage`/`localStorage` no logout e na troca de empresa (`AuthContext.tsx:374,419`), com teste de guard (`src/__tests__/auth-tenant-cache.test.ts`).
- Guards de FRMS bem feitos: `assertJornadaEmpresa`/`assertTripulanteEmpresa` (`frms-shared.ts`) validam `f.empresa_id = ?`.
- `empresas.ts` faz gating explícito de plataforma (`isPlatformSuperAdmin`, 403 quando `empresaId !== id`).

**Pontos frágeis:**
- Isolamento depende de **disciplina manual por query** — nenhuma camada força `empresa_id`.
- `empresa_id INTEGER DEFAULT 1` em ~16 tabelas centrais → INSERT que esquece o tenant cai silenciosamente na empresa 1.
- Fallback de plataforma por "magic id" `userId === 1` (`LEGACY_PLATFORM_ADMIN_USER_ID`) com **fail-open** para a 1ª empresa ativa se o vínculo estiver quebrado (`tenant.ts:270-353`).
- Rotas de catálogo fora do padrão de scoping.

---

## 4. Matriz de tabelas e empresa_id

Derivada de `grep "ADD COLUMN empresa_id"` em `worker-airtrust/migrations/` + CREATE TABLEs.

| Tabela | Tem `empresa_id`? | Deveria? | Default perigoso? | Risco | Recomendação |
|---|---|---|---|---|---|
| funcionarios | ✅ | ✅ | **DEFAULT 1** | Alto (PII) | Remover default; NOT NULL |
| qualificacoes_historico | ✅ | ✅ | **DEFAULT 1** | Alto | Remover default |
| qualificacoes_tipos | ✅ | ✅ | **DEFAULT 1** | Médio | Remover default |
| documentos | ✅ | ✅ | **DEFAULT 1** | Alto | Remover default |
| pasta_virtual | ✅ | ✅ | **DEFAULT 1** | Alto | Remover default |
| modelos_aeronave | ✅ | ✅ | **DEFAULT 1** | **Alto — rota não filtra** | F1 + remover default |
| modelos_sessao | ✅ | ✅ | DEFAULT 1 | Médio | Remover default |
| setores / funcoes / tipos_sessao | ✅ | ✅ | DEFAULT 1 | Médio | Remover default |
| fichas_sessao | ✅ | ✅ | DEFAULT 1 | Alto | Remover default |
| certificados / arquivos / auditoria | ✅ | ✅ | DEFAULT 1 | Médio | Remover default |
| notificacoes (singular) | ✅ | ✅ | DEFAULT 1 | Médio | Remover default |
| **notificacoes_sistema** | ❌ | ✅ | n/a | **Alto — sem coluna + rota global** | F2: adicionar `empresa_id` |
| frms_jornada | ✅ (nullable, sem default) | ✅ | NULL órfão | Médio | Backfill + NOT NULL |
| simuladores / simulador_agendamentos / sessoes | ✅ | ✅ | — | OK | — |
| aeronaves / licencas / compliance | ✅ | ✅ | parcial | Médio | — |
| **qualificacoes_categorias** | ❌ | ⚠️ design | n/a | Médio (taxonomia compartilhada) | Decidir global vs tenant |
| **manobras / manobras_categorias** | ❌ | ⚠️ design | n/a | Médio (catálogo compartilhado) | Decidir global vs tenant |
| **habilitacoes** (catálogo) | ❌ | ⚠️ design | n/a | Baixo (catálogo regulatório) | Provavelmente global OK |
| empresas / empresas_config / usuarios_empresas | n/a (raiz/junction) | n/a | — | OK | — |

> Inconsistência: `verifyRecordOwnership` lista `manobras`, `modelos_aeronave`, `habilitacoes` como tabelas de tenant (`tenant.ts:512-536`), mas `manobras`/`habilitacoes` **não têm** `empresa_id` — indecisão entre "catálogo global" e "dado de tenant".

---

## 5. Auditoria de endpoints

| Rota | Método | Arquivo | Tenant source | Risco | Evidência | Severidade |
|---|---|---|---|---|---|---|
| `/api/modelos-aeronave` `/:id` | GET/PUT/DELETE/POST | `routes/modelos-aeronave.ts` | **nenhum** | Lista/edita/apaga modelos de **todas** as empresas; INSERT cai em DEFAULT 1 | sem `empresa_id` (linhas 45-218) | **CRÍTICO** |
| `/api/notificacoes/sistema` | GET | `routes/notificacoes.ts:404` | só `user_id` | Retorna linhas `user_id IS NULL` + JOIN `funcionarios` sem filtro → nomes/matrículas cross-tenant | `WHERE ${whereClause}` sem `empresa_id`; tabela sem coluna (0331) | **ALTO** |
| `/api/simuladores/manobras` `/categorias` | GET/POST/PUT/DELETE | `routes/simuladores-catalogo.ts` | `auth()` só | Catálogo compartilhado; edição/exclusão por id global | tabela sem coluna `empresa_id` | **MÉDIO** (design) |
| `/api/categorias` `/:id` | POST/PUT/DELETE | `routes/categorias.ts` | `requireRole` só | Admin de B edita/apaga taxonomia usada por A | `qualificacoes_categorias` sem `empresa_id` | **MÉDIO** (design) |
| `/api/integracoes/sigvoos/maintenance/sincronizar-frms` | POST | `routes/integracoes_sigvoos.ts:697,727` | **body `empresaId ?? 1`** | Tenant controlado pelo cliente, default 1 — **gated por `MAINTENANCE_SECRET`** (secureCompare 702-709) | linha 727 (`?? 1`) | **MÉDIO** |
| `/api/empresas` (lista/detalhe/CRUD) | GET/POST/PUT/DELETE | `routes/empresas.ts` | `isPlatformSuperAdmin` + `empresaId===id` | Cross-tenant **só** para admin de plataforma; demais → 403 | linhas 477-518, 614, 744, 894 | **OK (verificado)** |
| `/api/frms/jornadas/:id`, `/jornada/:id/sono` | PUT/PATCH | `routes/frms.ts:1752,1827` | `assertJornadaEmpresa` (`f.empresa_id`) | Tenant-safe — guard antes do `WHERE id=?` | `frms-shared.ts:115` | **OK (verificado)** |
| Núcleo (funcionarios, sgso, escalas, simuladores-sessoes, documentos, dashboard, maioria do frms) | — | vários | `getEmpresaId(c)` | Filtram corretamente (amostrado) | ex.: sgso 510-933 `AND empresa_id = ?` | OK |

---

## 6. Auditoria de queries e joins

**Achados confirmados:**
- **F1 — `modelos_aeronave`:** 100% das queries sem `empresa_id` (`routes/modelos-aeronave.ts`). GET lista tudo; GET/PUT/DELETE `/:id` operam por id sem tenant; POST omite `empresa_id` (→ DEFAULT 1); checagem de unicidade `WHERE modelo = ?` é global (vaza existência).
- **F2 — `notificacoes_sistema`:** tabela **sem coluna** `empresa_id` (CREATE em migration 0331); `WHERE` só por `lida`/`user_id`; `LEFT JOIN funcionarios f ON f.id = n.funcionario_id` sem `empresa_id` → linhas `user_id IS NULL` retornam nomes/matrículas de funcionários de **qualquer** empresa.
- **F3 — `empresa_id INTEGER DEFAULT 1`** em ~16 tabelas centrais — causa-raiz documentada da contaminação Costa do Sol→empresa 1 e dos Lotes 1-3 de saneamento.

**Hipóteses verificadas nesta auditoria:**
- **F4 (frms_jornada por id) — REFUTADA.** Handlers chamam `assertJornadaEmpresa(c, id)` antes de qualquer `WHERE id = ?`, e o guard valida `f.empresa_id = ?` via join em funcionarios (`frms-shared.ts:115-148`). *Caveat menor:* `if (!empresaId) return null` → fail-open se o tenant estiver ausente (não esperado pós-middleware).
- **F5 (catálogos) — CONFIRMADA como gap de design.** `manobras`, `manobras_categorias`, `qualificacoes_categorias`, `habilitacoes` não possuem `empresa_id` → globais entre tenants. Não é vazamento de PII, mas permite que o admin de uma empresa edite/apague catálogo usado por outra, e cria acoplamento de taxonomia. **Requer decisão de produto:** catálogo de plataforma (global, somente leitura para tenants) vs. catálogo por empresa.
- **F7 (fallback de plataforma) — majoritariamente REFUTADA.** `empresas.ts` faz gating explícito e correto. *Resíduo:* o `tenantMiddleware` faz **fail-open** para `userId === 1` (cai na 1ª empresa ativa, preferindo `airtrust`) se o vínculo `usuarios_empresas` não resolver (`tenant.ts:270-353`). Baixa explorabilidade (exige ser o usuário 1), mas é um caminho de confiança implícita a tornar explícito antes do launch.

**Falsos positivos verificados (scoping correto):** `simuladores-sessoes.ts:713` tem `AND empresa_id = ?` multilinha; sgso consistentemente filtra.

**Frontend/cache (sem risco relevante):** `queryClient.clear()` no logout e na troca de empresa; storage limpo; teste de guard presente.

---

## 7. Auditoria de dados legados (read-only — **não executar UPDATE/DELETE**)

O banco de produção não foi consultado (sem autorização). Consultas **somente leitura** propostas para confirmar:

**Q1 — Dados operacionais presos em empresa 1**
```sql
SELECT 'funcionarios' t, COUNT(*) n FROM funcionarios WHERE empresa_id=1 AND deleted_at IS NULL
UNION ALL SELECT 'qualificacoes_historico', COUNT(*) FROM qualificacoes_historico WHERE empresa_id=1
UNION ALL SELECT 'modelos_aeronave', COUNT(*) FROM modelos_aeronave WHERE empresa_id=1 AND deleted_at IS NULL
UNION ALL SELECT 'documentos', COUNT(*) FROM documentos WHERE empresa_id=1
UNION ALL SELECT 'fichas_sessao', COUNT(*) FROM fichas_sessao WHERE empresa_id=1;
-- Interpretação: qualquer linha real da Costa do Sol aqui = contaminação pendente.
```

**Q2 — Linhas órfãs e vazamento de notificações (F2)**
```sql
SELECT 'frms_jornada_orfa' t, COUNT(*) n FROM frms_jornada WHERE empresa_id IS NULL
UNION ALL SELECT 'notif_sistema_cross', COUNT(*)
  FROM notificacoes_sistema n JOIN funcionarios f ON f.id=n.funcionario_id
  WHERE n.user_id IS NULL AND f.empresa_id <> 6;
-- Interpretação: 2ª linha >0 confirma notificações globais expondo funcionários de outra empresa.
```

**Q3 — Empresas e volume real**
```sql
SELECT e.id, e.codigo, e.nome,
  (SELECT COUNT(*) FROM funcionarios f WHERE f.empresa_id=e.id AND f.deleted_at IS NULL) funcs
FROM empresas e WHERE e.deleted_at IS NULL ORDER BY e.id;
-- Interpretação: valida dados reais Costa do Sol em empresa_id=6 e empresa 1 "limpa".
```

**Q4 — Modelos de aeronave por empresa (F1)**
```sql
SELECT empresa_id, COUNT(*) FROM modelos_aeronave WHERE deleted_at IS NULL GROUP BY empresa_id;
-- Interpretação: linhas em empresa_id=1 pós-migração indicam INSERT sem tenant (DEFAULT 1).
```

---

## 8. Auditoria de testes de tenant

**Existentes** (`worker-airtrust/src/__tests__/security/` e `/routes/`):
`tenant-write-paths`, `optional-auth-tenant-exposure`, `auditoria-tenant-isolation`, `documentos-tenant-isolation`, `escalas-alocacoes-tenant-scope`, `simuladores-optional-auth-tenant-scope`, `assets-tenant-ownership`, `admin-reset/backfill-tenant-scope`, `importacao-tenant-scope`, `qualificacao-historico-importacao-tenant` + `auth-tenant-cache` (frontend).

**Lacunas (obrigatórias antes de multiempresa):**
- ❌ `modelos-aeronave` cross-tenant (F1).
- ❌ `notificacoes_sistema` cross-tenant / PII leak (F2).
- ❌ `funcionarios/:id`, `qualificacoes/historico/:id` detalhe cross-tenant.
- ❌ `dashboard` — agregações não vazam totais de outra empresa.
- ❌ Catálogos (categorias/manobras) — decisão global vs tenant testada.

**Guardrail de CI recomendado:** lint que falhe PR quando `FROM <tabela_tenant>` não contiver `empresa_id` no mesmo statement (extensão do `guard:auth-boundaries`).

---

## 9. Avaliação arquitetural

| Critério | Manter + Hardening | Postgres + RLS | DB/schema por empresa | Híbrido |
|---|---|---|---|---|
| Segurança | Boa após hardening | Excelente (no DB) | Excelente | Boa |
| Custo migração | **Baixo** | **Muito alto** | Alto | Médio |
| Complexidade op. | Baixa | Alta (sai do Cloudflare-native) | Alta (N D1, binding limits) | Média |
| Risco regressão | Baixo-médio | **Muito alto** (produção viva) | Alto | Médio |
| Tempo estimado | 1-2 semanas | 2-4 meses | 1-2 meses | 3-5 semanas |
| Impacto no Worker | Mínimo | **Quebra D1 binding**; precisa Hyperdrive/PG | Roteamento de binding por tenant | Moderado |
| Impacto em testes | Incremental | Reescrita | Alto | Moderado |
| Clientes futuros | OK p/ dezenas | OK p/ milhares | OK p/ enterprise | OK |

**Nota decisiva:** D1/SQLite **não suporta Row Level Security**. "Postgres+RLS" implica abandonar D1 + Postgres externo + Hyperdrive — reescrita de 356 migrations e de todo `c.env.DB.prepare()`, em produção viva. Não justificável agora.

---

## 10. Decisão recomendada

### ✅ **MANTER E ENDURECER**

1. Tenancy já é server-side e a **maioria** das rotas filtra `empresa_id` — defeitos **enumeráveis e localizados** (catálogo, notificações, default).
2. F1, F2, F3 são corrigíveis em poucos lotes, sem trocar de banco.
3. Postgres+RLS traz risco de regressão desproporcional num sistema de produção com 356 migrations acopladas a D1.
4. DB-por-empresa em D1 fica disponível como evolução incremental futura (enterprise), sem redesenho agora.

---

## 11. Plano de ação em lotes

> Nenhum lote autorizado a executar — apenas escopo.

**Lote 1 — Bloquear riscos críticos (F1, F2)** · _detalhado em §11.1_
Arquivos: `routes/modelos-aeronave.ts`, `routes/notificacoes.ts`. Migration: F2 sim. Backup: sim. Deploy: sim. Janela: recomendada p/ F2.

**Lote 2 — Testes cross-tenant + guard de CI**
Arquivos: `__tests__/security/*`, script de lint. Migration/backup/deploy: não. Aceite: 100% rotas críticas com teste A-vs-B.

**Lote 3 — Saneamento read-only / dry-run (Q1-Q4)**
Migration: não (só SELECT). Backup: antes de qualquer apply. Deploy: não.

**Lote 4 — Constraints/índices (remover `DEFAULT 1`)**
Tabelas: ~16 c/ `DEFAULT 1`; `frms_jornada` NOT NULL pós-backfill. Migration: sim. Backup: **obrigatório**. Janela: sim.

**Lote 5 — Camada central de tenant + catálogos + fallback plataforma**
Helper obrigatório `tenantQuery()`; decisão F5 (global vs tenant); revisar fail-open `userId===1` (F7). Migration: possível. Deploy: sim.

### 11.1 — Detalhamento do Lote 1 (proposta — NÃO aplicada)

#### F1 — `routes/modelos-aeronave.ts`

**Objetivo:** escopar todas as queries por `empresa_id` e gravar o tenant no INSERT.

- **Pré-requisito:** confirmar via Q4 que dados reais estão em `empresa_id=6` antes de ativar o filtro (senão linhas legadas em 1 "somem" da empresa 6).
- **Decisão de produto:** modelos de aeronave são (a) por empresa ou (b) catálogo de plataforma? A migration 0165 moveu para empresa 6 → tratado como **por empresa**.

**Mudanças propostas (referência, não aplicar):**

```ts
// topo do arquivo
import { getEmpresaId } from '../middleware/tenant';

// GET / — adicionar filtro
const empresaId = getEmpresaId(c);
// ... FROM modelos_aeronave WHERE deleted_at IS NULL AND empresa_id = ?  (bind empresaId)

// GET /:id, PUT /:id (SELECT de existência), DELETE /:id (SELECT + UPDATE):
//   WHERE id = ? AND deleted_at IS NULL AND empresa_id = ?   (bind id, empresaId)
//   UPDATE ... WHERE id = ? AND empresa_id = ?               (bind ..., id, empresaId)

// POST / — incluir empresa_id explícito e checar unicidade por empresa:
//   SELECT id FROM modelos_aeronave WHERE modelo = ? AND empresa_id = ? AND deleted_at IS NULL
//   INSERT INTO modelos_aeronave (modelo, fabricante, tipo, categoria, descricao, empresa_id, ativo, created_at, updated_at)
//   VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))  -- empresa_id = empresaId
```

**Validações:** teste cross-tenant (empresa A não lista/edita/apaga modelo de B); smoke nas 2 empresas; confirmar que o frontend de simuladores ainda popula o dropdown de modelos.
**Aceite:** 0 query sem `empresa_id` no arquivo; 404/empty cross-tenant. **Migration:** não. **Deploy:** sim.

#### F2 — `notificacoes_sistema` + `routes/notificacoes.ts`

**Objetivo:** dar coluna de tenant à tabela e filtrar a rota.

- **Migration (nova, ex.: `0387_add_empresa_id_notificacoes_sistema.sql`)** — proposta:
  ```sql
  ALTER TABLE notificacoes_sistema ADD COLUMN empresa_id INTEGER;  -- sem DEFAULT 1 (ver F3)
  -- Backfill via funcionario:
  UPDATE notificacoes_sistema
     SET empresa_id = (SELECT f.empresa_id FROM funcionarios f WHERE f.id = notificacoes_sistema.funcionario_id)
   WHERE funcionario_id IS NOT NULL AND empresa_id IS NULL;
  CREATE INDEX IF NOT EXISTS idx_notif_sistema_empresa ON notificacoes_sistema(empresa_id, lida, created_at DESC);
  ```
  Linhas sem `funcionario_id` ficam com `empresa_id IS NULL` → tratar como "não exibir cross-tenant" (filtrar `empresa_id = ?`).

- **Rota (`/sistema`, `/sistema/contador`):** adicionar `AND empresa_id = ?` ao `whereClause`/`countWhere`, e ao JOIN garantir `f.empresa_id = ?`. Avaliar remover a cláusula `user_id IS NULL OR ...` ou restringi-la a notificações da própria empresa.

**Validações:** Q2 antes/depois (cross = 0); teste cross-tenant; verificar contador de não-lidas por empresa.
**Aceite:** nenhuma notificação de outra empresa visível; PII de funcionário não vaza. **Migration:** sim (backup obrigatório). **Janela:** recomendada. **Deploy:** sim.

### 11.2 — Lote 2: Testes cross-tenant + guard de CI

**Objetivo:** transformar isolamento de "esperança" em invariante verificável; impedir regressões futuras.

**Arquivos prováveis:**
- Novos testes em `worker-airtrust/src/__tests__/security/` e `/routes/` (espelhar o padrão de `documentos-tenant-isolation.test.ts`).
- Novo script de lint em `scripts/` integrado ao `npm run lint` (junto de `guard:auth-boundaries`, `lint:api-base`, `guard:tracked-secrets`).

**Cobertura mínima de testes (empresa A vs empresa B, mesmos formatos de id):**
- `modelos-aeronave`: A não lista/edita/apaga modelo de B (F1).
- `notificacoes_sistema`: A não vê notificação/PII de B, inclusive `user_id IS NULL` (F2).
- `funcionarios/:id`, `qualificacoes/historico/:id`: detalhe por id de B → 404/403.
- `dashboard`: agregações (contagens, vencimentos) não somam dados de B.
- Catálogos (`categorias`, `manobras`): comportamento condizente com a decisão do Lote 5.
- Negativos de escrita: UPDATE/DELETE com id de B → 0 linhas afetadas / 403.

**Guard de CI (lint estático):** regex/AST que falha o PR quando um statement `FROM <tabela_tenant>` (lista derivada de `ADD COLUMN empresa_id`) não contém `empresa_id` no mesmo statement. Necessário **allowlist** explícita para tabelas globais legítimas (`empresas`, `usuarios_empresas`, catálogos definidos no Lote 5) para evitar falso-positivo.

**Risco:** baixo (somente testes/CI). Principal risco é falso-positivo no lint travando PRs legítimos → mitigar com allowlist versionada e revisada.
**Validações:** `npm run test:worker`, `npm run test:all`, `npm run lint` verdes; rodar o guard contra o estado atual e catalogar exceções conhecidas (F1/F2 devem aparecer até serem corrigidos no Lote 1).
**Critério de aceite:** 100% dos endpoints críticos com teste A-vs-B (listar/detalhe/editar/apagar negados cross-tenant); guard ativo e bloqueando no `npm run lint`.
**Migration:** não. **Backup:** não. **Deploy:** não (roda em CI). **Janela:** não.

> **Ordem recomendada:** escrever os testes de F1/F2 **antes** de aplicar o Lote 1, em modo "red" (devem falhar), e usá-los para provar a correção (ficam "green" pós-Lote 1).

### 11.3 — Lote 3: Saneamento read-only / dry-run

**Objetivo:** quantificar a contaminação real (empresa 1 ↔ 6, órfãos) **sem alterar dados**, produzindo a lista exata de linhas a sanear antes de qualquer apply.

**Arquivos prováveis:** scripts `.sql` somente-SELECT em `artifacts/validation/` + relatório `.md` (mesmo padrão dos Lotes 1-3 já existentes em `artifacts/sanitization/` e `artifacts/db-backups/`).

**Execução proposta (read-only):**
```bash
# SOMENTE SELECT — nunca UPDATE/DELETE/INSERT
npx wrangler d1 execute airtrust-db --env production --remote --command "<Q1..Q4>"
```
Usar as consultas **Q1-Q4** do §7. Adicionar:
- Q5 — funcionários duplicados entre empresas (mesma matrícula/CPF em empresa 1 e 6).
- Q6 — qualificações/fichas/documentos cujo `empresa_id` diverge do `empresa_id` do funcionário referenciado (inconsistência relacional).

**Risco:** baixo (read-only). Risco real só se um SELECT for convertido em mutação — proibido neste lote.
**Validações:** cruzar contagens com a expectativa (empresa 6 = canonical Costa do Sol); diferenças devem ser explicáveis (legado, plataforma airtrust).
**Critério de aceite:** relatório quantitativo aprovado, com a lista nominal de linhas/tabelas a sanear **identificada mas não aplicada**; decisão explícita de quais resíduos em empresa 1 são legítimos (plataforma) vs contaminação.
**Migration:** não. **Backup:** não para os SELECTs; **obrigatório** antes de qualquer apply derivado (lote futuro). **Deploy:** não. **Janela:** não.

### 11.4 — Lote 4: Constraints / índices (remover `DEFAULT 1`)

**Objetivo:** fechar **F3** estruturalmente — que um INSERT sem `empresa_id` **falhe** em vez de cair na empresa 1.

**Tabelas-alvo:** ~16 com `empresa_id INTEGER DEFAULT 1` (ver §4) + `frms_jornada` (→ `NOT NULL` após backfill dos NULL para empresa 6, já parcialmente feito no Lote 3 de FRMS).

**Restrição técnica importante (SQLite/D1):** SQLite **não** permite `ALTER COLUMN DROP DEFAULT` nem `ADD CONSTRAINT NOT NULL` em coluna existente. Remover o default exige o **rebuild de 12 passos** (CREATE tabela nova sem default → COPY → DROP antiga → RENAME → recriar índices/FKs/triggers) por tabela. Em produção com FKs e 356 migrations, isso é a parte mais arriscada de toda a remediação.

**Estratégia recomendada (faseada, menos arriscada que rebuild em massa):**
1. **Curto prazo (preferível):** garantir `empresa_id` explícito em todo INSERT na aplicação (Lote 1 + auditoria das rotas de escrita) + o **guard de CI do Lote 2** que proíbe INSERT sem tenant. Isso neutraliza o risco operacional do `DEFAULT 1` sem tocar o schema.
2. **Médio prazo:** adicionar **índice tenant** `idx_<tabela>_empresa (empresa_id, deleted_at)` em cada tabela quente — barato e sem rebuild.
3. **Longo prazo (opcional, uma tabela por vez):** rebuild para remover `DEFAULT 1` e aplicar `NOT NULL`, começando pelas de maior risco (`funcionarios`, `documentos`, `pasta_virtual`, `fichas_sessao`), cada uma com backup e validação de contagem antes/depois.

**Risco:** médio-alto (rebuild). Mitigar: uma tabela por migration, backup por tabela, validação `COUNT(*)` e FK-check antes/depois, fora de horário operacional.
**Validações:** contagem idêntica antes/depois; `PRAGMA foreign_key_check`; smoke nas 2 empresas; tentar INSERT sem `empresa_id` → deve falhar.
**Critério de aceite:** nenhuma coluna `empresa_id` com `DEFAULT 1` (ou, se diferido, INSERT sem tenant barrado por lint/app) + índice tenant presente em cada tabela quente.
**Migration:** sim (uma por tabela). **Backup:** **obrigatório**. **Deploy:** não (DDL puro). **Janela:** sim.

### 11.5 — Lote 5: Camada central de tenant + catálogos + fallback de plataforma

**Objetivo:** reduzir a dependência de disciplina manual (causa-raiz de F1/F2) e resolver F5 e F7.

**Frentes:**

**(a) Camada central de query tenant-scoped** — `worker-airtrust/src/utils/tenant-query.ts` (novo)
- Wrapper que **exige** `empresaId` e injeta `WHERE empresa_id = ?` em SELECT/UPDATE/DELETE e `empresa_id` em INSERT, para as tabelas de tenant.
- Adoção **incremental** começando pelas rotas de maior risco; não reescrever tudo de uma vez.
- Benefício: o caminho "esquecer empresa_id" deixa de existir para quem usa o helper.

**(b) Catálogos (F5)** — decisão de produto a tomar:
- **Opção A (recomendada para `manobras`/`manobras_categorias`/`habilitacoes`):** catálogo de **plataforma** — global, *read-only* para tenants, escrita só para admin de plataforma. Trava edição/exclusão cross-tenant sem precisar de `empresa_id`.
- **Opção B (avaliar para `qualificacoes_categorias`):** por empresa — `ADD COLUMN empresa_id` + backfill + filtro nas rotas, se cada empresa precisa da própria taxonomia.
- Arquivos: `routes/simuladores-catalogo.ts`, `routes/categorias.ts`, `routes/habilitacoes.ts` (+ `modelos-aeronave` já no Lote 1).

**(c) Fallback de plataforma (F7)** — tornar explícito
- Substituir o "magic id" `userId === 1` (`LEGACY_PLATFORM_ADMIN_USER_ID`) e o fail-open do `tenantMiddleware` por um sinal explícito: flag `is_platform_admin` em `usuarios_empresas` **ou** claim dedicado no JWT.
- Remover o fail-open silencioso (cair na 1ª empresa ativa) → preferir erro explícito + log de auditoria.
- Arquivos: `middleware/tenant.ts` (`isPlatformAdminContext`, fallback 270-353), `middleware/auth.ts`.

**Risco:** médio (refactor amplo) — fazer incremental, guardado pelos testes do Lote 2.
**Validações:** testes do Lote 2 continuam verdes; novos testes de catálogo (escrita cross-tenant negada); teste de que admin de plataforma explícito acessa cross-tenant e admin comum não.
**Critério de aceite:** helper adotado nas rotas críticas; política de catálogo definida, implementada e testada; acesso de plataforma explícito e auditado, sem `userId===1` implícito nem fail-open.
**Migration:** possível (catálogos opção B / flag `is_platform_admin`). **Backup:** sim se tocar dados. **Deploy:** sim. **Janela:** depende do escopo de dados.

### 11.6 — Sequenciamento e dependências

| Lote | Depende de | Migration | Backup | Deploy | Janela |
|---|---|---|---|---|---|
| 1 — F1/F2 | Q4 (de Lote 3) p/ F1 | F2 sim | F2 sim | sim | F2 recomendada |
| 2 — Testes/CI | — (pode começar já) | não | não | não | não |
| 3 — Dry-run dados | — | não | não | não | não |
| 4 — DEFAULT 1 | Lotes 1, 3 | sim | obrigatório | não | sim |
| 5 — Camada/catálogo/F7 | Lote 2 (rede de testes) | possível | condicional | sim | condicional |

**Ordem prática sugerida:** Lote 2 (testes red) + Lote 3 (medir) em paralelo → Lote 1 (corrigir F1/F2, testes ficam green) → Lote 5 (catálogos/F7/camada) → Lote 4 (endurecimento de schema, por último, com schema já estável).

---

## 12. Gate mínimo antes de lançar para outra empresa

- [ ] F1, F2 corrigidos (0 endpoints críticos sem tenant guard).
- [ ] 0 SELECT/UPDATE/DELETE operacional sem `empresa_id`.
- [ ] 0 colunas `empresa_id DEFAULT 1` (F3) — INSERT sem tenant falha.
- [ ] `notificacoes_sistema` com `empresa_id` + filtro na rota.
- [ ] Catálogos (categorias/manobras/habilitacoes) com decisão explícita global-vs-tenant (F5).
- [ ] Fallback `userId===1` revisado/explícito (F7).
- [ ] 100% endpoints críticos com teste cross-tenant + guard de CI ativo.
- [ ] Q1-Q4 executadas: Costa do Sol em `empresa_id=6`, empresa 1 limpa.
- [ ] Logout/troca de empresa limpa cache (✅ já atende; manter teste).
- [ ] Service worker não serve dados antigos entre sessões.
- [ ] Relatório de readiness aprovado.

---

## 13. Conclusão

### ⚠️ **NÃO SEGURO AINDA, MAS RECUPERÁVEL**

A pergunta central — *"uma empresa consegue, por bug, ler/editar/apagar/inferir dados de outra?"* — tem resposta **SIM, hoje**, em caminhos confirmados:
- **Ler/editar/apagar:** `modelos_aeronave` (F1) — qualquer usuário autenticado, qualquer empresa.
- **Ler (PII):** `notificacoes_sistema` (F2) — nomes/matrículas de funcionários de outra empresa em notificações `user_id IS NULL`.
- **Inferir/misturar:** `DEFAULT 1` (F3) — INSERTs sem tenant contaminam empresa 1.

A fundação (JWT server-side, middleware global, scoping na maioria das rotas, guards FRMS, gating de `empresas.ts`, higiene de cache no frontend, suite de testes iniciada) é **estruturalmente sã**. Os defeitos são **localizados e enumeráveis**, corrigíveis sem troca de banco.

**Recomendação: MANTER E ENDURECER** via Lotes 1-5, sem migrar para Postgres/RLS neste estágio. Reavaliar DB-por-empresa apenas com demanda enterprise de isolamento físico.

| Achado | Status | Severidade |
|---|---|---|
| F1 — modelos-aeronave sem tenant filter | **Confirmado** | Crítico |
| F2 — notificacoes_sistema sem empresa_id | **Confirmado** | Alto |
| F3 — empresa_id DEFAULT 1 em ~16 tabelas | **Confirmado** | Alto (estrutural) |
| F4 — frms_jornada por id | **Refutado** (guard existe) | — |
| F5 — catálogos globais (manobras/categorias/habilitacoes) | **Confirmado** (design) | Médio |
| F6 — sigvoos `empresaId ?? 1` | Confirmado, mas secret-gated | Médio |
| F7 — fail-open userId===1 no tenantMiddleware | Resíduo (gating ok) | Médio |
