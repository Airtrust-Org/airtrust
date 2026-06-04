# AirTrust — SIGVOOS DDL R01 Readiness v0.5

**Data:** 2026-06-03
**Sprint:** Z0 readiness + Z1 migration local + Z1.1 chain audit + pós-apply oficial em produção
**Branch:** `main`
**HEAD:** `f2d0db6276e0600e34716823645622b5001d8b02`
**Modo:** Z0 foi read-only/docs-only. Z1 criou migration local + testes + atualização documental. Z1.1 auditou a cadeia `0354 -> 0387` com prova local. Depois, o mecanismo oficial `Cloudflare D1 migrations apply` aplicou a `0387` em `production` ao consumir a fila pendente durante a tentativa de aplicar a `0388`. Não houve SQL manual, não houve backfill, não houve consulta de dados de linha, não houve alteração de runtime e não houve deploy.

---

## 1. Objetivo

Mapear integralmente o escopo de `ensureSigvoosTables()` (R01), registrar o estado pós-apply da `0387` em produção e consolidar a estratégia local de bootstrap para preparar a remoção futura do runtime DDL residual. A reconciliação final da cadeia `0354 -> 0387` ainda depende de gate em ambiente novo aprovado.

> **Addendum pós-apply em produção (2026-06-03):** a tentativa de aplicar apenas `0388_documentos_canonical_schema.sql` via mecanismo oficial `Cloudflare D1 migrations apply` consumiu a fila pendente completa e aplicou também `0387_integracoes_sigvoos_base_tables.sql`. Registrar como **`APPLY_SCOPE_EXPANDED_BY_PENDING_QUEUE`**. Resultado: `0387` está aplicada em produção, mas isso **não** corrige a cadeia limpa, porque `0354_auditoria_critica_schema_hardening.sql` continua historicamente anterior à `0387` e ainda depende da existência prévia de `integracoes_sigvoos_config`. Status consolidado naquela fase: **`R01 = 0387_APPLIED_IN_PRODUCTION_BUT_CHAIN_0354_STILL_NEEDS_RECONCILIATION`**.
>
> **Addendum Sprint R01 Bootstrap + Replay Closure (2026-06-04):** `scripts/bootstrap-new-environment.sql` foi criado para ambientes novos, contendo apenas o DDL base de `integracoes_sigvoos_config`, `integracoes_sigvoos_eventos` e `integracoes_sigvoos_mapeamentos` + 4 índices. O teste local de migrations foi estendido para provar que o replay sem bootstrap falha em `0354`, enquanto o replay com bootstrap atravessa `0354` localmente, sem D1 remoto e sem dados reais. `ensureSigvoosTables()` segue preservado. Status consolidado naquela fase: **`R01 = BOOTSTRAP_IMPLEMENTED_RUNTIME_FALLBACK_PENDING_REMOVAL_GATE`**.
>
> **Addendum Sprint R01 Staging/New Environment Gate + Fallback Removal Readiness (2026-06-04):** o bootstrap foi reaudidado, o teste local passou a incluir um gate explícito por etapas em banco limpo temporário e o inventário do fallback runtime foi fechado em 10 call sites. O gate local-isolado passou, sem D1 remoto e sem dados reais. Novo status consolidado: **`R01 = READY_FOR_RUNTIME_FALLBACK_REMOVAL`**.

---

## 2. Estado atual

| Métrica | Valor |
|---|---|
| Função | `ensureSigvoosTables()` |
| Arquivo | `worker-airtrust/src/services/sigvoos-frms.ts:690-794` |
| Tabelas criadas em runtime | 5 (`integracoes_sigvoos_config`, `integracoes_sigvoos_eventos`, `integracoes_sigvoos_mapeamentos`, `sigvoos_mapeamento_manual`, `frms_jornada_pendente`) |
| Índices criados em runtime | 8 |
| Call sites (total) | 10 |
| Call sites em rotas | 2 (`worker-airtrust/src/routes/integracoes_sigvoos.ts:374,600`) |
| Call sites em serviços | 8 (`worker-airtrust/src/services/sigvoos-frms.ts:625,802,852,914,948,1045,2238,2500`) |
| Status na matriz | READY_FOR_RUNTIME_FALLBACK_REMOVAL |
| Status nesta sprint | READY_FOR_RUNTIME_FALLBACK_REMOVAL |

---

## 3. Arquivo runtime afetado

**Arquivo principal:** `worker-airtrust/src/services/sigvoos-frms.ts`

