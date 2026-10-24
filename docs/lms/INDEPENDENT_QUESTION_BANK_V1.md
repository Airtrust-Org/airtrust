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
