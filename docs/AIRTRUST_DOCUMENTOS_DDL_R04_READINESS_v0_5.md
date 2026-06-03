# AirTrust — Documentos DDL R04 Readiness v0.5

**Data:** 2026-06-03
**Sprint:** R04.1 — Documentos canonical schema readiness
**Status:** READINESS_MAPPED
**Modelo:** DeepSeek V4 Pro
**Próximo modelo recomendado:** GPT-5.4 Alta (para criação da migration 0388)

---

## 1. Objetivo

Mapear o estado atual do runtime DDL de Documentos para preparar a futura migration `0388_documentos_canonical_schema.sql`, que possibilitará a remoção segura de `auto-migration-documentos.ts` do runtime.

---

## 2. Estado atual

R04 — Documentos bootstrap / auto-migration-documentos.ts permanece como o único residual crítico de runtime DDL ativo (R01 está bloqueado por cadeia de migrations `0354 → 0387`; R03 e R09 estão RESOLVED).

O helper `ensureDocumentosTableExists()` é executado em todo startup do Worker via `onApiRequestBootstrap → runApiBootstrap`. Em ambientes com migrations aplicadas (produção), é no-op. Em ambientes novos sem migrations, é o único criador da tabela `documentos`.

---

## 3. Arquivos runtime envolvidos

| Arquivo | Função | Papel |
|---|---|---|
| `worker-airtrust/src/utils/auto-migration-documentos.ts` | `ensureDocumentosTableExists()` | Bootstrap: cria tabela + índices se não existir |
| `worker-airtrust/src/runtime/api-bootstrap.ts` | `runApiBootstrap()` | Orquestrador: chama `ensureDocumentosTableExists(env.DB)` |
| `worker-airtrust/src/index.ts:30,942` | `createWorkerEntrypoint()` | Wires `onApiRequestBootstrap: runApiBootstrap` |
| `worker-airtrust/src/middleware/tenant.ts:519` | `ALLOWED_TABLES` | Whitelist: inclui `documentos` e `pasta_virtual` |
| `worker-airtrust/src/routes/qualificacoes-certificados-helpers.ts:202-222` | `getCertificadosStorageColumns()` | Structural probe: `documentosHasEmpresaId`, `pastaVirtualHasDocumentoId`, `pastaVirtualHasCertificacaoId`, `pastaVirtualHasEmpresaId` |
| `worker-airtrust/src/routes/qualificacoes-certificados.ts` | CRUD de certificados | Reads/writes `documentos` + `pasta_virtual` |
| `worker-airtrust/src/routes/qualificacoes-certificados-write.ts` | Upload de certificados | Inserts em `documentos` + `pasta_virtual` |
| `worker-airtrust/src/routes/pasta-virtual-extra.ts` | Rotas compatibilidade legada | Reads/writes `documentos` |
| `worker-airtrust/src/routes/pasta-virtual.ts` | Pasta virtual por categoria | Reads `documentos` + `pasta_virtual` |
| `worker-airtrust/src/routes/admin.ts` | Admin soft-delete cascade | `funcionario_documentos` |
| `worker-airtrust/src/config/backup-modules.ts:54-63` | Config de backup | Define modulo DOCUMENTOS: `documentos`, `pasta_virtual`, `arquivos`, `funcionario_documentos`, `certificados_templates` |

---

## 4. Bootstrap atual de documentos

### 4.1 Tabelas criadas pelo runtime

