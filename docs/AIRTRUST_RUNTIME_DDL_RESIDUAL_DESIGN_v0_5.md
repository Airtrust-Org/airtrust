# AirTrust — Runtime DDL Residual Design v0.5

**Data:** 2026-06-03
**Branch:** `main`
**HEAD:** `d65fc9eab2e8abe608c5f4820a6a23319ad1bb2c`
**Sprint:** V/W/X.0–X.5/Z0 — DDL Runtime Residual Design + Pré-Fase + Schema Probe + Apply/Deploy + SIGVOOS Readiness
**Modo:** Sprint V read-only / docs-only. Sprint W removeu apenas DDL runtime já coberto por migrations existentes; Sprint X.0 executou somente probe estrutural read-only. Sprint X.5 executou apply de migrations 0385/0386 + deploy Worker/API. Sprint Z0 mapeou integralmente R01 (SIGVOOS) em modo read-only/docs-only. Nenhuma migration, schema ou banco real foi alterado manualmente.

> **Addendum Sprint W (2026-06-03):** R02, R05, R06, R07, R08 e R10 foram removidos do runtime. Permanecem R01, R03, R04 e R09, além de casos legacy/test-only.
>
> **Addendum Sprint X.0 (2026-06-03):** foi criado um probe read-only fail-closed para `solicitacoes_treinamento`. O snapshot local mostrou a tabela sem `treinamento_planejado_id`, sem `status_pre_agendamento` e sem `idx_solicitacoes_treinamento_planejado`. Como staging/produção não estavam autorizados para consulta estrutural, R03 passou a `BLOCKED_SCHEMA_PROBE_REQUIRED`.
>
> **Addendum Sprint X.1 (2026-06-03):** HEAD `c09c0cb`. Tentativa de execução com autorização: todas as 4 variáveis UNSET. Probe retornou `SKIPPED_SCHEMA_PROBE_NOT_AUTHORIZED`. R03 permanece `BLOCKED_SCHEMA_PROBE_REQUIRED`. Script validado como seguro (somente PRAGMA/SELECT, fail-closed, snapshot temporário). A barreira é exclusivamente de autorização do operador — o script está pronto para staging ou produção read-only assim que as env vars forem definidas.
>
> **Addendum Sprint X.2 (2026-06-03):** HEAD `d775bea`. Runner remoto read-only implementado com suporte a `staging` e `production` via `wrangler d1 execute --remote --json --command="PRAGMA ..."`. Validação de SQL reforçada com bloqueio de `SELECT *` e `FROM` em tabelas de usuário. 5 cenários de autorização testados: todos corretamente bloqueados ou encaminhados. Local: `PASS`. Staging autorizado: `FAIL` esperado (sem `wrangler login`). R03 permanece `BLOCKED_SCHEMA_PROBE_REQUIRED` — o runner está completo; a barreira é dupla (env vars + Cloudflare auth).
>
> **Addendum Sprint X.3 (2026-06-03):** HEAD `ed354f9`. Execução movida para worktree limpo (`/Users/filipedaumas/SAAS/Airtrust-r03-probe`) para preservar untracked fora do escopo no repositório principal. `ops:guard` PASS; `preflight-clean-deploy.sh` falhou apenas por exigir deploy em `main`, o que conflita com a estratégia obrigatória de worktree em branch dedicada. As 4 env vars de autorização permaneceram `UNSET`; o probe retornou `SKIPPED_SCHEMA_PROBE_NOT_AUTHORIZED`. Nenhum probe remoto foi executado, nenhum dado de linha foi consultado e R03 permanece `BLOCKED_SCHEMA_PROBE_REQUIRED`.
>
> **Addendum Sprint X.4 (2026-06-03):** o probe read-only aprovado em produção confirmou `TABLE_EXISTS=yes`, `TREINAMENTO_PLANEJADO_ID_EXISTS=no`, `STATUS_PRE_AGENDAMENTO_EXISTS=no` e `IDX_SOLICITACOES_TREINAMENTO_PLANEJADO_EXISTS=no`. Com isso, R03 foi reclassificado para `READY_FOR_SIMPLE_M1`, a migration `0386_solicitacoes_treinamento_planejado_link.sql` foi versionada e `ensureSolicitacoesTreinamentoLinkSchema()` saiu do runtime local. O novo estado é `MIGRATION_VERSIONED_RUNTIME_FALLBACK_REMOVED_PENDING_APPLY`: código pronto, aplicação remota + deploy ainda pendentes.
>
> **Addendum Sprint X.5 (2026-06-03):** as migrations `0385_audit_events_v2.sql` e `0386_solicitacoes_treinamento_planejado_link.sql` foram aplicadas em produção via Cloudflare D1 migrations apply. O probe pós-migration confirmou `STATUS=PASS` com as colunas e índice presentes em produção. O Worker/API foi deployado (`APP_VERSION=2026-06-03T17:00:27Z-c12d8bf`). Smoke pós-deploy: PASS (3/3). **R03 = RESOLVED.** O Audit v2 schema está `APPLIED_SCHEMA_READY_FOR_FLAG_PLAN`. Permanecem no runtime apenas R01 (SIGVOOS), R04 (Documentos bootstrap) e R09 (shared.ts dinâmico).

