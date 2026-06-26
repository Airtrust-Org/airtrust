# AIRTRUST LMS PROGRESS RECOVERY ENDPOINTS 20260626

## Objetivo

Consolidar o contrato administrativo de recuperacao de progresso no LMS Manutencao com tres rotas separadas:

- `POST /api/lms/matriculas/:id/progresso-recuperacao/dry-run`
- `POST /api/lms/matriculas/:id/progresso-recuperacao/apply`
- `POST /api/lms/matriculas/:id/progresso-recuperacao/rollback`

Escopo funcional desta fase:

- recuperar apenas progresso/posicao SCORM;
- exigir `admin`;
- bloquear `manager`;
- nao concluir matricula;
- nao gerar qualificacao;
- nao alterar score;
- nao aplicar migration;
- nao executar SQL manual fora do Worker.

## Dry-run

O endpoint `dry-run` continua sem escrita em banco.

Payload obrigatorio:

- `target_lesson_location`
- `target_progress_pct`
- `reason`
- `evidence_source`

Payload opcional:

- `operator_note`

Resposta principal:

- `current_state`
- `simulated_state`
- `requested_target`
- `differences`
- `risks`
- `would_be_allowed_future`
- `apply_allowed`
- `dry_run_reference`
- `blocked_reason`
- `blockers`

## Apply

O endpoint `apply` so pode executar se o estado atual ainda corresponder ao `dry_run_reference` revisado.

Payload obrigatorio:

- `target_lesson_location`
- `target_progress_pct`
- `reason`
- `evidence_source`
- `operator_note`
- `dry_run_reference`

Regras de bloqueio:

- matricula inexistente;
- curso nao-SCORM;
- usuario nao-admin;
- target regressivo de progresso;
- target regressivo de `lesson_location`;
- tentativa de concluir matricula;
- tentativa de alterar score;
- tentativa de alterar `data_conclusao`;
- matricula terminal;
- qualificacao ja vinculada;
- `suspend_data` forte sendo apagado;
- divergencia entre estado atual e `dry_run_reference`.

Garantias de escrita:

- grava audit log antes do update;
- atualiza apenas `lms_matriculas` e `lms_progresso_scorm`;
- preserva score existente;
- preserva `suspend_data` forte;
- nao escreve qualificacao;
- nao marca `CONCLUIDO`.

Resposta principal:

- `writes_executed`
- `audit_log_id`
- `rollback_available`
- `dry_run_reference`
- `before`
- `after`

## Rollback

O endpoint `rollback` exige:

- `admin`;
- `audit_log_id`;
- `reason`.

Regras:

- so aceita rollback de `LMS_PROGRESS_RECOVERY_APPLY`;
- compara estado atual com o snapshot aplicado;
- bloqueia se houve divergencia posterior;
- registra novo audit log;
- restaura apenas o estado anterior auditado.

## Validacao local executada

Arquivos de teste:

- `worker-airtrust/src/__tests__/routes/lms-matriculas-progress-recovery-dry-run.test.ts`
- `worker-airtrust/src/__tests__/routes/lms-matriculas-progress-recovery-apply.test.ts`
- `worker-airtrust/src/__tests__/routes/lms-matriculas-progress-integrity.test.ts`

Cobertura exercitada:

1. dry-run valido e sem escrita;
2. apply valido altera apenas progresso/location/cmi;
3. apply nao conclui matricula;
4. apply nao gera qualificacao;
5. apply nao altera score;
6. apply nao altera `data_conclusao`;
7. apply exige admin;
8. manager recebe `403`;
9. target regressivo bloqueia;
10. `suspend_data` forte nao e apagado;
11. divergencia do dry-run bloqueia;
12. audit log e criado;
13. rollback restaura estado anterior;
14. rollback bloqueia se o estado atual divergir;
15. matricula inexistente retorna `404`;
16. curso nao-SCORM bloqueia;
17. payload sem motivo/evidencia bloqueia.

Resultado local:

- `53/53` testes LMS direcionados passaram em `2026-06-26`;
- `npm run lint` passou em `2026-06-26`;
- `npm run build` passou em `2026-06-26`.

## Escopo do diff

Permitido nesta fase:

- Worker LMS;
- testes LMS;
- docs LMS.

Explicitamente fora:

- frontend;
- pacote SCORM;
- SQL manual;
- migration/schema;
- SIGVOOS;
- FRMS;
- qualificacoes fora do fluxo de bloqueio do LMS.

## Status desta evidencia

- `RECOVERY_DRY_RUN_ENDPOINT_DEPLOYED`: pendente de registrar no ciclo pos-merge
- `AW139_PROGRESS_RECOVERY_APPLY_DEPLOYED`: pendente de registrar no ciclo pos-merge
- `NO_COMPLETION_OR_QUALIFICATION_WRITES`: provado localmente