| Objeto | Tipo | Origem runtime | Existe em migration? | Lacuna | Risco |
|---|---|---|---|---|---|
| `documentos` | TABLE | `auto-migration-documentos.ts:27-42` | Sim (0136 rebuild) **mas schema diverge** | Colunas divergentes | ALTO — schema bootstrap ≠ schema migration chain |
| `idx_documentos_funcionario` | INDEX | `auto-migration-documentos.ts:50-51` | Parcial (criado por 0136 rebuild, mas 0200 cria versão composta diferente) | 0200 usa `tipo_documento` que bootstrap não tem | MÉDIO |
| `idx_documentos_historico` | INDEX | `auto-migration-documentos.ts:53` | Não | Coluna `historico_id` não existe em migrations | ALTO — índice sobre coluna inexistente via migration chain |
| `idx_documentos_deleted` | INDEX | `auto-migration-documentos.ts:54` | Não explicitamente | Nenhuma migration cria este índice isolado | BAIXO |
| `idx_documentos_r2_key` | INDEX | `auto-migration-documentos.ts:55` | Sim (0137:11, 0138:8) | Migration cobre | NENHUM |
| `idx_documentos_uuid` | INDEX | `auto-migration-documentos.ts:56` | Implícito (UNIQUE constraint gera índice automático) | Nome pode divergir | BAIXO |

### 4.2 Schema completo criado pelo bootstrap

```sql
CREATE TABLE IF NOT EXISTS documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  funcionario_id INTEGER NOT NULL,
  historico_id INTEGER,                          -- ⚠️ NÃO existe em migration 0136
  nome_arquivo TEXT NOT NULL,
  tipo TEXT NOT NULL,                             -- ⚠️ 0200 referencia tipo_documento
  tamanho INTEGER NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  descricao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (historico_id) REFERENCES qualificacoes_historico(id)
  -- ⚠️ FALTANDO vs migrations: empresa_id, sha256_hash, tipo_documento, qualificacao_historico_id
);

-- Índices:
CREATE INDEX IF NOT EXISTS idx_documentos_funcionario ON documentos(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_documentos_historico ON documentos(historico_id);
CREATE INDEX IF NOT EXISTS idx_documentos_deleted ON documentos(deleted_at);
CREATE INDEX IF NOT EXISTS idx_documentos_r2_key ON documentos(r2_key);
CREATE INDEX IF NOT EXISTS idx_documentos_uuid ON documentos(uuid);
```

### 4.3 Tabelas relacionadas NÃO bootstrapped (existem apenas via migrations)

| Tabela | Primeira migration | Status |
|---|---|---|
| `pasta_virtual` | 0133 (rebuild), 0134 (rebuild) | Dependente de migration chain |
| `arquivos` | 0108 (create), 0136 (rebuild) | Dependente de migration chain |
| `funcionario_documentos` | 0136 (rebuild) | Dependente de migration chain |
| `documentos_downloads` | 0137, 0138 | Dependente de migration chain |
| `certificados_templates` | Nenhuma migration CREATE — origem desconhecida (pré-0136) | ALTO RISCO |
| `pasta_virtual_jobs` | 0244 | Dependente de migration chain |

### 4.4 Quando o helper roda

1. `createWorkerEntrypoint(app, { onApiRequestBootstrap: runApiBootstrap })` — index.ts:941
2. `runApiBootstrap(env)` — api-bootstrap.ts:5
3. `ensureDocumentosTableExists(env.DB)` — api-bootstrap.ts:9
4. Verifica `sqlite_master` pela tabela `documentos` — auto-migration-documentos.ts:14
5. Se não existe → CREATE TABLE + 5 índices
6. Se existe → retorna sem ação (no-op)

### 4.5 Quem chama

`onApiRequestBootstrap` é invocado pelo Cloudflare Workers runtime no startup do Worker, antes da primeira requisição HTTP. Executa em TODOS os ambientes (local, dev, staging, production).

### 4.6 Risco de remover antes de migration canônica

**ALTO.** Se removermos `ensureDocumentosTableExists()` sem uma migration canônica:
- Ambientes novos (fresh D1) não teriam tabela `documentos` → erros 500 em todas as rotas de certificados/pasta virtual
- O schema criado pelo bootstrap tem colunas que NÃO existem via migration chain pura → possível inconsistência estrutural
- A migration chain sozinha pode não produzir o schema completo que o código espera

### 4.7 Backfill implícito

