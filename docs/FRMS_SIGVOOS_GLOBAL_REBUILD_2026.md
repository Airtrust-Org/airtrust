# FRMS SIGVOOS Global Rebuild 2026

Data: 2026-06-05

## Problema

O FRMS estava exibindo e calculando dados operacionais a partir de linhas `FIRA`, inclusive casos extremos como Dieter Johny Kuhr em 2026-06-01 com 25h37 de voo e divergencia entre coluna e alerta em 2026-06-02.

## Decisao

SIGVOOS passa a ser a unica fonte canonica para jornada realizada e horas de voo realizadas no FRMS operacional. FIRA permanece apenas como historico/auxiliar nao operacional. Na ausencia de SIGVOOS valido, o dia fica como pendente de SIGVOOS, sem fallback FIRA.

## Escopo

- Periodo: 2026-01-01 a 2026-06-05.
- Tripulantes: todos.
- Tabelas afetadas: `frms_jornada`, `frms_fatorizacao_jornada`, `frms_acumulo_rolling`, `frms_alerta`.
- Fonte SIGVOOS usada para o rebuild: previews SIGVOOS persistidos em `frms_importacao_fira` (`arquivo_nome LIKE 'SIGVOOS_%' OR importado_por='SIGVOOS'`).

## Backup

Backup/export local antes de escrita:

- Diretorio: `artifacts/frms-sigvoos-global-rebuild-20260605/backup-20260605T213800Z`
- Manifesto: `manifest.json`
- `frms_jornada.json`: 4500 linhas, SHA-256 `32ff8182bc4d661369c73abd13925f70a844887de524ac674d2b6ff5d872b3ab`
- `frms_fatorizacao_jornada.json`: 12340 linhas, SHA-256 `68cd158ecc6247c3def5c0948e19502d54daf6a0837c77c8d5ac523b80ed6927`
- `frms_acumulo_rolling.json`: 13243 linhas, SHA-256 `54c8d2a1c0ea0ce3525dff6454517b9751d4fcae1c27084b188ebe7610b6eb5d`
- `frms_alerta.json`: 4311 linhas, SHA-256 `c9f430de6c608f01cce3394525c3a7c52657476f5857e230c2e475fa1d9314ee`
- `frms_importacao_fira_sigvoos.json`: 684 linhas, SHA-256 `98aa787e17e35bbb48d9abc53b0977027084158f7a3a65fa68c906b885a41b73`
- `frms_jornada_pendente.json`: 0 linhas, SHA-256 `144ad3b9d676b35d0107867b55a40219ec05f8644c41a9afc873285141f4a581`

Os backups contem dados operacionais e nao foram preparados para commit.

Backup pontual complementar em 2026-06-06 antes da limpeza de alertas orfaos:

- Diretorio: `artifacts/frms-sigvoos-global-rebuild-20260605/backup-orphan-alerts-20260606T0038Z`
- `frms_alerta_orphans_before.json`: 28 linhas, SHA-256 `1ff6dfca2073e0753ed5f9d49e343f62002579cc6718b44904a13db77168add6`
- Os backups contem dados operacionais e nao devem ser commitados.

## Dry-Run

Piloto Dieter:

```bash
node scripts/frms-rebuild-from-sigvoos-2026.mjs --dry-run --from 2026-06-01 --to 2026-06-05 --tripulante-id 7
```

Resultado: 5 pares tripulante/data, 4 SIGVOOS validos, 1 SIGVOOS invalido, 4 substituicoes previstas.

Global:

```bash
node scripts/frms-rebuild-from-sigvoos-2026.mjs --dry-run --from 2026-01-01 --to 2026-06-05 --all-tripulantes
```

Resultado: 374 linhas SIGVOOS persistidas, 271 pares unicos tripulante/data, 261 SIGVOOS validos, 10 SIGVOOS invalidos, 659 linhas nao canonicas pendentes.

## Execucao

Script controlado:

```bash
node scripts/frms-rebuild-from-sigvoos-2026.mjs --execute --from 2026-06-01 --to 2026-06-05 --tripulante-id 7
node scripts/frms-rebuild-from-sigvoos-2026.mjs --execute --from 2026-01-01 --to 2026-06-05 --all-tripulantes
```

O piloto capturou duas falhas de script antes da conclusao global:

