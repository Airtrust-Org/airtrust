# AirTrust — Documentos 0388 Canonical Schema Design v0.5

## 1. Objetivo

Definir o desenho lógico da futura migration `0388_documentos_canonical_schema.sql` usando a baseline estrutural real de produção capturada na Sprint R04.2, sem aplicar migration, sem alterar schema remoto e sem remover o bootstrap runtime nesta fase.

> **Addendum Sprint R04.4 (2026-06-03):** o arquivo `worker-airtrust/migrations/0388_documentos_canonical_schema.sql` foi versionado localmente a partir deste desenho, junto com o teste `worker-airtrust/src/__tests__/migrations/documentos-canonical-schema.test.ts`. Nenhuma migration remota foi aplicada, o bootstrap runtime não foi removido e o status consolidado passou a **`R04 = MIGRATION_VERSIONED_PENDING_APPLY`**.

Objetivo prático da `0388`:

- estabilizar a criação de `documentos` em ambiente limpo;
- alinhar índices seguros com o uso atual;
- evitar DDL destrutivo ou aditivo arriscado sobre ambientes legados;
- preservar o caminho para remoção futura de `ensureDocumentosTableExists()` apenas depois de validação adicional.

## 2. Baseline real de produção

Resumo do probe estrutural read-only já registrado em R04.2:

- `documentos` existe em produção com 12 colunas:
  `id`, `uuid`, `funcionario_id`, `nome_arquivo`, `tipo`, `tamanho`, `r2_key`, `descricao`, `created_at`, `updated_at`, `deleted_at`, `empresa_id`.
- `documentos` **não** possui `historico_id`.
- `documentos` **não** possui `sha256_hash`.
- Índices visíveis em `documentos`:
  `idx_documentos_empresa`, `sqlite_autoindex_documentos_1`, `sqlite_autoindex_documentos_2`.
- `idx_documentos_uuid` nominal **não** existe; a unicidade está coberta por autoíndice SQLite.
- `pasta_virtual` existe com `empresa_id`, mas **sem** `documento_id`.
- `certificados_templates` existe em produção, porém sem migration `CREATE TABLE` reconciliada no histórico conhecido.

Implicação direta: a `0388` não pode assumir schema limpo nem tentar "corrigir" produção usando DDL amplo sem estratégia adicional.

## 3. Objetos já existentes

Objetos já presentes por baseline, migrations históricas ou ambas:

- Tabela `documentos`
- Coluna `documentos.empresa_id`
- Índice `idx_documentos_empresa`
- Constraints `UNIQUE` implícitas em `uuid` e `r2_key`
- Tabela `pasta_virtual`
- Tabela `documentos_downloads` via `0137`/`0138`
- Tabela `certificados_templates` em produção

Objetos presentes apenas em bootstrap ou apenas em parte da cadeia histórica:

- `documentos.historico_id` e `idx_documentos_historico` só no bootstrap
- `documentos.sha256_hash` e `idx_documentos_sha256` só em parte da história migratória
- Índices parciais `idx_documentos_tipo` e `idx_documentos_funcionario_tipo` em `0137`/`0138`
- Índices compostos de `0200` dependem de colunas fantasmas

## 4. Divergências relevantes

1. O bootstrap cria `historico_id`, mas a produção real não tem essa coluna.
2. A migration `0137_add_integrity_checks.sql` adiciona `sha256_hash`, mas a produção real não tem essa coluna.
3. A migration `0165` adiciona `empresa_id`, e a produção confirma esse estado.
4. O bootstrap cria índices nominais `idx_documentos_uuid` e `idx_documentos_r2_key`, mas a produção não expôs esses nomes.
5. A migration `0200` referencia `tipo_documento` e `qualificacao_historico_id` em `documentos`, mas essas colunas não existem na baseline conhecida.
6. O runtime trata `pasta_virtual.documento_id` como opcional; a produção confirma ausência.
7. `certificados_templates` existe em produção, mas a origem histórica ainda não está reconciliada.

## 5. Objetos propostos para a 0388