**Addendum Sprint Z0 (2026-06-03):** fase read-only/docs-only de mapeamento do R01 (SIGVOOS). `ensureSigvoosTables()` foi integralmente inventariada: 5 tabelas, 8 índices, 10 call sites. Lacunas confirmadas: 3 tabelas base (`integracoes_sigvoos_config`, `integracoes_sigvoos_eventos`, `integracoes_sigvoos_mapeamentos`) + 4 índices sem migration. Migração `0352` cobre integralmente `sigvoos_mapeamento_manual` e `frms_jornada_pendente` (com FK + CHECK extras). Migração `0354` referencia `integracoes_sigvoos_config` mas não cria a tabela base — dependência circular documentada. **R01 = READINESS_MAPPED.** Próxima fase: Sprint Z1 — criar migration `0387`, teste local, plano de aplicação controlada. Documento detalhado: `AIRTRUST_SIGVOOS_DDL_R01_READINESS_v0_5.md`.

**Addendum Sprint Z1 (2026-06-03):** a migration `0387_integracoes_sigvoos_base_tables.sql` foi criada e validada localmente com teste de schema/idempotência. Ela versiona as 3 tabelas base e 4 índices ainda provisionados em runtime por `ensureSigvoosTables()`. **R01 não saiu do runtime nesta sprint.** Motivo: a `0354_auditoria_critica_schema_hardening.sql` já executa `ALTER TABLE integracoes_sigvoos_config` antes de `0387`, então a cadeia limpa de migrations ainda exige tratamento adicional.

**Addendum Sprint Z1.1 (2026-06-03):** a auditoria de cadeia confirmou localmente a falha em schema limpo: `0354` quebra por ausência de `integracoes_sigvoos_config` e a `0387` posterior não corrige a ordem. Novo status: **`MIGRATION_CHAIN_BLOCKED_BY_0354`**. Restam R01, R04 e R09 no runtime.

**Addendum Sprint R09 (2026-06-03):** **R09 = RESOLVED.** `shared.ts` era dead code (nunca importado); o DDL ativo nunca executou em runtime. O `ALTER TABLE qualificacoes_historico ADD COLUMN` foi removido e substituído por no-op documentado. Colunas: `renovada`=presente (0200+), `local`/`modalidade`=intencionalmente removidas por 0200. Active path (`historico-helpers.ts:131`) já é no-op. Schema test criado. Restam R01 e R04 no runtime.

**Addendum Sprint R04.1 (2026-06-03):** **R04 = READINESS_MAPPED.** Mapeamento completo do runtime DDL de Documentos executado (docs-only, sem migration). Bootstrap: `ensureDocumentosTableExists()` em `auto-migration-documentos.ts` → `runApiBootstrap()` em `api-bootstrap.ts` → wired via `onApiRequestBootstrap` em `index.ts:942`. Schema runtime: 1 tabela (`documentos` com 12 colunas) + 5 índices. Coluna `historico_id` é bootstrap-only (nenhuma migration a cria). Colunas `sha256_hash` e `empresa_id` são migration-only (bootstrap não as cria). Migration 0200 referencia colunas `tipo_documento`/`qualificacao_historico_id` que não existem em migrations — colunas fantasmas. `certificados_templates` sem CREATE migration. 9 lacunas confirmadas (L1-L9). Probe estrutural remoto OBRIGATÓRIO antes da 0388. Documento detalhado: `docs/AIRTRUST_DOCUMENTOS_DDL_R04_READINESS_v0_5.md`.

**Addendum Sprint R04.2 (2026-06-03):** o probe estrutural remoto read-only de Documentos foi executado manualmente em `production` usando apenas `PRAGMA table_info(...)` e `PRAGMA index_list(...)` para `documentos`, `pasta_virtual` e `certificados_templates`. Resultado: `documentos` existe com `empresa_id DEFAULT 1`, sem `historico_id` e sem `sha256_hash`; `idx_documentos_uuid` nominal não existe; `pasta_virtual.documento_id` não existe; `certificados_templates` existe em produção. Sem DML/DDL, sem rows read/write. **R04 = READY_FOR_0388_CANONICAL_WITH_PROBE_BASELINE.**

