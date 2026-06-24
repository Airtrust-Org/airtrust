# AIRTRUST LMS SCORM COMPLETION E2E RELIABILITY 20260624

## 1. Resumo executivo

O hotfix de confiabilidade de conclusão SCORM foi isolado em worktree limpa a partir de `origin/main` e validado localmente sem reaproveitar a branch contaminada anterior.

Resultado desta fase:

- o player AirTrust deixou de tratar sinal visual do pacote como conclusão definitiva;
- a conclusão visual passou a virar estado pendente até confirmação do backend;
- o backend só conclui matrícula quando há evidência SCORM robusta;
- o endpoint `POST /matriculas/:id/finalizar` deixou de aceitar bypass cego;
- a geração de qualificação ficou condicionada à conclusão aceita e continua idempotente;
- AW139 manteve o hardening de resume contra regressão de `lesson_location` e perda de `suspend_data`;
- o relatório read-only de inconsistências LMS ficou exposto em `/api/lms/relatorios/conclusoes-inconsistentes`;
- harness local forte passou, mas não houve fixture real de browser/produção.

Decisão desta fase:

`E2E_BROWSER_BLOCKED_BUT_SCORM_HARNESS_PASSED`

## 2. Causa raiz

O problema não estava em um único ponto.

Camadas envolvidas:

- pacote SCORM podia sinalizar visualmente conclusão cedo demais;
- wrapper/player podia tratar esse sinal como evento forte antes da confirmação do backend;
- o backend podia aceitar finalização manual sem evidência SCORM suficiente;
- commits SCORM regressivos podiam reduzir `lesson_location` ou enfraquecer `suspend_data`, afetando resume e conclusão auditável.

## 3. Diferença entre progresso, score, status SCORM, conclusão LMS e qualificação

- progresso: indicação operacional de avanço do curso;
- score: nota informada pelo pacote;
- status SCORM: `lesson_status`, `completion_status` e `success_status`;
- conclusão LMS: transição da matrícula para `CONCLUIDO` com `data_conclusao`;
- qualificação: histórico gerado a partir da conclusão LMS aceita.

Conclusão importante:

- score alto sozinho não é conclusão;
- conclusão visual sozinha não é conclusão;
- qualificação não pode nascer sem matrícula realmente concluída.

## 4. Por que Francisco não renovou

Com base no diagnóstico anterior preservado:

- a ponte LMS → Qualificações existia;
- os cursos relevantes estavam configurados para gerar qualificação;
- o gargalo era a matrícula não chegar a `CONCLUIDO`.

Portanto, Francisco não renovou porque a evidência robusta de conclusão nunca consolidou a matrícula LMS como concluída.

## 5. Por que AW139 podia mostrar score ou conclusão visual sem matrícula concluída

- o pacote podia mostrar feedback visual de término;
- o wrapper ainda precisava confirmar o commit final;
- commits regressivos ou fracos podiam preservar score sem status final consistente;
- o backend não deve inferir conclusão só por score alto ou mensagem visual.

## 6. Onde o fluxo quebrava

- no wrapper, ao promover cedo demais a percepção visual de conclusão;
- no backend, quando a finalização manual não exigia prova SCORM suficiente;
- no merge do runtime SCORM, quando `location` e `suspend_data` podiam enfraquecer;
- na visibilidade operacional, porque inconsistências não apareciam claramente em relatório read-only.

## 7. O que foi corrigido

- `src/react-app/pages/lms/LmsPlayer.tsx`
  - toasts do AirTrust substituem o fluxo de feedback de conclusão;
  - estados `saving`, `pending`, `error` e `success` foram alinhados ao backend;
  - a UI não fecha o curso automaticamente e não declara conclusão antes da confirmação.

- `worker-airtrust/src/routes/lms-assets.ts`
  - commits passam `commit_event`, `completion_candidate` e `completion_observed_at`;
  - conclusão candidata gera pendência explícita e só vira sucesso após resposta do servidor;
  - regressões de runtime continuam bloqueadas;
  - não há uso de alerta nativo para conclusão.

- `worker-airtrust/src/services/lms-progress-guardrails.ts`
  - regra reutilizável de diagnóstico SCORM;
  - merge defensivo de runtime;
  - classificação entre aceito, candidato, rejeitado e inconsistente.