**Função:** `ensureSigvoosTables(db: D1Database): Promise<void>` (linhas 690-794)

**Mecanismo:** `db.batch()` com 13 statements (5 CREATE TABLE + 8 CREATE INDEX, todos com `IF NOT EXISTS`).

**Quando roda:** A cada request que toca qualquer endpoint SIGVOOS ou FRMS que dependa de configuração, eventos, mapeamentos ou jornadas pendentes. São 10 call sites — executado antes de toda operação de leitura/escrita nessas tabelas.

---

## 4. Tabelas e índices criados em runtime

### 4.1 Tabela: `integracoes_sigvoos_config`

| Coluna | Tipo | Constraints |
|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `empresa_id` | INTEGER | — |
| `chave` | TEXT | NOT NULL |
| `valor` | TEXT | — |
| `created_at` | TEXT | NOT NULL DEFAULT (datetime('now')) |
| `updated_at` | TEXT | NOT NULL DEFAULT (datetime('now')) |
| `deleted_at` | TEXT | — |

**Índices:**
| Índice | Tipo | Colunas | Origem |
|---|---|---|---|
| `idx_integracoes_sigvoos_config_empresa_chave` | UNIQUE | `(empresa_id, chave)` | Runtime apenas |

### 4.2 Tabela: `integracoes_sigvoos_eventos`

| Coluna | Tipo | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `empresa_id` | INTEGER | — |
| `tipo_evento` | TEXT | NOT NULL |
| `status` | TEXT | NOT NULL |
| `payload_json` | TEXT | — |
| `resposta_json` | TEXT | — |
| `erro_ultima` | TEXT | — |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |
| `deleted_at` | TEXT | — |

**Índices:**
| Índice | Tipo | Colunas | Origem |
|---|---|---|---|
| `idx_integracoes_sigvoos_eventos_empresa_created` | INDEX | `(empresa_id, created_at DESC)` | Runtime apenas |

### 4.3 Tabela: `integracoes_sigvoos_mapeamentos`

| Coluna | Tipo | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `empresa_id` | INTEGER | — |
| `nome_sigvoos` | TEXT | NOT NULL |
| `canac_sigvoos` | TEXT | — |
| `funcionario_id` | INTEGER | NOT NULL |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |
| `deleted_at` | TEXT | — |

**Índices:**
| Índice | Tipo | Colunas | Origem |
|---|---|---|---|
| `idx_integracoes_sigvoos_mapeamentos_empresa_nome` | INDEX | `(empresa_id, nome_sigvoos)` | Runtime apenas |
| `idx_integracoes_sigvoos_mapeamentos_empresa_canac` | INDEX | `(empresa_id, canac_sigvoos)` | Runtime apenas |

### 4.4 Tabela: `sigvoos_mapeamento_manual`

| Coluna | Tipo | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `empresa_id` | INTEGER | — |
| `nome_sigvoos` | TEXT | NOT NULL |
| `inscricao_sigvoos` | TEXT | — |
| `canac_sigvoos` | TEXT | — |
| `funcionario_id` | INTEGER | NOT NULL |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |
| `deleted_at` | TEXT | — |

**Índices em runtime (2):**
| Índice | Tipo | Colunas | Origem |
|---|---|---|---|
| `idx_sigvoos_mapeamento_manual_empresa_nome` | INDEX | `(empresa_id, nome_sigvoos)` | Runtime + 0352 |
| `idx_sigvoos_mapeamento_manual_empresa_inscricao` | INDEX | `(empresa_id, inscricao_sigvoos)` | Runtime + 0352 |

**Índices somente em migration (1):**
| Índice | Tipo | Colunas | Origem |
|---|---|---|---|
| `idx_sigvoos_mapeamento_manual_empresa_canac` | INDEX | `(empresa_id, canac_sigvoos)` | Apenas 0352 |

**Constraints somente em migration:** `FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)` — não presente no runtime.

### 4.5 Tabela: `frms_jornada_pendente`

| Coluna | Tipo | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `empresa_id` | INTEGER | — |
| `importacao_id` | TEXT | — |
| `nome_sigvoos` | TEXT | NOT NULL |
| `identificador_sigvoos` | TEXT | — |
| `canac_sigvoos` | TEXT | — |
| `competencia` | TEXT | NOT NULL |
| `jornadas` | INTEGER | NOT NULL DEFAULT 0 |
| `motivo` | TEXT | NOT NULL |
| `payload_json` | TEXT | — |
| `status` | TEXT | NOT NULL DEFAULT 'PENDENTE' |
| `resolved_funcionario_id` | INTEGER | — |
| `created_at` | TEXT | NOT NULL |
| `updated_at` | TEXT | NOT NULL |
| `deleted_at` | TEXT | — |

