# AirTrust Player 2.0 — arquitetura de encerramento canônico (RFC operacional)

**Status:** implementação incremental e fail-closed; **não** é autorização para publicar cursos, migrar D1/R2 ou emitir certificados.  
**Autoridade:** GitHub `main`, workflows e Schema V2 vigente. Requisitos definidos após a auditoria de matrículas em 99–100% e falha `PROGRESS_EVIDENCE_MISSING`.

## Decisão arquitetural

Não reconstruir apenas o iframe nem atribuir certificação ao Native. Substituir os múltiplos julgamentos concorrentes por **um protocolo único de evidência**:

1. **Ingestão por adaptador**: SCORM 1.2, SCORM 2004 e Native produzem fatos estruturados (navegação, eventos, resultado, tentativa, versão). O player não decide aprovação.
2. **Persistência sem finalização**: salvar relatório de SCO e progresso, inclusive quando o pacote comunica `passed` antes da confirmação do aluno. Nunca rejeitar uma gravação intermediária só porque ela ainda não satisfaz todos os requisitos finais. Sempre exigir autenticação, tenant e escopo da sessão.
3. **Verificação central**: um único verificador do servidor decide se as evidências são elegíveis; responde com código e requisitos faltantes, sem confundir `SCORM_COMPLETION_ACCEPTED` (status de conteúdo) com `CONCLUIDO` (matrícula persistida).
4. **Transação canônica**: finalização idempotente e tenant-bound grava matrícula, histórico, qualificação e auditoria com proteção contra repetição/concorrência. Falha de qualificação bloqueia confirmação, nunca gera certificado falso.
5. **Emissão e conciliação**: resultado do certificado é verificado à parte; status de emissão nunca pode ser inferido do progresso, de `passed` ou de uma resposta de rede ambígua.
6. **Leitura única ao aluno**: UI consulta o verificador e exibe `pendente`, causa real e próxima ação; 100% visual representa apenas posição de conteúdo, não aprovação.

## Prova imediata incorporada no código

A função versionada `evaluateScormClosureReadiness` alimenta o guard de commit explícito, a reconciliação de evidência persistida e o novo `closure_readiness` do detalhe da matrícula. Distingue:

- evidência de telas distintas vs. a marca `42/42`;
- formulário de 10 questões não respondidas vs. nota registrada e mínima do curso;
- status terminal do SCORM vs. confirmação explícita do aluno;
- consentimento para finalizar vs. status real `CONCLUIDO`;
- erro de rede/gravação vs. falha legítima na política de avaliação.

Em `SCORM_FINISH` ou `SCORM_COMPLETION_CANDIDATE`, o guard não converte o relatório em conclusão. Em `SCORM_USER_FINALIZE`, o verificador é obrigatório. A sessão de asset, tenant, edição e RBAC permanecem obrigatórios.

## Etapas seguintes da mudança estrutural

### A. Adaptadores sem suposição proprietária — obrigatório antes de aceitar qualquer ZIP SCORM

Hoje `airtrust.total_slides` e `airtrust.viewed_slides` são exigidos como evidência de cobertura. Isso **não é SCORM padrão**. Construir um adaptador SCORM 1.2/2004 que valide as evidências padronizadas reais do pacote (status, objetivo, score, interações, commit/terminate e configuração de avaliação do catálogo), sem simular telas ou respostas. Pacotes AirTrust com `requiredSlides`/`requiredInteractions` continuam com requisitos próprios.

A ativação do adaptador de terceiros deve ser **explícita por versão/curso e tenant**, governada e testada com pacote real. Não habilitar um fallback global que permita a qualquer pacote autodeclarar `passed` em uma tela vazia e emitir qualificação. Curso que não emite nenhuma evidência suficiente deve indicar `PACOTE_INCOMPATIVEL` ou requisitos objetivos, não ficar preso indefinidamente em 99%.

### B. Ledger confiável da tentativa e confirmação

Modelar e governar via Schema V2 o par `attempt_id`/`enrollment_cycle_id`, pacote SHA/edição, tipo de evento, sequência/idempotência e veredito por transição. Resolver `resume`/offline/queda de rede sem reutilizar evidência de edição/ciclo anterior. Não usar SQL remoto improvisado.

