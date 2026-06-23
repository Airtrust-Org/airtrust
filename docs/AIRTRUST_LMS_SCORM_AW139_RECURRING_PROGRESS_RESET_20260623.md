# AIRTRUST LMS SCORM AW139 RECURRING PROGRESS RESET 20260623

## 1. Resumo executivo

Incidente recorrente de retomada SCORM no curso AW139 tratado com hardening no wrapper AirTrust e no merge do commit SCORM do Worker.

Resultado desta fase:

- regressão de `lesson_location` passou a ser bloqueada explicitamente;
- `suspend_data` vazio ou menor deixou de apagar checkpoint forte;
- wrapper passou a manter checkpoint local apenas de posição, sem persistir conteúdo sensível de prova;
- telemetria sanitizada foi adicionada para commits, regressões bloqueadas, resume aplicado e commits defensivos em unload/visibility.

Decisão desta fase:

`AIRTRUST WRAPPER HARDENED — VALIDACAO REAL PENDENTE`

## 2. Histórico e por que os hotfixes anteriores foram insuficientes

Correções anteriores já protegiam:

- conclusão MGM sem commit final;
- `lesson_location` numérico puro em cursos AW, como `238`;
- restore básico de resume no wrapper.

Insuficiência observada:

- o wrapper ainda aceitava `SetValue` regressivo durante a sessão;
- `suspend_data` fraco podia substituir checkpoint mais forte;
- o merge do backend protegia o snapshot inteiro em vários casos, mas não fazia reconciliação explícita campo a campo;
- não havia telemetria suficiente para distinguir reset do pacote versus sobrescrita fraca no wrapper.

## 3. Causa raiz

Classificação desta fase:

- pacote: `PACKAGE_INCONSISTENT_LOCATION`
- wrapper: `AIRTRUST_OVERWROTE_PROGRESS`
- conclusão: `ambos`

Base da conclusão:

- o pacote auditado é SCORM 1.2 e contém múltiplos blocos de questão em `Arquivos - EAD/Operações Offshore/config.json`;
- o pacote usa a lib SCORM genérica minificada e não expõe proteção própria contra reenvio de posição inicial durante prova/reload;
- o wrapper aceitava `cmi.core.lesson_location`, `cmi.location` e `cmi.suspend_data` sem bloqueio explícito de regressão na memória da sessão.

## 4. Evidência do aluno afetado

Não foi possível identificar matrícula real afetada a partir do repositório local sem consultar produção.

Limitação registrada:

- não houve consulta a logs/dados reais;
- nenhuma PII foi exposta;
- nenhuma matrícula real foi alterada.

Status desta parte:

`INCIDENTE BLOQUEADO POR FALTA DE EVIDENCIA` para a matrícula real específica.

## 5. Auditoria do pacote AW139

Pacote auditado localmente:

- `Arquivos - EAD/Operações Offshore/imsmanifest.xml`
- `Arquivos - EAD/Operações Offshore/config.json`
- `Arquivos - EAD/Operações Offshore/scorm.2aa5f200ece6542d.js`

Achados:

- pacote SCORM 1.2;
- launch em `index.html`;
- presença de quizzes/blocos de questão no `config.json`;
- runtime SCORM genérico com `LMSSetValue`, `LMSCommit` e `LMSFinish`;
- sem evidência local de guardrail interno contra reset de localização ou limpeza defensiva de `suspend_data`.

Classificação:

`PACKAGE_INCONSISTENT_LOCATION`

## 6. Auditoria do wrapper AirTrust

Arquivos auditados:

- `worker-airtrust/src/routes/lms-assets.ts`
- `worker-airtrust/src/routes/lms-matriculas.ts`
- `worker-airtrust/src/services/lms-progress-guardrails.ts`

Problemas confirmados antes da correção:

- `SetValue` aceitava regressão de `lesson_location`;
- `suspend_data` vazio ou menor não era bloqueado explicitamente no wrapper;
- não havia backup local de posição para reabrir sessão com servidor regredido;
- o merge do backend não reconciliava `location` e `suspend_data` separadamente.