**Addendum Sprint R04.3 (2026-06-03):** o desenho documental da `0388` foi concluído sem migration nova, sem alteração de runtime e sem D1 remoto adicional. **R04 = 0388_DESIGN_READY.** A futura migration deve estabilizar apenas a tabela `documentos` sobre a baseline real de produção, incluindo os índices seguros `idx_documentos_empresa`, `idx_documentos_funcionario`, `idx_documentos_deleted`, `idx_documentos_tipo` e `idx_documentos_funcionario_tipo`. Permanecem fora do escopo da `0388` nesta fase: `historico_id`, `sha256_hash`, `pasta_virtual.documento_id`, `certificados_templates` e índices de `0200` dependentes de colunas fantasmas.

---

## 1. Objetivo

Fechar a pendência arquitetural de **DDL runtime residual** em modo inventário/plano. Esta fase:

1. Inventaria todos os `CREATE TABLE` / `ALTER TABLE` / `CREATE INDEX` / `DROP TABLE` / `CREATE TRIGGER` / `DROP INDEX` ainda presentes em runtime (`worker-airtrust/src/`);
2. Separa DDL legítimo de teste/local/legacy de DDL em hot path;
3. Confirma os resíduos conhecidos do Sprint E;
4. Mapeia quais migrations existentes já cobrem cada caso;
5. Identifica lacunas reais de migration;
6. Propõe ordem segura de remoção futura.

**Não implementa, não altera schema, não toca banco real.**

---

## 2. Método

1. `grep -RIn` por padrões DDL em `worker-airtrust/src/` (excluindo `__tests__/`).
2. Para cada ocorrência em arquivo não-teste: classificar por tipo (RUNTIME_HOT_PATH, RUNTIME_BOOTSTRAP, LEGACY_QUARANTINED, etc.).
3. Para cada ocorrência RUNTIME: verificar se há migration numerada correspondente em `worker-airtrust/migrations/`.
4. Para cada ocorrência com migration: verificar se a migration cobre schema completo ou apenas parcial.
5. Consolidar em inventário, classificar lacunas, propor ordem.

---

## 3. Inventário consolidado

### 3.1 Legenda de classificação

| Classificação | Significado |
|---|---|
| RUNTIME_HOT_PATH | DDL executado durante HTTP requests normais (handlers de rota) |
| RUNTIME_HOT_PATH_COVERED | Hot path mas com migration completa já existente |
| RUNTIME_BOOTSTRAP | DDL executado apenas no startup do worker (não por request) |
| LEGACY_QUARANTINED | Rotas admin-only de migração manual, fora de hot paths normais |
| TEST_ONLY | Apenas em arquivos de teste |
| DOC_REFERENCE | Documentação ou comentários |
| FALSE_POSITIVE | Regex ou string que matcha mas não executa DDL |

### 3.2 Matriz de inventário