**Índices:**
| Índice | Tipo | Colunas | Origem |
|---|---|---|---|
| `idx_frms_jornada_pendente_empresa_status` | INDEX | `(empresa_id, status, updated_at DESC)` | Runtime + 0352 |
| `idx_frms_jornada_pendente_importacao` | INDEX | `(importacao_id)` | Runtime + 0352 |

**Constraints somente em migration:** `CHECK(status IN ('PENDENTE', 'RESOLVIDO'))` + `FOREIGN KEY (resolved_funcionario_id) REFERENCES funcionarios(id)` — não presentes no runtime.

### 4.6 Matriz consolidada

| Objeto | Tipo | Origem runtime | Existe migration? | Lacuna | Risco |
|---|---|---|---|---|---|
| `integracoes_sigvoos_config` | TABLE | Sim (R01) | NÃO — base ausente | Migration 0354 adiciona coluna `notificar_falha_email` mas assume que a tabela existe | ALTO — sem migration, ambiente novo quebra |
| `idx_integracoes_sigvoos_config_empresa_chave` | UNIQUE INDEX | Sim (R01) | NÃO | Índice único ausente em qualquer migration | ALTO — duplicatas de config sem o índice |
| `integracoes_sigvoos_eventos` | TABLE | Sim (R01) | NÃO | Tabela inteira sem migration | ALTO — sem migration, ambiente novo quebra |
| `idx_integracoes_sigvoos_eventos_empresa_created` | INDEX | Sim (R01) | NÃO | Índice ausente em qualquer migration | MÉDIO — performance degradation sem índice |
| `integracoes_sigvoos_mapeamentos` | TABLE | Sim (R01) | NÃO | Tabela inteira sem migration | ALTO — sem migration, ambiente novo quebra |
| `idx_integracoes_sigvoos_mapeamentos_empresa_nome` | INDEX | Sim (R01) | NÃO | Índice ausente em qualquer migration | MÉDIO |
| `idx_integracoes_sigvoos_mapeamentos_empresa_canac` | INDEX | Sim (R01) | NÃO | Índice ausente em qualquer migration | MÉDIO |
| `sigvoos_mapeamento_manual` | TABLE | Sim (R01) | 0352 (integral) | Migration 0352 é mais completa: tem FOREIGN KEY + índice `canac` extra | BAIXO — 0352 cobre, mas migration é mais rica |
| `idx_sigvoos_mapeamento_manual_empresa_nome` | INDEX | Sim (R01) | 0352 | Nenhuma | BAIXO |
| `idx_sigvoos_mapeamento_manual_empresa_inscricao` | INDEX | Sim (R01) | 0352 | Nenhuma | BAIXO |
| `idx_sigvoos_mapeamento_manual_empresa_canac` | INDEX | NÃO (só em 0352) | 0352 | Migration tem índice que runtime NÃO tem — sem risco, é ganho | BAIXO |
| `frms_jornada_pendente` | TABLE | Sim (R01) | 0352 (integral) | Migration 0352 tem CHECK constraint + FOREIGN KEY que runtime não tem | BAIXO — 0352 cobre |
| `idx_frms_jornada_pendente_empresa_status` | INDEX | Sim (R01) | 0352 | Nenhuma | BAIXO |
| `idx_frms_jornada_pendente_importacao` | INDEX | Sim (R01) | 0352 | Nenhuma | BAIXO |

---

## 5. Dependências funcionais

### 5.1 Rotas que dependem das tabelas

| Rota/Endpoint | Arquivo | Call site | Tabelas acessadas |
|---|---|---|---|
| `GET/POST /api/sigvoos/config` | `routes/integracoes_sigvoos.ts:374` | `ensureSigvoosTables(c.env.DB)` | `integracoes_sigvoos_config` |
| `GET/POST /api/sigvoos/import` | `routes/integracoes_sigvoos.ts:600` | `ensureSigvoosTables(c.env.DB)` | `integracoes_sigvoos_eventos`, `integracoes_sigvoos_mapeamentos` |
| `GET /api/sigvoos/mapeamentos` | `routes/integracoes_sigvoos.ts` (via services) | Indireto via service | `integracoes_sigvoos_mapeamentos`, `sigvoos_mapeamento_manual` |