## 7. Guardrails implementados

Wrapper:

- bloqueio explícito de `lesson_location` regressivo ou vazio;
- bloqueio explícito de `suspend_data` vazio ou menor;
- aplicação de backup local mais forte de posição no load;
- checkpoint local apenas de posição/progresso resumido;
- limpeza do backup local na conclusão bem-sucedida;
- commits defensivos com motivo em `finish`, `commit`, `beforeunload`, `pagehide` e `visibilitychange`.

Worker:

- novo merge campo a campo para runtime SCORM em `lms-progress-guardrails.ts`;
- preservação da `location` forte mesmo quando o pacote envia `1/380` ou outro marcador regressivo;
- preservação de `suspend_data` forte quando o pacote envia vazio ou payload menor;
- telemetria sanitizada no commit do Worker.

## 8. Telemetria

Eventos adicionados/registrados:

- `SCORM_INIT`
- `SCORM_SET_VALUE`
- `SCORM_COMMIT`
- `SCORM_FINISH`
- `SCORM_RESUME_APPLIED`
- `SCORM_REGRESSION_BLOCKED`
- `SCORM_BEFORE_UNLOAD_COMMIT`
- `SCORM_VISIBILITY_COMMIT`

Sanitização:

- sem CPF, e-mail, token, cookie ou resposta de prova;
- `suspend_data` registrado apenas como presença e tamanho;
- `lesson_location` registrado só como marcador sanitizado.

## 9. Testes

Arquivos cobertos nesta fase:

- `worker-airtrust/src/__tests__/routes/lms-assets-resume.test.ts`
- `worker-airtrust/src/__tests__/routes/lms-matriculas-progress-integrity.test.ts`
- `worker-airtrust/src/__tests__/routes/lms-progresso.test.ts`

Casos validados:

- reset regressivo bloqueado;
- `suspend_data` vazio não apaga checkpoint;
- `suspend_data` mais novo é aceito sem perder `location` forte;
- AW numérico puro continua preservado;
- testes LMS existentes continuam verdes.

## 10. CI local

Validações executadas localmente:

- `npm --prefix worker-airtrust test -- src/__tests__/routes/lms-assets-resume.test.ts src/__tests__/routes/lms-matriculas-progress-integrity.test.ts`
- `npm --prefix worker-airtrust test -- src/__tests__/routes/lms-progresso.test.ts`
- `npm run lint`
- `npm run build`

Resultado:

- tudo verde nesta máquina.

## 11. Deploy

Nenhum deploy executado nesta fase.

Motivo:

- a validação local foi concluída, mas a validação de retomada real com fixture/matrícula segura ainda precisa ocorrer antes de publicação.

## 12. Validação com fixture/matrícula segura

Ainda pendente fora desta fase local.

Cenário recomendado para validação pós-publicação controlada:

1. abrir AW139 em matrícula segura;
2. avançar até módulo 4/prova;
3. forçar reload/fechamento;
4. reabrir;
5. confirmar retorno ao ponto salvo;
6. confirmar logs `SCORM_REGRESSION_BLOCKED` e `SCORM_RESUME_APPLIED`.

## 13. Reempacotamento do pacote

Não foi executado nesta fase.

Recomendação:

- manter o hardening do AirTrust como proteção imediata;
- se a recorrência continuar com a nova telemetria, reempacotar o pacote AW139 com commit/checkpoint mais explícito em prova.

## 14. Segurança operacional

Confirmado nesta fase:

- sem SQL;
- sem migration/schema;
- sem alteração de matrícula real;
- sem aprovação falsa;
- SIGVOOS intocado;
- `frms-source-policy.ts` intocado.

## 15. Decisão final

Decisão operacional desta fase:

`AIRTRUST WRAPPER HARDENED — VALIDACAO REAL PENDENTE`
