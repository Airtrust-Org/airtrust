# AirTrust Banco de Questões — módulo independente (contrato técnico V1)

Frente: issue #1661. Este primeiro lote define **apenas o domínio Worker** para criar, editar, revisar, publicar, versionar e corrigir provas com gabaritos privados. **Não disponibiliza telas, API, D1, autenticação ou publicação de provas.**

- **Autor** cria/edita pergunta `DRAFT` (enunciado, alternativas, resposta, justificativa, tópico, módulo e referência a unidade/versão do curso). Editar um rascunho não modifica uma questão já publicada.
- **Revisor independente** transforma DRAFT em REVIEWED. Um aprovador publica a revisão `PUBLISHED`, que recebe SHA-256 do conteúdo versionado. Questão publicada não pode ser editada; `forkPublishedQuestion` abre uma próxima revisão DRAFT.
- **Prova** referencia versões exatas e hashes das questões publicadas, por tenant, curso, módulo, edição e origem do treinamento. Uma única prova pode ter múltiplas seções, com limite de aprovação próprio (por exemplo dez questões e mínimo de 70% por módulo até nova política aprovada).
- A aplicação ao aluno recebe somente enunciado e alternativas. Gabarito e explicação ficam na camada privada do Worker. Nenhum método deste domínio concede `CONCLUIDO` ou certificado. A nota deve ser persistida por writer transacional separado, vinculada a matrícula/ciclo/edição/examVersion, com idempotência.
- **Consulta ao material é permitida**, mas a liberação da prova requer `STUDY_COMPLETED` real confirmado por Worker, não `LMSFinish`, último slide ou CMI `passed`. Esta interface ainda **não** está conectada.
- A futura camada D1 deve aplicar unicidade por `(tenant_id,question_id,revision)`, snapshots imutáveis de versões publicadas, transições RBAC verificadas pelo backend, auditoria append-only e transações de concorrência. Não realizar INSERT/UPDATE improvisados nem migrations sem Schema V2 revisado.
- O runtime legado SCORM 1.2 segue intacto nesta PR. F4 PR #1389 e F5 SCORM mantêm branches independentes.

## Gate e próxima fase
Vitest focado em `worker-airtrust/src/__tests__/lib/lms-independent-question-bank.test.ts`. Depois: schema V2 revisável, serviço administrativo RBAC multi-tenant, endpoints separados de edição/versão de perguntas e montagem de provas, UI de autoria, provas do aluno com consulta, integração com terminal canônico e E2E físico. Este contrato sem DB não previne sozinho competição de revisões; a transação D1 é indispensável.

## Estado após o Lote 1 (02/11/2026)
- Cada prova (`ExamPlan`) declara `acceptedQuestionSourceSha256`: atestado editorial das origens de ZIP cujas questões ela aceita. A origem da questão (`sourceSha256`) é só proveniência; trocar a edição do ZIP não invalida o banco.
- Questões sem resposta na submissão contam como erradas (`unanswered` no resultado); respostas duplicadas, desconhecidas ou em excesso continuam recusadas.
- A rota administrativa está montada em `/api/lms/exams/admin`, **desligada por padrão**: responde 503 fora de `ENVIRONMENT=staging` com a flag de revisão.
- O schema é a mudança numerada `0571` (`worker-airtrust/schema-v2/changes/0571_lms_exam_question_bank.sql`), **não aplicada** em nenhum ambiente. Aplicar exige registrar hashes no workflow de staging e autorização específica.
- Continua fora: tentativas, correção persistida, vínculo curso/edição, ligação ao `completeLmsMatricula` e tela do aluno.

## Estado após o Lote 2 (02/11/2026)
- Schema `0572` (planos publicados imutáveis, vínculo edição→prova append-only com classificação regulatória obrigatória, tentativas por ciclo, respostas): **não aplicado** em nenhum ambiente; exige 0569 e 0571 antes.
- `services/lms-exams/exam-attempt-store.ts`: publicar plano, vincular à edição, iniciar/retomar tentativa (idempotente), gravar resposta, enviar e corrigir no Worker. Sem rota de aluno ainda: quem chamar deve autenticar, provar a titularidade da matrícula e checar `isStudyCompleteAwaitingExam` antes.
- A prova aprovada só entra na conclusão como evidência: `ScormManifestClosureEvidence.externalExam` é preenchido para pacotes `assessment.mode=EXTERNAL` com tentativa aprovada no ciclo ativo e na edição servida. Sem o schema (produção hoje) a busca falha fechada e o comportamento continua `EXTERNAL_ASSESSMENT_PENDING`.
- `decideScoreF5Finalization` continua sem uso em runtime: ligá-la exige a política congelada no ciclo e a generalização do engine, previstas para o lote da tela do aluno.

## Estado após o Lote 3 (02/11/2026)
- **Rotas do aluno** em `/api/lms/exams` (`routes/lms-exam-learner.ts`), desligadas por padrão: 503 fora de `ENVIRONMENT=staging` com `LMS_EXAM_LEARNER_STAGING=REVIEWED_SCHEMA_ONLY`.
  - `GET /matriculas/:id/prova` estado (`NOT_AVAILABLE|STUDY_PENDING|READY|PASSED|COMPLETED`), `POST /matriculas/:id/tentativas` (cabeçalho `Idempotency-Key`), `PUT /tentativas/:id/respostas`, `POST /tentativas/:id/enviar`.
  - Titularidade e prontidão do estudo são recalculadas no servidor a cada chamada (`services/lms-exams/exam-gate.ts`); só o titular da matrícula passa e matrícula alheia responde 404.
  - Aprovar não conclui: o aluno chama o `POST /api/lms/matriculas/:id/finalizar` existente, que agora enxerga a prova aprovada como evidência. Não há segundo writer.
- **Rotas admin** (mesmo prefixo `/exams/admin`, mesma flag de staging): `POST /cursos/:id/provas` publica o plano (imutável) e `POST /cursos/:id/provas/:examId/versoes/:v/vinculo` o vincula à edição, com a classificação regulatória obrigatória.
- **Tela** `LmsProva` em `/lms/provas/:matriculaId` (radios agrupados por questão, salvamento a cada resposta, confirmação de envio com aviso de questões em branco, resultado sem gabarito) e botão "Ir para a prova final" no player quando a prova é a única pendência.
- Continua fora: consulta ao conteúdo durante a prova, tela de admin para montar a prova, limite/intervalo de retentativas (hoje sem limite), tempo, acomodações e a ligação de `decideScoreF5Finalization`.
