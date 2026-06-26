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

## PR, CI e deploy

- PR `#163` mergeado em `main` em `2026-06-26T09:28:45Z`;
- CI do PR `#163` fechado verde em `build`, `check-demo-data`, `lint`, `test`, `Check PR` e `lms-smoke`;
- workflow manual `Deploy AirTrust` disparado em `2026-06-26T09:29:24Z` falhou no job `Deploy Worker` porque `CLOUDFLARE_API_TOKEN` estava vazio no ambiente do GitHub Actions;
- o Worker foi publicado com sucesso por CLI local segura em `2026-06-26T09:35:59Z`;
- `APP_VERSION`: `2026-06-26T09:35:59Z-40d3bc3`;
- `Worker Version ID`: `274e12e8-4a08-425a-822f-4d67287eb121`.

## Smoke pos-deploy

- `GET https://api.airtrust.online/api/version` -> `200`, versao `2026-06-26T09:35:59Z-40d3bc3`;
- `GET https://api.airtrust.online/api/health` -> `200`, `database=ok`, `storage=ok`;
- `GET /api/lms/matriculas/332` sem token -> `401`;
- `POST /api/lms/matriculas/332/progresso-recuperacao/dry-run` sem token -> `401`;
- verificacao remota de `403` para perfil nao-admin ficou bloqueada nesta sessao porque nao havia fixture segura de credencial `manager` valida em producao.

## Dry-runs controlados executados

Os seguintes `dry-run` foram executados em producao de forma controlada, apenas leitura logica do endpoint e sem qualquer escrita em matricula, progresso SCORM ou qualificacao:

### Bruno Vital Justino / AW139 / matricula 332

- resposta `200`;
- `writes_executed=false`;
- `would_be_allowed_future=true`;
- estado antes/depois inalterado: `status=EM_ANDAMENTO`, `progresso_pct=1`, `ultimo_slide=8`, `lesson_location=8`, `qualificacao_historico_id=null`, `score_raw=null`;
- simulacao proposta: `progresso_pct=28`, `ultimo_slide=113`, `lesson_location=113/405`;
- riscos retornados: `CURRENT_RUNTIME_USES_LEGACY_NUMERIC_LOCATION`, `CURRENT_RUNTIME_HAS_NO_SUSPEND_DATA`.

### Alan Cortes / AW139 / matricula 323

- resposta `200`;
- `writes_executed=false`;
- `would_be_allowed_future=true`;
- estado antes/depois inalterado: `status=EM_ANDAMENTO`, `progresso_pct=1`, `ultimo_slide=75`, `lesson_location=73`, `qualificacao_historico_id=null`, `score_raw=95`;
- simulacao proposta: `progresso_pct=39`, `ultimo_slide=156`, `lesson_location=156/405`;
- riscos retornados: `CURRENT_RUNTIME_USES_LEGACY_NUMERIC_LOCATION`, `CURRENT_RUNTIME_HAS_NO_SUSPEND_DATA`, `CURRENT_SCORE_WILL_BE_PRESERVED`.

### Wagner Domas da Silva / AW139 / matricula 326

- resposta `200`;
- `writes_executed=false`;
- `would_be_allowed_future=true`;
- estado antes/depois inalterado: `status=EM_ANDAMENTO`, `progresso_pct=1`, `ultimo_slide=238`, `lesson_location=238`, `qualificacao_historico_id=null`, `score_raw=100`;
- simulacao proposta: `progresso_pct=59`, `ultimo_slide=238`, `lesson_location=238/405`;
- riscos retornados: `CURRENT_RUNTIME_USES_LEGACY_NUMERIC_LOCATION`, `CURRENT_RUNTIME_HAS_NO_SUSPEND_DATA`, `CURRENT_SCORE_WILL_BE_PRESERVED`;
- observacao operacional: o endpoint classificou este caso como tecnicamente permitido, mas a classificacao humana continua `NEEDS_MORE_EVIDENCE` ate revisao manual da evidencia.

## Limitacoes

- o endpoint nao aplica alteracao real;
- o endpoint nao grava `audit_logs`, por desenho, para garantir zero escrita;
- o endpoint nao tenta inferir `suspend_data` novo;
- o endpoint nao resolve crosswalk de cursos ainda bloqueados como PT6C;
- o endpoint nao substitui fixture segura para validacao operacional;
- o workflow de deploy do GitHub continua com falha operacional de segredo ausente para `CLOUDFLARE_API_TOKEN`.

## Por que `apply` nao foi implementado

`apply` ficou fora por desenho porque:

- exigiria escrita em matricula real;
- exigiria politica de rollback e auditoria persistente;
- exigiria revisao manual dos payloads e evidencia por aluno;
- a fase atual precisa provar primeiro o contrato seguro de simulacao.

## Proximos passos

1. corrigir o segredo `CLOUDFLARE_API_TOKEN` no workflow de deploy para que o caminho padrao do GitHub volte a publicar o Worker;
2. revisar humanamente os tres retornos de `dry-run`, com atencao especial ao caso Wagner;
3. preparar fixture segura ou credencial segura de `manager` para validar `403` remoto sem depender de usuario real;
4. manter PT6C e Francisco fora de execucao ate resolver crosswalk/evidencia;
5. pedir autorizacao explicita antes de discutir ou implementar `apply`.

## Decisao final desta fase

- `RECOVERY_DRY_RUN_ENDPOINT_DEPLOYED`
- `DRY_RUNS_EXECUTED_NO_WRITE`
- `CONTROLLED_STUDENT_RECOVERY_REVIEW_READY`
- `DRY_RUN_BLOCKED_BY_AUTH`
- `APPLY_NOT_IMPLEMENTED_BY_DESIGN`
