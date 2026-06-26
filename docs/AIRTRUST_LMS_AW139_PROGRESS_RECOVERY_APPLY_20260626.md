# AIRTRUST LMS AW139 PROGRESS RECOVERY APPLY 20260626

## Autorizacao

Autorizacao explicita recebida para reposicionamento real apenas em AW139:

- matricula `332` -> `113/405` -> `28%`
- matricula `323` -> `156/405` -> `39%`
- matricula `326` -> `238/405` -> `59%`, somente se novo dry-run permanecer monotonicamente seguro

Fora de escopo desta rodada:

- PT6C;
- IIO/APRS;
- HUMS-VXP;
- MGM;
- SGSO;
- Integracao;
- conclusao manual;
- geracao de qualificacao.

## Implementacao local pronta

Rotas:

- `POST /api/lms/matriculas/:id/progresso-recuperacao/dry-run`
- `POST /api/lms/matriculas/:id/progresso-recuperacao/apply`
- `POST /api/lms/matriculas/:id/progresso-recuperacao/rollback`

Garantias implementadas:

- `admin` only;
- `manager` -> `403`;
- audit log obrigatorio antes da escrita;
- rollback auditavel;
- bloqueio por regressao de progresso/location;
- bloqueio por divergencia do `dry_run_reference`;
- sem conclusao;
- sem score novo;
- sem qualificacao.

## Validacao local

- `cd worker-airtrust && npx vitest run src/__tests__/routes/lms-matriculas-progress-recovery-dry-run.test.ts src/__tests__/routes/lms-matriculas-progress-recovery-apply.test.ts src/__tests__/routes/lms-matriculas-progress-integrity.test.ts`
- `npm run lint`
- `npm run build`

Resultado:

- `53/53` testes direcionados passaram;
- lint verde;
- build verde.

## Produção

Campos para consolidacao apos merge e deploy:

- PR:
- commit publicado:
- `APP_VERSION`:
- Worker Version ID:
- horario UTC:

## Dry-runs de revalidacao

Preencher apos deploy:

- matricula `332`:
- matricula `323`:
- matricula `326`:

## Applies autorizados

Preencher apenas se a producao permanecer compativel:

- matricula `332`:
- matricula `323`:
- matricula `326`:

## Decisoes

- `AW139_PROGRESS_RECOVERY_APPLY_DEPLOYED`: pendente
- `AW139_PROGRESS_RECOVERY_APPLIED_FOR_AUTHORIZED_STUDENTS`: pendente
- `NO_COMPLETION_OR_QUALIFICATION_WRITES`: provado localmente, pendente de registrar em producao