Não. O bootstrap apenas cria estrutura (DDL). Não popula dados. O backfill de dados (ex: certificado_arquivo_id, empresa_id) ocorre em migrations separadas (0137, 0138, 0165, 0225, 0226, 0311).

### 4.8 Dependência de R2

Sim — as rotas de certificados usam `r2_key` para upload/download de arquivos em R2. Mas o bootstrap em si (DDL) não depende de R2 — apenas a operação das rotas.

### 4.9 Tenant isolation

Parcial. O bootstrap NÃO inclui `empresa_id`. A coluna foi adicionada pela migration 0165. As rotas usam structural probe (`documentosHasEmpresaId`) para adaptar queries com/sem `empresa_id`. O middleware `tenant.ts` lista `documentos` e `pasta_virtual` como tabelas permitidas.

---

## 5. Migrations históricas relacionadas

| Migration | Operação | Objeto | Cobre schema alvo? | Observação |
|---|---|---|---|---|
| **0108** | CREATE TABLE | `arquivos` | Parcial | Schema inicial de arquivos; rebuild em 0136 |
| **0133** | Rebuild | `pasta_virtual` | Parcial | Corrige FK refs; inclui `certificacao_id` |
| **0134** | Rebuild | `pasta_virtual` | Sim | Schema canônico da pasta_virtual (funcionario_id, tipo_documento, categoria, caminho_arquivo, arquivourl, nome_arquivo, nomeoriginal, arquivo_tamanho, tamanho, dataupload, created_at, updated_at, uploadedby, certificacao_id, descricao, deleted_at) |
| **0135** | DROP TRIGGER | `pasta_virtual` triggers | — | Remove triggers obsoletos |
| **0136** | Rebuild (DROP+CREATE) | `documentos`, `arquivos`, `funcionario_documentos` | **Parcial — schema base** | Cria `documentos` sem `historico_id`, `empresa_id`, `sha256_hash`; cria `funcionario_documentos` |
| **0137** (fix_certificados) | CREATE INDEX + TABLE | `documentos` indexes, `documentos_downloads` | Sim | Índices: r2_key, tipo, funcionario_tipo; tabela downloads |
| **0137** (add_integrity_checks) | ALTER TABLE ADD COLUMN | `documentos.sha256_hash` | Sim | Adiciona coluna de checksum SHA-256 |
| **0138** | CREATE INDEX + TABLE + TRIGGER + VIEW | `documentos` indexes, `documentos_downloads`, `v_certificados_completos` | Sim (redundante com 0137) | Recria índices e downloads (idempotente via IF NOT EXISTS) |
| **0150** | ALTER TABLE ADD COLUMN | `pasta_virtual.empresa_id` | Sim | Multi-tenant incremental |
| **0151** | ALTER TABLE ADD COLUMN | `pasta_virtual.empresa_id` | Sim | Multi-tenant incremental (redundante) |
| **0161** | ALTER TABLE ADD COLUMN | `pasta_virtual.empresa_id` | Sim | Multi-tenant (redundante) |
| **0162** | ALTER TABLE ADD COLUMN | `pasta_virtual.empresa_id` | Sim | Multi-tenant (redundante) |
| **0163** | ALTER TABLE ADD COLUMN | `pasta_virtual.empresa_id` | Sim | Multi-tenant (redundante) |
| **0164** | ALTER TABLE ADD COLUMN | `pasta_virtual.empresa_id` | Sim | Multi-tenant (redundante) |
| **0165** | **ALTER TABLE ADD COLUMN** | **`documentos.empresa_id`** | **Sim — CRÍTICO** | **Única migration que adiciona empresa_id a documentos** |
| **0176** | Fix FK type | `qualificacoes_historico.certificado_arquivo_id` | — | Corrige tipo da FK para documentos |
| **0200** | CREATE INDEX (composite) | `documentos` composite indexes | **⚠️ LACUNA** | Referencia colunas `tipo_documento` e `qualificacao_historico_id` que **não existem** no schema base 0136 |
| **0211** | ALTER TABLE ADD COLUMN | `pasta_virtual_sync.deleted_at` | — | Soft delete para tabela auxiliar |
| **0225** | UPDATE data | `documentos`, `pasta_virtual`, `certificados_templates` | — | Consolida dados para empresa 6 |
| **0226** | UPDATE data | `documentos`, `pasta_virtual`, `certificados_templates` | — | Restaura Costa do Sol (empresa 6) |
| **0227** | DROP TABLE | `documentos_backup`, `pasta_virtual_backup`, `funcionario_documentos_backup` | — | Limpeza |
| **0244** | CREATE TABLE | `pasta_virtual_jobs` | — | Jobs de geração de pasta virtual |
| **0311** | UPDATE data | `documentos`, `pasta_virtual` | — | Alinha registros legacy empresa 6 |