| ID | Arquivo | Função | Tipo de DDL | Tabela/Índice | Classificação | Risco | Migration existente | Lacuna |
|---|---|---|---|---|---|---|---|---|
| R01 | `services/sigvoos-frms.ts` | `ensureSigvoosTables()` | CREATE TABLE (5) + CREATE INDEX (8) | `integracoes_sigvoos_config`, `integracoes_sigvoos_eventos`, `integracoes_sigvoos_mapeamentos`, `sigvoos_mapeamento_manual`, `frms_jornada_pendente` + 8 índices | RUNTIME_HOT_PATH | ALTO | `0352` cobre `sigvoos_mapeamento_manual` + `frms_jornada_pendente`. `0354` referencia `integracoes_sigvoos_config` (adiciona coluna `notificar_falha_email`) mas NÃO cria a tabela base. `0387` agora versiona as 3 tabelas base + 4 índices. | **Status: MIGRATION_CHAIN_BLOCKED_BY_0354 (Sprint Z1.1).** Fallback preservado até baseline/plano de cadeia segura. |
| R02 | `services/treinamentos-planejados-integration.ts` | `ensureTreinamentosPlanejadosSchema()` | CREATE TABLE (2) + CREATE INDEX (3) | `treinamentos_planejados`, `treinamentos_participantes` + 3 índices | RUNTIME_HOT_PATH_COVERED | BAIXO | `0172_create_treinamentos_planejados.sql` — cobertura completa | Nenhuma — migration cobre schema integralmente |
| R03 | `services/treinamentos-planejados-integration.ts` | ~~`ensureSolicitacoesTreinamentoLinkSchema()`~~ | ALTER TABLE (2) + CREATE INDEX (1) | `solicitacoes_treinamento.treinamento_planejado_id`, `solicitacoes_treinamento.status_pre_agendamento`, `idx_solicitacoes_treinamento_planejado` | RESOLVED | NENHUM | `0280` cria `solicitacoes_treinamento` base. `0345` adiciona `lms_matricula_id`. `0386` versiona as 2 colunas + o índice parcial, aplicada em produção. Fallback runtime removido. Worker/API deployado. | **RESOLVED. Migration 0386 aplicada + Worker deployado. Nenhum DDL runtime neste caminho.** |
| R04 | `utils/auto-migration-documentos.ts` + `runtime/api-bootstrap.ts` | `ensureDocumentosTableExists()` | CREATE TABLE (1) + CREATE INDEX (5) | `documentos` + 5 índices (`idx_documentos_funcionario`, `idx_documentos_historico`, `idx_documentos_deleted`, `idx_documentos_r2_key`, `idx_documentos_uuid`) | RUNTIME_BOOTSTRAP → 0388_DESIGN_READY (Sprint R04.3) | MÉDIO | `0136` reconstrói `documentos` com schema antigo. `0137`/`0138` adicionam índices parciais. `0165` adiciona `empresa_id`. O probe remoto confirmou produção parcial/legada: sem `historico_id`, sem `sha256_hash`, com `empresa_id DEFAULT 1`, sem `documento_id` em `pasta_virtual`. A Sprint R04.3 fechou o desenho conservador da `0388`. | **0388_DESIGN_READY. Sprint R04.3 (2026-06-03):** baseline remoto já capturado e desenho documental fechado; próxima ação = versionar/testar `0388` conservadora sobre baseline real. Ver `docs/AIRTRUST_DOCUMENTOS_0388_CANONICAL_SCHEMA_DESIGN_v0_5.md`. |
| R05 | `routes/qualificacoes/tipos.ts` | `ensureTiposSchema()` | ALTER TABLE (2) | `qualificacoes_tipos.carga_horaria_inicial`, `qualificacoes_tipos.carga_horaria_recorrente` | RUNTIME_HOT_PATH_COVERED | BAIXO | `0317_split_carga_horaria_and_tipo_treinamento.sql` | Nenhuma |
| R06 | `routes/qualificacoes/historico-helpers.ts` | `ensureHistoricoSchema()` | ALTER TABLE (5 colunas) | `qualificacoes_historico.renovada`, `status`, `data_confirmacao`, `confirmada_por`, `tipo_treinamento` | RUNTIME_HOT_PATH_COVERED | BAIXO | `0173_add_status_to_qualificacoes.sql` cobre `status`. Demais colunas: cobertura parcial por migrations antigas (0095, etc.) | Migrations existem mas cobertura precisa de verificação caso a caso |
| R07 | `routes/qualificacoes/historico-helpers.ts` | `ensureQualificacoesTiposTrainingSchema()` | ALTER TABLE (2) | `qualificacoes_tipos.carga_horaria_inicial`, `carga_horaria_recorrente` | RUNTIME_HOT_PATH_COVERED | BAIXO | `0317_split_carga_horaria_and_tipo_treinamento.sql` | Nenhuma |
| R08 | `routes/qualificacoes/historico-helpers.ts` | inline in `ensureHistoricoSchema()` | ALTER TABLE (1) + CREATE INDEX (1) | `modelos_aeronave.modelo`, `idx_modelos_aeronave_modelo` | RUNTIME_HOT_PATH_COVERED | BAIXO | `0183_add_modelo_to_modelos_aeronave.sql` | Nenhuma |
| R09 | `routes/qualificacoes/shared.ts` | ~~dynamic ALTER TABLE~~ → no-op | ~~ALTER TABLE removido~~ | `qualificacoes_historico` (colunas: `renovada`=0200+, `local`/`modalidade`=removidas por 0200) | RUNTIME_HOT_PATH_COVERED → RESOLVED (Sprint R09) | BAIXO | `0107`, `0113`, `0200` (remove local/modalidade), `0325` | Nenhuma — DDL removido, active path em historico-helpers.ts já é no-op |
| R10 | `routes/simuladores-modelos.ts` | `ensureModelosSessaoModeloAeronaveColumn()` | ALTER TABLE (1) + CREATE INDEX (1) | `modelos_sessao.modelo_aeronave`, `idx_modelos_sessao_modelo_aeronave` | RUNTIME_HOT_PATH_COVERED | BAIXO | `0184_add_modelo_aeronave_to_modelos_sessao.sql` | Nenhuma |
| R11 | `routes/admin-migration.ts` | handlers admin-only | CREATE TABLE, DROP TABLE, ALTER TABLE, CREATE INDEX | `pasta_virtual`, `avaliacoes_manobras` (rebuild completo) | LEGACY_QUARANTINED | BAIXO | N/A — rota admin manual | Admin-gated, não é hot path normal |
| R12 | `routes/admin-manual-migrations.ts` | handlers admin-only | CREATE TABLE, DROP TABLE, ALTER TABLE, CREATE INDEX | Múltiplas tabelas (13+ rebuilds) | LEGACY_QUARANTINED | BAIXO | N/A — rota admin manual | Admin-gated, não é hot path normal |
| R13 | `routes/admin-migrate.ts` | handler admin-only | ALTER TABLE + CREATE INDEX | `funcionarios.modelo_aeronave_id` + índice | LEGACY_QUARANTINED | BAIXO | Não verificada — rota admin manual | Admin-gated |
| R14 | `routes/migrations.ts` | handler admin-only | CREATE TABLE, DROP TABLE, ALTER TABLE, CREATE INDEX | `qualificacoes_tipos` (migration com backup/rebuild) | LEGACY_QUARANTINED | BAIXO | N/A — é a própria rota de migração | Admin-gated |
| R15 | `__tests__/migrations/audit-events-v2-schema.test.ts` | teste | CREATE TABLE (em teste) | `audit_logs` | TEST_ONLY | NENHUM | N/A | — |
| R16 | `__tests__/audit/audit-events-v2-activation-readiness.test.ts` | teste | assertion de string | `audit_events_v2` | TEST_ONLY | NENHUM | N/A | — |
| R17 | `__tests__/architecture/no-runtime-ddl-hot-paths.test.ts` | teste | regex patterns | N/A | FALSE_POSITIVE | NENHUM | N/A | Padrões de detecção, não execução |
| R18 | `__tests__/routes/treinamentos-planejados.test.ts` | teste | verificação de prefixo DDL | N/A | FALSE_POSITIVE | NENHUM | N/A | — |
| R19 | `__tests__/routes/fail-open-hardening.test.ts` | teste | assertion de DDL | N/A | FALSE_POSITIVE | NENHUM | N/A | — |
| R20 | `__tests__/services/treinamentos-planejados-integration.test.ts` | teste | verificação de prefixo DDL | N/A | FALSE_POSITIVE | NENHUM | N/A | — |