| Objeto | Ação proposta | Motivo | Risco | Status |
|---|---|---|---|---|
| `documentos` | `CREATE TABLE IF NOT EXISTS` com baseline de produção + `empresa_id` | Garante ambiente limpo sem depender do bootstrap | Baixo | `INCLUDE_IN_0388` |
| `idx_documentos_empresa` | `CREATE INDEX IF NOT EXISTS` | Já existe em produção e é estável para tenant-scope | Baixo | `INCLUDE_IN_0388` |
| `idx_documentos_funcionario` | `CREATE INDEX IF NOT EXISTS` | Coluna existe na baseline e o índice já é criado pelo bootstrap | Baixo | `INCLUDE_IN_0388` |
| `idx_documentos_deleted` | `CREATE INDEX IF NOT EXISTS` | Safe em baseline existente e útil para soft-delete | Baixo | `INCLUDE_IN_0388` |
| `idx_documentos_tipo` | `CREATE INDEX IF NOT EXISTS ... WHERE deleted_at IS NULL` | Já existe em `0137`/`0138` e usa apenas colunas reais da baseline | Baixo | `INCLUDE_IN_0388` |
| `idx_documentos_funcionario_tipo` | `CREATE INDEX IF NOT EXISTS ... WHERE deleted_at IS NULL` | Índice útil já previsto em `0137`/`0138`, sem depender de colunas fantasmas | Baixo | `INCLUDE_IN_0388` |
| `documentos.historico_id` | Não adicionar nesta fase | Produção não tem a coluna e o runtime atual não exige a coluna para operar | Médio | `REQUIRES_RUNTIME_REVIEW` |
| `idx_documentos_historico` | Não criar nesta fase | Depende de `historico_id`, que não pertence à baseline real de produção | Médio | `REQUIRES_RUNTIME_REVIEW` |
| `documentos.sha256_hash` | Não adicionar nesta fase | Produção não tem a coluna; o runtime já opera em fail-open quando ela falta | Médio | `DEFER` |
| `idx_documentos_sha256` | Não criar nesta fase | Depende de coluna ausente em produção | Médio | `DEFER` |
| `idx_documentos_uuid` nominal | Não criar nesta fase | `uuid` já é coberto por autoíndice SQLite; risco de redundância e falso alinhamento nominal | Baixo | `DO_NOT_TOUCH` |
| `idx_documentos_r2_key` nominal do bootstrap | Não criar nesta fase | `r2_key` já é `UNIQUE`; nome e formato divergem entre bootstrap e histórico | Baixo | `DO_NOT_TOUCH` |
| `pasta_virtual.documento_id` | Não adicionar | Produção não tem a coluna e o runtime explicitamente a trata como opcional | Alto | `DO_NOT_TOUCH` |
| Índice de `pasta_virtual.documento_id` | Não criar | Depende de coluna ausente e sem decisão arquitetural fechada | Alto | `DO_NOT_TOUCH` |
| `certificados_templates` | Não criar nem alterar via `0388` | Tabela já existe em produção, mas a origem histórica precisa de reconciliação separada | Médio | `DEFER` |
| Índices de `0200` sobre `tipo_documento` / `qualificacao_historico_id` | Não recriar na `0388` | Dependem de colunas não confirmadas no schema real | Alto | `DO_NOT_TOUCH` |
| `documentos_downloads`, `views`, `triggers` de certificados | Não tocar nesta fase | Já têm histórico próprio e não são necessários para estabilizar o bootstrap de `documentos` | Médio | `DO_NOT_TOUCH` |

## 6. Objetos explicitamente adiados

Objetos adiados para sprint específica, revisão de runtime ou reconciliação histórica:

- `documentos.historico_id`
- `idx_documentos_historico`
- `documentos.sha256_hash`
- `idx_documentos_sha256`
- qualquer DDL em `certificados_templates`
- qualquer DDL para `pasta_virtual.documento_id`
- qualquer tentativa de materializar `tipo_documento` ou `qualificacao_historico_id` em `documentos`
- qualquer correção da migration `0200`

## 7. Draft lógico da migration 0388

Draft lógico aprovado e agora **versionado** como `worker-airtrust/migrations/0388_documentos_canonical_schema.sql`:

```sql
-- 0388_documentos_canonical_schema.sql
-- Objetivo: estabilizar schema base de documentos em ambiente limpo e alinhar
-- índices seguros com a baseline real de produção.
-- Sem DML. Sem DROP. Sem rebuild. Sem backfill.

CREATE TABLE IF NOT EXISTS documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  funcionario_id INTEGER NOT NULL,
  nome_arquivo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  tamanho INTEGER NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  descricao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT DEFAULT NULL,
  empresa_id INTEGER DEFAULT 1,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

CREATE INDEX IF NOT EXISTS idx_documentos_empresa
  ON documentos(empresa_id);

CREATE INDEX IF NOT EXISTS idx_documentos_funcionario
  ON documentos(funcionario_id);

CREATE INDEX IF NOT EXISTS idx_documentos_deleted
  ON documentos(deleted_at);

CREATE INDEX IF NOT EXISTS idx_documentos_tipo
  ON documentos(tipo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documentos_funcionario_tipo
  ON documentos(funcionario_id, tipo)
  WHERE deleted_at IS NULL;
```

Decisões embutidas neste draft:

- não adicionar `historico_id`;
- não adicionar `sha256_hash`;
- não criar índice nominal `idx_documentos_uuid`;
- não tocar `pasta_virtual`;
- não tocar `certificados_templates`;
- não reencenar a lógica problemática de `0200`.

## 8. Testes necessários

Após a Sprint R04.4:

1. Teste local de schema limpo aplicando a `0388`.
2. Teste de idempotência: rodar a `0388` duas vezes, sem erro na segunda execução.
3. Teste estático confirmando que a `0388` não contém `DROP`, `UPDATE`, `DELETE`, `INSERT`, `REPLACE`, `UPSERT`, `ALTER TABLE` ou backfill.
4. Teste local garantindo existência de:
   - tabela `documentos`;
   - coluna `empresa_id`;
   - índices `idx_documentos_empresa`, `idx_documentos_funcionario`, `idx_documentos_deleted`, `idx_documentos_tipo`, `idx_documentos_funcionario_tipo`.
5. Teste estático garantindo que a migration não toca `pasta_virtual` nem `certificados_templates`.
6. Teste de regressão do bootstrap: o runtime ainda não deve ser removido nesta fase.
7. Após apply futuro: probe pós-migration em produção e smoke das rotas de certificados/pasta virtual.

## 9. Ordem segura futura

1. Validar a `0388` versionada em ambiente limpo local.
2. Revisar se `historico_id` e `sha256_hash` realmente merecem migration separada ou abandono explícito.
3. Aplicar a `0388` em staging aprovado.
4. Validar smoke funcional de certificados e pasta virtual.
5. Aplicar em produção via fluxo oficial de migrations.
6. Executar probe pós-migration.
7. Só então discutir remoção de `ensureDocumentosTableExists()`.

## 10. Critérios para remover bootstrap runtime

O bootstrap só pode sair quando:

- a `0388` estiver versionada e aplicada no ambiente-alvo;
- o probe pós-migration confirmar que `documentos` atende ao contrato escolhido;
- ficar explícito se `historico_id` será abandonado ou migrado separadamente;
- ficar explícito se `sha256_hash` permanecerá opcional ou ganhará migration separada;
- os fluxos de upload/listagem/stream/delete de certificados e pasta virtual passarem em smoke;
- não houver dependência operacional remanescente de `documento_id` em `pasta_virtual`.

## 11. Rollback

Como o desenho proposto é aditivo e conservador:

- rollback preferencial: reverter o versionamento da `0388` antes de aplicar remotamente;
- após aplicação futura, rollback de código deve preceder qualquer alteração estrutural complementar;
- como esta proposta evita `DROP`, `UPDATE`, `DELETE` e rebuild, o risco estrutural primário é criação redundante/indesejada de índice, não perda de dados;
- remoção do bootstrap **não** entra no mesmo passo da aplicação da `0388`.

## 12. Fora do escopo

- aplicar migration remota;
- aplicar a migration remotamente nesta sprint;
- alterar schema remoto;
- remover bootstrap runtime;
- criar `documento_id` em `pasta_virtual`;
- reconciliar a origem de `certificados_templates`;
- corrigir `0200_performance_composite_indexes.sql`;
- fazer backfill;
- tocar R2 real;
- alterar auth/RBAC/tenant;
- deployar Worker/API ou Pages.