### 5.1 Resumo da cobertura migratória

**Colunas de `documentos` e sua origem:**

| Coluna | Origem migration | Origem bootstrap | Match? |
|---|---|---|---|
| `id` | 0136 (rebuild) | ✅ auto-migration | ✅ |
| `uuid` | 0136 | ✅ auto-migration | ✅ |
| `funcionario_id` | 0136 | ✅ auto-migration | ✅ |
| `historico_id` | ❌ **NENHUMA** | ✅ auto-migration | ❌ **BOOTSTRAP-ONLY** |
| `nome_arquivo` | 0136 | ✅ auto-migration | ✅ |
| `tipo` | 0136 | ✅ auto-migration | ✅ |
| `tamanho` | 0136 | ✅ auto-migration | ✅ |
| `r2_key` | 0136 | ✅ auto-migration | ✅ |
| `descricao` | 0136 | ✅ auto-migration | ✅ |
| `created_at` | 0136 | ✅ auto-migration | ✅ |
| `updated_at` | 0136 | ✅ auto-migration | ✅ |
| `deleted_at` | 0136 | ✅ auto-migration | ✅ |
| `sha256_hash` | **0137_add_integrity_checks** | ❌ | ❌ **MIGRATION-ONLY** |
| `empresa_id` | **0165** | ❌ | ❌ **MIGRATION-ONLY** |
| `tipo_documento` | ❌ **NENHUMA (referenciada em 0200)** | ❌ | ❌ **COLUNA FANTASMA** |
| `qualificacao_historico_id` | ❌ **NENHUMA (referenciada em 0200)** | ❌ | ❌ **COLUNA FANTASMA** |

---

## 6. Schema canônico alvo (proposta para 0388)

### 6.1 Tabela `documentos` — schema alvo

```sql
CREATE TABLE IF NOT EXISTS documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  funcionario_id INTEGER NOT NULL,
  historico_id INTEGER,                          -- Presente no bootstrap, NÃO em migrations
  nome_arquivo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  tamanho INTEGER NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  descricao TEXT,
  sha256_hash TEXT,                              -- Migration 0137_add_integrity_checks
  empresa_id INTEGER DEFAULT NULL,               -- Migration 0165
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (historico_id) REFERENCES qualificacoes_historico(id)
);
```

### 6.2 Índices alvo

```sql
-- Índices básicos (presentes no bootstrap + migrations)
CREATE INDEX IF NOT EXISTS idx_documentos_funcionario ON documentos(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_documentos_historico ON documentos(historico_id);
CREATE INDEX IF NOT EXISTS idx_documentos_deleted ON documentos(deleted_at);
CREATE INDEX IF NOT EXISTS idx_documentos_r2_key ON documentos(r2_key);
CREATE INDEX IF NOT EXISTS idx_documentos_uuid ON documentos(uuid);
CREATE INDEX IF NOT EXISTS idx_documentos_sha256 ON documentos(sha256_hash);
CREATE INDEX IF NOT EXISTS idx_documentos_empresa ON documentos(empresa_id);

-- Índices parciais (migrations 0137/0138)
CREATE INDEX IF NOT EXISTS idx_documentos_tipo ON documentos(tipo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documentos_funcionario_tipo ON documentos(funcionario_id, tipo) WHERE deleted_at IS NULL;
```

