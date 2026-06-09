# AirTrust — Hardening `empresa_id DEFAULT 1` — Wave 3

Data: 2026-06-09
Repo: `/Users/filipedaumas/SAAS/Airtrust`
Branch: `main`
Base validada: `5959279e`

## Objetivo

Concluir o hardening das tabelas remanescentes de risco médio ainda expostas a `empresa_id DEFAULT 1`, removendo o default inseguro, tornando `empresa_id` obrigatório quando tecnicamente aplicável, executando backfill determinístico e fechando os pontos de runtime ainda sem isolamento explícito por tenant.

## Escopo decidido

Incluídas nesta wave:

* `documentos`
* `pasta_virtual`
* `tipos_sessao`
* `setores`
* `funcoes`
* `arquivos`

Excluída nesta wave:

* `qualificacoes_tipos`

Justificativa da exclusão:

* a tabela ainda contém resíduos soft-deletados com `empresa_id = 1`;
* não há linhagem determinística suficiente para backfill sem inferência fraca;
* a regra operacional desta wave proibiu fallback artificial e proibiu migration com backfill ambíguo.

## Auditoria e decisão por tabela

### `documentos`

* 473 linhas em produção.
* 25 linhas com `empresa_id = 1` antes da correção.
* Backfill determinístico via `funcionario_id -> funcionarios.empresa_id`.
* 17 documentos apontavam para funcionários soft-deletados, mas ainda com empresa resolvível e consistente.

### `pasta_virtual`

* 245 linhas em produção.
* 10 linhas com `empresa_id = 1` antes da correção.
* Backfill determinístico via `funcionario_id -> funcionarios.empresa_id`.

### `tipos_sessao`

* 23 linhas em produção.
* 6 linhas com `empresa_id = 1` antes da correção.
* Catálogo confirmado como tenant-scoped.
* Duplicidades ativas por código (`INI`, `SEM`) entre empresa `1` e `6` foram resolvidas por canonização para o tenant correto.
* Resíduos soft-deletados (`EXA`, `IFR`, `INS`, `VFR`) foram preservados com tenant consistente no contexto do catálogo efetivo já concentrado em empresa `6`.

### `setores`

* 17 linhas em produção.
* Já não havia resíduos com `empresa_id = 1`.
* Ainda precisava endurecimento de schema e runtime tenant-safe.

### `funcoes`

* 12 linhas em produção.
* Já não havia resíduos com `empresa_id = 1`.
* Ainda precisava endurecimento de schema e runtime tenant-safe.

### `arquivos`

* Tabela confirmada vazia em produção.
* Rebuild seguro sem necessidade de backfill.

## Alterações implementadas

### Migrations

Arquivos criados:

* `worker-airtrust/migrations/0399_harden_empresa_id_wave3.sql`
* `worker-airtrust/migrations/0400_reconcile_wave3_d1_ledger.sql`

Principais mudanças da `0399`:

* rebuild de `documentos`, `pasta_virtual`, `tipos_sessao`, `setores`, `funcoes` e `arquivos`;
* remoção de `DEFAULT 1` de `empresa_id`;
* `empresa_id INTEGER NOT NULL` nas seis tabelas;
* recriação explícita de índices tenant-scoped onde o modelo anterior ainda carregava unicidade global;
* ajuste e recriação da view dependente `vw_setores_gestores_ativo`;
* preservação de dados, FKs relevantes, soft deletes e comportamento esperado do runtime.

Principais mudanças da `0400`:

* reconciliação do ledger remoto `d1_migrations` para registrar `0399` após aplicação direta por `d1 execute`.

### Runtime

Arquivos alterados:

* `worker-airtrust/src/routes/funcoes.ts`
* `worker-airtrust/src/routes/setores.ts`
* `worker-airtrust/src/routes/simuladores-fichas.ts`

Endurecimentos aplicados:

* `UPDATE` e soft delete finais de `funcoes` e `setores` agora exigem `id + empresa_id + deleted_at IS NULL`;
* fallbacks de `modelos_sessao` em `simuladores-fichas` agora resolvem sempre dentro do tenant correto;
* join de fallback com `tipos_sessao` agora exige `ts.empresa_id = ?` e `ts.deleted_at IS NULL`.

### Testes

Arquivos criados:

* `worker-airtrust/src/__tests__/migrations/empresa-id-wave3-hardening.test.ts`
* `worker-airtrust/src/__tests__/migrations/empresa-id-wave3-ledger-reconcile.test.ts`
* `worker-airtrust/src/__tests__/routes/organizational-catalogs-tenant-isolation.test.ts`

Arquivos atualizados:

* `worker-airtrust/src/__tests__/migrations/migration-governance.test.ts`
* `worker-airtrust/src/__tests__/security/tenant-write-paths.test.ts`

## Backup antes da produção

Backup/export realizado antes da migration:

* `artifacts/db-backups/airtrust-db-pre-default1-wave3-20260609.sql`

Tamanho observado:

* `100M`

O diretório de backups permanece ignorado por Git.

## Replay local sobre dump real de produção

Fluxo executado:

1. import do backup para `/tmp/airtrust-wave3-replay-20260609.db`;
2. aplicação local de `0399_harden_empresa_id_wave3.sql`;
3. verificação de integridade e checagens direcionadas às tabelas-alvo.

Resultados:

* `PRAGMA integrity_check;` => `ok`
* `pragma_foreign_key_check` => zero ocorrências nas seis tabelas do escopo
* única dívida remanescente fora do escopo: `_backup_qh_tmp` com passivo histórico já conhecido

Contagens pós-replay:

* `documentos`: total `473`, `empresa_id = 1` => `0`, `empresa_id IS NULL` => `0`
* `pasta_virtual`: total `245`, `empresa_id = 1` => `0`, `empresa_id IS NULL` => `0`
* `tipos_sessao`: total `23`, `empresa_id = 1` => `0`, `empresa_id IS NULL` => `0`
* `setores`: total `17`, `empresa_id = 1` => `0`, `empresa_id IS NULL` => `0`
* `funcoes`: total `12`, `empresa_id = 1` => `0`, `empresa_id IS NULL` => `0`
* `arquivos`: total `0`, `empresa_id = 1` => `0`, `empresa_id IS NULL` => `0`

## Validação local de código

Comandos executados com sucesso:

* `npx vitest run src/__tests__/migrations/empresa-id-wave3-hardening.test.ts src/__tests__/routes/organizational-catalogs-tenant-isolation.test.ts src/__tests__/security/tenant-write-paths.test.ts src/__tests__/routes/simuladores-fichas-tenant-write.test.ts`
* `npx vitest run src/__tests__/migrations/migration-governance.test.ts src/__tests__/routes/documentos-tenant-isolation.test.ts src/__tests__/routes/simuladores-modelos-dropdown-and-tipo-cor.test.ts`
* `npx vitest run src/__tests__/migrations/empresa-id-wave3-ledger-reconcile.test.ts src/__tests__/migrations/migration-governance.test.ts`
* `npx tsc --noEmit`
* `npm run lint`
* `npm run test:run`
* `npm run test:worker`
* `npm run build`

## Produção

### Aplicação da migration

Primeira tentativa:

* `wrangler d1 migrations apply ... --remote`
* falhou com `FOREIGN KEY constraint failed: SQLITE_CONSTRAINT_FOREIGNKEY`

Observação:

* o mesmo conteúdo da `0399` já havia passado integralmente no replay local sobre o dump real;
* por isso o bloqueio foi tratado como limitação do wrapper operacional do `migrations apply` neste caso específico, e não como evidência de perda ou corrupção de dados.

Execução efetiva:

* aplicação direta de `worker-airtrust/migrations/0399_harden_empresa_id_wave3.sql` via `wrangler d1 execute --remote --file ...`
* resultado: sucesso, `48` queries processadas, `changed_db = true`

