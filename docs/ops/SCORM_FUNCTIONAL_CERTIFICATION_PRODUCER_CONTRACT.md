# AirTrust — produtor independente de certificação SCORM (frente 2)

**Estado:** implementação de ingestão e assinatura; **não** é liberação de ativação nem
certificação de algum ZIP do portfólio. PR #1422 permanece draft e issue #1325 aberta.

## Limites de confiança

- O ZIP não pode emitir sua própria certificação; a API SCORM, o HTML,
  os dados de conclusão e os valores de `cmi` são **dados observados**.
- A prova deve nascer em harness de QA executado pela organização, em
  navegador real com matrícula/ciclo descartáveis, sob credenciais exclusivas
  de staging. A chave HMAC nunca é acessível ao ZIP, navegador, aluno ou
  frontend.
- Qualquer `PASS` sintético pré-programado ou resposta de avaliação escrita
  diretamente em CMI é inválido. O harness clica os controles reais e compara
  os estados persistidos e o histórico do backend.
- Sem proveniência verificada, não há promoção de pacote. Cursos ativos e
  matrículas existentes não são alterados pela ausência do certificador.

## Contrato de atestação V1

`worker-airtrust/src/lib/lms/lms-scorm-trusted-attestation.ts` exige
assinatura HMAC-SHA256 e revalida a assinatura no endpoint de importação e
novamente antes de trocar o ponteiro do curso. A projeção canônica contém:

- `empresaId`, `cursoId`, `packageId` (UUID da edição imutável),
  `packageSha256` (SHA-256 **dos bytes exatos do ZIP**);
- `runtimeSha` (SHA publicado no Worker, `AIRTRUST_SOURCE_SHA`),
  `harnessSha` (commit do produtor), emissão UTC e escopo
  `GOVERNED_STAGING_SYNTHETIC`;
- perfis de avaliação pontuada/formativa, resultados independentes em
  Chromium e WebKit e SHA-256 dos respectivos artefatos sanitizados;
- testemunhos de dois documentos PDF **distintos**, um por execução Chromium
  e outro por execução WebKit, com IDs independentes de matrícula, ciclo,
  histórico de qualificação e documento e SHA-256 dos bytes obtidos por download
  autenticado no backend (não apenas a existência de um arquivo PDF).
- cada relatório do navegador deve conter `certificateDocument` com
  `enrollmentId`, `cycleId`, `qualificationHistoryId`,
  `documentId`, `sha256` e `certificateDownloadHttpStatus=200`;
  a assinatura exige `certificatePdfFiles.CHROMIUM` e
  `certificatePdfFiles.WEBKIT` distintos.

O endpoint administrativo autenticado
`POST /lms/cursos/:id/scorm-package-versions/:packageId/functional-attestation`
**não aceita** relatório local, assinatura ausente, SHA/edição/tenant divergentes,
caso obrigatório ausente ou `INCONCLUSIVE` como `PASS`. Há rechecagem no
`/activate`. A chave é `SCORM_QA_ATTESTATION_SECRET`: secret de staging/
Worker e do job protegido de QA, nunca commitado. Sem esta configuração
o caminho é fail-closed.

`scripts/ci/sign-scorm-functional-attestation.mjs` só executa no GitHub
Actions sobre `refs/heads/main`; confirma o hash do ZIP local, os dois
artefatos de execução, os critérios de persistência/tenant/ciclo/qualificação
e existência de PDF antes de assinar. Esta ferramenta **não executa** os
navegadores nem concede PASS; deve receber provas de um produtor autorizado.
Relatórios `LOCAL_DISPOSABLE_D1_R2_ONLY` são rejeitados.

## Interface exigida das frentes vizinhas

**Player 3:** disponibilizar, em staging/QA somente, launch autenticado da
edição exata com identidade de matrícula e ciclo no servidor, diagnóstico
read-only sobre `Initialize/Commit/Finish`, cursor renderizado versus
`lesson_location`, `suspend_data`, `lesson_status`, nota, tentativa e
fechamento canônico. O produtor também precisa confirmar ausência de downgrade
ao reabrir e 409 em escrita com ciclo antigo. Não criar endpoint para forçar
`completed` ou `passed`.

**Frente de cursos/Factory:** publicar para o QA, fora do ZIP do aluno, um
contrato declarativo versionado por hash: IDs dos slides obrigatórios,
interações e pré-condições reais de navegação, perfil da avaliação, nota mínima
e roteiro de avaliação revisado pela equipe instrucional. Não inventar
gabaritos nem extrair a resposta de campos enviados pelo aluno. Sem driver
compatível, classificar `DRIVER_UNSUPPORTED`, não reprovar pacote nem certificar.

**Integração LMS/Qualificações:** em matrícula descartável de staging,
comprovar recuperação após suspensão, reprovação sem qualificação, aprovação
por resposta genuína, confirmação explícita do aluno, conclusão canônica,
um único registro histórico e PDF válido de certificado, além de novo
ciclo isolado. Não utilizar matrículas existentes.

## Classificação de resultados

- `PASS`: todas as condições demonstradas em ambos os navegadores.
- `PACKAGE_DEFECT`: defeito observado e reproduzível no ZIP com runtime,
  assets e driver comprovadamente disponíveis.
- `CONTENT_MISSING`: slide, interação, avaliação ou asset obrigatório ausente.
- `TEST_TIMEOUT`: limite de execução; **inconclusivo**, não prova defeito.
- `DRIVER_UNSUPPORTED`: interação não automatizável pelo adaptador atual;
  **inconclusivo**, requer adaptação ou sessão assistida.