### 5.2 Funções de serviço que dependem

| Função | Linha | Propósito |
|---|---|---|
| `getSigvoosConfig()` | 802 | Leitura de configuração SIGVOOS |
| `setSigvoosConfig()` | 852 | Escrita de configuração SIGVOOS |
| `importarDadosSigvoos()` | 914 | Importação de dados do SIGVOOS |
| `listarEventosSigvoos()` | 948 | Listagem de eventos de importação |
| `resolverPendenciasFrms()` | 1045 | Resolução de pendências FRMS via SIGVOOS |
| `processarImportacaoFira()` | 2238 | Processamento de importação FIRA |
| `reconciliarJornadas()` | 2500 | Reconciliação de jornadas FRMS × SIGVOOS |

**Call site adicional em rota interna:**
| `syncFrmsComSigvoos()` (chamada de rota) | `sigvoos-frms.ts:625` | Sync manual FRMS → SIGVOOS |

### 5.3 Risco de remover antes de migration

**ALTO.** Se `ensureSigvoosTables()` for removida ou tiver seu escopo reduzido sem que as 3 tabelas base (`integracoes_sigvoos_config`, `integracoes_sigvoos_eventos`, `integracoes_sigvoos_mapeamentos`) tenham migration:

1. **Ambiente novo:** Worker sobe, primeiro request SIGVOOS quebra com `"no such table: integracoes_sigvoos_config"`.
2. **Ambiente existente:** Tabelas já existem (criadas por execuções anteriores de `ensureSigvoosTables`). Remoção da função é segura se e somente se a migration for aplicada ANTES em todos os ambientes (local, staging, produção).
3. **Migração 0354 é dependente:** `ALTER TABLE integracoes_sigvoos_config ADD COLUMN notificar_falha_email TEXT` em `0354` assume que a tabela existe. Se `0354` foi aplicada, a tabela já foi criada em runtime antes. Mas em ambiente novo, `0354` falharia se aplicada antes da migration base.

---

## 6. Migrations existentes relacionadas

### 6.1 Migration 0352 — `sigvoos_frms_pendencias_e_enriquecimento.sql`

**Cobertura:**
- ✅ `sigvoos_mapeamento_manual` — tabela completa (com FOREIGN KEY + CHECK implícito)
- ✅ `idx_sigvoos_mapeamento_manual_empresa_nome`
- ✅ `idx_sigvoos_mapeamento_manual_empresa_inscricao`
- ✅ `idx_sigvoos_mapeamento_manual_empresa_canac` ← **índice extra que runtime NÃO tem**
- ✅ `frms_jornada_pendente` — tabela completa (com CHECK constraint + FOREIGN KEY)
- ✅ `idx_frms_jornada_pendente_empresa_status`
- ✅ `idx_frms_jornada_pendente_importacao`
- ✅ `ALTER TABLE frms_jornada ADD COLUMN fonte_resolucao_sigvoos TEXT`
- ✅ `idx_frms_jornada_fonte_resolucao_sigvoos`

**Classificação:** Cobertura INTEGRAL para `sigvoos_mapeamento_manual` e `frms_jornada_pendente`. A migration é MAIS completa que o runtime (tem FOREIGN KEY, CHECK constraint, e 1 índice extra).

### 6.2 Migration 0354 — `auditoria_critica_schema_hardening.sql`

**Cobertura:**
- ⚠️ `ALTER TABLE integracoes_sigvoos_config ADD COLUMN notificar_falha_email TEXT` — adiciona coluna mas **NÃO cria a tabela base**

**Classificação:** Cobertura PARCIAL. A migration 0354 **depende** da existência prévia de `integracoes_sigvoos_config`, que só é criada em runtime. Isso cria uma dependência circular: 0354 precisa da tabela que o runtime cria, mas o runtime não deveria criar tabelas.

### 6.3 Migration 0217 — `frms_importacao_fira.sql`

**Cobertura:**
- Cria `frms_importacao_fira` (tabela diferente, relacionada a FIRA mas independente das tabelas SIGVOOS)

**Classificação:** NÃO relacionada diretamente. Tabela separada para importação FIRA.

### 6.4 Resumo de cobertura

