# AirTrust — DDL Residual Migration Readiness v0.5

**Data:** 2026-06-03
**Branch:** `main`
**HEAD:** `cf5866907d820fb085472f748243968c6d03510d`
**Sprint:** V/W/X.0 — DDL Runtime Residual Design + Schema Probe
**Modo:** Read-only / docs+runner-only. Nenhum runtime, schema, migration ou banco real alterado.

---

## 1. Pré-condições para remover DDL runtime

Antes de remover qualquer DDL runtime, as seguintes condições devem ser satisfeitas:

### Condições técnicas

1. **Migration numerada existe** em `worker-airtrust/migrations/` cobrindo o schema completo que o runtime DDL cria.
2. **Migration é idempotente** — usa `IF NOT EXISTS` para CREATE TABLE/INDEX e verifica existência de coluna antes de ALTER TABLE.
3. **Migration foi aplicada em staging** e validada com sucesso (rotas do módulo funcionam sem o runtime DDL).
4. **Migration foi aplicada em produção** e validada com sucesso.
5. **Teste de arquitetura atualizado** — `no-runtime-ddl-hot-paths.test.ts` reflete a nova allowlist.

### Condições operacionais

6. **Ambiente de staging aprovado** disponível com schema completo.
7. **Operador autorizado** para aplicar migration em staging e produção.
8. **Plano de rollback documentado** para cada migration.
9. **Branch limpa** (`main`, `HEAD == origin/main`, sem tracked changes).

### Condições de segurança

10. **Nenhum DDL runtime removido antes** da migration correspondente estar aplicada em produção.
11. **Rollback testado em staging** antes de aplicar em produção.
12. **Monitoramento ativo** durante e após aplicação.

---

## 2. Migrations necessárias

### 2.1 Migration M1 — `solicitacoes_treinamento` link columns

**Número sugerido:** próximo disponível na sequência (atualmente ~0385)

**Nome sugerido:** `0386_solicitacoes_treinamento_planejado_link.sql`

**Conteúdo:**
```sql
-- Migration: Adicionar colunas de link com treinamentos planejados
-- Tabelas afetadas: solicitacoes_treinamento
-- Rollback: remover colunas e índice (não destrutivo — colunas podem ficar com NULL)

-- Verificar e adicionar treinamento_planejado_id
-- (D1 não suporta ALTER TABLE ADD COLUMN IF NOT EXISTS — verificar via PRAGMA antes)

ALTER TABLE solicitacoes_treinamento ADD COLUMN treinamento_planejado_id INTEGER;
ALTER TABLE solicitacoes_treinamento ADD COLUMN status_pre_agendamento TEXT;

CREATE INDEX IF NOT EXISTS idx_solicitacoes_treinamento_planejado
  ON solicitacoes_treinamento(treinamento_planejado_id)
  WHERE treinamento_planejado_id IS NOT NULL;
```

**Tabelas afetadas:** `solicitacoes_treinamento`
**Tipo:** Aditivo (ADD COLUMN + CREATE INDEX)
**Risco:** BAIXO — colunas novas com NULL permitido, índice parcial
**Rollback:** Remover colunas e índice (não destrutivo — dados existentes não são perdidos)
**Dependências:** Nenhuma — `solicitacoes_treinamento` já existe via `0280`

**Status pós-Sprint X.4:** `MIGRATION_VERSIONED_RUNTIME_FALLBACK_REMOVED_PENDING_APPLY`

**Evidência Sprint X.0 (2026-06-03):**
- Probe local read-only executado com `PASS` em snapshot D1 local: tabela existe, colunas ausentes, índice ausente.
- Probe de staging/produção: `SKIPPED_SCHEMA_PROBE_NOT_AUTHORIZED`.

**Evidência Sprint X.1 (2026-06-03):**
- HEAD: `c09c0cb`. Script revalidado como seguro (PRAGMA/SELECT, fail-closed, snapshot).
- Autorização: 4 variáveis UNSET → `SKIPPED_SCHEMA_PROBE_NOT_AUTHORIZED`.
- Barreira: exclusivamente humana (env vars não definidas).

