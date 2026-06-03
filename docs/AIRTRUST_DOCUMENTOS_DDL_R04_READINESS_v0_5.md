# AirTrust — Documentos DDL R04 Readiness v0.5

**Data:** 2026-06-03
**Sprint:** R04.2 — fechamento documental do probe estrutural remoto
**Status:** READY_FOR_0388_CANONICAL_WITH_PROBE_BASELINE
**Modelo:** DeepSeek V4 Pro
**Próximo modelo recomendado:** GPT-5.4 Alta (para criação da migration 0388)

---

## 1. Objetivo

Mapear o estado atual do runtime DDL de Documentos para preparar a futura migration `0388_documentos_canonical_schema.sql`, que possibilitará a remoção segura de `auto-migration-documentos.ts` do runtime.

> **Addendum Sprint R04.2 (2026-06-03):** o probe estrutural remoto read-only foi executado manualmente em `production` usando somente `PRAGMA table_info(...)` e `PRAGMA index_list(...)` para `documentos`, `pasta_virtual` e `certificados_templates`. Resultado operacional registrado: `Total queries executed: 6`, `Rows read: 0`, `Rows written: 0`, sem DML, sem DDL e sem consulta de dados de linha. Baseline confirmado: `documentos` existe com `empresa_id` e sem `historico_id`/`sha256_hash`; `idx_documentos_uuid` nominal não existe e a unicidade está coberta por autoíndices SQLite; `pasta_virtual.documento_id` não existe; `certificados_templates` existe em produção. **R04 = READY_FOR_0388_CANONICAL_WITH_PROBE_BASELINE.**

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

### 6.3 Baseline remoto capturado em produção (R04.2)

**Segurança do probe executado**

```text
Target: production
SQL usado: PRAGMA only
Total queries executed: 6
Rows read: 0
Rows written: 0
DML/DDL: não
Dados de linha: não
```

**Tabela `documentos`**

```text
Colunas:
- id INTEGER pk
- uuid TEXT notnull
- funcionario_id INTEGER notnull
- nome_arquivo TEXT notnull
- tipo TEXT notnull
- tamanho INTEGER notnull
- r2_key TEXT notnull
- descricao TEXT nullable
- created_at TEXT notnull default datetime('now')
- updated_at TEXT notnull default datetime('now')
- deleted_at TEXT nullable default NULL
- empresa_id INTEGER nullable default 1

Índices:
- idx_documentos_empresa
- sqlite_autoindex_documentos_2
- sqlite_autoindex_documentos_1

Observações:
- `historico_id` não existe em produção.
- `sha256_hash` não existe em produção.
- `idx_documentos_uuid` nominal não apareceu; unicidade de `uuid` está coberta por autoíndice SQLite.
- Os índices nominais `idx_documentos_funcionario`, `idx_documentos_historico`, `idx_documentos_deleted` e `idx_documentos_r2_key` não apareceram no baseline remoto.
```

**Tabela `pasta_virtual`**

```text
Colunas:
- id INTEGER pk
- funcionario_id INTEGER notnull
- tipo_documento TEXT notnull
- categoria TEXT nullable
- caminho_arquivo TEXT nullable
- arquivourl TEXT nullable
- nome_arquivo TEXT nullable
- nomeoriginal TEXT nullable
- arquivo_tamanho INTEGER nullable
- tamanho INTEGER nullable
- dataupload TEXT nullable
- created_at TEXT nullable default datetime('now')
- updated_at TEXT nullable default datetime('now')
- uploadedby INTEGER nullable
- certificacao_id INTEGER nullable
- descricao TEXT nullable
- deleted_at TEXT nullable
- empresa_id INTEGER nullable default 1

Índices:
- idx_pasta_virtual_empresa
- idx_pasta_virtual_deleted
- idx_pasta_virtual_funcionario

Observações:
- `documento_id` não existe em produção.
- Nenhum índice relacionado a `documento_id` existe no baseline remoto.
```

**Tabela `certificados_templates`**

