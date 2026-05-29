# FRMS D3-B/D4 - Tabela Dedicada para Read/Ack

Data: 2026-05-28

## 1) Objetivo

Separar eventos FRMS read/ack da tabela legado `frms_fadiga_evento`, criando armazenamento dedicado para retencao, historico, auditoria e maior volume.

Esta fase nao cria mitigacao, decisao automatica, score novo, threshold novo ou gatilho operacional.

## 2) Por que tabela dedicada

`frms_fadiga_evento` foi suficiente para D1/D2, mas seus filtros dependem de `json_extract(payload_json, ...)` para atributos centrais como status, tipo, severidade, funcionario e data operacional.

A tabela dedicada normaliza esses campos e reduz acoplamento entre eventos de fadiga/check-in e ciencia operacional read/ack.

## 3) Schema novo

Migration local proposta:

- `worker-airtrust/migrations/0384_frms_read_ack_dedicated_storage.sql`

Tabelas:

- `frms_read_ack_events`
- `frms_read_ack_event_audit`

Campos principais normalizados:

- `empresa_id`
- `data_operacional`
- `funcionario_id`
- `event_type`
- `severity`
- `source`
- `lifecycle_status`
- `created_at`
- `acknowledged_at`
- `acknowledged_by`
- `ack_note`
- `archived_at`
- `archived_by`
- `archive_reason`

Campos JSON preservam contexto:

- `snapshot_alertas_json`
- `data_sources_json`
- `limitations_json`
- `snapshot_payload_json`

## 4) Compatibilidade com legado

O runtime passa a gravar novos eventos em `frms_read_ack_events`.

O `GET /api/frms/read-ack/events` consulta:

- tabela dedicada;
- tabela legado `frms_fadiga_evento` para `tipo = 'FRMS_READ_ACK_EVENT'`.

Quando o mesmo `id` existir nas duas fontes, a tabela dedicada tem preferencia na resposta para evitar duplicidade visual.

Eventos retornam `storage_source`:

- `FRMS_READ_ACK_EVENTS`
- `LEGACY_FRMS_FADIGA_EVENTO`

## 5) Politica sem backfill inicial

Nao ha backfill automatico nesta fase.

Eventos antigos continuam legiveis a partir de `frms_fadiga_evento`. Eventos novos, apos aplicacao controlada da migration e deploy, passam a nascer na tabela dedicada.

## 6) Rollout

Sequencia recomendada:

1. Revisar SQL da migration.
2. Aplicar migration em ambiente controlado.
3. Validar `GET`, `generate` e `ack` em periodo curto.
4. Fazer deploy do runtime.
5. Executar smoke autenticado sem criar volume amplo.
6. Monitorar contagens por `storage_source`.

## 7) Rollback

Rollback operacional:

- manter `frms_fadiga_evento` intacta;
- reverter runtime para leitura/escrita legado, se necessario;
- preservar `frms_read_ack_events` e `frms_read_ack_event_audit` como historico inerte;
- nao dropar tabelas em rollback imediato sem revisao.

## 8) Backfill futuro

Backfill deve ser fase separada:

- por `empresa_id` e faixa de data;
- reentrante e idempotente;
- com contagem antes/depois;
- sem apagar legado;
- com amostragem de payload e hashes.

## 9) Riscos

- Deploy do runtime antes da migration quebra rotas read/ack.
- Backfill mal planejado pode duplicar eventos logicos.
- Consultas de legado continuam dependentes de JSON ate backfill/congelamento completo.

## 10) Validacoes esperadas

- TypeScript worker.
- TypeScript frontend.
- Build.
- Lint.
- Testes worker.
- Testes focados de read/ack.
- `git diff --check`.

## 11) Status da migration

Migration criada localmente, mas nao aplicada em producao nesta fase.

## 12) Fase D completa

A Fase D completa continua bloqueada para mitigacao automatica, acao corretiva, alteracao de escala, SGSO automatico, gatilhos por quinzena/setores/sit periods e qualquer decisao automatica de aptidao.