---

## 4. Resíduos confirmados

### 4.1 Resíduos que exigem migration nova (bloqueiam remoção)

| # | Arquivo | O que faz | Tabelas/Colunas afetadas | Call sites | Migration necessária |
|---|---|---|---|---|---|
| **R01** | `services/sigvoos-frms.ts:690-794` | `ensureSigvoosTables()` — CREATE TABLE IF NOT EXISTS (5 tabelas) + CREATE INDEX (8 índices) a cada request SIGVOOS/FRMS | `integracoes_sigvoos_config`, `integracoes_sigvoos_eventos`, `integracoes_sigvoos_mapeamentos` (3 tabelas base) + 4 índices | 10 call sites: `routes/integracoes_sigvoos.ts` (2×), `services/sigvoos-frms.ts` (8×) | `0387_integracoes_sigvoos_base_tables.sql` criada no Sprint Z1. **Status: MIGRATION_CHAIN_BLOCKED_BY_0354.** Fallback mantido; cadeia limpa falha antes da `0387`. |
| R03 | `services/treinamentos-planejados-integration.ts:201-227` | ~~`ensureSolicitacoesTreinamentoLinkSchema()`~~ — ALTER TABLE (2 colunas) + CREATE INDEX (1 parcial) a cada sync de treinamento | `solicitacoes_treinamento.treinamento_planejado_id`, `solicitacoes_treinamento.status_pre_agendamento`, `idx_solicitacoes_treinamento_planejado` | 3 call sites (linhas 736, 820, 942) | ✅ RESOLVIDO. Migration `0386` aplicada em produção + Worker/API deployado. |
| **R04** | `utils/auto-migration-documentos.ts` + `runtime/api-bootstrap.ts` | `ensureDocumentosTableExists()` — CREATE TABLE + 5 índices no startup | `documentos` (tabela completa + 5 índices) | 1 call site: `runApiBootstrap()` no startup do worker | Consolidar schema completo de `documentos` em migration canônica única |

### 4.2 Resíduos já cobertos por migration (removíveis com segurança)