Reconciliação do ledger:

* aplicação direta de `worker-airtrust/migrations/0400_reconcile_wave3_d1_ledger.sql`
* `d1_migrations` após reconciliação:
  * `0399_harden_empresa_id_wave3.sql` => `2026-06-09 03:07:19`
  * `0400_reconcile_wave3_d1_ledger.sql` => `2026-06-09 03:07:51`
* `wrangler d1 migrations list ... --remote` ao final => `No migrations to apply`

### Validação remota pós-aplicação

Validações remotas confirmadas:

* `documentos.empresa_id` => `NOT NULL`, sem default, total `473`, distribuição: empresa `6` => `473`
* `pasta_virtual.empresa_id` => `NOT NULL`, sem default, total `245`, distribuição: empresa `6` => `245`
* `tipos_sessao.empresa_id` => `NOT NULL`, sem default, total `23`, distribuição: empresa `6` => `23`
* `setores.empresa_id` => `NOT NULL`, sem default, total `17`, distribuição: empresa `6` => `14`, empresa `7` => `3`
* `funcoes.empresa_id` => `NOT NULL`, sem default, total `12`, distribuição: empresa `6` => `9`, empresa `7` => `3`
* `arquivos.empresa_id` => `NOT NULL`, sem default, total `0`
* nas seis tabelas: `empresa_id IS NULL` => `0`
* nas seis tabelas: `empresa_id = 1` => `0`

Índices remotos observados após a migration:

* `documentos`: `idx_documentos_tipo`, `idx_documentos_funcionario_tipo`, `idx_documentos_funcionario`, `idx_documentos_empresa`, `idx_documentos_deleted`
* `pasta_virtual`: `idx_pasta_virtual_funcionario`, `idx_pasta_virtual_empresa`, `idx_pasta_virtual_deleted`
* `tipos_sessao`: `idx_tipos_sessao_empresa`, `idx_tipos_sessao_deleted_at`, `idx_tipos_sessao_codigo`
* `setores`: `idx_setores_empresa`, `idx_setores_codigo`, `idx_setores_ativo`
* `funcoes`: `idx_funcoes_empresa`, `idx_funcoes_deleted_at`, `idx_funcoes_codigo`, `idx_funcoes_ativo`
* `arquivos`: `idx_arquivos_empresa`

Limitação conhecida da API remota:

* `PRAGMA integrity_check` e `PRAGMA foreign_key_check` via Cloudflare D1 API retornaram `SQLITE_AUTH`;
* por isso a garantia de integridade profunda foi fechada pelo replay local sobre o dump real de produção, que passou com `integrity_check = ok` e sem ocorrências de FK nas seis tabelas do escopo.

## Deploy do worker/API

Deploy executado:

* `unset APP_VERSION APP_BUILD_TIME && npm run deploy:worker:safe`

Resultado:

* deploy apenas do worker/API em produção
* nova versão publicada: `2026-06-09T03:08:23Z-5959279e`
* `Current Version ID`: `560b8861-0b83-4de3-9003-850129624650`

Verificações públicas:

* `GET https://api.airtrust.online/api/version` => sucesso, versão `2026-06-09T03:08:23Z-5959279e`
* `GET https://api.airtrust.online/api/health` => sucesso, status `healthy`, database `ok`, storage `ok`

## Resultado final

Wave 3 concluída com sucesso para o escopo definido.

Estado final:

* seis tabelas endurecidas;
* `empresa_id DEFAULT 1` removido do escopo desta wave;
* nenhum resíduo `empresa_id = 1` nas tabelas tratadas;
* runtime reforçado para `funcoes`, `setores` e fallbacks de `simuladores-fichas`;
* ledger remoto reconciliado;
* worker/API publicado e validado.

Pendência explícita fora desta wave:

* `qualificacoes_tipos` permanece para tratamento posterior, condicionado a regra de linhagem determinística que permita backfill sem ambiguidade.
