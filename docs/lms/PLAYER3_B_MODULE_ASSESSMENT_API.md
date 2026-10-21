# Player 3 — Contrato da prova formal terminal (Frente B)

**Estado 2026-10-14:** Código em PR #1389, em draft. Staging desativado por padrão, migrations **não aplicadas**. Não constitui homologação do LMS.

## API para Frentes A e D

Esta API recebe somente a prova formal terminal, liberada após o registro de
todas as unidades instrucionais obrigatórias. Fixações dos módulos usam a rota
`POST /api/lms/native/matriculas/{matriculaId}/pratica`; elas podem ser repetidas,
retornam feedback sem nota ou tentativa e não participam da conclusão.
Uma política aprovada deve conter exatamente uma etapa oficial, vinculada à
última unidade de avaliação da edição. Políticas oficiais com etapas modulares
intermediárias são recusadas pelo Worker.

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
0554_lms_player3_module_attempts.sql (requer 0553). Não aplicada.

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
2. Aplicação Schema V2 0553/0554 apenas por workflow governado em staging.
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
SQLite 0553/0554. A guarda está integrada internamente ao writer canônico
`completeLmsMatricula`; o contrato 0556 continua **REVIEW-ONLY** e o endpoint
terminal Player3 é **default OFF** até Schema V2 governado, homologação do
HTML5 sem gabarito, inventário T0/T1 e E2E de certificado existente.

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

## Marco de terminal transacional B — 2026-10-14 (continuação)

- O preparador `preparePlayer3CanonicalTerminal` é server-only e recolhe
  recibos de provas corrigidas com gabarito R2 privado, todas as lições
  efetivamente persistidas e qualificação escopada à matrícula/ciclo/edição.
- No `completeLmsMatricula` o Player3 usa **um único D1.batch**:
  1. SQL de guarda das lições e tentativas aprovadas;
  2. INSERT de `lms_player3_completion_intents` com nonce e recibos privados;
  3. writes canônicos da matrícula, ciclo, histórico, qualificação e audit log;
  4. DELETE de intent antes de COMMIT. O conceito 0556 exige FK diferida
     contra sentinela não preenchível: o intent órfão aborta a transação.
- O plano **0555 REVIEW-ONLY** passa a substituir, quando aplicável,
  o trigger de tentativas de 0554 para reconhecer **somente SCORM explicitamente
  ativado** no mesmo tenant/curso; SCORM externo não ativado continua recusado.
- **POST /api/lms/native/matriculas/{matriculaId}/etapas/concluir**:
  rota autenticada, corpo **vazio**, sem nota ou identificadores manipuláveis;
  protegida por seis gates exatos, independentes e staging-only:
  `NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS`,
  `NATIVE_LEARNER_WRITE_ENABLED_TENANTS`,
  `PLAYER3_MODULE_ATTEMPTS_ENABLED_TENANTS`,
  `NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS` e
  `PLAYER3_TERMINAL_WRITE_ENABLED_TENANTS` (além de `ENVIRONMENT=staging`).
  Ausência, wildcard ou tenant diferente resultam em 404 sem D1/R2.
- HTTP 200 apenas com recibo coerente do writer, `status=CONCLUIDO` e
  `certificate_state=REQUIRES_VERIFICATION` quando há qualificação. **Não
  afirma que o certificado foi emitido**. O PDF precisa ser consultado no E2E.
- 0553/0554 permanecem **não aplicadas**; 0555/0556 permanecem arquivos
  `.REVIEW-ONLY.sql.txt`, sem manifest/aprovação de apply. Nenhum recurso
  foi escrito remotamente ou ativado para alunos nesta etapa.

**Testes focados:** 36 SQLite de compatibilidade de catálogo + 18 SQLite
para intent e rollback (suítes com sobreposição); 56 testes Worker do writer,
53 testes Worker da integração HTTP e TypeScript Worker PASS. O gate de
regressão SQLite foi incluído no `.github/workflows/ci.yml`. O fechamento
operacional exige, além dos gates oficiais, origem HTML5 segura homologada,
T0/T1 da Costa do Sol, migrations governadas, R2 privado SHA-pinned e prova
visual em staging de matrícula/qualificação/certificado verificável.


## Compatibilidade com Frente C — T0/T1 e retomada administrativa (14/10/2026)

O reconciliador da Frente C entregue na `main` mantém todas as decisões
individuais **somente dentro do arquivo cifrado**. A Frente B não reimplementa
a comparação e não lê arquivos T0/T1 de produção no Worker de aluno.

O planejador de continuidade da B classifica também alteração de nota final,
tentativas, estados/resultados SCORM, tipo do conteúdo, versão/hash do pacote,
datas, histórico e ciclo **mesmo quando o percentual permanece 99%**.
O hash do pacote atualmente ativo no catálogo não prova que o aluno
consumiu aquela edição. Qualquer mudança dessas classes impede
`unchanged` e requer revisão protegida.

A proposta interna de retomada `createAdminResumeCreditIntent` **não grava
no D1 e não concede visitas, nota, conclusão ou certificado**. Ela passou a
exigir o contrato privado `FrontCReconciledHandoff`:

- Proveniência T0/T1 com SHA-256 dos arquivos cifrados e tenant autorizado 6.
- `decision_key` e SHA da linha T1, mesmos IDs de tenant/matrícula/
  funcionário/curso/ciclo e mesmos watermarks do registro.
- Decisão elegível, revisão independente após T1, identificação
  comprovada da edição **original** fora da versão ativa do catálogo,
  crosswalk validado para o destino e ausência de qualquer sinal de
  certificação automática.