```text
Colunas:
- id INTEGER pk
- empresa_id INTEGER notnull
- nome VARCHAR(100) notnull
- descricao TEXT nullable
- tipo VARCHAR(50) default 'PADRAO'
- template_json TEXT notnull
- logo_url TEXT nullable
- background_url TEXT nullable
- assinatura_url TEXT nullable
- fonte VARCHAR(50) default 'Arial'
- tamanho_fonte_titulo INTEGER default 24
- tamanho_fonte_corpo INTEGER default 14
- cor_primaria VARCHAR(7) default '#000000'
- cor_secundaria VARCHAR(7) default '#666666'
- cor_destaque VARCHAR(7) default '#0066CC'
- orientacao VARCHAR(20) default 'landscape'
- tamanho_papel VARCHAR(10) default 'A4'
- margem_cm DECIMAL(4,2) default 2.0
- ativo BOOLEAN default 1
- padrao BOOLEAN default 0
- versao VARCHAR(10) default '1.0'
- tags TEXT nullable
- created_by INTEGER nullable
- created_at DATETIME default CURRENT_TIMESTAMP
- updated_by INTEGER nullable
- updated_at DATETIME default CURRENT_TIMESTAMP
- deleted_at DATETIME nullable

Índices:
- idx_templates_tipo
- idx_templates_padrao
- idx_templates_empresa_ativo

Observações:
- `certificados_templates` existe em produção.
- A origem histórica continua sem migration CREATE reconciliada.
```

### 6.4 Respostas às 10 perguntas

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
Sim. O probe remoto já eliminou a incerteza principal do baseline de produção: `historico_id` e `sha256_hash` estão ausentes; `empresa_id` existe com default `1`. A futura `0388` ainda precisa ser idempotente para ambientes não-prod e para variações legadas, mas agora não deve assumir schema limpo nem usar `ALTER TABLE` às cegas.

**8. Precisa probe estrutural remoto antes da 0388?**
**SIM — e ele já foi executado na Sprint R04.2.** O baseline de produção deixou de ser hipotético:
- `historico_id` não existe em `documentos`
- `sha256_hash` não existe em `documentos`
- `empresa_id` existe com default `1`
- `idx_documentos_uuid` nominal não existe
- `pasta_virtual.documento_id` não existe
- `certificados_templates` existe em produção

**9. Pode remover auto-migration-documentos depois da 0388?**
**SIM, APÓS confirmação.** Condições:
- Migration 0388 aplicada com sucesso em produção
- Probe pós-migration confirma schema completo
- Deploy do Worker sem `ensureDocumentosTableExists`
- Smoke test confirma rotas de certificados/pasta virtual funcionando

**10. Qual ordem segura?**
1. **Criar migration 0388** → adaptada ao baseline remoto capturado
2. **Testar migration localmente** → chain test com schema limpo
3. **Aplicar migration em staging** → validar
4. **Aplicar migration em produção** → via D1 migrations apply
5. **Probe pós-migration** → confirmar schema
6. **Remover** `ensureDocumentosTableExists` + `runApiBootstrap` call
7. **Deploy Worker/API**
8. **Smoke test** → certificados, pasta virtual

---

## 7. Lacunas confirmadas

| # | Lacuna | Severidade | Impacto |
|---|---|---|---|
| L1 | `historico_id` não existe no baseline de produção e só existe via bootstrap — NENHUMA migration a cria | ALTA | Produção real diverge do bootstrap; a 0388 precisará decidir explicitamente se canonicaliza esta FK |
| L2 | Colunas `tipo_documento` e `qualificacao_historico_id` referenciadas em 0200 nunca foram criadas | ALTA | Migration 0200 tenta criar índices em colunas inexistentes → possível falha silenciosa em D1 |
| L3 | `sha256_hash` não existe no baseline de produção, embora exista em migration 0137_add_integrity_checks | MÉDIA | O schema real é parcial/legado; a 0388 terá de adicionar a coluna de forma idempotente |
| L4 | `empresa_id` existe em produção via legado/migration, mas o bootstrap não a cria | ALTA | Ambientes bootstrap-only continuam sem isolamento tenant em `documentos` |
| L5 | `idx_documentos_deleted` não tem cobertura explícita de migration e não apareceu no baseline remoto | BAIXA | Performance de soft-delete queries |
| L6 | `idx_documentos_uuid` nominal não apareceu no baseline remoto (unicidade via autoíndice SQLite) | BAIXA | Nome do índice diverge do bootstrap; a 0388 não deve depender do nome nominal em produção |
| L7 | `certificados_templates` existe em produção, mas segue sem migration CREATE reconciliada | ALTA | Origem histórica permanece obscura para ambientes novos |
| L8 | `pasta_virtual.documento_id` não existe no baseline remoto e nunca foi adicionado por migration | MÉDIA | Código adapta-se via probe, mas a coluna não pode ser assumida como canônica |
| L9 | Produção não expôs os índices nominais do bootstrap nem os índices parciais esperados | MÉDIA | A 0388 terá de tratar cobertura de índices sobre baseline parcial/legado |