### C. Testes exigidos para liberar

- SCORM 1.2 e 2004 de autores distintos; formulário incompleto, nota insuficiente, aprovação, saída rápida, reconexão, duplicação e múltiplas abas.
- Matrícula de outro tenant, sessão expirada, pacote trocado, categoria de qualificação inválida e corrida de múltiplos envios — devem falhar fechado.
- Aluno real autorizado de QA em staging: inicia, retoma, realiza, finaliza, refaz login, vê status `CONCLUIDO`, histórico/Compliance coerentes e certificado verificável.
- Player Native V1 da PR #1389 compartilha **transação canônica**, mas continua isolado até Schema V2 0550/0551/0552 e prova final. Os nove candidatos privados não são publicados automaticamente.

## Critério de encerramento

Não declarar correção completa por 8/8 CI, 100% de navegação, `SCORM_COMPLETION_ACCEPTED` ou deploy saudável. Encerramento depende de prova real de curso **SCORM** e **Native** e da persistência canônica e certificado, com rollback e observabilidade. Staging oficial antes de qualquer produção; produção somente para SHA, componentes e escopo exatos autorizados.

## Gate de certificação funcional (etapa de segurança, 2026-10-13)

A execução de navegador que observa `LMSInitialize`, `LMSCommit`, `LMSFinish`,
`completionReached` e nota é **conformidade do protocolo/execução parcial**,
não certificação ponta a ponta. Novas ativações precisam de um contrato separado
`functionalCertification` para **o SHA exato do ZIP**, com as oito etapas
`FIRST_ACCESS`, `SUSPEND_RESUME`, `ASSESSMENT_INSUFFICIENT`,
`ASSESSMENT_APPROVED`, `EXPLICIT_FINALIZATION`, `REOPEN_COMPLETED`,
`NO_STATUS_DOWNGRADE` e `TENANT_CYCLE_ISOLATION`, todas em Chromium e WebKit para cursos com avaliação obrigatória; cursos formativos sem avaliação pontuada não exigem os dois cenários de avaliação, mas preservam todas as demais provas.

O verificador fail-closed `evaluateScormFunctionalCertification` valida
integridade do conjunto de resultados e SHA, **não a origem** dos resultados.
Somente o harness isolado da plataforma pode fornecer atestações; conteúdo ZIP,
metadados e payload do aluno jamais podem produzi-las. O runner atual ainda não
executa esse contrato completo e passa lista vazia: **nenhuma nova versão é
certificada ou ativável por esse caminho até integração e prova do harness**.
O status anterior `publishable=true` sem atestação não serve para ativação.
Isso não modifica pacotes ativos, histórico, matrículas ou certificados.

**Ainda pendente:** implementar harness real, executar os cenários por SHA,
registrar evidência independente, testar qualificação/certificado e validar em
staging antes de qualquer promoção; preservar bloqueio da liberação em massa
conforme issue #1325.

## Fechamento canônico — rotas convergentes (13/10/2026)

O endpoint de confirmação autenticada `POST /lms/matriculas/:id/finalizar` e o
encerramento administrativo `PATCH /lms/matriculas/:id/status` passam a
consultar **o mesmo** `buildPersistedScormClosureReadiness` usado pelo
Player 2.0 e pelo guard de integridade. `passed`, `completed`, posição final
ou percentual alto isolados nunca provam cobertura distinta de telas,
avaliação aprovada ou elegibilidade para criar qualificação.

O sistema retorna `closure_readiness.code` e `missing` com motivos objetivos
na recusa HTTP 409; nenhum `completeLmsMatricula` é chamado nesse caso.
Isso é defesa em profundidade, pois o middleware já verifica a mesma
prontidão antes da rota. A exceção **administrativa explicitamente
autorizada, motivada e auditada** permanece separada do fluxo de conclusão
do aluno e não constitui certificação pedagógica do pacote SCORM.

**Teste de regressão:** cobertura ausente, nota abaixo do domínio/score
normalizado, estado terminal ausente, formação sem prova pontuada, percurso
completo elegível e exceção administrativa auditada. A emissão continua
restrita ao serviço de conclusão transacional. Estes testes não são
certificação de navegador dos cursos ativos nem comprovam a correção de
matrículas específicas em 99%.
