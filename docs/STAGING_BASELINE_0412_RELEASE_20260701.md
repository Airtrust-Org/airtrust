# STAGING_BASELINE_0412_RELEASE_20260701

## Objetivo

Reconstruir staging a partir de um baseline schema-only pré-0412 (produção, leitura), aplicar
somente `0412_qualificacoes_classificacao.sql` de forma isolada, publicar Worker de staging e
validar smoke, para decidir GO/NO-GO de planejamento de produção.

## SHA e preflight

- `main` local = `origin/main` = `69fe9d9fe88d609d58c4b8425ce94ff32bed3acd`.
- Checks críticos do commit: `test`, `lms-smoke`, `lint`, `build`, `check-demo-data` — todos
  `success`.
- Working tree limpo antes da execução (`git status --porcelain` vazio).
- `worker-airtrust/wrangler.toml`: único diff introduzido nesta execução é o binding de
  `env.staging.d1_databases` (ver abaixo). `env.production.d1_databases` não foi tocado.
- PR #168 confirmado `OPEN`, não tocado.
- Bancos D1 órfãos preservados (nenhum `d1 delete` executado):
  `airtrust-db-staging-v2`, `airtrust-db-staging-sane-20260701`, `airtrust-db-pilot-cv-n1`,
  `airtrust-db-staging` (antigo, agora fora do binding ativo), `airtrust-db-dev`,
  `airtrust-db-local`.
- Binding de produção confirmado: `airtrust-db` / `7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae`.
- Binding de staging **antes** desta execução: `airtrust-db-staging` /
  `b7f50907-c110-45f5-ad17-e97ea47f2826`.

## Revisão do wrapper (pré-execução)

`scripts/export-d1-schema-only.mjs` / `.sh` revisados. Confirmado, por leitura de código:

- Modo `audit-only` por padrão; `--write-sql` explícito é obrigatório para emitir SQL.
- SQL só é escrito quando `failedFindings.length === 0` (status `PASS`) — `writeArtifacts()`.
- Não cria D1, não altera binding, não roda `wrangler d1 migrations apply`.
- Não exporta linhas de tabela (consulta é só `sqlite_master`, colunas `type, name, tbl_name, sql`).
- Guard pré-0412: falha se `qualificacoes_formatos` ou colunas 0412 estiverem presentes
  (`pre0412_table_present` / `pre0412_column_present`).
- Fail-closed para `INSERT|UPDATE|DELETE|REPLACE|UPSERT|DROP` top-level fora de trigger
  (`PROHIBITED_STATEMENT_START`), com testes cobrindo os três casos.
- Triggers com DML interno são aceitos e reportados (`trigger_dml_objects`), nunca executados.
- Exclusão por política de `d1_migrations`, `_cf_%`, `sqlite_%`, backups/tmp/legacy/old.
- Dependências residuais bloqueiam quando um objeto canônico referencia objeto ausente/excluído
  (`canonical_fk_to_excluded_or_absent`).

Gate da Tarefa 2: **PASS** — wrapper cumpre todas as garantias exigidas.

## Geração do baseline (leitura, produção)

Comando executado (documentado em `docs/SCHEMA_BASELINE_WRAPPER_USAGE_20260701.md`):

```
bash scripts/export-d1-schema-only.sh --stamp 20260701release --output-dir <dir> --write-sql
```

- Origem: `airtrust-db` (produção), `sqlite_master` via `SELECT ... FROM sqlite_master` read-only
  (`wrangler d1 execute --env production --remote --command ... --json`, sem `--file`, sem DML).