---

## 8. Riscos de cadeia/migration

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| 0200 falha em schema limpo (colunas inexistentes) | ALTA | Migration chain quebra | 0388 deve criar colunas antes de 0200 rodar, OU 0200 deve ser corrigido |
| `certificados_templates` não existe em schema limpo | MÉDIA | Falha em rotas de template | Investigar origem; possivelmente adicionar CREATE TABLE na 0388 |
| Schema parcial/legado confirmado em produção | ALTA | Dificuldade em reproduzir estado real e risco de migration simplista | Usar a baseline remota capturada como insumo obrigatório da 0388 |
| Duplicação de índices (bootstrap + migration criam mesmos índices) | BAIXA | Conflito de nomes | `IF NOT EXISTS` em ambos os lados mitiga |
| FK `historico_id` quebra se `qualificacoes_historico` não existir | BAIXA | Erro em CREATE TABLE | `qualificacoes_historico` é criada cedo na chain (migration 0032) |

---

## 9. Evidência do probe estrutural remoto

**Executado com sucesso na Sprint R04.2.**

### SQL efetivamente usado (read-only):

```sql
PRAGMA table_info(documentos);
PRAGMA index_list(documentos);

PRAGMA table_info(pasta_virtual);
PRAGMA index_list(pasta_virtual);

PRAGMA table_info(certificados_templates);
PRAGMA index_list(certificados_templates);
```

### O que o probe revelou:

1. Lista exata de colunas em `documentos`, `pasta_virtual` e `certificados_templates`
2. `historico_id` e `sha256_hash` ausentes em `documentos`
3. `empresa_id` presente em `documentos` e `pasta_virtual`, com default `1`
4. `idx_documentos_uuid` nominal ausente, substituído por autoíndices SQLite
5. `documento_id` ausente em `pasta_virtual`
6. `certificados_templates` presente em produção
7. Baseline suficiente para classificar R04 sem consultar dados de linha

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

Como o probe remoto confirmou que a tabela já existe com schema parcial/legado, a 0388 deve funcionar como migration canônica idempotente sobre baseline existente, e não como simples `CREATE TABLE IF NOT EXISTS`.

---

## 11. Ordem segura futura

```
1. ANALISE_BASELINE_REMOTA     → Consolidar colunas/índices já capturados
2. CRIAR_0388                  → Migration canônica adaptada
3. TESTAR_LOCAL                → Chain test com schema limpo
4. TESTAR_STAGING              → Aplicar em staging, validar
5. REVIEW_MIGRATION            → Revisão de código
6. APLICAR_PRODUCAO            → D1 migrations apply --remote
7. PROBE_POS_MIGRATION         → Confirmar schema final
8. REMOVER_BOOTSTRAP           → Deletar ensureDocumentosTableExists + runApiBootstrap
9. DEPLOY_WORKER               → Deploy sem bootstrap
10. SMOKE_TEST                 → Validar rotas de certificados/pasta virtual
11. ATUALIZAR_DOCS             → R04 = RESOLVED
```

---

## 12. Testes necessários

| Teste | Tipo | Descrição |
|---|---|---|
| Chain test 0388 em schema limpo | Unit/Local | Rodar todas as migrations do zero e verificar que `documentos` tem schema completo |
| Probe estrutural remoto | Read-only prod | ✅ Executado com `PRAGMA table_info/index_list` nas 3 tabelas-alvo |
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
- ❌ Criar migration 0388 nesta sprint
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

**Fim do readiness document.** Gerado em 2026-06-03. Atualizado com Sprint R04.2 e baseline estrutural remoto de produção. Próxima fase: criar/testar a `0388_documentos_canonical_schema.sql` contra a baseline capturada (GPT-5.4 Alta).