| # | Arquivo | Cobertura |
|---|---|---|
| R02 | `services/treinamentos-planejados-integration.ts` — `ensureTreinamentosPlanejadosSchema()` | `0172_create_treinamentos_planejados.sql` — cobertura completa |
| R05 | `routes/qualificacoes/tipos.ts` — `ensureTiposSchema()` | `0317_split_carga_horaria_and_tipo_treinamento.sql` |
| R06 | `routes/qualificacoes/historico-helpers.ts` — `ensureHistoricoSchema()` | `0173_add_status_to_qualificacoes.sql` + migrations antigas |
| R07 | `routes/qualificacoes/historico-helpers.ts` — `ensureQualificacoesTiposTrainingSchema()` | `0317_split_carga_horaria_and_tipo_treinamento.sql` |
| R08 | `routes/qualificacoes/historico-helpers.ts` — modelo_aeronave DDL | `0183_add_modelo_to_modelos_aeronave.sql` |
| R10 | `routes/simuladores-modelos.ts` — `ensureModelosSessaoModeloAeronaveColumn()` | `0184_add_modelo_aeronave_to_modelos_sessao.sql` |

---

## 5. Falsos positivos

| # | Arquivo | Motivo |
|---|---|---|
| R17 | `__tests__/architecture/no-runtime-ddl-hot-paths.test.ts` | Regex patterns para detectar DDL — não executa DDL |
| R18 | `__tests__/routes/treinamentos-planejados.test.ts` | Verificação de prefixo em strings de teste |
| R19 | `__tests__/routes/fail-open-hardening.test.ts` | Assertions sobre strings DDL em testes |
| R20 | `__tests__/services/treinamentos-planejados-integration.test.ts` | Verificação de prefixo DDL em testes |

---

## 6. Casos legacy/quarentena

Estes arquivos contêm DDL mas **não são hot paths normais** — são rotas admin-only protegidas por `requireRole('admin')`. Não são prioridade de remoção.

| # | Arquivo | Escopo | Risco |
|---|---|---|---|
| R11 | `routes/admin-migration.ts` | Rebuild de `pasta_virtual` e `avaliacoes_manobras` | Admin-gated, operação manual |
| R12 | `routes/admin-manual-migrations.ts` | Rebuild de 13+ tabelas com backup/restore | Admin-gated, operação manual |
| R13 | `routes/admin-migrate.ts` | ALTER TABLE em `funcionarios` | Admin-gated |
| R14 | `routes/migrations.ts` | Migração de `qualificacoes_tipos` | Admin-gated |

**Decisão:** Estas rotas são ferramentas administrativas legadas. Não são alvo desta fase. Devem ser tratadas em sprint futuro de limpeza de rotas admin legadas, com substituição por migrations numeradas ou remoção se obsoletas.

---

## 7. Lacunas de migration

### 7.1 Lacuna crítica — SIGVOOS (R01)

**O que falta:**
```sql
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

**Nota:** `sigvoos_mapeamento_manual` e `frms_jornada_pendente` (também em `ensureSigvoosTables`) **já têm** migration em `0352_sigvoos_frms_pendencias_e_enriquecimento.sql`. A migration `0354` referencia `integracoes_sigvoos_config` (adiciona `notificar_falha_email`) mas assume que a tabela já existe — ou seja, a migration `0354` depende da existência prévia da tabela que só é criada em runtime.

**Impacto se remover sem migration:** As 3 tabelas base nunca seriam criadas em ambiente novo. Rotas SIGVOOS e FRMS quebrariam com "no such table".

### 7.2 Lacuna média — Treinamentos Link (R03)

**O que falta:**
```sql
ALTER TABLE solicitacoes_treinamento ADD COLUMN treinamento_planejado_id INTEGER;
ALTER TABLE solicitacoes_treinamento ADD COLUMN status_pre_agendamento TEXT;

CREATE INDEX IF NOT EXISTS idx_solicitacoes_treinamento_planejado
  ON solicitacoes_treinamento(treinamento_planejado_id)
  WHERE treinamento_planejado_id IS NOT NULL AND deleted_at IS NULL;
