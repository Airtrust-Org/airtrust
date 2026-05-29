# FRMS Stabilization Closure Status

Data: 2026-05-29

## 1) Objetivo

Consolidar o estado real do modulo FRMS/read-ack em producao, repositorio e banco, encerrando o ciclo de microfases recentes.

Esta consolidacao nao cria mitigacao, formula, threshold, decisao operacional automatica, alteracao de escala, SGSO automatico, check-in novo ou qualquer uso de `apto_para_voo`.

## 2) Commits principais

Commits recentes relacionados ao FRMS/read-ack presentes em `origin/main`:

- `777ba18` - `feat(frms): add read ack events`
- `b3e2393` - `feat(frms): add read ack lifecycle filters`
- `d8fbb94` - `docs(frms): define read ack retention strategy`
- `b73f7f1` - `feat(frms): add dedicated read ack storage`
- `84e3353` - `chore(frms): add read ack backfill tooling`
- `162f0ef` - `chore(frms): harden read ack backfill tooling`
- `e7cf588` - `docs(frms): record read ack actor cleanup`

O commit original `656e1d1` ficou na branch `origin/chore/frms-read-ack-backfill-v2`, mas seu conteudo foi consolidado em `main` por cherry-pick como `162f0ef`.

## 3) Versao de producao

`GET https://api.airtrust.online/api/version` respondeu:

```json
{"success":true,"data":{"version":"managed-by-script","environment":"production","builtAt":"managed-by-script","deploymentId":"managed-by-script"}}
```

O endpoint confirma ambiente `production`, mas nao expõe commit/APP_VERSION rastreavel. Portanto, nao foi possivel provar por esse endpoint se o worker publicado corresponde a `origin/main`.

## 4) Estado das tabelas

Tabelas confirmadas em producao:

- `frms_fadiga_evento`
- `frms_read_ack_events`
- `frms_read_ack_event_audit`

Contagens em producao:

- legado `FRMS_READ_ACK_EVENT`: 23
- legado `FRMS_READ_ACK_ACK`: 1
- dedicado `frms_read_ack_events`: 25
- auditoria dedicada `frms_read_ack_event_audit`: 2

## 5) Estado legado

O legado permanece intacto em `frms_fadiga_evento`.

Nenhuma rotina desta consolidacao apagou, atualizou ou mascarou dados legados.

## 6) Estado dedicado

Recortes conhecidos para `empresa_id = 6`:

- `2026-05-27`: 23 eventos dedicados, 1 `ACKED`, 22 `PENDING`, 23 IDs distintos.
- `2026-05-28`: 2 eventos dedicados, 1 `ACKED`, 1 `PENDING`, ator do ACK = `60`.

Todos os 23 IDs legados de `2026-05-27` existem tambem no dedicado. Pelo desenho do runtime, quando o mesmo ID existe em legado e dedicado, a leitura deve preferir `FRMS_READ_ACK_EVENTS`.

## 7) Backfill

O backfill do recorte inicial ja esta materializado no dedicado.

Dry-run recente do tooling para `empresa_id = 6`, `2026-05-27` indicou:

- `legacy_events_found = 23`
- `legacy_acks_found = 1`
- `dedicated_events_existing = 23`
- `events_to_insert = 0`
- `audits_to_insert = 0`
- `invalid_payloads = 0`

Nao ha backfill amplo pendente ou autorizado.

## 8) `acknowledged_by = 0`

Achado original: 22 eventos `PENDING` dedicados tinham `acknowledged_by = 0`, sem `acknowledged_at`, sem usuario real `id = 0` e sem auditoria `ACK`.

Correcao controlada ja aplicada em D4-C:

```sql
UPDATE frms_read_ack_events
SET acknowledged_by = NULL
WHERE lifecycle_status = 'PENDING'
  AND acknowledged_by = 0
  AND acknowledged_at IS NULL;
```

Reauditoria desta consolidacao:

- `acknowledged_by = 0`: nenhum registro.
- dry-run atual `would_update = 0`.
- nao ha `ACKED` com `acknowledged_by = 0`.
- nao ha `acknowledged_by = 0` com `acknowledged_at` preenchido.
- nao ha usuario `id = 0` na tabela `usuarios`.

Nenhum novo UPDATE foi necessario nesta fase.

## 9) Validacoes API/UI

Sem token AirTrust seguro no ambiente, chamadas autenticadas retornaram `401 MISSING_TOKEN`:

- `/api/frms/read-ack/events?data_inicio=2026-05-27&data_fim=2026-05-27&status=ALL`
- `/api/frms/operational-snapshot?data_inicio=2026-05-27&data_fim=2026-05-27&include_inconsistencies=true`

Equivalencia read-only validada por SELECTs de producao:

- `2026-05-27`: total 23, `ACKED` 1, `PENDING` 22, sem duplicidade no dedicado.
- `2026-05-28`: total 2, `ACKED` 1, `PENDING` 1, ator ACK valido.

UI:

- `https://airtrust.online/frms/controle-operacional` respondeu HTTP 200.
- Sem sessao autenticada, nao foi possivel confirmar visualmente a tela interna, a secao de Ciencia operacional FRMS ou filtros.

## 10) Fechado

- Storage dedicado de read/ack existe e contem historico inicial.
- Auditoria dedicada existe e contem ACKs esperados.
- Compatibilidade com legado esta preservada.
- Tooling de backfill esta em `main` e endurecido para `NULL` em campos numericos opcionais.
- Placeholder `acknowledged_by = 0` esta saneado.
- Legado permanece intacto.

## 11) Pendente

- Smoke autenticado real da API e UI com sessao operacional aprovada.
- Endpoint `/api/version` nao expõe commit rastreavel; isso limita correlacao direta entre producao e `origin/main`.
- Revisao humana final do baseline antes de qualquer nova iniciativa de FRMS.

## 12) Proibido neste baseline

Continua proibido sem nova decisao explicita:

- apagar ou alterar legado para mascarar problema;
- criar migration nova;
- aplicar migration nova;
- executar backfill amplo;
- alterar escala;
- chamar SGSO automaticamente;
- criar mitigacao;
- submeter check-in;
- usar `apto_para_voo`;
- criar formula, score novo ou threshold operacional;
- usar quinzena, setores ou sit periods como gatilho automatico.

## 13) Quando usar Opus

Usar Opus somente antes de qualquer decisao cientifica ou operacional que envolva:

- formula de risco;
- threshold;
- mitigacao automatica;
- acao corretiva;
- alteracao de escala;
- gatilho por quinzena, setores ou sit periods;
- interpretacao de aptidao para voo.

Nao e necessario Opus para manter tooling, documentacao, auditoria read-only ou saneamento pontual ja comprovado.

## 14) Recomendacao

Pausar novas mudancas funcionais de FRMS/read-ack e tratar este documento como baseline final.

Proximo passo recomendado: smoke autenticado por usuario operacional aprovado e revisao humana do baseline antes de qualquer evolucao fora de read/ack.