- Divergências de identidade, ciclo, fonte, etapa terminal ou consentimento
  indevido para writes bloqueiam o planejamento; a C deve registrar a
  exceção no arquivo privado para avaliação humana.

O plano pode conter somente um **bookmark de navegação**; não altera
`seenLessonIds`, ledger de tentativas, matrícula ou qualificação. A futura
aplicação exigirá serviço Worker com RBAC real, prova de custódia do
inventário cifrado, verificação de identidade/timestamps/edição após T1,
atomicidade, idempotência e auditoria. A existência de uma estrutura JS
na memória não é aprovação governada. Nenhuma execução T0/T1 real ou
write administrativo ocorreu nesta entrega.

**Bloqueador operacional:** issue #1467 (token D1 readonly, AES-256 em cofre,
aprovadores humanos); a etapa da C está integrada como código, mas
sem aceite operacional. Para homologar: casos 0%, 20%, 50%, 80% e 99%,
versões distintas, WebKit/Chromium, SCORM externo, nota, qualificação e
certificado realmente consultável em staging após Schema V2 governado.


## Observabilidade de certificado pós-conclusão — 14/10/2026

Para eliminar a ambiguidade entre `CONCLUIDO` (matrícula/ciclo D1) e
**PDF realmente arquivado** (documento vinculado + R2), a PR #1389 inclui
o endpoint de leitura **GET**
`/api/lms/native/matriculas/:matriculaId/etapas/certificado`.

- Mesmo conjunto de **seis controles de staging** exigidos pelo terminal
  Player 3; por padrão desligado, sem acesso em production.
- `auth()` do router e
  `resolveNativeEnrollmentAdmission` exigem usuário ativo, funcionário
  proprietário, empresa exata e matrícula vigente, sem privilégios cruzados.
- Releitura SQL associa a matrícula e ciclo concluídos à qualificação
  `CONCLUIDA`, ao documento não excluído do próprio funcionário e à chave
  de R2 no prefixo exato
  `certificados/empresa-{empresaId}/funcionario-{funcionarioId}/historico-{historicoId}/`.
- A leitura R2 (somente os cinco primeiros bytes) prova `%PDF-` e existência
  mínima do objeto. A chave R2 não é retornada. Não há geração, reparo,
  `D1.batch`, upload, alteração de matrícula ou certificado.
- Resposta `success:true,data` com `matricula_id`, `ciclo_id`,
  `matricula_status`, `historico_id`, `certificate_state`,
  `documento_id`, `stream_path` e `stream_verified:false`.
  Estados incluem `ENROLLMENT_NOT_COMPLETED`, `NOT_APPLICABLE`,
  `HISTORY_NOT_LINKED`, `HISTORY_INVALID`,
  `CERTIFICATE_NOT_ARCHIVED`, `CERTIFICATE_OBJECT_MISSING`,
  `CERTIFICATE_PDF_INVALID` e `PDF_HEADER_VERIFIED`.

`PDF_HEADER_VERIFIED` **não significa PDF lido integralmente, licença,
renderização válida ou stream acessível**. O teste independente da D
deve chamar a rota real, exigir o estado esperado e executar
`GET /api/pasta-virtual/stream/:documentoId` **com a mesma sessão de aluno**,
inspecionando corpo integral `%PDF-`, estrutura/EOF e resposta HTTP 200.
Não aceitar `certificate_state:REQUIRES_VERIFICATION` do POST como prova.
O status `CERTIFICATE_NOT_ARCHIVED` após conclusão é falha recuperável
operacional do serviço de certificado, **não** autorização para repetir
a transação terminal ou inventar a emissão.

QA local: 44/44 testes focados do serviço de certificado, rota HTTP
e writer de conclusão + Worker TypeScript (verificar execução final).
Nenhum certificado foi emitido no staging/produção nesta entrega.

## Fechamento resiliente do aluno — reconciliação após resposta ambígua

O componente `Player3FinalizationControls` consulta primeiro **GET**
`/api/lms/native/matriculas/:id/etapas/certificado`. Se a matrícula e o
ciclo atual já estiverem `CONCLUIDO`, a tela não envia novo POST. Caso ainda
estejam ativos, exige a leitura de prontidão `/etapas/prontidao` e só então
envia uma única solicitação sem corpo para `/etapas/concluir`.

Se o POST retornar sucesso, a tela valida o recibo do Writer e consulta o
arquivo de certificado separadamente. `REQUIRES_VERIFICATION` nunca afirma
existência do PDF; `PDF_HEADER_VERIFIED` afirma somente o cabeçalho, não o
download integral. Cursos cujo contrato não gera qualificação exigem
`qualification_not_required` com `NOT_APPLICABLE` e não inventam PDF.

Em erro, timeout, perda de conexão **depois de iniciar o POST** ou recibo
ambíguo, a interface faz apenas uma nova leitura autenticada de
`/etapas/certificado`. Caso o D1 já registre `CONCLUIDO` para a mesma
matrícula/ciclo, apresenta conclusão registrada; se não, **permanece incerta,
sem reenviar o terminal**. O botão `Consultar situação da conclusão` é
somente leitura e serve para futuras verificações, inclusive de um certificado
que seja arquivado posteriormente. A identidade da matrícula, o ciclo e
a edição são imutáveis para essa instância da interface; a troca de ciclo
remonta o componente, impedindo herdar o estado de conclusão anterior.

**Validação sintética:** 25/25 Vitest em três arquivos de frontend,
ESLint focado PASS em worktree isolado. Inclui timeout após COMMIT,
reconciliação posterior, recibo falso, ciclo/tenant de sessão divergente,
curso sem qualificação e consulta sem segundo POST. O documento PDF integral,
o replay após desconexão Safari/Chromium e a persistência real seguem para
homologação independente da Frente D em staging.