```

**Nota:** `0280` cria `solicitacoes_treinamento` base. `0345` adiciona `lms_matricula_id`. Mas as colunas de link com treinamentos planejados (`treinamento_planejado_id`, `status_pre_agendamento`) nunca foram migradas.

**Evidência Sprint X.0:**
- Snapshot local (`PASS`): tabela existe; `treinamento_planejado_id` ausente; `status_pre_agendamento` ausente; `idx_solicitacoes_treinamento_planejado` ausente.
- Produção aprovada (`PASS`): tabela existe; `treinamento_planejado_id` ausente; `status_pre_agendamento` ausente; índice ausente.
- Decisão Sprint X.4: `READY_FOR_SIMPLE_M1`.

**Impacto se remover sem migration:** Sync de solicitações aprovadas → treinamentos planejados quebraria. Colunas não existiriam e o código tenta escrever nelas.

### 7.3 Lacuna média — Documentos (R04)

**O que falta:** Uma migration canônica que crie a tabela `documentos` com o schema atual completo (todas as colunas que o bootstrap cria + `empresa_id` de `0165` + índices de `0137`/`0138` + índices do bootstrap).

**Situação atual:**
- `0136` — reconstrói `documentos` com schema de 2025 (sem `empresa_id`, sem índices atuais)
- `0137` — adiciona índices parciais em `documentos`
- `0138` — adiciona mais índices e cria `documentos_downloads`
- `0165` — adiciona `empresa_id` a `documentos`
- Bootstrap (`auto-migration-documentos.ts`) — cria tabela completa + 5 índices

**Complexidade:** O schema de `documentos` evoluiu através de 4+ migrations. Consolidar em uma migration canônica única requer:
1. Extrair o schema final (colunas + índices) do estado atual
2. Criar migration com `CREATE TABLE IF NOT EXISTS`
3. Garantir que todos os índices do bootstrap + migrations estejam incluídos

**Impacto se remover sem migration:** Ambiente novo sem `documentos` quebraria no startup. Ambientes existentes não seriam afetados (tabela já existe).

---

## 8. Ordem segura de remoção

A ordem recomendada prioriza **menor risco primeiro** e **independência entre as mudanças**:

### Fase 1 — Remover DDL já coberto por migration (sem migration nova)

| # | Arquivo | O que remover | Pré-condição |
|---|---|---|---|
| 1 | `services/treinamentos-planejados-integration.ts` | Função `ensureTreinamentosPlanejadosSchema()` e suas 3 chamadas | Nenhuma — `0172` já cobre |
| 2 | `routes/qualificacoes/tipos.ts` | Bloco `ensureTiposSchema()` — ALTER TABLEs de `carga_horaria_*` | Nenhuma — `0317` já cobre |
| 3 | `routes/qualificacoes/historico-helpers.ts` | `ensureHistoricoSchema()` e `ensureQualificacoesTiposTrainingSchema()` | Nenhuma — migrations já cobrem |
| 4 | `routes/simuladores-modelos.ts` | `ensureModelosSessaoModeloAeronaveColumn()` | Nenhuma — `0184` já cobre |

**Resultado esperado:** 4 funções `ensure*` removidas. Zero migration nova. Risco: BAIXO.

### Fase 2 — Criar migration para Treinamentos Link, depois remover

| # | Ação | Pré-condição |
|---|---|---|
| 5 | Criar migration numerada com ALTER TABLE ADD COLUMN (`treinamento_planejado_id`, `status_pre_agendamento`) + CREATE INDEX parcial em `solicitacoes_treinamento` | Ambiente aprovado |
| 6 | Aplicar migration em staging, validar | Migration aplicada com sucesso |
| 7 | Aplicar migration em produção | Staging validado |
| 8 | Remover `ensureSolicitacoesTreinamentoLinkSchema()` e suas 3 chamadas | Concluído no repositório após versionar `0386`; deploy segue condicionado à aplicação da migration |

**Resultado esperado:** 1 função `ensure*` removida. 1 migration nova. Risco: MÉDIO.

### Fase 3 — Criar migration para SIGVOOS, depois remover

| # | Ação | Pré-condição |
|---|---|---|
| 9 | Criar migration numerada com CREATE TABLE IF NOT EXISTS para `integracoes_sigvoos_config`, `integracoes_sigvoos_eventos`, `integracoes_sigvoos_mapeamentos` + índices | Schema validado contra runtime |
| 10 | Aplicar migration em staging, validar rotas SIGVOOS/FRMS | Migration aplicada com sucesso |
| 11 | Aplicar migration em produção | Staging validado |
| 12 | Atualizar `ensureSigvoosTables()` para remover as 3 tabelas base e manter apenas `sigvoos_mapeamento_manual` e `frms_jornada_pendente` (já cobertos por `0352`) OU remover a função inteira se `0352` cobrir tudo | — |
| 13 | Remover chamadas a `ensureSigvoosTables()` dos 10 call sites | Função removida ou escopo reduzido |

**Resultado esperado:** 10 call sites limpos. 1 migration nova. Risco: ALTO (schema complexo, 10 call sites).

### Fase 4 — Consolidar Documentos, depois remover bootstrap

| # | Ação | Pré-condição |
|---|---|---|
| 14 | Extrair schema completo de `documentos` do estado atual (produção) | Acesso read-only aprovado |
| 15 | Criar migration canônica única com CREATE TABLE IF NOT EXISTS + todos os índices | Schema extraído |
| 16 | Aplicar migration em staging, validar upload/download de documentos | Migration aplicada com sucesso |
| 17 | Aplicar migration em produção | Staging validado |
| 18 | Remover `ensureDocumentosTableExists()` de `auto-migration-documentos.ts` | Migration aplicada em produção |
| 19 | Remover chamada do `api-bootstrap.ts` | Função removida |
| 20 | Opcional: remover arquivo `auto-migration-documentos.ts` se ficar órfão | Nenhuma referência restante |

**Resultado esperado:** Bootstrap limpo. 1 migration nova. Risco: MÉDIO (tabela crítica, mas `IF NOT EXISTS` é seguro).

---

## 9. Testes necessários

### Para cada fase de remoção:

1. **Teste de arquitetura** — Atualizar `no-runtime-ddl-hot-paths.test.ts` com a nova lista de arquivos permitidos (reduzir a allowlist progressivamente).
2. **Teste de regressão de funcionalidade** — Para cada módulo afetado:
   - SIGVOOS: CRUD de configuração, importação, mapeamentos
   - Treinamentos Planejados: sync de solicitações, criação de turmas
   - Documentos: upload, download, stream, delete
   - Qualificações: CRUD de tipos, histórico, colunas dinâmicas
   - Simuladores: CRUD de modelos de sessão
3. **Teste de ambiente limpo** — Verificar que worker sobe sem erro em ambiente com schema via migration apenas (sem DDL runtime).
4. **Teste de ambiente existente** — Verificar que `IF NOT EXISTS` não causa breaking change em ambiente que já tem as tabelas.

---

## 10. Fora do escopo desta fase

- Rotas admin legadas (`admin-migration.ts`, `admin-manual-migrations.ts`, `admin-migrate.ts`, `migrations.ts`) — são ferramentas administrativas, não hot paths.
- Colunas dinâmicas em `qualificacoes/shared.ts` — requerem análise caso a caso das colunas possíveis.
- Remoção de `ensureSigvoosTables()` para `sigvoos_mapeamento_manual` e `frms_jornada_pendente` — estas duas tabelas já têm migration (`0352`), mas a função `ensureSigvoosTables()` ainda as cria. A remoção pode ser feita junto com a Fase 3 se `0352` for considerado cobertura suficiente.
- Execução real de qualquer migration — esta fase é exclusivamente de design e planejamento.

---

## 11. Sumário

| Métrica | Valor |
|---|---|
| Total de ocorrências DDL inventariadas (worker runtime) | 20 (excluindo docs/scripts) |
| Resíduos RUNTIME_HOT_PATH confirmados | 2 críticos ativos no runtime atual (R01 SIGVOOS, R04 Documentos bootstrap). R03 = RESOLVIDO (migration 0386 aplicada + deploy). R09 = RESOLVIDO (Sprint R09). |
| Resíduos RUNTIME_HOT_PATH_COVERED (já com migration) | 7 (R02, R05, R06, R07, R08, R09, R10) |
| Casos LEGACY_QUARANTINED | 4 (R11, R12, R13, R14) |
| Falsos positivos / test-only | 7 (R15-R20) |
| Lacunas de migration remanescentes | 2 confirmadas (`R01` SIGVOOS base, `R04` Documentos canonico) |
| Migrations existentes relacionadas | 10+ (`0172`, `0173`, `0183`, `0184`, `0200`, `0280`, `0317`, `0345`, `0352`, `0354`, `0136`-`0138`, `0165`) |
| Migrations novas necessarias | 2 confirmadas (`0387` ja versionada mas bloqueada por cadeia; `0388` planejada) |
| Ordem recomendada restante | `R04` documentos canonico -> `R01` baseline/chain plan |
| Status na matriz | DDL_RUNTIME = PARTIAL (R03 = RESOLVED; R09 = RESOLVED Sprint R09; R04 = 0388_DESIGN_READY Sprint R04.3; R01 = MIGRATION_CHAIN_BLOCKED_BY_0354 (Sprint Z1.1)) |

---

**Fim do design document.** Gerado em 2026-06-03. Atualizado com Sprint X.5 closure, Sprint Z0 readiness mapping, Sprint Z1 (`0387` criada), Sprint Z1.1 (cadeia bloqueada pela `0354`), Sprint R04.2 (baseline estrutural remota de Documentos) e Sprint R04.3 (desenho documental da `0388`).