- `worker-airtrust/src/routes/lms-matriculas.ts`
  - diagnóstico aplicado no commit SCORM;
  - `/finalizar` exige evidência SCORM compatível;
  - logs de auditoria registram `SCORM_COMPLETION_CANDIDATE`, `SCORM_COMPLETION_ACCEPTED`, `SCORM_COMPLETION_REJECTED`, `SCORM_FINAL_COMMIT_MISSING`, `SCORM_STATUS_INCONSISTENT`, `SCORM_QUALIFICATION_TRIGGERED` e `SCORM_QUALIFICATION_SKIPPED`.

- `worker-airtrust/src/repositories/lmsRelatoriosRepository.ts`
  - relatório read-only de inconsistências SCORM usando o mesmo diagnóstico do backend.

## 8. Como o toast substitui o alerta nativo

Mensagens alinhadas nesta fase:

- recebimento inicial: `Conclusão recebida. Salvando progresso...`
- confirmação: `Curso concluído e registrado com sucesso.`
- pendente ou rejeitado: `Conclusão recebida, mas ainda não confirmada pelo servidor.`

Conclusão operacional:

- o fluxo visível agora é controlado pelo player AirTrust, não por `window.alert`.

## 9. Como a conclusão agora depende de confirmação backend

- o wrapper envia commit candidato quando detecta sinal forte de conclusão;
- o backend calcula diagnóstico com score, status, progresso, location, tempos e commit final;
- apenas resposta com `novo_status = CONCLUIDO` promove a UI para sucesso definitivo;
- se o backend responder candidato ou inconsistente, a UI permanece em pendência ou erro auditável.

## 10. Como o bridge LMS → Qualificações fica protegido

- matrícula só conclui após aceitação;
- `data_conclusao` só nasce no caminho aceito;
- `createLmsQualificationOnCompletion` roda depois da conclusão;
- reenvio continua sem duplicar histórico;
- conclusão rejeitada, inconsistente ou pendente não gera qualificação.

## 11. Testes executados

Worker:

- `npx vitest run src/__tests__/routes/lms-matriculas-progress-integrity.test.ts --reporter=dot`
- `npx vitest run src/__tests__/routes/lms-assets-resume.test.ts --reporter=dot`
- `npx vitest run src/__tests__/routes/lms-progresso.test.ts --reporter=dot`
- `npx vitest run src/__tests__/routes/lms-relatorios-repository-contract.test.ts --reporter=dot`
- `npx vitest run src/__tests__/routes/lms-assets-scorm-public-empresa-fallback.test.ts --reporter=dot`

Frontend:

- `npx vitest run src/__tests__/LmsPlayer.completion-flow.test.tsx --reporter=dot`
- `npx vitest run src/__tests__/lms-access-and-finalize.test.tsx --reporter=dot`

Gates gerais:

- `npm run lint`
- `npm run build`

Resultado local:

- tudo verde nesta worktree.

## 12. E2E ou harness executado

Não houve Playwright real contra fixture segura nesta fase.

Houve harness forte local cobrindo:

- fluxo de conclusão aceita;
- fluxo candidato sem conclusão falsa;
- bloqueio de regressão de location;
- bloqueio de `suspend_data` vazio;
- proteção do `/finalizar`;
- fluxo visual do player para `saving`, `pending`, `error` e `success`.

Decisão desta parte:

`E2E_BROWSER_BLOCKED_BUT_SCORM_HARNESS_PASSED`

## 13. Pendências

- falta fixture real segura para AW139 e IIO/APRS em browser real;
- falta validação pós-deploy controlada;
- ainda não foi feita remediação histórica de matrículas reais.

## 14. Reempacotamento do pacote SCORM

Não há prova nesta fase de que reempacotamento é obrigatório para liberar o hotfix.

Conclusão desta etapa:

- o wrapper AirTrust consegue neutralizar o problema operacional imediato sem repackaging;
- se o pacote continuar emitindo sinal visual enganoso fora do controle do wrapper, registrar como `SCORM_PACKAGE_REPACKAGING_REQUIRED` em fase separada.

## 15. Remediação manual

Não foi executada.

Também não é parte deste PR:

- Francisco;
- Wagner;
- Alane/Alan;
- qualquer aluno real.

## 16. Riscos remanescentes

- sem fixture real, ainda falta prova de browser end-to-end fora do harness local;
- o pacote pode continuar inconsistente internamente, mesmo com o guardrail do AirTrust;
- a auditoria depende do que o pacote realmente persiste em `cmi_json` e `suspend_data`.

## 17. Decisão final

Decisão operacional desta worktree:

`E2E_BROWSER_BLOCKED_BUT_SCORM_HARNESS_PASSED`
