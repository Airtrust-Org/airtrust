# Player 3 — candidato técnico sintético coerente com os contratos Native/Worker

## Objetivo

Preparar **sem acesso remoto** um conjunto de artefatos coerentes para a homologação técnica do Player 3. A edição é exclusivamente sintética e independente dos 22 ZIPs de cursos reais, cuja adaptação será feita em fase posterior por solicitação do operador.

O gerador anterior produzia HTML5, unidades e um gabarito de teste, mas não gerava os objetos que o Worker da PR #1389 exige: `AIRTRUST_NATIVE_COURSE_V1`, `AIRTRUST_PLAYER3_SERVER_PRIVATE_BANK_REVIEW_V1`, `AIRTRUST_PLAYER3_GRADE_POLICY_V1` e a identidade `AIRTRUST_PLAYER3_AUTHORED_LAUNCH_V1`. Esta entrega preenche essa lacuna **apenas offline**.

## Gerar e validar

```bash
python3 scripts/learning-factory/prepare_player3_technical_candidate.py \
  --out /tmp/player3-candidate-test-001 \
  --parent-origin https://staging.airtrust.pages.dev \
  --course-id qa-player3-synthetic

python3 -m unittest -v scripts/learning-factory/test_prepare_player3_technical_candidate.py
node scripts/learning-factory/test_player3_technical_browser.cjs
```

O destino não pode existir. O gerador cria:

- `browser/player3-technical-only.zip`: HTML5 com cinco unidades, fixação e avaliação com dez questões, sem chave de avaliação ou autorização certificadora.
- `private/native-private-candidate.json`: Native V1 com 4 lições e 1 etapa, SHA-256 de seus **bytes exatos** como identidade da edição. O código JavaScript do HTML5 utiliza precisamente esse SHA.
- `private/player3-server-private-bank.json`: banco sintético de respostas no esquema privado esperado pelo Worker.
- `private/player3-approved-policy.json`: política sintética, com banco/edição/fonte vinculados por SHA-256 e metadados para **ensaio do contrato de launch**. Campos `certificationApproved:true` e `reviewedImmutableRelease:true` são requeridos pelo **teste do validador**; **não constituem autorização de publicação**.
- `private/source-stage-crosswalk.json`: identidade reproduzível das unidades e questões.
- `manifest.json`: hashes de fonte, edição, política, banco privado, conteúdo e marcador **OFFLINE_TECHNICAL_CANDIDATE_NOT_APPROVED_FOR_STAGING_OR_PRODUCTION**.

Todo conteúdo privado está em diretório `0700`, arquivos `0600`. Nunca adicionar ao Git, publicar gabaritos em origem HTML5, exibir em logs, disponibilizar a clientes ou fazer upload para R2 fora do fluxo governado e autorizado. O código não chama API, Cloudflare, D1 nem R2. O curso `courseId` exige prefixo `qa-` e o host da página deve ser HTTPS staging/QA.

## Integração futura, fora do escopo desta PR

A frente proprietária do motor (#1389) deve confirmar, com testes focados no **mesmo SHA do seu contrato**, a validação do Native e o grading da etapa real no Worker, e somente então preparar ambiente sintético autorizado por empresa e usuário. Ainda faltam schema físico 0561/0562, habilitação governada, publicação das origens e matrícula QA, e a execução das seis jornadas reais Chromium/WebKit até PDF. **Não equiparar teste offline a conclusão E2E.**

Esta PR **não altera o motor, não aprova nenhum curso, não aplica migrations, não executa seeds, não faz deploy e não autoriza produção**.