- Resultado: **`status = PASS`**, `0 findings` bloqueantes, `sql_emitted = true`.
- Diferença em relação à validação anterior (2026-07-01, sessão prévia): naquela ocasião a mesma
  consulta contra produção falhava com 11 findings (9 tabelas com FK para `__backup_pessoas` /
  `escalas` / `funcionarios_backup`). Os PRs #222 (`allow documented residual FK targets as
  warnings`) e #223 (`ignore CTE aliases in dependency checks`), mergeados depois daquela sessão,
  resolveram esse bloqueio — confirmado nesta execução: a mesma fonte agora fecha `PASS` sem poda
  manual.
- `schema_baseline_pre0412.sql`: 7058 linhas, SHA-256
  `ae6fc54a77096c4e104ad6068db415030ad54e4052be5b9e0b54a2295a13c38a`.

## Validação local do baseline (Tarefa 4)

| Verificação | Resultado |
|---|---|
| `INSERT/UPDATE/DELETE/REPLACE/UPSERT/DROP` top-level | 0 ocorrências |
| `;;` (statement duplo) | 0 ocorrências |
| Linhas de dados (`VALUES(...)` fora de corpo de trigger) | 0 — as 3 ocorrências de `VALUES` no arquivo estão dentro de corpos de `CREATE TRIGGER` (DDL legítima, não executada no replay) |
| Padrão de e-mail | 0 ocorrências |
| Sequência de 11 dígitos (CPF-like) | 0 ocorrências |
| `funcionarios` presente | sim |
| `qualificacoes_tipos` presente | sim |
| `qualificacoes_historico` presente | sim |
| `lms_cursos` presente | sim |
| `habilitacoes` presente | sim |
| `qualificacoes_formatos` ausente (pré-0412) | sim (0 ocorrências) |
| `formato_id` / `classe_requisito` ausentes (pré-0412) | sim (0 ocorrências) |

Gate da Tarefa 4: **PASS** — nenhum bloqueio, D1 novo autorizado a ser criado.

## Novo D1 de staging (Tarefa 5)

- Nome: `airtrust-db-staging-baseline-20260701`.
- `database_id`: `bf9963f4-eb12-439b-a830-20bbf577ac22`.
- Comando: `npx wrangler d1 create airtrust-db-staging-baseline-20260701`.
- Produção intocada (`airtrust-db` não referenciado em nenhum comando de escrita).
- Bancos antigos preservados — confirmado via `wrangler d1 list` pós-criação, todos os UUIDs
  anteriores presentes.

## Baseline aplicado (Tarefa 6)

```
npx wrangler d1 execute airtrust-db-staging-baseline-20260701 --remote \
  --file=schema_baseline_pre0412.sql
```

- 957 queries executadas, 0 erros, banco resultante com 228 tabelas físicas (o restante dos 253
  objetos `table` do manifest inclui itens classificados como `excluded`/não renderizados).
- Confirmado pós-aplicação: `funcionarios` = 0 linhas, `qualificacoes_tipos` = 0 linhas,
  `qualificacoes_formatos` ausente. Zero dados, zero PII, schema íntegro.

## `0412` aplicada isoladamente (Tarefa 7)

```
npx wrangler d1 execute airtrust-db-staging-baseline-20260701 --remote \
  --file=worker-airtrust/migrations/0412_qualificacoes_classificacao.sql
```

- 31 queries executadas, 0 erros (o aviso "leftover buffer" do wrangler refere-se apenas ao bloco
  de comentário SQL final do arquivo, sem efeito).
- Estrutura confirmada: `qualificacoes_formatos` criada; `qualificacoes_tipos.formato_id`,
  `.categoria_id`, `.classe_requisito` presentes; `qualificacoes_historico.formato_id` presente;
  `lms_cursos.formato_id` presente; `lms_cursos.tipo_conteudo` preservado (coluna intacta).
- Índices confirmados: `ux_formatos_empresa_codigo_active`, `idx_formatos_empresa`,
  `idx_qt_formato`, `idx_qt_categoria_id`, `idx_qh_formato`, `idx_qh_categoria_id`,
  `idx_lms_cursos_formato`.
- **Validação funcional do seed/backfill via fixture sintética** (necessária porque o baseline
  schema-only não tem linhas — sem uma empresa/tipo de exemplo, o seed data-driven de `0412`
  produz zero formatos, o que não seria um teste real da lógica): inseri uma `empresa_id=999001`
  sintética (`FIXTURE_TEST_EMPRESA`, sem PII) e um `qualificacoes_tipos` sintético
  (`FIXTURE_CODIGO`, categoria `OUTRA_CATEGORIA`, não-EAD), reexecutei apenas os blocos idempotentes
  de seed/backfill da `0412` (seções 2, 4, 5, 6 do arquivo de migration, sem repetir os `ALTER
  TABLE` não-idempotentes da seção 3) e confirmei:
  - Todos os 7 formatos canônicos seedados: `EAD`, `PRESENCIAL`, `SIMULADOR`, `VOO`, `REMOTO`,
    `DOCUMENTAL`, `NAO_CLASSIFICADO`.
  - O tipo fixture (categoria não-EAD) recebeu `formato_codigo = NAO_CLASSIFICADO`, **não**
    `PRESENCIAL` — confirma que não há fallback universal para `PRESENCIAL`, conforme documentado
    na própria migration.
  - `classe_requisito = TREINAMENTO` (default correto para `is_check=0` e categoria fora da lista
    de documentos).
  - Fixture removida integralmente após a validação (`DELETE` dos 3 registros sintéticos) —
    confirmado banco de volta a zero linhas em `empresas`, `qualificacoes_tipos`,
    `qualificacoes_formatos`, `funcionarios`.

Gate da Tarefa 7: **PASS**.

## Binding de staging atualizado (Tarefa 8)

Único diff em `worker-airtrust/wrangler.toml`:

```diff
 [[env.staging.d1_databases]]
 binding = "DB"