| Tabela/Índice | 0352 | 0354 | 0217 | Status |
|---|---|---|---|---|
| `integracoes_sigvoos_config` | ❌ | ⚠️ (patch apenas) | ❌ | **SEM MIGRATION BASE** |
| `idx_integracoes_sigvoos_config_empresa_chave` | ❌ | ❌ | ❌ | **SEM MIGRATION** |
| `integracoes_sigvoos_eventos` | ❌ | ❌ | ❌ | **SEM MIGRATION** |
| `idx_integracoes_sigvoos_eventos_empresa_created` | ❌ | ❌ | ❌ | **SEM MIGRATION** |
| `integracoes_sigvoos_mapeamentos` | ❌ | ❌ | ❌ | **SEM MIGRATION** |
| `idx_integracoes_sigvoos_mapeamentos_empresa_nome` | ❌ | ❌ | ❌ | **SEM MIGRATION** |
| `idx_integracoes_sigvoos_mapeamentos_empresa_canac` | ❌ | ❌ | ❌ | **SEM MIGRATION** |
| `sigvoos_mapeamento_manual` | ✅ | ❌ | ❌ | Coberto |
| `idx_sigvoos_mapeamento_manual_empresa_nome` | ✅ | ❌ | ❌ | Coberto |
| `idx_sigvoos_mapeamento_manual_empresa_inscricao` | ✅ | ❌ | ❌ | Coberto |
| `idx_sigvoos_mapeamento_manual_empresa_canac` | ✅ (só migration) | ❌ | ❌ | Coberto |
| `frms_jornada_pendente` | ✅ | ❌ | ❌ | Coberto |
| `idx_frms_jornada_pendente_empresa_status` | ✅ | ❌ | ❌ | Coberto |
| `idx_frms_jornada_pendente_importacao` | ✅ | ❌ | ❌ | Coberto |

---

## 7. Lacunas confirmadas

### Lacuna 1 — Tabela `integracoes_sigvoos_config` sem migration base
- **Severidade:** ALTA
- **Impacto:** Ambiente novo sem SIGVOOS funcional. Migration 0354 falharia se aplicada isoladamente.
- **Solução:** Criar `CREATE TABLE IF NOT EXISTS integracoes_sigvoos_config (...)` em migration numerada.

### Lacuna 2 — Tabela `integracoes_sigvoos_eventos` sem migration
- **Severidade:** ALTA
- **Impacto:** Eventos de importação SIGVOOS não persistidos em ambiente novo.
- **Solução:** Criar `CREATE TABLE IF NOT EXISTS integracoes_sigvoos_eventos (...)` em migration numerada.

### Lacuna 3 — Tabela `integracoes_sigvoos_mapeamentos` sem migration
- **Severidade:** ALTA
- **Impacto:** Mapeamentos SIGVOOS × funcionários não persistidos em ambiente novo.
- **Solução:** Criar `CREATE TABLE IF NOT EXISTS integracoes_sigvoos_mapeamentos (...)` em migration numerada.

### Lacuna 4 — 4 índices sem migration
- **Severidade:** MÉDIA
- **Índices ausentes:** `idx_integracoes_sigvoos_config_empresa_chave` (UNIQUE), `idx_integracoes_sigvoos_eventos_empresa_created`, `idx_integracoes_sigvoos_mapeamentos_empresa_nome`, `idx_integracoes_sigvoos_mapeamentos_empresa_canac`
- **Impacto:** Performance degradation + possibilidade de duplicatas em config (sem unique index).
- **Solução:** Incluir todos os 4 índices na migration.

### Lacuna 5 — Dependência circular 0354 → runtime
- **Severidade:** MÉDIA
- **Descrição:** A migration 0354 referencia `integracoes_sigvoos_config` (adiciona coluna `notificar_falha_email`) mas a tabela base não tem migration. Se um ambiente novo aplicar migrations em ordem numérica, 0354 falha ao chegar em `ALTER TABLE integracoes_sigvoos_config`.
- **Solução:** A migration base para `integracoes_sigvoos_config` deve ter número **anterior** a 0354 OU a nova migration deve incluir a coluna `notificar_falha_email` diretamente no CREATE TABLE.

### Lacuna 6 — Divergência runtime vs migration (não-blocker)
- **Severidade:** BAIXA
- **Descrição:** `sigvoos_mapeamento_manual` e `frms_jornada_pendente` têm FOREIGN KEYs e CHECK constraints na migration 0352 que o runtime NÃO cria. Isso significa que:
  - Ambiente provisionado por migration: tem FK + CHECK (mais restrito)
  - Ambiente provisionado por runtime: sem FK + CHECK (mais permissivo)
- **Impacto:** Dados podem ser inseridos sem validação de integridade referencial em ambientes que só passaram pelo runtime. Não é bloqueante para remoção.
- **Recomendação:** Documentar, não agir nesta fase.