- ordem de copia de fatorizacao antes de criar nova jornada, bloqueada por FK;
- alias SQL incorreto em update de alertas.

Ambas foram corrigidas no script. O estado parcial do piloto foi auditado antes da retomada, e o script foi reexecutado de forma idempotente.

Resultado global final:

- `data_result.totalChanges`: 1223
- `derived_result.totalChanges`: 2974
- `active_sigvoos_after_data`: 261
- `rolling_rows_inserted`: 261

Execucao complementar em 2026-06-06 para alertas orfaos ativos sem `jornada_id` no recorte 2026:

```bash
node scripts/frms-rebuild-from-sigvoos-2026.mjs --dry-run --from 2026-01-01 --to 2026-06-05 --all-tripulantes --out-dir artifacts/frms-sigvoos-global-rebuild-20260605/dry-run-orphan-alert-cleanup-20260101-20260605
node scripts/frms-rebuild-from-sigvoos-2026.mjs --execute --from 2026-01-01 --to 2026-06-05 --all-tripulantes --out-dir artifacts/frms-sigvoos-global-rebuild-20260605/execute-orphan-alert-cleanup-20260101-20260605
```

Resultado complementar:

- jornadas alteradas: 0
- `orphan_active_alerts_without_jornada`: 28
- `data_result.totalChanges`: 0
- `derived_result.totalChanges`: 748
- `active_sigvoos_after_data`: 261
- `rolling_rows_inserted`: 261

Nenhuma migration foi executada. Nao houve `DELETE` fisico. As escritas foram `UPDATE`/`INSERT` gerados pelo script versionado.

## Contagens

Antes, jornadas ativas por origem:

- `FIRA`: 745
- `MANUAL`: 141
- `SIGVOOS`: 21

Depois, jornadas ativas por origem:

- `FIRA`: 525
- `MANUAL`: 134
- `SIGVOOS`: 261

Depois, por mes/origem:

- 2026-01: FIRA 175
- 2026-02: FIRA 201, SIGVOOS 8
- 2026-03: FIRA 109, SIGVOOS 11
- 2026-04: FIRA 36, SIGVOOS 86
- 2026-05: FIRA 2, MANUAL 134, SIGVOOS 130
- 2026-06: FIRA 2, SIGVOOS 26

## Validações Pós

- FIRA com fatorizacao ativa: 0
- Rolling sem SIGVOOS no mesmo dia: 0
- Alertas ativos sem jornada SIGVOOS: 0
- Alertas orfaos ativos no recorte 2026-01-01 a 2026-06-05: 0 apos limpeza complementar
- Divergencia alerta diaria vs coluna da jornada: 0
- SIGVOOS ativo extremo/invalido: 0
- Pendencias reais sem SIGVOOS valido: 659 linhas nao canonicas ativas, exibidas como nao operacionais pela politica de fonte.

## Dieter 2026-06-01 a 2026-06-05

- 2026-06-01: permanece `FIRA` nao operacional; SIGVOOS persistido tambem e invalido (`1537min > 655min`), portanto nao foi promovido.
- 2026-06-02: `SIGVOOS`, jornada 375min, HV 189min.
- 2026-06-03: `SIGVOOS`, jornada 451min, HV 282min.
- 2026-06-04: `SIGVOOS`, jornada 462min, HV 190min.
- 2026-06-05: `SIGVOOS`, jornada 316min, HV 203min.

Nao ha alerta ativo contaminado de 15h15 para Dieter no periodo validado.

## Riscos Remanescentes

- Janeiro nao possui SIGVOOS persistido no conjunto auditado; os dias permanecem pendentes.
- Os 10 SIGVOOS invalidos precisam de correcao na origem/integracao antes de virar dado operacional.
- Fatorizacao nova foi copiada quando existia fatorizacao anterior do mesmo dia. Jornadas criadas sem fatorizacao anterior permanecem sem fatorizacao ate reprocessamento pelo motor completo.
- O script recalcula rolling/alertas por SQL controlado e nao substitui uma futura rotina interna com acesso direto ao motor TypeScript completo.

## Comandos de Validacao

```bash
npx tsc --noEmit
npm run build
npm run test:worker
npm run lint
git diff --check
```

## Confirmacoes

- Nenhuma migration executada.
- Nenhum SQL manual improvisado linha a linha para corrigir casos individuais.
- Nenhum `git add .`.
- Nenhum `DELETE` fisico.
