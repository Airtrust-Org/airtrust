# Shared Session: Multiple Curricula Per Participant

## Context

The shared-session kernel currently stores at most one active curricular assignment per
`(agendamento_id, participante_id)`. That prevents a single physical participant from
carrying more than one curriculum inside the same shared appointment.

The target contract is different:

- one physical appointment;
- one physical participant row per person in the appointment;
- multiple curricular assignments for the same person when the appointment spans
  different session models;
- one explicit relation between each active segment and each curricular assignment it
  fulfills;
- one optional ficha per `segmento_atribuicao`.

This execution changes only the generic infrastructure. It does not add examiner
curricula, NOTECHS, or new curricular seed data.

## Final Invariants

1. A physical participant appears once in `sessoes_participantes` for the appointment.
2. Curricular assignments are keyed by `(agendamento_id, participante_id, modelo_sessao_id)`
   among active rows.
3. Each active curricular assignment still belongs to one participant and one session model.
4. Each active curricular segment link belongs to one segment and one curricular assignment.
5. Each segment link has its own status and `gera_ficha` flag.
6. Fichas are keyed by `segmento_atribuicao_id`, not by `(agendamento, participante)`.
7. Minutes for an assignment are the sum of active segment links for that assignment only.
8. Re-editing a shared session must not duplicate assignments, links, minutes, or fichas.
9. Canceling one segment or one planned link must not cancel unrelated assignments or links.
10. Completed evidence is never hard-deleted or silently replaced.
11. All writes remain tenant-safe and always bind `empresa_id`.
12. Historical records without the new link-based ficha relation remain readable.

## Request Contract

The API becomes segment-oriented. Top-level participants describe only the physical people
in the appointment. Curricular intent moves into each segment.

```json
{
  "participantes": [
    { "funcionario_id": 101 },
    { "funcionario_id": 102 }
  ],
  "segmentos": [
    {
      "id": 801,
      "inicio": "07:00",
      "fim": "08:00",
      "finalidade_codigo": "SOP_NORMAL",
      "modelo_sessao_id": 2001,
      "participantes": [
        {
          "funcionario_id": 101,
          "funcao": "PF",
          "cumpre_treinamento": true,
          "gera_ficha": true
        },
        {
          "funcionario_id": 102,
          "funcao": "PM",
          "cumpre_treinamento": false
        }
      ]
    }
  ]
}
```

Backend derivation rules:

- physical participants come from the top-level `participantes`;
- each curricular segment participant produces or reuses one logical assignment keyed by
  `(funcionario_id, modelo_sessao_id)`;
- each curricular segment participant also produces one explicit
  `simulador_segmento_atribuicoes` row for that segment-assignment pair;
- each active segment-assignment link may own one ficha.

## Reconciliation Rules

`PUT` no longer rebuilds the whole shared structure.

- participants are upserted by `funcionario_id`;
- assignments are upserted by `(participant, model)`;
- segments are updated by `id` when present, otherwise inserted;
- segment participants are upserted by `(segmento_id, participante_id)`;
- segment-assignment links are upserted by `(segmento_id, atribuicao_curricular_id)`;
- planned links removed from the final set are soft-canceled;
- active non-protected fichas removed from the final set are soft-deleted;
- rows with protected evidence (`APROVADO`, `NAO_APROVADO`, `CONCLUIDA`, or link
  status `CUMPRIDA`) are preserved and cannot be silently replaced.

If an edit attempts to mutate or remove protected evidence, the backend returns `409`
instead of rebuilding history.

## Compatibility

- legacy `atribuicao_curricular_id` columns remain for historical reads;
- `fichas_sessao.atribuicao_curricular_id` remains populated for compatibility;
- new ficha uniqueness moves to `segmento_atribuicao_id`;
- sessions created before the new relation continue to load through the existing fallback
  logic when no explicit link-based ficha exists.
