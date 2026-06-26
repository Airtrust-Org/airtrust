# AIRTRUST LMS PROGRESS RECOVERY DRY RUN ENDPOINT 20260626

## Objetivo

Implementar o primeiro passo seguro da recuperacao de progresso em LMS Manutencao: um endpoint administrativo de simulacao que nao escreve no banco e nao permite `apply`.

## Regras de seguranca

O endpoint:

- aceita apenas `admin`;
- nao aceita `manager`;
- nao executa `INSERT`, `UPDATE` ou `DELETE`;
- nao gera qualificacao;
- nao altera score;
- nao conclui matricula;
- nao implementa `apply` nesta fase.

## Endpoint criado

- `POST /api/lms/matriculas/:id/progresso-recuperacao/dry-run`

## Payload aceito

Campos obrigatorios:

- `target_lesson_location`
- `target_progress_pct`
- `reason`
- `evidence_source`

Campo opcional:

- `operator_note`

Campos aceitos apenas para bloqueio explicito em `dry-run`:

- `target_lesson_status`
- `target_score_raw`
- `target_matricula_status`

## Resposta

O endpoint retorna:

- `current_state`
- `simulated_state`
- `requested_target`
- `differences`
- `risks`
- `would_be_allowed_future`
- `blocked_reason`
- `blockers`

## Validacoes implementadas

- matricula existe;
- curso precisa ser `scorm`;
- `reason` obrigatorio;
- `evidence_source` obrigatorio;
- target nao pode reduzir progresso forte;
- target nao pode reduzir `lesson_location` forte;
- target nao pode marcar conclusao;
- target nao pode alterar score;
- target nao pode concluir matricula;
- target nao pode operar sobre matricula terminal;
- target nao pode operar sobre matricula com qualificacao ja vinculada.

## Testes executados

Arquivos:

- `worker-airtrust/src/__tests__/routes/lms-matriculas-progress-integrity.test.ts`
- `worker-airtrust/src/__tests__/routes/lms-matriculas-progress-recovery-dry-run.test.ts`

Casos cobertos no teste novo:

1. admin executa dry-run valido;
2. manager recebe `403`;
3. sem token recebe `401`;
4. matricula inexistente retorna `404`;
5. target regressivo fica bloqueado;
6. target com conclusao fica bloqueado;
7. target com score fica bloqueado;
8. curso nao-SCORM fica bloqueado;
9. dry-run nao cria qualificacao;
10. dry-run nao altera matricula;
11. dry-run nao altera `lms_progresso_scorm`;
12. payload sem motivo/evidencia retorna `400`.

Resultado local desta fase:

- `36/36` testes passando nas suites LMS executadas;
- `npm run lint` executado com sucesso em `2026-06-26`;
- `npm run build` executado com sucesso em `2026-06-26`.

## Limitacoes

- o endpoint nao aplica alteracao real;
- o endpoint nao grava `audit_logs`, por desenho, para garantir zero escrita;
- o endpoint nao tenta inferir `suspend_data` novo;
- o endpoint nao resolve crosswalk de cursos ainda bloqueados como PT6C;
- o endpoint nao substitui fixture segura para validacao operacional.

## Por que `apply` nao foi implementado

`apply` ficou fora por desenho porque:

- exigiria escrita em matricula real;
- exigiria politica de rollback e auditoria persistente;
- exigiria revisao manual dos payloads e evidencia por aluno;
- a fase atual precisa provar primeiro o contrato seguro de simulacao.

## Proximos passos

1. publicar o Worker com o endpoint `dry-run`;
2. executar smoke do Worker;
3. validar em fixture segura;
4. revisar respostas dos payloads preparados;
5. pedir autorizacao explicita antes de discutir ou implementar `apply`.

## Decisao final desta fase

- `RECOVERY_DRY_RUN_ENDPOINT_READY_FOR_DEPLOY`
- `APPLY_NOT_IMPLEMENTED_BY_DESIGN`