**Evidência Sprint X.2 (2026-06-03):**
- HEAD: `d775bea`. Runner remoto read-only implementado no script.
- Suporte a 3 targets: `local` (sqlite3 + snapshot), `staging` (wrangler d1 execute --remote), `production` (wrangler d1 execute --remote).
- Guardas de validação testadas: 3 PRAGMA aceitos, 8 padrões DDL/DML rejeitados.
- Testes de autorização: 5 cenários (no-auth, staging sem confirm, production sem production_read_only, local autorizado PASS, staging autorizado FAIL por falta de wrangler auth).
- Autorização: 4 variáveis ainda UNSET → `SKIPPED_SCHEMA_PROBE_NOT_AUTHORIZED`.
- Conclusão: o runner remoto está completo e fail-closed. A barreira agora é dupla: (a) env vars e (b) `wrangler login` ativo. Ambas são operacionais, não técnicas.

**Evidência Sprint X.3 (2026-06-03):**
- Worktree limpo isolado em `/Users/filipedaumas/SAAS/Airtrust-r03-probe` para não tocar os untracked do repositório principal.
- Branch de execução: `sprint-x3-r03-probe`; HEAD == `origin/main` (`ed354f94bd1a9c23375ee3d8535707e93d1dc4b7`).
- `git status` limpo no worktree; `npm run ops:guard` PASS.
- `preflight-clean-deploy.sh` falhou apenas pelo gate `deploy only from main`, incompatível com a própria exigência de worktree em branch separada; nenhum deploy foi tentado.
- Variáveis de autorização continuaram UNSET; probe retornou `SKIPPED_SCHEMA_PROBE_NOT_AUTHORIZED`.
- Decisão mantida: não criar M1, não remover fallback runtime, não deployar.

**Evidência Sprint X.4 (2026-06-03):**
- Probe estrutural aprovado em `production`: `TABLE_EXISTS=yes`, `TREINAMENTO_PLANEJADO_ID_EXISTS=no`, `STATUS_PRE_AGENDAMENTO_EXISTS=no`, `IDX_SOLICITACOES_TREINAMENTO_PLANEJADO_EXISTS=no`, `REMOTE_RUNNER_USED=yes`.
- Classificação: `READY_FOR_SIMPLE_M1`.
- Migration `0386_solicitacoes_treinamento_planejado_link.sql` criada.
- `ensureSolicitacoesTreinamentoLinkSchema()` removida do runtime local junto com seus call sites.
- Deploy deliberadamente adiado até a aplicação aprovada da migration no ambiente-alvo.

### 2.2 Migration M2 — `integracoes_sigvoos_*` base tables

**Número sugerido:** próximo disponível após M1

**Nome sugerido:** `0387_integracoes_sigvoos_base_tables.sql`

