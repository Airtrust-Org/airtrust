# AirTrust Data Quality Execution Guide v0.5

Data: 2026-06-02

## Objetivo

Orientar a execucao segura dos checks de data quality antes da segunda empresa real. Este guia nao autoriza execucao remota por Codex nem alteracao de dados.

## Artefatos

- Catalogo: `docs/AIRTRUST_DATA_QUALITY_CHECKS_v0_5.md`
- Runbook: `docs/AIRTRUST_DATA_QUALITY_RUNBOOK_v0_5.md`
- SQL read-only: `scripts/validation/data-quality-checks-readonly.sql`
- Validador estatico: `scripts/validation/validate-data-quality-sql.sh`
- Runner local seguro: `scripts/validation/run-data-quality-local.sh`

## Politica de Execucao

- Executar somente em `local` ou `staging`.
- Executar apenas quando `AIRTRUST_ALLOW_DATA_QUALITY_RUN=YES`.
- `AIRTRUST_DATA_QUALITY_TARGET` deve ser `local` ou `staging`.
- `production` e qualquer DB remoto sao proibidos.
- Nao usar `wrangler d1 execute --remote`.
- Nao salvar dumps, tokens, cookies, PII ou resultados sensiveis no repositorio.
- O runner local trabalha com copia temporaria do SQLite local/staging e imprime apenas resumo agregado.
- Se o banco local/staging nao estiver configurado, o runner encerra com `SKIPPED_DATA_QUALITY_RUN`.

## Validacao Estatica do SQL

Antes de qualquer execucao operacional, validar que o arquivo permanece read-only:

```bash
bash scripts/validation/validate-data-quality-sql.sh
npm run validate:data-quality-sql
```

Aceite:

- nenhum comando proibido encontrado;
- nenhum `wrangler`, `d1 execute` ou `--remote`;
- todas as instrucoes efetivas iniciam com `SELECT`;
- script encerra com status `0`.

## Execucao Local Segura

Quando houver ambiente local aprovado:

```bash
export AIRTRUST_ALLOW_DATA_QUALITY_RUN=YES
export AIRTRUST_DATA_QUALITY_TARGET=local
npm run data-quality:local
```

Quando houver ambiente staging aprovado e um caminho de banco seguro definido fora do repositorio:

```bash
export AIRTRUST_ALLOW_DATA_QUALITY_RUN=YES
export AIRTRUST_DATA_QUALITY_TARGET=staging
export AIRTRUST_DATA_QUALITY_DB_PATH=/caminho/seguro/para/staging.sqlite
npm run data-quality:local
```

## Resultado Sanitizado

O runner deve registrar somente:

- `check_id`
- `categoria`
- `status` (`PASS`, `WARN`, `FAIL`, `SKIPPED`)
- `count`
- `bloqueia`
- nota curta sem PII

## Classificacao dos Achados

- `FAIL`: bloqueia cliente externo ou representa risco operacional critico.
- `WARN`: nao bloqueia a liberacao, mas deve entrar em remediacao antes de crescimento.
- `INFO`: acompanhamento documental.

## Bloqueia Cliente Externo

Bloqueia cliente externo quando o achado compromete tenant isolation, acesso, FRMS, escalas ou qualquer fluxo que exponha dados ou comportamento incorreto para o cliente.

## Bloqueia Piloto Interno

Bloqueia piloto interno quando o achado compromete o uso minimo do tenant, a confianca em metricas, a integridade do fluxo ou a seguranca dos dados.

## O Que Nunca Deve Ser Feito

- Nao executar em producao.
- Nao executar em D1 remoto.
- Nao usar migration ou seed para corrigir data quality.
- Nao corrigir dados nesta fase.
- Nao registrar PII em evidencia.
- Nao commitar saida bruta de consultas.
- Nao adicionar `wrangler d1 execute --remote` em scripts novos.
