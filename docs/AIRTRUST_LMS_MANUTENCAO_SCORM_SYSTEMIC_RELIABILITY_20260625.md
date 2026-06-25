# AIRTRUST LMS MANUTENCAO SCORM SYSTEMIC RELIABILITY 20260625

## 1. Resumo executivo

Esta fase ficou restrita a analise e correcoes locais no codigo do LMS/SCORM, sem escrita em producao, sem migration e sem remediacao historica.

Achado principal confirmado localmente:

- o endpoint `POST /api/lms/matriculas/scorm/commit` preservava `cmi_json` e `lesson_location` fortes apos merge defensivo, mas calculava `progresso_pct` usando apenas o payload bruto do commit recebido;
- isso permitia coexistencia de estado incoerente do tipo `location` alta preservada com `progresso_pct` baixo ou travado, o que ajuda a explicar sintomas operacionais como `posicao 18` ou `115` com `progresso 1%`;
- a correcao local passou a calcular progresso com base no runtime SCORM ja reconciliado.

Resultado desta fase:

- correcao minima aplicada no worker LMS;
- harness local ampliado para todos os cursos de Manutencao listados no incidente;
- testes locais verdes;
- sem deploy;
- sem classificacao de incidente como resolvido em producao.

## 2. Escopo realmente validado

Validado localmente:

- merge defensivo de `cmi_json`, `lesson_location` e `suspend_data`;
- progresso monotônico derivado do estado reconciliado;
- conclusao candidata e finalizacao controlada por evidencia SCORM;
- geracao de qualificacao idempotente no fluxo aceito;
- relatorio de inconsistencias SCORM sem regressao de contrato;
- player frontend mantendo fluxo de toast/pendencia/finalizacao.

Nao validado nesta fase:

- auditoria read-only de producao por aluno real;
- browser E2E com fixture segura em ambiente semelhante a producao;
- pacote-fonte real de todos os cursos de Manutencao;
- deploy e smoke pos-publicacao.

## 3. Causa raiz sistemica confirmada

Classificacao desta fase:

- backend LMS: `PROGRESS_NOT_PERSISTED`
- backend LMS: `SCORM_STATUS_INCONSISTENT`

Descricao objetiva:

- o worker ja preservava estado forte em `cmi_json`, mas persistia `progresso_pct` a partir do commit de entrada, nao do estado final reconciliado;
- um commit regressivo ou fraco podia ser bloqueado para `location` e `suspend_data`, mas ainda assim deixar a matricula com progresso numerico defasado;
- isso distorce o relatorio `/lms/relatorios`, a lateral do player e a leitura operacional do caso;
- a conclusao SCORM continua exigindo evidencia robusta, entao esse desvio de progresso nao virou aprovacao falsa, mas manteve varios casos como inconsistentes ou visualmente confusos.

## 4. O que foi corrigido

Arquivo alterado:

- `worker-airtrust/src/routes/lms-matriculas.ts`

Correcao aplicada:

- `mergeScormRuntimeState(...)` passou a ocorrer antes do calculo de progresso;
- `progresso_pct` passou a usar `extractProgressPctFromCmiJson(mergedCmiJson)`;
- o progresso agora acompanha o `location` forte preservado pelo merge defensivo;
- o `completion_diagnostic` tambem passa a refletir o progresso reconciliado.

Impacto esperado:

- commits regressivos nao derrubam mais a leitura de progresso quando o `location` forte ja existia;
- relatorio de inconsistencias e resposta do commit ficam mais coerentes com o estado runtime final;
- reduz falso sintoma de `posicao alta + progresso quase zero`.

## 5. Cobertura por curso no harness local

Cobertura positiva adicionada no worker para os cursos abaixo, via finalizacao controlada com evidence candidate por fixture:

| curso | location fixture | resultado local |
| --- | --- | --- |
| MGM - Manual Geral de Manutencao | `98/98` | `PASS` |
| MCQ - Manual de Controle de Qualidade | `84/84` | `PASS` |
| MOM - Manual da Organizacao de Manutencao | `76/76` | `PASS` |
| SGSO para Manutencao | `64/64` | `PASS` |
| Treinamento tecnico Integracao Manutencao | `52/52` | `PASS` |
| HUMS | `88/88` | `PASS` |
| HUMS-VXP | `92/92` | `PASS` |
| Inspecao IIO & APRS | `80/80` | `PASS` |
| AW139 - Manutencao | `380/380` | `PASS` |
| PT6C-67C - Manutencao | `108/108` | `PASS` |
| Heliwise - Manutencao | `45/45` | `PASS` |

Cobertura negativa local existente:

- commit stale com `location` regressivo;
- `suspend_data` menor ou vazio;
- score alto sem status conclusivo no slide final;
- bloqueio de `/finalizar` sem evidencia suficiente.

## 6. Testes executados

Worker:

- `npx vitest run src/__tests__/routes/lms-matriculas-progress-integrity.test.ts`
- `npx vitest run src/__tests__/routes/lms-assets-resume.test.ts`
- `npx vitest run src/__tests__/routes/lms-relatorios-repository-contract.test.ts`

Frontend:

- `npx vitest run src/__tests__/LmsPlayer.completion-flow.test.tsx`
- `npx vitest run src/__tests__/lms-access-and-finalize.test.tsx`

Gates:

- `npm run lint`
- `npm run build`

Resultado desta fase:

- tudo verde localmente apos instalar dependencias ausentes do workspace.

## 7. Casos reais e producao

Nenhum caso real foi alterado.

Sem acesso read-only a producao neste workspace, nao foi possivel fechar localmente:

- Bruno Justino;
- Alan Cortes;
- Francisco Altermir;
- Wagner Domas;
- alunos listados em `Inconsistencias SCORM`.

Classificacao obrigatoria desta fase para casos reais:

- `HISTORICAL REMEDIATION REQUIRED — NO AUTOMATIC WRITE`

## 8. Pacotes SCORM

Foi reaproveitada apenas a auditoria local ja registrada para AW139.

Nao houve prova nova nesta fase de que:

- todos os pacotes de Manutencao estao corretos;
- reempacotamento seja obrigatorio agora;
- reempacotamento resolva sozinho os sintomas de producao.

Classificacao desta parte:

- `PACKAGE REPACKAGING REQUIRED FOR SOME COURSES` = nao comprovado nesta fase;
- manter como pendencia de auditoria especifica por pacote real.

## 9. Pendencias obrigatorias

Antes de classificar o incidente como resolvido:

1. executar auditoria read-only de producao por curso e por aluno afetado;
2. rodar fixture segura em browser real para AW139, PT6C, MGM, HUMS-VXP, SGSO, Integracao e IIO/APRS;
3. validar `/lms/relatorios` apos novo commit seguro;
4. decidir se algum pacote precisa reempacotamento;
5. montar plano separado de remediacao historica, sem write automatico.

## 10. Decisao final desta fase

Decisao honesta desta worktree:

- `E2E BLOCKED BY FIXTURE LIMITATION`
- `HISTORICAL REMEDIATION REQUIRED — NO AUTOMATIC WRITE`

Nao declarar resolvido em producao nesta fase.
