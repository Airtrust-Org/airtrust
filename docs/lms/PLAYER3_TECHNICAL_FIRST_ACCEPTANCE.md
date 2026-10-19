# Player 3 — homologação técnica primeiro (decisão do operador, 2026-10-18)

**Objetivo atual:** fazer o player funcionar de ponta a ponta, sem auditar, converter, corrigir nem publicar os arquivos originais dos cursos. O operador fornecerá um ZIP com o conjunto de treinamentos **depois** da estabilização técnica para adaptações técnicas separadas. Não exigir aprovação pedagógica nem disponibilidade do RC8.1 como pré-requisito do **aceite técnico**.

## Dois aceites separados

1. **Aceite TÉCNICO (agora):** player isolado, autenticação e tenant, abertura de edição imutável, navegação, fixação, salvamento e retomada, tentativa errada, retentativa, correção exclusivamente pelo Worker, terminal atômico, não duplicação, vínculo de qualificação/certificado PDF verificável e replay, Chromium e WebKit. Executar com **pacote e matrículas 100% sintéticos**, em tenant QA explícito, por mecanismo governado e em staging. Um pacote técnico tem conteúdo inventado só para exercitar a interface; não representa cursos reais nem constitui conclusão de treinamento.
2. **Aceite de CONTEÚDO (posterior):** somente após o player técnico passar, receber do operador os ZIPs originais, preservar autoria e aplicar adaptações técnicas necessárias a cada curso. Políticas particulares, fidelidade visual/recursos e equivalência dos conteúdos existentes serão analisadas nessa fase. Isso não desbloqueia publicação de curso real nesta fase.

## Identidades sintéticas independentes

O executor E2E exige `PLAYER3_QA_STORAGE_STATE_CHROMIUM` e
`PLAYER3_QA_STORAGE_STATE_WEBKIT` diferentes quando
`qaContentMode=SYNTHETIC_TECHNICAL`. O estado global legado
`PLAYER3_QA_STORAGE_STATE` não pode substituí-los nessa modalidade.
As credenciais de cada navegador devem pertencer a alunos sintéticos
autorizados no tenant QA, com matrículas e ciclos distintos; somente um
arquivo com nome diferente não comprova identidade independente.
Esse pré-requisito falha fechado antes de abrir o conteúdo. Os estados
autenticados ficam fora do repositório, em artefatos efêmeros protegidos
do GitHub Actions staging, nunca em comentários ou logs.

## Modalidade de prova técnica

Em `e2e/player3/fixture-contract.ts`, o perfil privado pode declarar `qaContentMode: "SYNTHETIC_TECHNICAL"` em vez do padrão `"AUTHORED_RC81"`. O hash SHA-256 do ZIP sintético deve corresponder exatamente à variável protegida `PLAYER3_QA_SYNTHETIC_SOURCE_SHA256` e **ser diferente do hash original RC8.1**. O perfil, por si só, nunca autoriza seu próprio pacote. A edição de conteúdo continua imutável, em origem HTTPS staging segregada; URLs continuam vinculadas a `empresa_id`, curso, edição e hash de conteúdo.

O teste técnico aceita **4 a 100 unidades sintéticas**, **1 a 8 avaliações oficiais** (dez perguntas verificáveis por avaliação), unidades de lição com recibos canônicos, pelo menos uma fixação e duas matrículas de browsers independentes. Os dois outros casos por browser permanecem: retomada histórica de navegação a 80% (sem nota inventada) e compatibilidade SCORM 1.2 externo em ambiente QA, separado do Native.

O E2E executa os mesmos caminhos **reais** de tela/iframe, API, D1, histórico, R2 e PDF. Não simular status de aprovação, gravar resultado direto no banco, falsificar `postMessage`, desligar guards do backend, nem usar pacote SCORM incompatível só para gerar verde. Ausência de infraestrutura/identidade, botão ou fixture deve falhar, não ser marcada como skip aprovado.

### Gates que não mudam

- Frontend sem acesso a gabaritos/segredos. Worker responde tentativas com dados efetivamente calculados e persistidos.
- Conclusão somente mediante política transacional e histórico/certificado emitidos e inspecionados; último slide e porcentagem não certificam.
- Tenant isolado, RBAC, origem do HTML5 e arquivos R2 verificados.
- Staging: workflow oficial, snapshot SHA, 8 gates, D1 Schema V2 e recuperação conforme manifesto/ledger, janela coordenada na issue #776.
- 0561 e 0562 são atualmente **REVIEW-ONLY**, sem autorização de SQL, seed ou produção. O aceite técnico não converte esses candidatos em migrações aplicadas.
- Produção só com autorização específica de SHA/artefato/escopo; não incluir ou modificar material de cursos antes da fase posterior.