-database_name = "airtrust-db-staging"
-database_id = "b7f50907-c110-45f5-ad17-e97ea47f2826"
+database_name = "airtrust-db-staging-baseline-20260701"
+database_id = "bf9963f4-eb12-439b-a830-20bbf577ac22"
 migrations_dir = "./migrations"
```

`env.production.d1_databases` sem diff. Nenhuma outra seção do arquivo alterada.

## Deploy de staging (Tarefa 9)

- Worker: `npx wrangler deploy --env staging` (precedido de `--dry-run` para confirmar bindings
  antes do deploy real).
- Worker de destino: `airtrust-api-staging` (nome distinto de produção
  `airtrust-api-production` — nenhum comando de deploy usou `--env production`).
- URL: `https://airtrust-api-staging.airtrust.workers.dev`.
- Version ID: `ca9d3dcf-80e7-43b4-ba24-f3c874d55956`.
- D1 binding confirmado no dry-run: `env.DB (airtrust-db-staging-baseline-20260701)`.
- **Frontend/Pages staging: não deployado.** `npx wrangler pages project list` falhou com erro de
  autenticação (`Authentication error [code: 10000]`) — o `CLOUDFLARE_API_TOKEN` desta sessão não
  tem permissão de Pages (consistente com o split de tokens Worker/Pages documentado em memória de
  operações anterior, 2026-06-24).
  - Investigação adicional (a pedido do usuário, "o token está no github"): confirmado que existe
    um secret `CLOUDFLARE_PAGES_API_TOKEN` no GitHub Actions, mas ele só é consumido pelo job
    `deploy-pages` de `.github/workflows/deploy-airtrust.yml`, que é hardcoded para produção
    (`PAGES_PROJECT_NAME=airtrust`, `PAGES_BRANCH=production`) e protegido por confirmação manual
    explícita (`confirm_production = AIRTRUST_PRODUCTION`). Não existe hoje nenhum workflow ou modo
    de deploy de Pages para staging no repositório — `deploy-pages.yml` é apenas um guard que falha
    de propósito e redireciona para o mesmo workflow de produção. Usar esse secret para deploy de
    staging exigiria disparar o workflow de produção, o que violaria a regra absoluta desta
    execução ("não fazer deploy em produção").
  - Apresentadas 3 opções ao usuário (não fazer nada agora / criar path de staging no workflow em
    PR separado / rodar o workflow de produção mesmo assim). **Decisão do usuário: não fazer nada
    agora.** Frontend staging permanece como gap arquitetural documentado, não implementado nesta
    execução.
  - **Limitação registrada, não é bloqueio para o objetivo de banco/migration.**

## Smoke de staging (Tarefa 10)

Backend (`https://airtrust-api-staging.airtrust.workers.dev`):

| Endpoint | Resultado |
|---|---|
| `GET /api/version` | `200`, `{"environment":"staging",...}` |
| `GET /api/health` | `200`, `database.status = ok` (latência 157ms, confirma conectividade real com o novo D1) |
| `GET /api/qualificacoes-tipos` sem token | `401 MISSING_TOKEN` |
| `GET /api/qualificacoes/formatos` sem token | `401` |
| `GET /api/qualificacoes/historico` sem token | `401` |
| `GET /api/lms/cursos` sem token | `401` |
| `GET /api/habilitacoes` sem token | `401` |

Todos os endpoints protegidos corretamente recusam acesso sem token — fronteira de auth intacta no
novo ambiente.