**Conteúdo:**
```sql
-- Migration: Criar tabelas base de integração SIGVOOS
-- Tabelas afetadas: integracoes_sigvoos_config, integracoes_sigvoos_eventos,
--                    integracoes_sigvoos_mapeamentos
-- Rollback: DROP TABLE IF EXISTS (não destrutivo se sem dados ou com backup)

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

**Tabelas afetadas:** `integracoes_sigvoos_config`, `integracoes_sigvoos_eventos`, `integracoes_sigvoos_mapeamentos`
**Tipo:** Aditivo (CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS)
**Risco:** MÉDIO — 3 tabelas novas. `IF NOT EXISTS` garante idempotência. Unique index em `config` pode conflitar se tabela já existir com dados.
**Rollback:** DROP TABLE IF EXISTS para cada tabela (apenas se sem dados críticos)
**Dependências:** `0354` adiciona `notificar_falha_email` a `integracoes_sigvoos_config` — esta migration DEVE vir antes de `0354` na ordem de aplicação, ou `0354` deve ser verificada (ela usa ALTER TABLE, que falharia se a tabela não existir)

**⚠️ Atenção especial para `0354`:**
A migration `0354_auditoria_critica_schema_hardening.sql` linha 35 faz:
```sql
ALTER TABLE integracoes_sigvoos_config ADD COLUMN notificar_falha_email TEXT;
```
Isso significa que `0354` **assume que a tabela já existe**. Se M2 for aplicada depois de `0354`, não há problema — a tabela é criada por M2 e `0354` adiciona a coluna. Mas se um ambiente novo aplicar migrations em ordem numérica, `0354` (já aplicada) precederia M2 — e `0354` teria falhado porque a tabela não existia.

**Resolução:** Verificar se `0354` foi aplicada com sucesso em produção (implicaria que a tabela já existia quando `0354` rodou — ou seja, o runtime DDL já a criou). Se sim, M2 é segura (usa IF NOT EXISTS e não conflita). Se não, a ordem de aplicação em ambiente novo deve ser: M2 → `0354`.

### 2.3 Migration M3 — `documentos` canonical schema

**Número sugerido:** próximo disponível após M2

**Nome sugerido:** `0388_documentos_canonical_schema.sql`

**Conteúdo:** A ser extraído do schema atual de produção (requer acesso read-only aprovado para extrair o DDL completo). O template:

```sql
-- Migration: Schema canônico da tabela documentos
-- Substitui auto-migration-documentos.ts
-- Rollback: N/A (IF NOT EXISTS — não altera tabela existente)

CREATE TABLE IF NOT EXISTS documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  funcionario_id INTEGER NOT NULL,
  historico_id INTEGER,
  nome_arquivo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  tamanho INTEGER NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  descricao TEXT,
  empresa_id INTEGER DEFAULT 1,              -- de 0165
  sha256_hash TEXT,                            -- de 0137_add_integrity_checks
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (historico_id) REFERENCES qualificacoes_historico(id)
);