### 6.3 Respostas às 10 perguntas

**1. Quais tabelas a 0388 precisa garantir?**
Apenas `documentos`. As tabelas `pasta_virtual`, `arquivos`, `funcionario_documentos`, `documentos_downloads` e `certificados_templates` já são cobertas por migrations existentes (ou têm origem pré-migration confirmada em produção).

**2. Quais colunas precisam estar presentes?**
Todas as 15 colunas listadas em 6.1. Especial atenção a `historico_id` (bootstrap-only) e `sha256_hash`/`empresa_id` (migration-only).

**3. Quais índices precisam estar presentes?**
Os 9 índices listados em 6.2, cobrindo tanto os do bootstrap quanto os de migrations 0137/0138.

**4. Quais objetos já são cobertos por migrations históricas?**
- Schema base (12 colunas): migration 0136 (rebuild)
- `sha256_hash`: migration 0137_add_integrity_checks
- `empresa_id`: migration 0165
- Índices parciais (tipo, funcionario_tipo): migrations 0137/0138
- `documentos_downloads`: migrations 0137/0138
- `pasta_virtual`: migrations 0133/0134
- `funcionario_documentos`: migration 0136

**5. Quais objetos só existem por bootstrap?**
- Coluna `historico_id` — NENHUMA migration a cria
- Índice `idx_documentos_historico` — NENHUMA migration o cria
- Índice `idx_documentos_deleted` — NENHUMA migration o cria (pelo menos não explicitamente com este nome)

**6. A futura 0388 pode usar CREATE TABLE IF NOT EXISTS?**
**SIM, com ressalva.** `CREATE TABLE IF NOT EXISTS` é seguro para o caso feliz (tabela não existe). Mas em produção a tabela já existe com schema potencialmente incompleto — `IF NOT EXISTS` não faria nada. Será necessário complementar com `ALTER TABLE ADD COLUMN` para colunas faltantes (usando idempotência via try/catch ou probe estrutural prévio).

**7. Há risco de ALTER TABLE ADD COLUMN duplicado?**
Sim. Se o probe estrutural não for feito antes, as colunas `historico_id`, `sha256_hash`, ou `empresa_id` podem já existir → erro em D1. Estratégia recomendada: probe estrutural read-only antes da migration, ou usar `ALTER TABLE ADD COLUMN` dentro de bloco condicional no script de migration (D1 não suporta `IF NOT EXISTS` para colunas).

**8. Precisa probe estrutural remoto antes da 0388?**
**SIM, FORTEMENTE RECOMENDADO.** O schema de produção é desconhecido em detalhes. Não sabemos se:
- `historico_id` existe em produção
- `sha256_hash` existe em produção
- `empresa_id` existe e qual o default
- As colunas `tipo_documento` e `qualificacao_historico_id` referenciadas por 0200 existem

O probe remoto deve executar `PRAGMA table_info(documentos)` em produção e retornar a lista de colunas + tipos + defaults.

**9. Pode remover auto-migration-documentos depois da 0388?**
**SIM, APÓS confirmação.** Condições:
- Migration 0388 aplicada com sucesso em produção
- Probe pós-migration confirma schema completo
- Deploy do Worker sem `ensureDocumentosTableExists`
- Smoke test confirma rotas de certificados/pasta virtual funcionando

**10. Qual ordem segura?**
1. **Probe estrutural remoto** → `PRAGMA table_info(documentos)` em produção
2. **Criar migration 0388** → adaptada ao resultado do probe
3. **Testar migration localmente** → chain test com schema limpo
4. **Aplicar migration em staging** → validar
5. **Aplicar migration em produção** → via D1 migrations apply
6. **Probe pós-migration** → confirmar schema
7. **Remover** `ensureDocumentosTableExists` + `runApiBootstrap` call
8. **Deploy Worker/API**
9. **Smoke test** → certificados, pasta virtual

