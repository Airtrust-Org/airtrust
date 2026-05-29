# FRMS D4-B - Backfill Controlado Read/Ack Legado

Data: 2026-05-29

## 1) Objetivo

Migrar, de forma controlada e idempotente, eventos FRMS read/ack legados de `frms_fadiga_evento` para as tabelas dedicadas criadas na D3-B/D4:

- `frms_read_ack_events`
- `frms_read_ack_event_audit`

Esta fase nao cria mitigacao, decisao automatica, score, threshold, gatilho por quinzena/setores ou qualquer fluxo operacional novo.

## 2) Escopo

Migrar somente os tipos legados:

- `FRMS_READ_ACK_EVENT`
- `FRMS_READ_ACK_ACK`

A migracao preserva os IDs dos eventos originais quando possivel e cria auditoria dedicada para ACKs legados.

## 3) O que sera migrado

Para `frms_read_ack_events`:

- `id`
- `empresa_id`
- `data_operacional`
- `funcionario_id`
- `event_type`
- `severity`
- `source`
- `lifecycle_status`
- `snapshot_status`
- `snapshot_alertas_json`
- `data_sources_json`
- `limitations_json`
- `snapshot_payload_json`
- `event_hash`
- `created_at`
- `acknowledged_at`
- `acknowledged_by`
- `ack_note`

Para `frms_read_ack_event_audit`:

- `event_id`
- `action = ACK`
- `actor_user_id`
- `action_at`
- `note`
- `payload_after_json`

## 4) O que nao sera migrado

- Nenhum tipo fora de `FRMS_READ_ACK_EVENT` e `FRMS_READ_ACK_ACK`.
- Nenhum registro com payload invalido.
- Nenhum evento sem `data_operacional`, `funcionario_id`, `event_type` ou `severity`.
- Nenhum ACK que referencie evento inexistente no recorte.

## 5) Filtros obrigatorios

O script exige filtros explicitos:

```bash
node scripts/backfill-frms-read-ack-dedicated-storage.mjs \
  --empresa-id 6 \
  --data-inicio 2026-05-27 \
  --data-fim 2026-05-27
```

`--apply` sem `--empresa-id`, `--data-inicio` e `--data-fim` falha antes de executar consultas.

## 6) Dry-run

Dry-run e o modo padrao. Ele executa somente SELECTs e registra:

- `legacy_events_found`
- `legacy_acks_found`
- `dedicated_events_existing`
- `audit_existing`
- `events_to_insert`
- `audits_to_insert`
- `invalid_payloads`
- `skipped`

## 7) Apply

Apply exige flag explicita:

```bash
node scripts/backfill-frms-read-ack-dedicated-storage.mjs \
  --apply \
  --empresa-id 6 \
  --data-inicio 2026-05-27 \
  --data-fim 2026-05-27
```

A escrita e limitada ao recorte filtrado e usa:

- `INSERT OR IGNORE` para eventos dedicados;
- `WHERE NOT EXISTS` para auditoria de ACK por `empresa_id`, `event_id` e `action = ACK`.

## 8) Idempotencia

O backfill pode ser reexecutado no mesmo recorte sem duplicar eventos nem auditorias:

- eventos ja existentes em `frms_read_ack_events` entram em `skipped`;
- ACKs com auditoria existente entram em `skipped`;
- legado permanece intacto.

## 9) Rollback logico

Rollback destrutivo nao e recomendado.

Se houver problema:

1. manter `frms_fadiga_evento` intacta;
2. reverter runtime para priorizar legado, se necessario;
3. preservar linhas dedicadas como historico inerte;
4. nao dropar tabelas nem apagar linhas sem revisao humana.

## 10) Validacao pos-backfill

Validar:

- contagem dedicada por `empresa_id` e `data_operacional`;
- contagem de auditoria dedicada;
- contagem legada inalterada;
- `GET /api/frms/read-ack/events` sem duplicidade;
- `storage_source = FRMS_READ_ACK_EVENTS` para IDs migrados;
- `ALL/PENDING/ACKED` preservados.

## 11) Riscos

- Payload legado invalido deve bloquear o apply do recorte.
- Recorte amplo demais pode migrar volume inesperado.
- A auditoria backfilled nao reconstrui `payload_before_json` historico quando ele nao existia no legado; preserva `payload_after_json` do evento reconhecido.

## 12) Legado preservado

A D4-B nao apaga, nao atualiza e nao altera `frms_fadiga_evento`.

## 13) Fase D completa

A Fase D completa continua bloqueada para mitigacao, decisao automatica, alteracao de escala, SGSO automatico, thresholds e formulas de risco.
