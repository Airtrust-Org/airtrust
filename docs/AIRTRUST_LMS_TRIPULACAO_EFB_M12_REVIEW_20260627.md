# AIRTRUST LMS TRIPULACAO EFB M12 REVIEW 2026-06-27

## 1. Escopo

Revisão read-only do caso:

- matrícula `12`
- curso `EFB – Electronic Flight Bag`
- qualificação `4449`

## 2. Estado atual consolidado

### Matrícula 12

- `status=CONCLUIDO`
- `data_conclusao=2026-04-24`
- `qualificacao_historico_id=4449`
- `tentativas=3`
- `updated_at=2026-04-24 15:36:39`

### Estado SCORM persistido

- `lesson_status` coluna = `failed`
- `cmi.core.lesson_status` = `failed`
- `cmi.core.lesson_location` = `40/40`
- `cmi.core.score.raw` = `0`
- `cmi.core.score.max` = `2`
- `session_count=3`
- `last_commit_at=2026-04-24 15:36:28`
- `suspend_data_len=0`

### Audit logs encontrados

- `2026-04-24 15:36:28` -> `LMS_MATRICULA_REPROVADA`
- `2026-04-24 15:36:28` -> `LMS_MATRICULA_REPROVADA`
- `2026-04-24 15:36:39` -> `LMS_MATRICULA_FINALIZADA_MANUAL`

### Qualificação 4449

- `qualificacao_codigo=E5`
- `status=CONCLUIDA`
- `data_emissao=2026-04-24`
- `data_vencimento=2027-04-24`
- `lms_matricula_id=12`
- `renovacao_de=3483`
- `origem_tipo=LMS`

### Cadeia anterior

- `qh 3483` -> `E5`
- `status=RENOVADA`
- `data_vencimento=2026-04-29`

## 3. Respostas objetivas

### 1. A qualificação 4449 é defensável?

Não com a evidência técnica disponível no banco.

Motivos:

- o SCORM persistido marcou `failed`;
- o score persistido foi `0/2`;
- houve `LMS_MATRICULA_REPROVADA` antes da finalização manual;
- o backend normal jamais teria concluído esse caso automaticamente.

Classificação:

- `FAILED_BUT_COMPLETED`
- `EFB_M12_ROLLBACK_REVIEW_REQUIRED`

### 2. Existe evidência alternativa de conclusão?

No banco e nos documentos lidos nesta fase, não.

O que existe é apenas:

- evidência de navegação até o slide final (`40/40`);
- evidência de reprovação no quiz (`failed`, `0/2`);
- evidência de finalização manual posterior.

Isso não equivale a aprovação.

### 3. Houve reteste posterior?

Não foi encontrado reteste posterior na base lida:

- não existe nova matrícula do mesmo `funcionario_id=41` para `curso_id=4`;
- não foi encontrada nova qualificação `E5` adicional para o mesmo funcionário;
- não há novo commit SCORM posterior ao evento de `2026-04-24`.

### 4. Há duplicidade?

Não há duplicidade ativa do mesmo tipo.

Situação encontrada:

- `qh 3483` está `RENOVADA`
- `qh 4449` está `CONCLUIDA`

Portanto:

- cadeia estrutural existe;
- duplicidade vigente ativa não foi encontrada.

### 5. A qualificação deve entrar em rollback review?

Sim.

Decisão:

- `EFB_M12_ROLLBACK_REVIEW_REQUIRED`

Justificativa:

- há evidência explícita de reprovação;
- a conclusão foi manual e posterior ao evento de reprovação;
- a qualificação 4449 depende diretamente dessa matrícula.

### 6. Quais dados precisam ser coletados antes de eventual rollback?

Coletar antes de qualquer reversão:

1. identificação do operador que executou `LMS_MATRICULA_FINALIZADA_MANUAL`;
2. justificativa operacional usada em `2026-04-24`;
3. confirmação do gestor responsável sobre eventual exceção de negócio;
4. evidência externa de aprovação, se existir:
   - ata;
   - planilha;
   - print de reteste;
   - lista de presença;
   - novo certificado externo;
5. snapshot completo de:
   - `lms_matriculas`
   - `lms_progresso_scorm`
   - `qualificacoes_historico`
   - `audit_logs`
6. decisão explícita sobre a cadeia `3483 -> 4449`.

## 4. Avaliação final

Leitura técnica:

- o aluno chegou ao fim do conteúdo;
- o aluno não aprovou o quiz persistido;
- o sistema registrou reprovação;
- um admin concluiu manualmente depois;
- a qualificação foi gerada a partir desse desvio administrativo.

Conclusão:

- a qualificação `4449` não é defensável pela trilha SCORM disponível;
- nenhuma evidência alternativa foi localizada nesta fase;
- não houve reteste posterior detectável;
- não há duplicidade ativa, mas há cadeia de renovação que precisa ser preservada na análise;
- o caso deve entrar em revisão formal de rollback.

Decisões:

- `EFB_M12_ROLLBACK_REVIEW_REQUIRED`
- `FAILED_BUT_COMPLETED`
- `NO_NEW_RECOVERY_WRITES`
- `INCIDENT_STILL_OPEN`
