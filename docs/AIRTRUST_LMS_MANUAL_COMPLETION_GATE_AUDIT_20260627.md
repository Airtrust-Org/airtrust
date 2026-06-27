# AIRTRUST LMS MANUAL COMPLETION GATE AUDIT 2026-06-27

## 1. Resumo executivo

Auditoria read-only do AirTrust em `2026-06-27`, seguida de correção técnica mínima no código, confirmou que havia um caminho administrativo inseguro para cursos SCORM.

Achado principal:

- os endpoints `POST /api/lms/matriculas/:id/finalizar` e `PATCH /api/lms/matriculas/:id/status` já bloqueavam `lesson_status=failed`, mas ainda aceitavam estado `candidate` sem `passed/completed` explícito;
- isso permitia concluir matrícula SCORM e disparar `createLmsQualificationOnCompletion()` apenas com progresso final aparente + score suficiente + evidência de runtime;
- o caso `EFB M12` não depende desse caminho específico porque estava com `failed`, mas o bypass era suficiente para reproduzir risco equivalente ao de uma conclusão administrativa sem evidência SCORM robusta.

Decisão desta fase:

- `UNSAFE_MANUAL_COMPLETION_PATH_FOUND`
- `MANUAL_COMPLETION_GATE_HARDENED`
- `QUALIFICATION_BYPASS_CLOSED`
- `NO_NEW_RECOVERY_WRITES`
- `INCIDENT_STILL_OPEN`

## 2. Documentos revisados

Foram revisados os seguintes artefatos existentes:

- `docs/AIRTRUST_LMS_MANUTENCAO_ADMIN_EXCEPTION_MEMO_20260627.md`
- `docs/evidence/lms-maintenance-post-recovery-snapshot-20260627.json`
- `docs/AIRTRUST_LMS_TRIPULACAO_EFB_M12_REVIEW_20260627.md`
- `docs/AIRTRUST_LMS_TRIPULACAO_SCORM_ENGINE_REWORK_PLAN_20260627.md`
- `docs/AIRTRUST_LMS_SCORM_RISK_CONTAINMENT_20260627.md`

Confirmações documentais:

- Manutenção registrada como exceção administrativa fora do escopo;
- ausência de `audit_logs` para a remediação SQL de `2026-06-27`;
- IDs afetados listados;
- flags `NO_NEW_RECOVERY_WRITES`, `NO_MANUAL_COMPLETION_ALLOWED` e `ROLLBACK_REVIEW_REQUIRED_FOR_SUBSET` presentes;
- caso `EFB M12` classificado como `FAILED_BUT_COMPLETED`;
- rework do engine SCORM de Tripulação registrado;
- incidente permanece aberto.

## 3. Caminhos auditados

### Backend LMS

1. `worker-airtrust/src/routes/lms-matriculas.ts`
2. `worker-airtrust/src/routes/lms-progresso.ts`
3. `worker-airtrust/src/services/lms-progress-guardrails.ts`
4. `worker-airtrust/src/services/lms-qualification.ts`

### Frontend / chamadas de cliente

1. `src/react-app/hooks/useLms.ts`
2. `src/__tests__/lms-access-and-finalize.test.tsx`

## 4. Classificação dos gates atuais

### A. `POST /api/lms/matriculas/:id/finalizar`

- exige admin ou manager; aluno só finaliza a própria matrícula;
- antes da correção: aceitava `explicit_completion=false` quando `completion_diagnostic.status='candidate'`;
- para SCORM, isso podia concluir matrícula e gerar qualificação sem `passed/completed` robusto;
- cria `audit_logs` via `SCORM_COMPLETION_ACCEPTED`, `LMS_MATRICULA_FINALIZADA_MANUAL` e `SCORM_QUALIFICATION_TRIGGERED/SKIPPED`.

Classificação anterior:

- `UNSAFE_MANUAL_COMPLETION_PATH`
- `QUALIFICATION_BYPASS_RISK`

Classificação atual:

- `SAFE_GATE_PRESENT`

### B. `PATCH /api/lms/matriculas/:id/status`

- exige `admin` ou `manager`;
- manager já não podia concluir matrícula com qualificação vinculada;
- antes da correção: ainda aceitava `candidate` sem conclusão explícita para SCORM;
- podia concluir matrícula e gerar qualificação por `createLmsQualificationOnCompletion()`.

Classificação anterior:

- `UNSAFE_MANUAL_COMPLETION_PATH`
- `QUALIFICATION_BYPASS_RISK`

Classificação atual:

- `SAFE_GATE_PRESENT`

### C. `POST /api/lms/matriculas/:id/commit`

- não é caminho manual administrativo;
- conclui apenas quando `isScormSuccess()` identifica `passed/completed` explícito com score coerente;
- reprova em `failed`;
- cria `audit_logs` de progresso e conclusão.

Classificação:

- `SAFE_GATE_PRESENT`

### D. `POST /api/lms/xapi/statements`

- não é caminho manual administrativo;
- conclui por verbos explícitos `passed/completed`;
- gera qualificação apenas no fluxo automático de conclusão.

Classificação:

- `SAFE_BUT_NEEDS_TEST`

## 5. Lacunas encontradas

1. O diagnóstico `candidate` era tratado como autorização de conclusão manual em SCORM.
2. O bypass permitia gerar qualificação sem `lesson_status=passed` ou `completion_status=completed`.
3. O frontend do player continua chamando `/finalizar`, então o hardening precisava ficar no backend, não na UI.
4. A trilha histórica de Manutenção segue fora do app e sem `audit_logs` canônicos suficientes.

## 6. Correção aplicada

Arquivo alterado:

- `worker-airtrust/src/routes/lms-matriculas.ts`

Regra nova para curso SCORM:

- conclusão manual agora exige `completion_diagnostic.explicit_completion === true`;
- `candidate` continua auditável, mas não autoriza `CONCLUIDO`;
- `failed` continua bloqueado;
- score alto isolado continua insuficiente;
- geração de qualificação manual deixa de ocorrer sem `passed/completed` robusto.

## 7. Testes existentes e adicionados

Testes atualizados:

- `worker-airtrust/src/__tests__/routes/lms-matriculas-status-gate.test.ts`
- `worker-airtrust/src/__tests__/routes/lms-matriculas-progress-integrity.test.ts`

Cobertura reforçada:

- rejeição de `PATCH /status` quando há `candidate` auditável sem conclusão explícita;
- rejeição de `POST /finalizar` quando há apenas `candidate`;
- preservação do fluxo não-SCORM para PDF/PPTX;
- preservação do bloqueio para estados SCORM sem evidência suficiente.

## 8. Decisão sobre risco de repetição

Estado atual do app após a correção:

- o caso histórico de SQL direto em Manutenção continua fora do caminho da aplicação;
- o caso `EFB M12` continua exigindo revisão separada e sem rollback nesta fase;
- o bypass administrativo dentro do app para SCORM sem `passed/completed` robusto foi fechado.

Decisão:

- `MANUAL_COMPLETION_GATE_HARDENED`
- `QUALIFICATION_BYPASS_CLOSED`
- `INCIDENT_STILL_OPEN`

## 9. Próximos passos

1. Abrir PR técnico pequeno com o hardening dos gates SCORM.
2. Manter PR documental com os artefatos de contenção e este relatório.
3. Em fase separada, revisar rollback de `Manutenção 328/344/396/398` e `EFB M12`.
4. Ampliar cobertura de teste em `POST /api/lms/xapi/statements` para cenários de qualificação.