---

## 8. Estratégia recomendada para R01

### Fase atual (Z0): READINESS_MAPPED ✅

Inventário completo. Lacunas documentadas. Nenhuma ação de código.

### Addendum Sprint Z1 (2026-06-03): migration criada, fallback preservado

- Migration criada: `worker-airtrust/migrations/0387_integracoes_sigvoos_base_tables.sql`
- Teste local criado: `worker-airtrust/src/__tests__/migrations/sigvoos-base-tables-schema.test.ts`
- Cobertura local confirmada para as 3 tabelas base + 4 índices, e cobertura combinada com `0352` para as 5 tabelas/8 índices do runtime SIGVOOS.
- **Fallback `ensureSigvoosTables()` preservado.**

**Motivo da preservação do fallback:** a migration `0354_auditoria_critica_schema_hardening.sql` já existente faz `ALTER TABLE integracoes_sigvoos_config ADD COLUMN notificar_falha_email TEXT` antes do novo número `0387`. Em um ambiente limpo que aplique migrations em ordem numérica, `0354` continua dependendo da existência prévia de `integracoes_sigvoos_config`. Como esta sprint não podia reordenar nem reescrever `0354`, a criação da `0387` **não é suficiente para remover o fallback runtime com segurança**.

**Status resultante após Z1:** `R01 = MIGRATION_VERSIONED_PENDING_RUNTIME_REMOVAL`.

### Addendum Sprint Z1.1 (2026-06-03): cadeia bloqueada pela 0354

- O teste local foi expandido para simular uma cadeia limpa com pré-requisitos mínimos.
- Resultado confirmado: `0354_auditoria_critica_schema_hardening.sql` falha por ausência de `integracoes_sigvoos_config`.
- Concatenar `0387` depois da `0354` não corrige a falha, porque o erro acontece antes.
- Probe remoto SIGVOOS não foi executado nesta fase: `SKIPPED_NO_SIGVOOS_SCHEMA_PROBE`.

**Status resultante após Z1.1:** `R01 = MIGRATION_CHAIN_BLOCKED_BY_0354`.

**Status consolidado após o apply oficial em produção:** `R01 = 0387_APPLIED_IN_PRODUCTION_BUT_CHAIN_0354_STILL_NEEDS_RECONCILIATION`.

**Status consolidado após o bootstrap local e replay closure:** `R01 = BOOTSTRAP_IMPLEMENTED_RUNTIME_FALLBACK_PENDING_REMOVAL_GATE`.

**Status consolidado após o staging/new-environment gate local-isolado:** `R01 = READY_FOR_RUNTIME_FALLBACK_REMOVAL`.

### Próxima fase (Z1): Criar migration + teste local

**Migration proposta:** `0387_integracoes_sigvoos_base_tables.sql`

**Conteúdo:**

```sql
-- Migration 0387: SIGVOOS base tables (substitui ensureSigvoosTables runtime)
-- Tabelas: integracoes_sigvoos_config, integracoes_sigvoos_eventos, integracoes_sigvoos_mapeamentos
-- Índices: 4 índices associados

-- Tabela 1: Configuração SIGVOOS
CREATE TABLE IF NOT EXISTS integracoes_sigvoos_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER,
  chave TEXT NOT NULL,
  valor TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_integracoes_sigvoos_config_empresa_chave
  ON integracoes_sigvoos_config(empresa_id, chave);

-- Tabela 2: Eventos SIGVOOS
CREATE TABLE IF NOT EXISTS integracoes_sigvoos_eventos (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER,
  tipo_evento TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT,
  resposta_json TEXT,
  erro_ultima TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_integracoes_sigvoos_eventos_empresa_created
  ON integracoes_sigvoos_eventos(empresa_id, created_at DESC);

-- Tabela 3: Mapeamentos SIGVOOS
CREATE TABLE IF NOT EXISTS integracoes_sigvoos_mapeamentos (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER,
  nome_sigvoos TEXT NOT NULL,
  canac_sigvoos TEXT,
  funcionario_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_integracoes_sigvoos_mapeamentos_empresa_nome
  ON integracoes_sigvoos_mapeamentos(empresa_id, nome_sigvoos);

CREATE INDEX IF NOT EXISTS idx_integracoes_sigvoos_mapeamentos_empresa_canac
  ON integracoes_sigvoos_mapeamentos(empresa_id, canac_sigvoos);
```

