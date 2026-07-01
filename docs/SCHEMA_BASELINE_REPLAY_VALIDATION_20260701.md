# SCHEMA_BASELINE_REPLAY_VALIDATION_20260701

## Objetivo

Validar, após o merge do PR #221 (`24d497d0115c25cfd01f16e7600ffd1a01eeecd4`), que o wrapper
schema-only (`scripts/export-d1-schema-only.sh` / `.mjs`) produz um baseline replayável, seguro e
auditável, e avaliar prontidão para reconstrução de staging/multiempresa.

## Escopo e método

- Nenhuma escrita em produção. Nenhuma migration. Nenhum DML em banco real. Nenhum deploy.
- Fonte de leitura: `sqlite_master` de `airtrust-db` (produção) via `wrangler d1 execute --command
  SELECT ... --json` (somente leitura, sem `--file`) e de `airtrust-db-staging` (staging) pelo mesmo
  método, ambos sem escrita.
- Todos os artefatos de exportação/replay foram gerados fora do repositório
  (`/private/tmp/.../scratchpad/schema-baseline/`), não em `docs/controlled-execution/`.
- Replay executado com `sqlite3` local (banco de arquivo temporário, descartável), não D1.

## Resultado 1 — Testes/lint/typecheck do wrapper (recém-mergeado)

- `node --test scripts/__tests__/export-d1-schema-only.test.mjs`: **20/20 PASS**.
- `npm run lint`: **PASS** (api-base, tracked-secrets, auth-boundaries, empresa-default1,
  duplicate-migrations, operational-sql-sources).
- `npx tsc --noEmit`: **PASS**, sem output.
- Confirmado fail-closed para DML/`DROP` top-level fora de trigger (testes `insert/update/drop
  outside trigger blocks`).
- Confirmado que triggers com DML interno são aceitos **apenas como corpo de trigger** e reportados
  em `trigger_dml_objects` (teste `canonical trigger with internal dml is allowed and reported`).

## Resultado 2 — Exportação schema-only contra produção (audit-only, leitura)

Comando:

```
bash scripts/export-d1-schema-only.sh --stamp 20260701validation --output-dir <tmp>
```

(caminho documentado em `docs/SCHEMA_BASELINE_WRAPPER_USAGE_20260701.md`, sem `--write-sql`).

- Origem: `airtrust-db` (produção), `sqlite_master` via `SELECT` read-only.
- Resultado: **`status = FAIL`**, 11 findings bloqueantes, `sql_emitted = false`.
- O guard pré-0412 passou (nenhum objeto `qualificacoes_formatos`/coluna 0412 presente em
  produção — esperado, `0412` ainda não foi aplicada lá).
- Os 11 findings são **reais, não são bug do wrapper**: 9 tabelas canônicas (`certificados_templates`,
  `credenciais`, `hospedagem`, `hospedagens`, `pessoas_auditoria_acessos`, `pessoas_papeis`,
  `registros_frms`, `sessoes_treinamento`, `solicitacoes_lgpd`) mantêm FKs apontando para tabelas
  ausentes (`__backup_pessoas`, `escalas`, `funcionarios_backup`) — remanescentes de tabelas de
  backup/renomeação nunca limpas —, mais 2 objetos dependentes (`trg_apply_reclassification`,
  `vw_tripulante_operacional`).
- A mesma exportação repetida contra `airtrust-db-staging` (staging) produziu **os mesmos 11
  findings**, confirmando que é drift estrutural real replicado entre ambientes, não ruído de uma
  fonte específica.
- O wrapper corretamente recusou emitir `schema_baseline_pre0412.sql` nesse estado — comportamento
  fail-closed funcionando como projetado.

## Resultado 3 — Replay de validação (dataset podado, apenas para prova de mecanismo)

Como a exportação real falhou por dívida de schema pré-existente (não por defeito do wrapper), foi
construído um dataset de validação **podado** (mesma captura real de `sqlite_master` de staging,
removendo apenas os 9 objetos bloqueantes + seus índices/triggers diretamente dependentes — 41
objetos de 938) para provar mecanicamente que o wrapper produz SQL replayável quando o schema fonte
está estruturalmente íntegro. Este dataset podado **não é um baseline oficial** — é evidência de
mecanismo.

```
bash scripts/export-d1-schema-only.sh --input-json <pruned.json> --stamp 20260701pruned \
  --output-dir <tmp> --write-sql
```

