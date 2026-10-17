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
- SHA-256 do documento PDF de certificado verificado no QA.

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
