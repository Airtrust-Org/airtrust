# AIRTRUST LMS MANUTENCAO AFETADOS PROGRESSO 20260626

## Objetivo desta fase

Consolidar os candidatos AW139 autorizados para reposicionamento controlado com `dry-run` obrigatorio antes de qualquer `apply`.

## Classificacao operacional atual

| aluno | curso | matricula_id | alvo | classificacao atual |
| --- | --- | --- | --- | --- |
| Bruno Vital Justino | AW139 - Manutencao | `332` | `113/405` | `AUTHORIZED_APPLY_CANDIDATE` |
| Alan Cortes | AW139 - Manutencao | `323` | `156/405` | `AUTHORIZED_APPLY_CANDIDATE` |
| Wagner Domas da Silva | AW139 - Manutencao | `326` | `238/405` | `AUTHORIZED_APPLY_IF_REVALIDATED` |
| Bruno Vital Justino | PT6C-67C - Manutencao | `384` | bloqueado | `CROSSWALK_PENDING` |
| Francisco Altemir da Silva Conceicao | Inspecao IIO & APRS | `93` | bloqueado | `NEEDS_MORE_EVIDENCE` |

## Payloads autorizados para revalidacao

### Bruno Vital Justino / AW139 / matricula 332

```json
{
  "target_lesson_location": "113/405",
  "target_progress_pct": 28,
  "reason": "Reposicionamento autorizado pelo gestor apos perda de progresso SCORM no AW139 Manutencao. Restore progress only; sem conclusao, sem score, sem qualificacao.",
  "evidence_source": "Relato do aluno + dry-run tecnico AirTrust + autorizacao explicita do gestor em 2026-06-26.",
  "operator_note": "Executar apply somente se o novo dry-run continuar monotonicamente seguro."
}
```

### Alan Cortes / AW139 / matricula 323

```json
{
  "target_lesson_location": "156/405",
  "target_progress_pct": 39,
  "reason": "Reposicionamento autorizado pelo gestor apos perda de progresso SCORM no AW139 Manutencao. Restore progress only; sem conclusao, sem score, sem qualificacao.",
  "evidence_source": "Relato do aluno + dry-run tecnico AirTrust + autorizacao explicita do gestor em 2026-06-26.",
  "operator_note": "Executar apply somente se o novo dry-run continuar monotonicamente seguro."
}
```

### Wagner Domas da Silva / AW139 / matricula 326

```json
{
  "target_lesson_location": "238/405",
  "target_progress_pct": 59,
  "reason": "Reposicionamento autorizado pelo gestor apos perda de progresso SCORM no AW139 Manutencao. Restore progress only; sem conclusao, sem score, sem qualificacao.",
  "evidence_source": "Relato do aluno + dry-run tecnico AirTrust + autorizacao explicita do gestor em 2026-06-26.",
  "operator_note": "Executar apply somente se o novo dry-run continuar monotonicamente seguro."
}
```

## Casos bloqueados nesta rodada

### Bruno Vital Justino / PT6C-67C / matricula 384

Motivo:

- crosswalk PT6C ainda pendente;
- nao autorizado para `apply` nesta rodada.

### Francisco Altemir da Silva Conceicao / IIO & APRS / matricula 93

Motivo:

- evidencia tecnica insuficiente;
- nao autorizado para `apply` nesta rodada;
- sem conclusao manual.

## Regra operacional

Antes de qualquer escrita real:

1. deployar o Worker com `apply`;
2. reexecutar `dry-run` em producao;
3. bloquear qualquer caso divergente;
4. aplicar apenas os casos ainda monotonicamente seguros;
5. confirmar `EM_ANDAMENTO`, `data_conclusao = null`, score inalterado e sem `qualificacao_historico_id`.

## Follow-up de fechamento limpo do PR 162

**Data:** 2026-06-26  
**Status:** `RECOVERY_ENDPOINTS_MERGED` + `RECOVERY_ENDPOINTS_DEPLOYED` + `NO_STUDENT_RECOVERY_BEFORE_PACKAGE_VALIDATION`

Validacoes de producao confirmadas apos a recuperacao limpa:

- `GET https://api.airtrust.online/api/version` -> `200` com `version=2026-06-26T10:06:55Z-a8b9f12`;
- `GET https://api.airtrust.online/api/health` -> `200 healthy`;
- `POST /api/lms/matriculas/332/progresso-recuperacao/dry-run` sem token -> `401`;
- `POST /api/lms/matriculas/332/progresso-recuperacao/apply` sem token -> `401`;
- `POST /api/lms/matriculas/332/progresso-recuperacao/rollback` sem token -> `401`.

Conclusoes operacionais desta fase:

- os endpoints `dry-run`, `apply` e `rollback` ja estao mergeados em `main` pelos PRs limpos `#163` e `#165`;
- o PR `#162` permaneceu `CONFLICTING` apenas por conflito documental add/add e deixou de ser a trilha correta de publicacao;
- nenhum aluno real foi alterado nesta etapa;
- os casos AW139 acima continuam apenas como candidatos autorizados para revalidacao posterior;
- PT6C continua bloqueado por `CROSSWALK_PENDING`;
- IIO/APRS continua bloqueado por `NEEDS_MORE_EVIDENCE`.

Gate mantido:

- `NO_MANUAL_COMPLETION_ALLOWED`
- `NO_STUDENT_RECOVERY_BEFORE_PACKAGE_VALIDATION`
- `INCIDENT_STILL_OPEN`