**Nota corrigida após Z1:** a `0387` foi deliberadamente criada com o schema que o runtime realmente garante hoje, sem tentar corrigir por si só a dependência da `0354`. Como `0387` vem numericamente depois de `0354`, ela **não resolve** um bootstrap limpo baseado apenas em migrations ordenadas. A normalização dessa sequência ficou para a próxima fase controlada.

**Após aplicação da migration em todos os ambientes:**
1. Resolver explicitamente a dependência `0354 -> integracoes_sigvoos_config` em plano controlado
2. Aplicar `0387` no ambiente-alvo aprovado
3. Só então reduzir/remover `ensureSigvoosTables()` e limpar os 10 call sites

---

## 9. Ordem segura futura

| Passo | Ação | Ambiente | Risco | Pré-condição |
|---|---|---|---|---|
| 1 | Criar migration `0387` | Repositório | CONCLUÍDO | Schema runtime validado contra o código |
| 2 | Validar `0387` localmente + cobertura com `0352` | Local | CONCLUÍDO | Teste `sigvoos-base-tables-schema.test.ts` |
| 3 | Definir correção operacional para a dependência `0354 -> integracoes_sigvoos_config` | Repositório/Runbook | MÉDIO | Sem isso, fallback R01 não sai com segurança |
| 4 | Registrar o apply oficial da `0387` em produção via fila pendente (`APPLY_SCOPE_EXPANDED_BY_PENDING_QUEUE`) | D1 produção | CONCLUÍDO | `Cloudflare D1 migrations apply` executado |
| 5 | Definir correção operacional para a dependência `0354 -> integracoes_sigvoos_config` | Repositório/Runbook | ALTO | Sem isso, fallback R01 não sai com segurança |
| 6 | Validar estratégia de staging/ambiente limpo já reconciliada | D1 staging | MÉDIO | Plano de sequência aprovado |
| 7 | Reduzir/remover `ensureSigvoosTables()` | Código | MÉDIO | Cadeia reconciliada + migration aplicada em todos os ambientes |
| 8 | Deploy Worker/API | Cloudflare | MÉDIO | Código atualizado |
| 9 | Smoke pós-deploy | Produção | BAIXO | Deploy concluído |

---

## 10. Testes necessários

### 10.1 Testes de migration (fase Z1)

- [x] Aplicar `0387` em SQLite local limpo → verificar que tabelas são criadas
- [x] Reaplicar `0387` com tabelas runtime-shaped já existentes → verificar idempotência
- [x] Verificar que `0352` + `0387` juntos cobrem todas as 5 tabelas e 8 índices do runtime SIGVOOS
- [x] Demonstrar localmente que `0354` falha em cadeia limpa sem `integracoes_sigvoos_config`
- [x] Demonstrar que `0387` depois da `0354` não resgata a cadeia limpa
- [ ] Definir baseline/estratégia segura para ambientes novos antes de remover o fallback

### 10.2 Testes funcionais (fase Z1)

- [ ] CRUD de configuração SIGVOOS (`getSigvoosConfig` / `setSigvoosConfig`)
- [ ] Importação de dados SIGVOOS (`importarDadosSigvoos`)
- [ ] Listagem de eventos (`listarEventosSigvoos`)
- [ ] Resolução de pendências FRMS (`resolverPendenciasFrms`)
- [ ] Processamento FIRA (`processarImportacaoFira`)
- [ ] Reconciliação de jornadas (`reconciliarJornadas`)

### 10.3 Testes de arquitetura (fase Z1+)

- [ ] Atualizar `no-runtime-ddl-hot-paths.test.ts` para reduzir allowlist após remoção do runtime
- [ ] Verificar que nenhum outro `CREATE TABLE` para tabelas SIGVOOS existe fora de migrations

---

## 11. Rollback

### Rollback da migration (se aplicada em ambiente sem dados)

```sql
DROP TABLE IF EXISTS integracoes_sigvoos_config;
DROP TABLE IF EXISTS integracoes_sigvoos_eventos;
DROP TABLE IF EXISTS integracoes_sigvoos_mapeamentos;
```

### Rollback da migration (se aplicada em ambiente com dados)

**⚠️ DROP TABLE causa perda de dados.** Estratégia segura:
1. Manter as tabelas (não dropar)
2. Reverter o código para continuar usando `ensureSigvoosTables()` (fallback runtime)
3. O `IF NOT EXISTS` garante que as tabelas existentes não sejam afetadas