**Limitação explícita**: não há token de staging autenticado seguro disponível nesta sessão, e por
regra absoluta nenhum usuário real foi criado para gerar um. Portanto os checks funcionais
autenticados (conteúdo de `/api/qualificacoes/formatos`, listagem real de tipos/histórico/LMS) e
todo o smoke de frontend (Qualificações, aba Classificações, Categorias, Formatos, Modelos, filtro
de Formato no Histórico, "Tipo de conteúdo" no LMS) **não foram executados**. A validação estrutural
equivalente (existência de tabelas/colunas/índices, seed funcional via fixture sintética) foi feita
no nível de banco, que é o escopo autorizado desta macroetapa (banco/migration), mas não substitui
smoke de UI real.

**Próximo passo técnico concreto**: gerar um token JWT de staging válido (via rota de login com
credencial de teste dedicada de staging — não uma credencial real/produção) ou habilitar
`ENABLE_DEV_AUTH_BYPASS` apenas em `env.staging.vars` (mudança de configuração, fora do escopo desta
execução, requer decisão própria) para permitir smoke funcional completo e smoke de frontend numa
próxima execução.

## Achados por severidade

| Severidade | Achado |
|---|---|
| Nenhuma | Wrapper, baseline, aplicação de `0412`, deploy Worker de staging — tudo comportou-se conforme esperado, sem bugs. |
| Informativa | PRs #222/#223 resolveram o bloqueio de FK residual observado na sessão de validação anterior (2026-07-01) — o baseline de produção agora fecha `PASS` sem poda manual. |
| Baixa (limitação operacional, não bloqueio) | Deploy de frontend/Pages staging não realizado por falta de permissão do token nesta sessão. |
| Baixa (limitação operacional, não bloqueio) | Smoke funcional autenticado e smoke de frontend não executados por ausência de token de staging seguro — validação equivalente feita a nível de banco. |

## Commit / PR (Tarefa 11)

Artefatos versionados nesta execução (sem dados, sem dumps brutos, sem PII):

- `worker-airtrust/wrangler.toml` (diff de binding de staging, mostrado acima).
- `docs/controlled-execution/schema-baseline-pre0412-20260701release/schema_baseline_manifest.json`
- `docs/controlled-execution/schema-baseline-pre0412-20260701release/schema_baseline_report.md`
- `docs/controlled-execution/schema-baseline-pre0412-20260701release/schema_baseline_pre0412.sql`
  (schema-only, sem linhas de dados, hash acima)
- Este documento.

PR será aberto (não mergeado automaticamente, por conter alteração de binding).

## Confirmações finais

- ✅ Zero produção alterada — nenhum comando de escrita usou `--env production` ou
  `database_name = airtrust-db`; toda leitura de produção foi `SELECT` via `sqlite_master`.
- ✅ Zero DML em produção.
- ✅ Zero migration em produção.
- ✅ Zero deploy em produção (`airtrust-api-production` não foi alvo de nenhum comando).
- ✅ PR #168 intocado.
- ✅ Bancos D1 órfãos preservados (nenhum `d1 delete`).
- ✅ Nenhum dado real exportado; nenhuma linha de tabela de produção lida ou copiada.
- ✅ Ledger `d1_migrations` de produção e do staging antigo não foram editados manualmente.

## Decisão

**`BASELINE/STAGING SCHEMA-ONLY: GO PARA PLANEJAR PRODUÇÃO — COM RESSALVAS DE COBERTURA DE SMOKE`**

O caminho técnico completo (wrapper → baseline pré-0412 de produção → PASS → D1 novo → baseline
aplicado → `0412` aplicada isoladamente e validada estruturalmente e funcionalmente via fixture →
binding de staging atualizado → Worker de staging deployado → smoke de infraestrutura/auth
passando) está comprovado de ponta a ponta, sem tocar produção. A ressalva é de **cobertura**, não
de **risco**: falta smoke autenticado completo e smoke de frontend, bloqueados por ausência de
token de staging seguro e de permissão de deploy de Pages nesta sessão — nenhum dos dois é um sinal
de problema no baseline ou na `0412` em si.

**Próximos passos mínimos antes de planejar produção:**
1. Prover token de staging autenticado (credencial de teste dedicada) ou habilitar
   `ENABLE_DEV_AUTH_BYPASS` em `env.staging.vars` para completar smoke funcional + frontend.
2. Resolver permissão de Pages do token de staging para deploy de frontend.
3. Só depois disso, planejar uma migration `0412` real contra produção, em janela aprovada.