- Resultado: **`status = PASS`**, 0 findings, `sql_emitted = true`.
- Replay: `sqlite3 replay.sqlite < schema_baseline_pre0412.sql` — **exit 0, zero erros**.
- `PRAGMA foreign_key_check` no banco replayado: **vazio (sem violações)**.
- `PRAGMA integrity_check`: **`ok`**.
- Contagem de objetos no banco replayado: 211 tabelas, 739 índices, 35 triggers, 8 views.
- Verificação programática de ordem de dependência (cada índice/trigger criado só depois da tabela
  base já existir no stream SQL): **0 violações** em 883 statements.
- `qualificacoes_formatos` ausente no banco replayado — confirma consistência com estado pré-0412.
- Áreas sensíveis presentes e íntegras no replay: `qualificacoes_*` (7 tabelas + view
  `qualificacoes_historico_v` consultável), LMS (7 tabelas `lms_%`), FRMS (19 tabelas `frms_%`),
  Escalas (17 tabelas `escala%`), RBAC/empresa (`papeis`, `usuarios`, `usuarios_empresas`,
  `empresas`, `empresa_config`, `funcionarios`).
- Triggers com DML interno (`trg_qualificacoes_historico_set_tipo`, `update_papeis_updated_at`)
  presentes como objetos no banco replayado; nenhuma linha foi inserida (`SELECT count(*) FROM
  qualificacoes_historico` = 0) — confirma que o corpo do trigger não é executado no replay
  schema-only.

## Achado relevante (não um bug do wrapper): coluna `funcionarios.nome_guerra` foi renomeada

O schema físico atual (capturado ao vivo) tem a coluna `funcionarios.guerra` (não `nome_guerra`), e
a view `qualificacoes_historico_v` atual **não referencia** `nome_guerra` nem `guerra` diretamente
neste ponto — ambas foram normalizadas em migrations posteriores (`0114_rename_funcionarios_columns.sql`
e ajustes de view subsequentes). Isso **confirma e reforça o diagnóstico da ADR anterior**
(`docs/MIGRATION_CHAIN_DR_STAGING_NO_GO_20260701.md`): o schema físico atual é internamente
consistente e replayável como um todo — o problema está apenas no *replay sequencial migration a
migration* a partir de `0000`, não no estado atual em si. Isso é evidência direta de que a
estratégia recomendada (Opção B/C — baseline a partir de snapshot do schema atual) é tecnicamente
sólida: o snapshot atual replaya sem erro, ao contrário da cadeia histórica completa.

## Achados por severidade

| Severidade | Achado | Classificação |
|---|---|---|
| Alta (arquitetura, não bloqueante para o wrapper) | 9 tabelas canônicas com FK para tabelas de backup ausentes (`__backup_pessoas`, `escalas`, `funcionarios_backup`) impedem `status = PASS` num baseline real de produção/staging sem poda | Divergência real de schema (dívida técnica histórica), não bug do wrapper. Bloqueia `--write-sql` oficial até decisão de política (excluir essas tabelas do baseline por regra explícita, ou migration de limpeza das FKs órfãs — não implementado nesta execução, fora de escopo). |
| Informativa | `funcionarios.guerra` (não `nome_guerra`) — coluna renomeada, view atual não depende do nome antigo | Confirma que schema atual é consistente; reforça validade da estratégia de baseline por snapshot. |
| Nenhuma | Wrapper (testes, lint, typecheck, fail-closed DML, trigger DML, ordenação, FK, replay) | Sem bugs encontrados. |

## Prontidão para staging/multiempresa

- O **mecanismo** do wrapper está comprovado: replay limpo, ordenado, sem DML, com FKs e triggers
  preservados, cobrindo Qualificações (incluindo pré-0412), LMS, FRMS, Escalas e RBAC/empresa.
- O **baseline real de produção** ainda não atinge `status = PASS` sem poda, por causa do achado de
  severidade alta acima. Isso é um gap de política/dado, não de código do wrapper.
- Próximo passo concreto: decisão explícita (fora desta execução) sobre as 9 tabelas com FK órfã —
  (a) adicioná-las à lista de exclusão por política documentada, com justificativa registrada em
  `docs/SCHEMA_OBJECT_CANONICALITY_AUDIT_20260701.md`, ou (b) migration de limpeza que remove/repointa
  as FKs órfãs (requer autorização e ambiente de teste antes de qualquer aplicação em produção).
  Só depois disso um `--write-sql` oficial contra produção deve ser tentado.

## Sem alteração de código

Nenhum arquivo do wrapper, testes, docs de uso ou scripts de lint foi alterado nesta execução. Este
documento e o de replay são os únicos artefatos novos versionados.