## Critério objetivo de encerramento

O Player 3 técnico está pronto quando: a suite do novo SHA passou por 8/8 gates, Worker/Pages/schema necessários foram publicados oficialmente em staging, seis jornadas Chromium/WebKit usando matrículas QA descartáveis foram **executadas** com evidência real (não apenas listadas/compiladas), casos de erro e segurança passaram e a página abre/retoma/conclui sem duplicidade e com PDF acessível. Documentar bloqueio real caso a homologação não possa ser executada. **Não declarar o LMS de cursos originais pronto nem percentual global derivado desses testes.**

O contrato de homologação fiel do Doutrinamento RC8.1 permanece preservado em `docs/lms/PLAYER3_FRONT_D_HOMOLOGATION.md` e seu SHA original continua exigido em `AUTHORED_RC81`, **somente para a fase posterior**. Nada do treinamento real foi editado nesta mudança.

## Preflight de ativação QA sintética — execução sem alterações remotas

O candidato técnico possui o script `scripts/staging/player3-technical-qa-activation-preflight.mjs`. Ele valida **somente a configuração** do tenant QA para o SHA explicitamente revisado; não publica conteúdo, não cria matrícula, não consulta D1/R2 e nunca comprova seis jornadas.

Para executá-lo em um workspace protegido, forneça as variáveis do **ambiente staging autorizado**, sem registrá-las em logs nem arquivos públicos: `ENVIRONMENT=staging`, `PLAYER3_QA_SYNTHETIC_TENANT_ID`, `PLAYER3_QA_EXPECTED_SHA` e `PLAYER3_QA_SYNTHETIC_SOURCE_SHA256` (SHA-256 independente e diferente do RC8.1), os oito allowlists exclusivos ao tenant QA exigidos pelo script, `PLAYER3_QA_STAGING_ORIGIN`, `PLAYER3_QA_API_ORIGIN`, `PLAYER3_AUTHORED_CONTENT_ORIGIN` e `PLAYER3_QA_CONTENT_ORIGIN`. A origem HTML5 deve ser uma **terceira origem HTTPS** diferente de Pages e Worker. Valores wildcard, tenant de cliente, ambiente de produção, SHA ou origem discrepantes devem falhar.

```bash
node scripts/staging/player3-technical-qa-activation-preflight.mjs
node --test scripts/__tests__/player3-technical-qa-activation-preflight.test.mjs
```

O output deliberadamente contém apenas nomes de gates ausentes, booleans e contagens, sem identidades, tokens ou valor de allowlist. **`tenantGateReady: true` não comprova schema, edição, matrícula, conclusão ou PDF**; esses campos permanecem `false` até validação física independente. Flags jamais devem ser habilitadas globalmente ou em produção.

**Dependências materiais ainda não supridas pelo gerador offline:** tenant sintético exclusivo autorizado, usuário autenticado sem acesso cross-tenant, curso criado pela API sob governança, marker Native, edição publicada com bytes/hash pinados, banco e política privados no R2, conteúdo HTML5 isolado, seis matrículas/ciclos distintos, perfil QA privado com credenciais adequadas, uma matrícula de continuidade 80% e um pacote SCORM 1.2 externo autorizado. Aplicações 0561/0562 de staging são infraestrutura necessária, mas não provisionam esses dados nem ativam flags. As matrículas devem ser criadas pelo writer transacional do Worker, não por INSERT improvisado.

A janela de mutações de staging utiliza o lock compartilhado `airtrust-staging-mutations-and-scorm-qa`; consultar issue #776 antes de qualquer seed, upload, deploy ou E2E. Restauração e limpeza dos dados descartáveis devem ser verificadas por recibos reais, sem apagar cursos ou matrículas preexistentes. Somente depois de executar e evidenciar 6/6 jornadas Chromium/WebKit, certificado PDF real e regressão SCORM é permitido avaliar saída de draft, merge protegido e release específico.

## Composição do perfil privado após provisionamento real

`scripts/learning-factory/build_player3_technical_qa_profile.py` prepara **offline** o arquivo `PLAYER3_QA_PROFILE_FILE` consumido pela suíte. Primeiro, a etapa governada de provisionamento deve entregar, em JSON privado com `schema: "AIRTRUST_PLAYER3_QA_IDENTITIES_V1"`, `tenantCode: "qa_examiner_training"`, `tenantId`, `releaseSha`, `baseUrl`, `apiBaseUrl`, `contentOrigin` e `projects.chromium`/`projects.webkit`. Em cada browser, fornecer três objetos separados:

- `doutrinamento`: `courseId`, `enrollmentId`, `cycleId`, `launchPath`, `qualificationPath`, `certificatePath` reais;
- `resume80`: `enrollmentId`, `cycleId`, `editionSha256`, `launchPath`, `minPreviousPct`, `expectedResumeUnitId`, `creditedNavigationIds` de evidência histórica QA legítima;
- `external`: `enrollmentId`, `cycleId`, `editionSha256`, `launchPath`, `frameSelectors` e seletores textuais `visualLastPageButton`, `wrongAnswerButton`, `correctAnswerButton`, `submitButton`, `finishButton`, `learnerCompletionButton` do SCORM 1.2 externo real.

Esses valores **não são inventados** pelo gerador. O utilitário valida bytes SHA-256 da edição Native e do ZIP sintético, 6 IDs de matrícula/ciclo distintos, host e tenant QA, crosswalk de cinco unidades/uma avaliação e saída privada sem sobrescrita (0600 fora do repositório). Ele deriva URLs de leitura QA apenas do ID real e nunca envia gabaritos ao navegador.

```bash
python3 scripts/learning-factory/prepare_player3_technical_candidate.py \
  --out /tmp/player3-qa-candidate-001 \
  --parent-origin https://staging.airtrust.pages.dev \
  --course-id qa-player3-synthetic
python3 scripts/learning-factory/build_player3_technical_qa_profile.py \
  --candidate /tmp/player3-qa-candidate-001 \
  --assignments /caminho/privado/identidades-staging.json \
  --out /caminho/privado/player3-qa-profile.json
python3 -m unittest scripts/learning-factory/test_build_player3_technical_qa_profile.py
```

**Nenhuma dessas ações provisiona ou limpa D1/R2, publica a edição, concede permissões, autentica alunos, gera certificados ou equivale a 6/6 E2E.** As identidades sintéticas reais precisam ser comprovadas e o perfil deve ser destruído ao final da homologação. Não copiar para Git, Drive, logs, artefatos públicos nem usar dados de clientes.

## Isolamento real dos dois alunos no aceite em navegador

Os leitores `/api/lms/native/matriculas/:id/etapas/qa-evidencias` e `/api/lms/native/scorm/matriculas/:id/qa-evidencias` verificam **a identidade do funcionário titular da matrícula**. Um token de administrador genérico não é prova de leitura autorizada de duas matrículas de alunos diferentes.

Por isso, a homologação técnica exige `PLAYER3_QA_STORAGE_STATE_CHROMIUM` e `PLAYER3_QA_STORAGE_STATE_WEBKIT` distintos, acompanhados por `PLAYER3_QA_READONLY_BEARER_TOKEN_CHROMIUM` e `PLAYER3_QA_READONLY_BEARER_TOKEN_WEBKIT` também distintos. Cada token deve corresponder ao usuário/funcionário QA do navegador respectivo; o E2E associa todas as leituras e downloads de certificado ao contexto correto. No modo `SYNTHETIC_TECHNICAL`, o token global `PLAYER3_QA_READONLY_BEARER_TOKEN` **não é fallback permitido**. A identidade do aluno deve ter autorização para suas três matrículas/cursos sintéticos sem escopo cross-tenant.

Os dois pares de credenciais são privativos: não armazenar no Git, screenshots, relatórios, artifacts, logs nem HTML5. O teste é recusado se os dois tokens forem iguais, se um deles faltar ou se as sessões Playwright apontarem para o mesmo arquivo. As APIs continuam verificando `empresa_id`, `funcionario_id`, RBAC e edição no backend; não há exceção administrativa para facilitar QA.

A governança de staging também dispõe de `scripts/staging/player3-qa-readonly-inventory.mjs`, que valida o D1 canônico e retorna apenas contagens do tenant `qa_examiner_training`, marcadores, edições, políticas e matrículas vinculadas. Invocação padrão: dry-run (nenhuma conexão). `--inspect` requer confirmação `CONFIRM_STAGING_PLAYER3_READONLY=AIRTRUST_STAGING_PLAYER3_READONLY`, consulta somente `SELECT` e falha se o D1 indicar qualquer write. Uma contagem suficiente **não** valida credenciais, origem HTML5, jornada, PDF nem aprovação de produção.
