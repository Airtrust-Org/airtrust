# Player 3 — Contrato de avaliações por módulo (Frente B)

**Estado 2026-10-14:** Código em PR #1389, em draft. Staging desativado por padrão, migrations **não aplicadas**. Não constitui homologação do LMS.

## API para Frentes A e D

**POST /api/lms/native/matriculas/{matriculaId}/etapas/{stageId}/tentativas**

A aplicação AirTrust envia Authorization JWT e Content-Type application/json.
O corpo tem limite de 128 KiB e os seguintes campos estritos:

- eventId: ID estável e exclusivo da submissão; usar o mesmo no replay;
- attemptNumber: contador de 1 a 500, independente para cada etapa;
- answers: lista de objetos contendo somente questionId e optionId.

Nunca enviar grade, correctOptionId, certificate, tenant, ciclo ou edition
no corpo. A identidade do funcionário, curso, ciclo e edição é verificada
diretamente pelo Worker a partir de autenticação, banco e R2 privado.

**GET /api/lms/native/matriculas/{matriculaId}/etapas/sessao:** consulta
protegida do mesmo tenant, matrícula, ciclo e edição para reabrir o treinamento.
Recalcula os recibos de aprovação com a política e o banco de respostas
privados; retorna stages (stageId, attempts, lastScorePct, passed,
nextAttemptNumber), editionSha256, cycleId e allOfficialStagesPassed.
O booleano de provas aprovadas não significa matrícula concluída:
completionSupported continua false. Nenhuma resposta ou gabarito sai no GET.

**Resposta:** HTTP 201 para nova tentativa e 200 para replay idêntico.
Inclui state, stage_id, attempt_number, edition_sha256, score_pct,
stage_passed e completion_supported=false. Não retorna gabaritos. HTTP
400 para corpo inválido, 401/403 para credencial inválida, 404 para gate
desligado, 409 para conflito e 503 para indisponibilidade.

## Gates de execução

Somente staging com três allowlists exatas e independentes,
todas exigindo o mesmo tenant sem wildcard:

- NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS
- NATIVE_LEARNER_WRITE_ENABLED_TENANTS
- PLAYER3_MODULE_ATTEMPTS_ENABLED_TENANTS (novo, default OFF)

**Frente A:** manter o HTML5 visual original, mas nenhuma mensagem da página
pode certificar aluno. O AirTrust usa a API acima para tentar a prova. Só
liberar o próximo módulo após recibo persistido de stage_passed=true.
Após perda de conexão, consultar GET de sessão modular autenticado e só liberar após confirmação.
Nunca confiar no contador local ou no fechamento de janela.

**Frente D:** testar aprovação, reprovação, replay, colisão, interrupção,
volta de conexão, mesma edição, troca de edição, tenant/ciclo divergente,
reabertura Safari/Chromium e SCORM de fornecedor externo. O E2E não está
homologado até existir leitura reconciliada e conclusão real/certificado.

## D1 e R2 (propriedade da Frente B)

Migration aditiva Schema V2: worker-airtrust/schema-v2/changes/
0553_lms_player3_module_attempts.sql (requer 0552). Não aplicada.

As tabelas lms_player3_politicas e lms_player3_tentativas_modulares mantêm
respectivamente política e hashes aprovados por edição e tentativas append-only
com sequência independente por etapa, nota do backend e replay idempotente.

No R2 privado e prefixo imutável da edição, o Worker espera:
- player3-approved-policy.json
- player3-server-private-bank.json

Os dois documentos precisam ter SHA-256 ancorado no D1, e o banco de
respostas jamais pode sair pelo endpoint do aluno ou pelo ZIP HTML5.
Não existe API de publicação habilitada; dados de revisão são privados.

**Aprovação de uma etapa NÃO conclui treinamento.** O gate canônico ainda
precisa exigir todas as provas obrigatórias, evidências de aprendizagem,
qualificação e certificado verificável, sob ciclo e edição imutáveis.

## Próximas condições

1. HTML5 fiel sem gabaritos e política pedagógica aprovada (Frente A).
2. Aplicação Schema V2 0552/0553 apenas por workflow governado em staging.
3. Política e gabarito SHA-pinned armazenados no R2 privado.
4. reconciliação de provas por etapa com as demais evidências e
   integração do resultado com completeLmsMatricula.
5. E2E real Doutrinamento 42/42 e SCORM externo, depois oito gates,
   autorização específica de SHA/escopo e fluxo oficial de release.

Nenhuma matrícula foi atualizada, migrada ou concluída nesta etapa.


## Prontidão conjunta — contrato 2026-10-14

**GET /api/lms/native/matriculas/{matriculaId}/etapas/prontidao**:
rota autenticada e só em staging com os mesmos três gates exatos. Consulta
Worker-private a edição, o ciclo, as unidades de conteúdo registradas e as
aprovações modulares verificadas, sempre da mesma matrícula/ciclo/edição.
Retorna metadados `totalRequiredLessons`, `verifiedLessons`,
`officialStageCount`, `officialStagesPassed`,
`readyForAtomicTerminalPreflight`, `reason`, `editionSha256`,
`cycleId` e **`completion_supported=false`**. Nunca devolve gabarito.

Esta resposta não significa matrícula concluída. A guarda SQL
`lms-player3-terminal-transaction-guard.ts` já existe e foi testada contra
SQLite 0552/0553, mas ainda não foi conectada ao writer transacional de
qualificação/certificado. A segurança do conteúdo HTML5 e a comprovação
visual devem ser concluídas antes de habilitar o fechamento.

**Para Frente A:** o mapeamento entre HTML5 autoral e evidência de conteúdo
deve produzir identificadores estáveis de unidades, vinculados à edição,
para que a API reconheça todas as unidades obrigatórias. Não utilizar o
contador DOM como fonte de verdade. Não enviar nota/certificado no POST.

**Para Frente D:** validar este GET com conteúdo completo vs faltante,
todas as provas vs uma pendente, edição/ciclo divergentes, aluno sem
autorização, reabertura/reconexão e prova seguida de perda de sinal.
O resultado `readyForAtomicTerminalPreflight=true` NÃO autoriza tratar o
aluno como CONCLUIDO. Exigir posteriormente a transação final e o
certificado realmente recuperável. Não testar em produção.


## Marco de integração terminal B — 2026-10-14

A Frente B agora tem preparador server-only de comprovantes reais, pré-validação
das unidades do conteúdo e guarda de transação na função canônica
`completeLmsMatricula`. **Isso não disponibiliza conclusão ao aluno**:
não há endpoint terminal Player3 exposto e faltam o Schema V2 de intent
atômico, a aplicação governada das migrations, a qualificação/certificado
validados e os testes E2E.

**Frente A:** cada unidade/lesson obrigatória deve ter ID estável **da edição**,
para permitir prova de cobertura completa no ledger, mesmo após reabertura.
Uma etapa de avaliação aprovada **não substitui** evidência de visita às
unidades de conteúdo. O HTML5 publicado não pode expor gabarito.

**Frente C:** ao transferir 80% de progresso, não forçar `seenLessonIds`,
nota ou tentativa oficial no banco sem recibo verificável. Equivalência
administrativa de navegação não é certificado.

**Frente D:** teste E2E precisa observar uma matrícula cujo percurso termina
com todos os eventos + recibos, `CONCLUIDO` no ciclo certo, qualificação e
certificado **realmente consultável**. Não basta `/etapas/prontidao=true` ou
a chamada a `completeLmsMatricula`. Validar falhas no serviço de certificados,
idempotência e rollback antes de homologar.