- `INFRASTRUCTURE_ERROR`: browser ausente, credencial, rede ou ambiente; **inconclusivo**.
- `UNCERTIFIED`: qualquer etapa, assinatura, SHA, browser ou documento faltante.

**Bloqueador de rollout:** o suite atual em D1/R2 descartáveis e o teste de
protocolo Chromium/WebKit não geram prova autenticada de cada ZIP real em
staging, certificado PDF e witness de navegação/avaliação. Não integrar
esta PR até existir produtor conectado e homologação do candidato real.

## Produtor independente de ZIPs reais: prova local, sem atestacao de staging

O script `scripts/qa/scorm-independent-zip-producer.mjs` recebe um ZIP e um roteiro de QA externo em JSON, vinculados pelo SHA-256 dos bytes completos. Publica os arquivos apenas em loopback, executa Chromium e WebKit sem credenciais externas e verifica interacoes DOM reais, acesso a conteudo requerido, Commit, suspend_data, retomada apos reabrir a sessao, resultado insuficiente, aprovacao, nota minima e reabertura sem rebaixamento terminal. A selecao de respostas no roteiro depende de revisao instrucional externa: o produtor nao descobre nem inventa gabaritos.

Exemplo de comando: `node scripts/qa/scorm-independent-zip-producer.mjs /qa/pacote.zip /qa/roteiro-revisado.json /qa/relatorio.json`. O roteiro exige `schemaVersion=1`, `packageSha256` exato, `launchFile`, `requiresAssessment`, `requiredContent` e jornadas `resume` e `pass`. Para avaliacao pontuada, exige ainda `masteryScore` e `fail`. As acoes suportadas sao `click`, `fill` e `press`; nenhuma escreve CMI diretamente.

ATENCAO: o executor local usa uma API SCORM emulada, NAO o Worker autenticado e seu D1. Seu relatorio sempre contem `source=AIRTRUST_LOCAL_INDEPENDENT_ZIP_PROBE_V1`, `status=UNCERTIFIED`, `activationAuthorized=false` e lista explicitamente provas ausentes: launch autenticado da edicao candidata antes da ativacao, persistencia backend, ciclos/tenant, dois certificados PDF independentes e assinatura governada. Nenhuma observacao local se transforma em atestacao assinada.

Bloqueio de integracao: para produzir a atestacao confiavel, e necessario um launch de staging autenticado da edicao ZIP imutavel antes de sua ativacao, configuracao de matriculas/ciclos sinteticos governados, roteiro independente por hash, consulta read-only do backend e downloads reais dos dois documentos PDF. O pipeline deve produzir evidencias por navegador desse conjunto antes de usar `sign-scorm-functional-attestation.mjs`, sem atalhos do Player 3.

## QA autenticado de edição inativa: rota somente-leitura e limites

A PR #1422 acrescenta inspeção de um **candidato VALIDATED, ainda INACTIVE** no Worker, sem sobrescrever `lms_cursos.scorm_package_r2_prefix` nem usar o launch padrão de uma matrícula. Nenhuma operação abaixo cria matrícula, certificado ou resultado SCORM persistido.

**Em staging ou desenvolvimento apenas**, um gestor com sessão de acesso válida requisita:
`POST /api/lms/assets/session` com `{ "curso_id": 15, "preview": true, "candidate_package_id": "<uuid>", "candidate_package_sha256": "<64 hex>" }`.
O serviço exige correspondência exata no banco do **mesmo tenant e curso** entre ID, SHA, prefixo `lms/scorm/<empresa>/<curso>/_candidates/<uuid>/`, status `VALIDATED` e edição **distinta da ativa**, retornando cookie de asset escopado e temporário. O browser então abre `GET /api/lms/scorm/qa-preview/:curso_id/:candidate_id`; assets usam exclusivamente `GET /api/lms/scorm/qa-assets/:empresa_id/:curso_id/:candidate_id/*`. Todas as chamadas revalidam edição e tenant, role de preview e cookie QA; o cookie QA é proibido nas rotas regulares de aprendizagem. Em produção, a API retorna 403 mesmo para administradores.

O preview marca `previewMode=true`, usa `commitUrl=null` e não aceita matrícula real. Sua finalidade é eliminar a circularidade técnica **"ativar para conseguir renderizar candidato"** sem relaxar a assinatura de ativação. **Não** produz atestação, não prova persistência de CMI, avaliação, histórico ou PDF; é uma fase independente anterior ao QA sintético governado.

**Fronteira de integração ainda faltante:** a jornada completa exige tenant/cursos/funcionários e ciclos *sintéticos* autorizados em staging, lançamento de learner que persista CMI da **mesma edição candidata** sem usar o ponteiro ativo, qualificação e PDF baixado do backend com hash. A rota preview NÃO deve ser reutilizada como substituto desta jornada. A assinatura para ativação continua bloqueada até o conjunto de provas real dos dois navegadores.

**Entrada da Frente 3 (não recebida por bytes nesta PR):** ZIP corrigido #15 SHA-256 `cdc5a3cf30e4d37697c1f411977d87e16538bc75a6c03379252bbc2c8c06f6d2` + ZIP original exato #41/CFIT com hash independente; roteiros externos revisados e proveniência segura. O ZIP histórico corrigido #15 `381ef573...` registrado no issue #1311 **não** é intercambiável. Sem acesso verificável aos arquivos, estado `INCONCLUSIVE / CONTENT_NOT_DELIVERED`, nunca `CERTIFIED`.
