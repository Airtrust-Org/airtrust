# AirTrust Data Integrity Guardrails Onda 0/1

## Escopo

Esta etapa implementa apenas guardrails read-only, testes, CI seguro e documentacao. Nao inclui runtime guards de Onda 2, migrations de Onda 3, deploy, DML ou qualquer escrita em producao.

Arquivos principais:

- `scripts/integrity/invariants.sql`
- `scripts/integrity/run-integrity.mjs`
- `scripts/integrity/baseline.example.json`
- `scripts/check-duplicate-migrations.mjs`
- `scripts/check-operational-sql-sources.mjs`
- `scripts/validation/data-quality-checks-readonly.sql`
- `scripts/validation/run-data-quality-local.sh`

## Problema R0

O detector legado consultava nomes driftados como `frms_jornadas`, `simulador_sessoes` e `simulador_sessao_participantes`. O schema local confirmado em `2026-06-17` mostra outra realidade:

- `frms_jornada` existe; `frms_jornadas` nao existe.
- `manobras` existe; `cadastro_manobras` nao existe.
- `sessoes_simulador` existe como `VIEW` sobre `simulador_agendamentos`.
- `sessoes_participantes` existe; `simulador_sessao_participantes` nao existe.
- `lms_cursos` e `lms_matriculas` nao aparecem no snapshot D1 local usado nesta rodada.

Por isso o detector legado foi reduzido a um aviso de deprecacao e o wrapper antigo agora delega explicitamente para o novo runner.

## Runner fail-closed

O runner em `scripts/integrity/run-integrity.mjs` agora:

- aceita apenas `SELECT`;
- ignora comentarios ao procurar palavras proibidas;
- rejeita DML e DDL;
- falha quando um check obrigatorio referencia tabela ou coluna inexistente;
- permite `SKIPPED_SCHEMA_UNCONFIRMED` apenas para checks marcados como opcionais;
- retorna JSON estavel com `checks`, `violations`, `summary` e `failOnSeverity`;
- usa `--fail-on-severity P0|P1|NONE`, com default `P0`.

Com isso:

- `integrity:ci` falha somente em `P0`;
- `P1` continua aparecendo no JSON como `FAILED`, mas pode operar como warning;
- erros de schema obrigatorio continuam fail-closed.

## Checks cobertos

- `I1`: modelo ativo ou em uso sem manobras.
- `I1b`: canario de volume de `modelos_sessao_manobras`.
- `I2`: ficha final sem manobras.
- `I2b`: ficha final com manobra sem resultado ou `NAO_REALIZADA`.
- `I3b`: ordem duplicada por modelo.
- `I4`: relacao modelo-manobra cross-tenant.
- `I5`: qualificacao cross-tenant ou status final sem data.
- `I6`: LMS matricula ativa sem curso valido.
- `I7`: FRMS jornada sem minimos ou duplicada por `tripulante_id + data + origem`.
- `I8`: escala com alocacao orfa ou duplicada.
- `I10`: residuos `_new`, `_backup_*`, `_temp`, `_v`.

## Skips esperados por schema

No snapshot local desta rodada:

- `I4` fica `SKIPPED_SCHEMA_UNCONFIRMED` porque `manobras.empresa_id` nao existe.
- `I6` fica `SKIPPED_SCHEMA_UNCONFIRMED` porque `lms_cursos` e `lms_matriculas` nao existem nesse fixture.

Os demais checks usam apenas estrutura confirmada localmente.

## Execucao local confirmada em 2026-06-17

Base usada: `worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/a36f84ea60804f30bb0c7f7cad9f5336a6cca0165abdab8b9241d93dbf0b6006.sqlite`

Resultado observado com baseline de exemplo:

- `I1`: `FAILED` com 1 modelo sem manobras (`A139-I-11/12`).
- `I1b`: `FAILED` no baseline de exemplo (`615 < 1000`), como warning `P1`.
- `I5`: `FAILED` com historicos cross-tenant no fixture local.
- `I10`: `FAILED` com residuos `_backup_qh_tmp`, `qualificacoes_tipos_backup_0063`, `qualificacoes_tipos_backup_20251128` e `qualificacoes_historico_v`.

Esses achados foram documentados; nenhum dado foi corrigido automaticamente nesta fase.

## Como rodar

Snapshot local auto-descoberto:

```bash
npm run integrity:local
```

Banco explicito:

```bash
AIRTRUST_INTEGRITY_DB=/caminho/para/fixture.sqlite npm run integrity:local
```

Com baseline real aprovado:

```bash
AIRTRUST_INTEGRITY_BASELINE=/caminho/para/baseline.json npm run integrity:ci
```

Compatibilidade legada:

```bash
AIRTRUST_ALLOW_DATA_QUALITY_RUN=YES AIRTRUST_DATA_QUALITY_TARGET=local npm run data-quality:local
```

## O que bloqueia CI

- qualquer `P0` em `integrity:ci`;
- schema obrigatorio ausente para um check mandatory;
- nova migration com prefixo numerico duplicado fora da allowlist historica;
- novo script ou migration com DML sem marcador de fonte.

Marcadores aceitos para SQL operacional:

- `source_reference:`
- `operational_decision:`
- `dry_run_required:`
- `rollback_plan_required:`

## Backlog

Onda 2:

- `assertModeloTemManobras`
- `assertFichaCompleta`
- `assertSameTenant`
- `assertOrdemUnica`
- protecao das rotas de escrita de Simuladores
- smoke read-only pos-deploy

Onda 3:

- `UNIQUE(modelo_id, ordem)` em `modelos_sessao_manobras`
- avaliacao de `empresa_id` em tabelas de ligacao
- politica para residuos `_new`, `_backup_*`, `_temp`, `_v`
- snapshot, dry-run e rollback antes de qualquer migration
- execucao real somente com Codex 5.5 e autorizacao explicita

## Declaracao operacional

Nao houve DML, migration, alteracao de banco persistente, deploy, nem mudancas operacionais em SIGVOOS ou FRMS nesta etapa.