---

## 7. Lacunas confirmadas

| # | Lacuna | Severidade | Impacto |
|---|---|---|---|
| L1 | `historico_id` só existe via bootstrap — NENHUMA migration a cria | ALTA | Migration chain pura não produz esta coluna; rotas de certificados podem usar esta FK |
| L2 | Colunas `tipo_documento` e `qualificacao_historico_id` referenciadas em 0200 nunca foram criadas | ALTA | Migration 0200 tenta criar índices em colunas inexistentes → possível falha silenciosa em D1 |
| L3 | `sha256_hash` só existe via migration 0137_add_integrity_checks — bootstrap não a cria | MÉDIA | Ambiente novo via bootstrap-only não tem checksum |
| L4 | `empresa_id` só existe via migration 0165 — bootstrap não a cria | ALTA | Ambiente novo via bootstrap-only não tem tenant isolation em `documentos` |
| L5 | `idx_documentos_deleted` não tem cobertura explícita de migration | BAIXA | Performance de soft-delete queries |
| L6 | `idx_documentos_uuid` não tem cobertura explícita de migration (mas UNIQUE gera índice automático) | BAIXA | Nome do índice pode divergir |
| L7 | `certificados_templates` não tem migration CREATE — origem desconhecida | ALTA | Pode não existir em ambiente novo; referenciada em 0225/0226/backup |
| L8 | `pasta_virtual.documento_id` nunca foi adicionado por migration — apenas probe estrutural | MÉDIA | Código adapta-se via probe, mas coluna pode não existir |
| L9 | Bootstrap não cria índices parciais (WHERE deleted_at IS NULL) que migrations 0137/0138 criam | BAIXA | Performance de queries com soft-delete |

---

## 8. Riscos de cadeia/migration

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| 0200 falha em schema limpo (colunas inexistentes) | ALTA | Migration chain quebra | 0388 deve criar colunas antes de 0200 rodar, OU 0200 deve ser corrigido |
| `certificados_templates` não existe em schema limpo | MÉDIA | Falha em rotas de template | Investigar origem; possivelmente adicionar CREATE TABLE na 0388 |
| Schema híbrido bootstrap+migration em produção | ALTA | Dificuldade em reproduzir estado real | Probe estrutural remoto antes de qualquer ação |
| Duplicação de índices (bootstrap + migration criam mesmos índices) | BAIXA | Conflito de nomes | `IF NOT EXISTS` em ambos os lados mitiga |
| FK `historico_id` quebra se `qualificacoes_historico` não existir | BAIXA | Erro em CREATE TABLE | `qualificacoes_historico` é criada cedo na chain (migration 0032) |

---

## 9. Necessidade de probe estrutural remoto

**SIM — OBRIGATÓRIO antes da criação da migration 0388.**

### Comando proposto (read-only):

```sql
PRAGMA table_info(documentos);
```

Também recomendado:

```sql
SELECT name FROM sqlite_master WHERE type='table' AND name IN (
  'documentos', 'pasta_virtual', 'arquivos', 'funcionario_documentos',
  'documentos_downloads', 'certificados_templates', 'pasta_virtual_jobs'
);
SELECT name FROM sqlite_master WHERE type='index' AND name LIKE '%documento%';
SELECT sql FROM sqlite_master WHERE type='table' AND name='documentos';
```

### O que o probe deve revelar:

1. Lista exata de colunas em `documentos` na produção
2. Se `historico_id` existe
3. Se `sha256_hash` existe
4. Se `empresa_id` existe e qual DEFAULT
5. Se `tipo_documento` e `qualificacao_historico_id` existem (colunas fantasmas da 0200)
6. Se `certificados_templates` existe
7. Schema real de `pasta_virtual`

---

## 10. Estratégia recomendada para 0388

### Abordagem: Migration canônica com idempotência estrutural

A migration 0388 deve:

1. **Criar tabela se não existir** (cobre ambientes novos):
   ```sql
   CREATE TABLE IF NOT EXISTS documentos (...schema canônico completo...);
   ```