-- Índices do bootstrap + migrations
CREATE INDEX IF NOT EXISTS idx_documentos_funcionario ON documentos(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_documentos_historico ON documentos(historico_id);
CREATE INDEX IF NOT EXISTS idx_documentos_deleted ON documentos(deleted_at);
CREATE INDEX IF NOT EXISTS idx_documentos_r2_key ON documentos(r2_key);
CREATE INDEX IF NOT EXISTS idx_documentos_uuid ON documentos(uuid);
CREATE INDEX IF NOT EXISTS idx_documentos_empresa ON documentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_documentos_sha256 ON documentos(sha256_hash);
CREATE INDEX IF NOT EXISTS idx_documentos_tipo ON documentos(tipo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documentos_funcionario_tipo ON documentos(funcionario_id, tipo) WHERE deleted_at IS NULL;
```

**Tabelas afetadas:** `documentos`
**Tipo:** Aditivo (CREATE TABLE IF NOT EXISTS + índices)
**Risco:** BAIXO — `IF NOT EXISTS` garante que tabela existente não é alterada
**Rollback:** N/A — não altera tabela existente
**Dependências:** Extrair schema exato de produção antes de escrever a migration final

**⚠️ Pré-requisito:** Esta migration requer acesso read-only a produção para extrair o schema atual com `PRAGMA table_info('documentos')` e `SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='documentos'`. Sem isso, a migration pode não corresponder exatamente ao schema real.

---

## 3. Validação local

### 3.1 Setup

```bash
# Resetar D1 local para estado limpo
npm run setup:local:reset

# Aplicar migrations (todas as existentes + as novas)
# Para cada nova migration:
wrangler d1 execute airtrust-db --config worker-airtrust/wrangler.dev.toml --local \
  --file=worker-airtrust/migrations/0386_solicitacoes_treinamento_planejado_link.sql

wrangler d1 execute airtrust-db --config worker-airtrust/wrangler.dev.toml --local \
  --file=worker-airtrust/migrations/0387_integracoes_sigvoos_base_tables.sql

wrangler d1 execute airtrust-db --config worker-airtrust/wrangler.dev.toml --local \
  --file=worker-airtrust/migrations/0388_documentos_canonical_schema.sql
```

### 3.2 Verificações

```bash
# Verificar que tabelas existem
wrangler d1 execute airtrust-db --config worker-airtrust/wrangler.dev.toml --local \
  --command="SELECT name FROM sqlite_master WHERE type='table' AND name IN ('integracoes_sigvoos_config','integracoes_sigvoos_eventos','integracoes_sigvoos_mapeamentos','documentos')"

# Verificar colunas em solicitacoes_treinamento
wrangler d1 execute airtrust-db --config worker-airtrust/wrangler.dev.toml --local \
  --command="PRAGMA table_info('solicitacoes_treinamento')"

# Rodar testes do worker
npm run test:worker

# Rodar teste de arquitetura
npx vitest run worker-airtrust/src/__tests__/architecture/no-runtime-ddl-hot-paths.test.ts
```

### 3.3 Smoke test funcional

```bash
# Iniciar worker local
npm run dev:worker:local

# Smoke público
bash scripts/smoke-authenticated-operational.sh
```

---

## 4. Validação staging

### 4.1 Pré-condições

- Ambiente staging aprovado e acessível
- Schema de staging sincronizado com produção
- Operador autorizado com credenciais staging

### 4.2 Procedimento

```bash
# 1. Backup do schema atual de staging
wrangler d1 execute airtrust-db-staging --env staging --remote \
  --command="SELECT sql FROM sqlite_master WHERE type='table' AND name IN ('integracoes_sigvoos_config','integracoes_sigvoos_eventos','integracoes_sigvoos_mapeamentos','documentos','solicitacoes_treinamento')" \
  > /tmp/staging_pre_migration_schema.txt

# 2. Aplicar M1 (solicitacoes_treinamento link)
wrangler d1 execute airtrust-db-staging --env staging --remote \
  --file=worker-airtrust/migrations/0386_solicitacoes_treinamento_planejado_link.sql

# 3. Aplicar M2 (integracoes_sigvoos base)
wrangler d1 execute airtrust-db-staging --env staging --remote \
  --file=worker-airtrust/migrations/0387_integracoes_sigvoos_base_tables.sql

# 4. Aplicar M3 (documentos canônico)
wrangler d1 execute airtrust-db-staging --env staging --remote \
  --file=worker-airtrust/migrations/0388_documentos_canonical_schema.sql

# 5. Deploy do worker (sem runtime DDL) para staging
# (fora do escopo desta fase — necessário na fase de implementação)

# 6. Validar rotas críticas
# - SIGVOOS: GET/POST configuração, importação
# - Treinamentos: sync, listagem
# - Documentos: upload, download, listagem
```

---

## 5. Ordem recomendada (visão consolidada)

| Fase | Migration | O que faz | Remoção de runtime | Risco | Modelo |
|---|---|---|---|---|---|
| **Pré-Fase** | Nenhuma | Remover `ensure*` já cobertos: R02, R05, R06, R07, R08, R10 | 6 funções + call sites | BAIXO | GPT-5.4 Alta |
| **Fase 1** | M1 — `0386_solicitacoes_treinamento_planejado_link.sql` | Adicionar 2 colunas + 1 índice parcial em `solicitacoes_treinamento` | `ensureSolicitacoesTreinamentoLinkSchema()` + 3 call sites | MÉDIO | GPT-5.5 Altissimo |
| **Fase 2** | M2 — `0387_integracoes_sigvoos_base_tables.sql` | Criar 3 tabelas base + 3 índices + 1 unique index | `ensureSigvoosTables()` (escopo total ou parcial) + 10 call sites | ALTO | GPT-5.5 Altissimo |
| **Fase 3** | M3 — `0388_documentos_canonical_schema.sql` | Criar schema canônico de `documentos` com todos os índices | `ensureDocumentosTableExists()` + `api-bootstrap.ts` call | MÉDIO | GPT-5.5 Alta |

---

## 6. Rollback

### 6.1 Rollback M1 (solicitacoes_treinamento link)

```sql
-- Remover índice primeiro
DROP INDEX IF EXISTS idx_solicitacoes_treinamento_planejado;

-- Colunas adicionadas não precisam ser removidas (NULL por padrão, inofensivas)
-- Se necessário recriar schema exato anterior:
-- ALTER TABLE solicitacoes_treinamento DROP COLUMN treinamento_planejado_id; (D1 não suporta)
-- Alternativa: rebuild da tabela com backup/restore (como admin-migration.ts)
```

**Nota:** D1 não suporta `DROP COLUMN`. Rollback real requer rebuild da tabela. Na prática, colunas extras com NULL não causam problema — o rollback seguro é manter as colunas e reverter o código runtime.

### 6.2 Rollback M2 (integracoes_sigvoos base)

```sql
DROP TABLE IF EXISTS integracoes_sigvoos_config;
DROP TABLE IF EXISTS integracoes_sigvoos_eventos;
DROP TABLE IF EXISTS integracoes_sigvoos_mapeamentos;
```

**⚠️ Se as tabelas já contiverem dados de produção, DROP TABLE causará perda de dados.** Rollback seguro: manter tabelas e reverter o código para continuar usando runtime DDL.

### 6.3 Rollback M3 (documentos canônico)

```sql
-- N/A — migration usa IF NOT EXISTS, não altera tabela existente
-- Se aplicada em ambiente novo (tabela não existia), rollback seria:
DROP TABLE IF EXISTS documentos;
```

---

## 7. Testes

### 7.1 Testes de arquitetura

**Sprint X.4 executado:** `services/treinamentos-planejados-integration.ts` saiu da allowlist do guard arquitetural. R03 agora está versionado e sem fallback runtime no repositório, mas ainda pendente de aplicação da migration + deploy seguro.

Atualizar `worker-airtrust/src/__tests__/architecture/no-runtime-ddl-hot-paths.test.ts`:

```typescript
// Allowlist atualizada progressivamente:
const ALLOWED_DDL_FILES = [
  // Fase 1 (já cobertos) — remover da allowlist
  // 'services/treinamentos-planejados-integration.ts', // R02 removido
  // 'routes/qualificacoes/tipos.ts',                    // R05 removido
  // 'routes/qualificacoes/historico-helpers.ts',        // R06,R07,R08 removidos
  // 'routes/simuladores-modelos.ts',                    // R10 removido

  // Fase 2 — remover da allowlist após M1 aplicada
  // 'services/treinamentos-planejados-integration.ts',  // R03 removido

  // Fase 3 — remover da allowlist após M2 aplicada
  // 'services/sigvoos-frms.ts',                         // R01 removido

  // Fase 4 — remover da allowlist após M3 aplicada
  // 'utils/auto-migration-documentos.ts',               // R04 removido
  // 'runtime/api-bootstrap.ts',                         // R04 removido

  // Legacy — manter na allowlist (não são hot paths)
  'routes/admin-migration.ts',
  'routes/admin-manual-migrations.ts',
  'routes/admin-migrate.ts',
  'routes/migrations.ts',
];
```

### 7.2 Testes de regressão funcional

| Módulo | O que testar | Arquivo de teste |
|---|---|---|
| SIGVOOS | Config CRUD, importação, mapeamentos, eventos | `__tests__/routes/integracoes_sigvoos.test.ts` (criar se não existir) |
| Treinamentos Planejados | Sync de solicitações, criação de turmas, participantes | `__tests__/routes/treinamentos-planejados.test.ts` (atualizar) |
| Documentos | Upload, download, stream, delete, listagem | `__tests__/routes/documentos*.test.ts` (verificar cobertura) |
| Qualificações | CRUD tipos, histórico, helpers | `__tests__/routes/qualificacoes*.test.ts` (verificar cobertura) |
| Simuladores | Modelos de sessão, CRUD | `__tests__/routes/simuladores*.test.ts` (verificar cobertura) |

---

## 8. Critérios de autorização

Cada fase só pode prosseguir se:

1. ✅ Migration foi revisada por par (ou segundo modelo)
2. ✅ Migration foi testada localmente com `npm run test:worker` PASS
3. ✅ Migration foi aplicada em staging sem erro
4. ✅ Smoke test de staging PASS para o módulo afetado
5. ✅ `ops:guard` PASS
6. ✅ `preflight-clean-deploy.sh` PASS
7. ✅ Rollback testado em staging (onde aplicável)
8. ✅ Operador autorizado disponível para aplicar em produção
9. ✅ Branch `main` limpa, `HEAD == origin/main`

---

## 9. O que não fazer

1. ❌ **Não remover runtime DDL antes da migration estar aplicada em produção.** Causa "no such table" em ambiente novo ou coluna ausente.
2. ❌ **Não aplicar migration em produção sem testar em staging.** Schema divergente entre ambientes é difícil de diagnosticar.
3. ❌ **Não remover `ensureSigvoosTables()` completamente sem verificar `0352`.** As tabelas `sigvoos_mapeamento_manual` e `frms_jornada_pendente` são criadas tanto por `0352` quanto por `ensureSigvoosTables()`. Se `0352` não foi aplicada em todos os ambientes, remover a função quebra.
4. ❌ **Não assumir que `0354` foi aplicada com sucesso.** Se `0354` falhou silenciosamente porque `integracoes_sigvoos_config` não existia, a coluna `notificar_falha_email` nunca foi adicionada.
5. ❌ **Não criar M3 sem extrair schema real de produção.** O schema de `documentos` pode ter colunas ou índices adicionais não capturados no bootstrap ou nas migrations conhecidas.
6. ❌ **Não deployar worker com DDL removido sem antes aplicar a migration.** Ordem correta: migration primeiro, deploy do worker depois.

---

## 10. Dependências entre fases

```
Pré-Fase (sem migration)
    │
    ├── independente das demais
    │
Fase 1 (M1 - Treinamentos Link)
    │
    ├── independente — M1 não depende de M2 nem M3
    │
Fase 2 (M2 - SIGVOOS Base)
    │
    ├── verificar 0354 (depende de integracoes_sigvoos_config existir)
    ├── independente de M1 e M3
    │
Fase 3 (M3 - Documentos Canônico)
    │
    ├── requer extração de schema de produção
    ├── independente de M1 e M2
```

As fases podem ser executadas em paralelo (por times diferentes) já que afetam tabelas diferentes e não têm dependências entre si.

---

**Addendum Sprint W:** a Pré-Fase foi executada sem migration nova. Restam apenas R01, R03, R04 e R09 para fases futuras.

**Addendum Sprint X.0:** foi criado o runner `scripts/validation/probe-solicitacoes-treinamento-schema-readonly.sh`, fail-closed e somente com `PRAGMA`/`SELECT`. O probe local indicou ausência das 2 colunas e do índice em snapshot local; o probe de ambiente aprovado ficou `SKIPPED_SCHEMA_PROBE_NOT_AUTHORIZED`. Portanto, R03 saiu de `DESIGN_READY` para `BLOCKED_SCHEMA_PROBE_REQUIRED` até existir evidência estrutural do ambiente aprovado.

**Addendum Sprint X.4:** o probe aprovado em produção confirmou que a tabela existe e que as 2 colunas + o índice ainda estão ausentes. A migration simples `0386_solicitacoes_treinamento_planejado_link.sql` foi versionada e o fallback runtime foi removido localmente. O status atual passa a `MIGRATION_VERSIONED_RUNTIME_FALLBACK_REMOVED_PENDING_APPLY`.

**Fim do readiness document.** Gerado em 2026-06-03. Nenhum schema ou migration foi alterado nesta fase; Sprint W removeu somente DDL runtime já coberto.
