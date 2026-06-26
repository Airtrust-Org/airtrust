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

## Dry-runs executados em 2026-06-26

Os tres payloads AW139 acima foram executados em producao apenas via endpoint `dry-run`, sem escrita.

### Resultado Bruno Vital Justino / matricula 332

- `HTTP 200`;
- `writes_executed=false`;
- `would_be_allowed_future=true`;
- `before/after` identicos: `status=EM_ANDAMENTO`, `progresso_pct=1`, `ultimo_slide=8`, `lesson_location=8`, `qualificacao_historico_id=null`;
- riscos: `CURRENT_RUNTIME_USES_LEGACY_NUMERIC_LOCATION`, `CURRENT_RUNTIME_HAS_NO_SUSPEND_DATA`.

### Resultado Alan Cortes / matricula 323

- `HTTP 200`;
- `writes_executed=false`;
- `would_be_allowed_future=true`;
- `before/after` identicos: `status=EM_ANDAMENTO`, `progresso_pct=1`, `ultimo_slide=75`, `lesson_location=73`, `qualificacao_historico_id=null`, `score_raw=95`;
- riscos: `CURRENT_RUNTIME_USES_LEGACY_NUMERIC_LOCATION`, `CURRENT_RUNTIME_HAS_NO_SUSPEND_DATA`, `CURRENT_SCORE_WILL_BE_PRESERVED`.

### Resultado Wagner Domas da Silva / matricula 326

- `HTTP 200`;
- `writes_executed=false`;
- `would_be_allowed_future=true`;
- `before/after` identicos: `status=EM_ANDAMENTO`, `progresso_pct=1`, `ultimo_slide=238`, `lesson_location=238`, `qualificacao_historico_id=null`, `score_raw=100`;
- riscos: `CURRENT_RUNTIME_USES_LEGACY_NUMERIC_LOCATION`, `CURRENT_RUNTIME_HAS_NO_SUSPEND_DATA`, `CURRENT_SCORE_WILL_BE_PRESERVED`;
- apesar de tecnicamente permitido pelo endpoint, este caso permanece com classificacao operacional `NEEDS_MORE_EVIDENCE` ate revisao humana.

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

Nesta fase, os payloads AW139 podem ser executados apenas em `dry-run` controlado, sem escrita. `apply` continua proibido.

Passos seguintes antes de qualquer `apply`:

1. revisar os retornos simulados dos tres casos AW139;
2. manter Wagner sob criterio humano de evidencia antes de qualquer discussao de `apply`;
3. validar `403` com fixture segura de `manager`;
4. pedir autorizacao explicita para qualquer recuperacao real.