2. **Adicionar colunas faltantes** (cobre ambientes com schema parcial):
   - Probe ou try/catch para `historico_id`, `sha256_hash`, `empresa_id`
   - Usar `ALTER TABLE documentos ADD COLUMN` com tratamento de erro

3. **Criar índices faltantes** (idempotente via IF NOT EXISTS)

4. **NÃO fazer backfill de dados** — apenas estrutura

5. **NÃO criar tabelas relacionadas** — `pasta_virtual`, `arquivos`, etc. já têm cobertura de migration

6. **Documentar** que `certificados_templates` precisa ser investigado separadamente

### Alternativa: Schema assert + conditional DDL

Se o probe remoto confirmar que a tabela já existe com schema completo, a 0388 pode ser reduzida a um schema assert (verificação) + conditional DDL apenas para colunas/índices faltantes.

---

## 11. Ordem segura futura

```
1. PROBE_REMOTO_READONLY     → PRAGMA table_info(documentos) em produção
2. ANALISE_RESULTADO          → Decidir CREATE vs ALTER vs híbrido
3. CRIAR_0388                 → Migration canônica adaptada
4. TESTAR_LOCAL               → Chain test com schema limpo
5. TESTAR_STAGING             → Aplicar em staging, validar
6. REVIEW_MIGRATION           → Revisão de código
7. APLICAR_PRODUCAO           → D1 migrations apply --remote
8. PROBE_POS_MIGRATION        → Confirmar schema final
9. REMOVER_BOOTSTRAP          → Deletar ensureDocumentosTableExists + runApiBootstrap
10. DEPLOY_WORKER              → Deploy sem bootstrap
11. SMOKE_TEST                  → Validar rotas de certificados/pasta virtual
12. ATUALIZAR_DOCS             → R04 = RESOLVED
```

---

## 12. Testes necessários

| Teste | Tipo | Descrição |
|---|---|---|
| Chain test 0388 em schema limpo | Unit/Local | Rodar todas as migrations do zero e verificar que `documentos` tem schema completo |
| Probe estrutural remoto | Read-only prod | `PRAGMA table_info(documentos)` em produção |
| Teste de idempotência | Unit/Local | Rodar 0388 duas vezes — segunda deve ser no-op |
| Schema assertion test | Unit/Local | Verificar que todas as colunas e índices alvo existem após migration chain completa |
| Smoke certificados | Integração | Upload + download de certificado após migration |
| Smoke pasta virtual | Integração | Listar + filtrar pasta virtual após migration |
| Smoke multi-tenant | Integração | Verificar tenant isolation com empresa_id |

---

## 13. Rollback

A migration 0388 é **DDL puro sem DML** — não altera dados. Rollback em produção seria:
- A migration em si não tem rollback automático (D1 não suporta DDL transacional para ALTER)
- Se necessário reverter schema: criar migration 0389 com DROP COLUMN para colunas adicionadas indevidamente
- O bootstrap (`ensureDocumentosTableExists`) NÃO deve ser removido ANTES de confirmar sucesso da migration — isso garante fallback

---

## 14. Fora do escopo desta fase

- ❌ Criar migration 0388
- ❌ Executar probe remoto
- ❌ Alterar runtime
- ❌ Alterar schema
- ❌ Executar D1 remoto
- ❌ Fazer deploy
- ❌ Remover `auto-migration-documentos.ts`
- ❌ Alterar auth/RBAC/tenant
- ❌ Tocar R2
- ❌ Backfill de dados
- ❌ Investigar `certificados_templates` (requer sprint separada)
- ❌ Corrigir migration 0200 (colunas fantasmas `tipo_documento`/`qualificacao_historico_id`)
- ❌ Resolver lacuna `pasta_virtual.documento_id`

---

**Fim do readiness document.** Gerado em 2026-06-03. Sprint R04.1. Próxima fase: probe estrutural remoto (GPT-5.4 Alta).
