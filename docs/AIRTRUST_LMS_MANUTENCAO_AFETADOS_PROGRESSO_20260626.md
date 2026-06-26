# AIRTRUST LMS MANUTENCAO AFETADOS PROGRESSO 20260626

## Objetivo desta fase

Consolidar apenas os payloads de `dry-run` para a recuperacao futura de progresso, sem executar `apply`, sem concluir matricula e sem gerar qualificacao.

## Classificacao operacional atual

| aluno | curso | matricula_id | alvo dry-run | classificacao |
| --- | --- | --- | --- | --- |
| Bruno Vital Justino | AW139 - Manutencao | `332` | `113/405` | `RESTORE_PROGRESS_ONLY_CANDIDATE` |
| Alan Cortes | AW139 - Manutencao | `323` | `156/405` | `RESTORE_PROGRESS_ONLY_CANDIDATE` |
| Wagner Domas da Silva | AW139 - Manutencao | `326` | `238/405` | `NEEDS_MORE_EVIDENCE` |
| Bruno Vital Justino | PT6C-67C - Manutencao | `384` | bloqueado | `CROSSWALK_PENDING` |
| Francisco Altemir da Silva Conceicao | Inspecao IIO & APRS | `93` | bloqueado | `NEEDS_MORE_EVIDENCE` |

## Payloads preparados

### Bruno Vital Justino / AW139 / matricula 332

```json
{
  "target_lesson_location": "113/405",
  "target_progress_pct": 28,
  "reason": "Restaurar checkpoint reportado no modulo 4 apos reset de progresso AW139",
  "evidence_source": "incident-aw139-2026-06-26; payload-bruno-aw139-m04",
  "operator_note": "Dry-run only. Nao executar apply nesta fase."
}
```

### Alan Cortes / AW139 / matricula 323

```json
{
  "target_lesson_location": "156/405",
  "target_progress_pct": 39,
  "reason": "Restaurar checkpoint reportado apos avancar alem do modulo 6 no AW139",
  "evidence_source": "incident-aw139-2026-06-26; payload-alan-aw139-m06",
  "operator_note": "Dry-run only. Alvo reflete checkpoint operacional consolidado."
}
```

### Wagner Domas da Silva / AW139 / matricula 326

```json
{
  "target_lesson_location": "238/405",
  "target_progress_pct": 59,
  "reason": "Avaliar consolidacao do checkpoint numerico forte existente no AW139",
  "evidence_source": "incident-aw139-2026-06-26; leitura-read-only-producao",
  "operator_note": "Dry-run only. Caso ainda classificado como NEEDS_MORE_EVIDENCE."
}
```

## Casos bloqueados nesta fase

### Bruno Vital Justino / PT6C-67C / matricula 384

Motivo:

- crosswalk seguro do curso ainda pendente;
- alvo final de lesson location ainda nao foi provado.

### Francisco Altemir da Silva Conceicao / IIO & APRS / matricula 93

Motivo:

- nao ha evidencia tecnica suficiente de checkpoint ou conclusao anterior;
- o caso nao pode migrar para `apply` nem para conclusao manual.

## Regra operacional

Nenhum desses payloads deve ser executado em aluno real nesta fase.

Passos seguintes antes de qualquer `apply`:

1. publicar o endpoint `dry-run` no Worker;
2. validar o endpoint em fixture segura;
3. revisar os retornos simulados;
4. pedir autorizacao explicita para qualquer recuperacao real.