### Rollback da remoção de runtime

Reverter o commit que removeu/reduziu `ensureSigvoosTables()`. A função é idempotente e segura para reexecução.

---

## 12. Fora do escopo desta fase

- ✅ Criar migration `0387` — concluído na Sprint Z1
- ❌ Aplicar migration em qualquer ambiente
- ✅ Preservar `ensureSigvoosTables()` até a aplicação controlada + resolução da dependência com `0354`
- ❌ Remover call sites
- ❌ Deploy Worker/API
- ❌ Tocar banco real (local, staging ou produção)
- ❌ Alterar auth/RBAC/tenant
- ❌ Tocar R02, R04, R09 ou qualquer outro resíduo DDL
- ❌ Resolver divergência FOREIGN KEY / CHECK constraint entre runtime e 0352 (não-blocker)
- ❌ Remover `sigvoos_mapeamento_manual` e `frms_jornada_pendente` do runtime (já cobertos por 0352, mas a remoção é parte da fase Z1+)

---

**Addendum Sprint R01 Chain Reconciliation (2026-06-03):** formalização do achado de bloqueio de replay limpo. Confirmado que nenhuma migration anterior à `0354` cria `integracoes_sigvoos_config`. Testes locais 8/8 PASS (`sigvoos-base-tables-schema.test.ts`): prova que `0354` falha em cadeia limpa e que concatenar `0387` depois não resgata a execução. Decisão conservadora: **R01 = MIGRATION_APPLIED_CHAIN_RECONCILIATION_REQUIRED**. `ensureSigvoosTables()` preservado. Sem migration nova, sem D1 remoto, sem deploy, sem alteração de runtime. Documento de decisão criado: `docs/AIRTRUST_SIGVOOS_MIGRATION_CHAIN_RECONCILIATION_v0_5.md`.

**Addendum Sprint R01 Baseline Strategy (2026-06-03):** estratégia de resolução definida. Opção A (editar 0354) rejeitada. Opção B (0389 isolada) insuficiente para replay limpo. Decisão curto prazo: criar `scripts/bootstrap-new-environment.sql` com tabelas SIGVOOS base para novos ambientes executarem antes das migrations históricas. Decisão longo prazo: squash/rebaseline em sprint arquitetural. `ensureSigvoosTables()` preservado até bootstrap validado e condições da Seção 9 atendidas. Doc de estratégia: `docs/AIRTRUST_SIGVOOS_R01_BASELINE_STRATEGY_v0_5.md`.

**Addendum Sprint R01 Bootstrap + Replay Closure (2026-06-04):** bootstrap criado em `scripts/bootstrap-new-environment.sql`; documentação operacional criada em `docs/AIRTRUST_SIGVOOS_R01_NEW_ENVIRONMENT_BOOTSTRAP_AND_REPLAY_CLOSURE_v0_5.md`; teste local estendido para provar replay sem bootstrap (FAIL em `0354`) vs replay com bootstrap (PASS atravessando `0354`). Nenhuma migration histórica editada, nenhuma migration nova criada, nenhum D1 remoto executado, nenhum deploy feito. **R01 = BOOTSTRAP_IMPLEMENTED_RUNTIME_FALLBACK_PENDING_REMOVAL_GATE.**

**Addendum Sprint R01 Staging/New Environment Gate + Fallback Removal Readiness (2026-06-04):** gate local-isolado explícito adicionado ao teste de migrations com ordem `bootstrap -> 0352 -> 0354 -> 0387`; auditoria adicional do bootstrap confirmou escopo somente DDL, sem seeds, sem secrets e sem substituição de `0352`; inventário do fallback runtime fechado em 10 call sites. Nenhuma migration histórica editada, nenhuma migration nova criada, nenhum D1 remoto executado, nenhum deploy feito. **R01 = READY_FOR_RUNTIME_FALLBACK_REMOVAL.**

**Fim do readiness document.** Gerado em 2026-06-03 no Sprint Z0 e atualizado nos Sprints Z1, Z1.1, pós-apply oficial em produção, Sprint R01 Chain Reconciliation, Sprint R01 Baseline Strategy, Sprint R01 Bootstrap + Replay Closure e Sprint R01 Staging/New Environment Gate + Fallback Removal Readiness (2026-06-04). Status atual: **`R01 = READY_FOR_RUNTIME_FALLBACK_REMOVAL`**. `ensureSigvoosTables()` preservado nesta etapa. Próxima fase: Runtime Fallback Removal + Final Audit Closure.
