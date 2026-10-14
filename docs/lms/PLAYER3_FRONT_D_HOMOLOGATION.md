# Frente D — Homologação operacional independente do Player 3

**Status: contrato automatizado preparado; homologação real PENDENTE.** Incidente [#1325](https://github.com/Airtrust-Org/airtrust/issues/1325), reconstrução [PR #1389](https://github.com/Airtrust-Org/airtrust/pull/1389). Esta frente NÃO implementa o motor, o writer, certificados, RBAC, Schema V2 nem a Factory.

## Escopo e autoridade
- Suíte segregada: `e2e/player3/player3-acceptance.spec.ts`; configuração `e2e/player3/playwright.player3.config.ts`.
- Alvo: Doutrinamento em Segurança e Qualidade **RC8.1**, edição/hash aprovado; Chromium e WebKit; **42 unidades do HTML5 original**, fixações, avaliação oficial definida pelo manifesto (modular ou final), reprovação+nova tentativa, persistência, conclusão, histórico, qualificação, PDF, recarga, fechamento de sessão e offline.
- Continuidade de matrícula histórica em **80%** com crédito administrativo **somente de navegação**. Nunca importar nota/certificado do SCORM ou inferi-los por porcentagem.
- SCORM **externo 1.2**, fora da Factory/M8: executar o SCO verdadeiro pelo adaptador legado, reprovar, reabrir, aprovar, finalizar, consultar backend; contador/último slide não é prova de conclusão.
- O E2E exige **ambiente staging com matrículas TESTE descartáveis, autorizadas e isoladas**. Não rodar contra produção, banco de clientes, matrícula real #911 ou dados pessoais. Sem seed remoto implícito, migrations, upload R2 ou contorno de autenticação.
- Não substitui os testes já existentes `e2e/ci/lms-scorm-browser-protocol.spec.ts` (protocolo Factory/M8) e `e2e/ci/lms-scorm-enrollment-browser.spec.ts` (Worker/D1 local M8). Eles não certificam RC8.1 nem pacote externo.

## Pré-requisitos antes de cada execução real
1. Frente B disponibiliza no **SHA candidato** os endpoints autenticados, HTML5 isolado e sem gabarito exportado, writer de tentativas/fechamento e vínculo histórico/qualificação/certificado. Schema V2 e conteúdo são publicados somente pelo fluxo aprovado. A edição RC8.1 exata e o manifesto pedagógico são revisados; não inventar prova final.
2. Aprovar staging QA e provisionar **separadamente por navegador** três matrículas sintéticas na mesma empresa de teste: nova RC8.1, continuidade 80% e SCORM 1.2 **externo**; todo conteúdo externo com licença/uso de QA. Reprovação/aprovação devem ser possíveis de forma legítima. A prova de continuidade exige snapshot histórico de QA persistido e crédito de posição aprovado, jamais creditação de avaliação.
3. Criar um arquivo **privado, fora do repositório**, definido por `PLAYER3_QA_PROFILE_FILE`, com `baseUrl` (Pages staging), `apiBaseUrl` (Worker staging), `expectedSourceSha` (40 hex do commit candidato), `contentOrigin` (HTML5 em terceira origem HTTPS), `empresaId`, `courseTitle`, `projects.chromium` e `projects.webkit`. **Seis matrículas sintéticas distintas:** três Chromium e três WebKit. Em cada projeto:
   - `doutrinamento`: `enrollmentId`, `cycleId`, `editionSha256`, `launchPath`, `snapshotPath`, `qualificationPath`, `certificatePath` e `units` (exatamente 42 entradas **na ordem real da edição**; cada entrada `{id,visualCue,practice?,official?}`; exatamente **oito avaliações modulares com `official.stageId` diferentes**, sem inventar prova final). `practice` é `{question,wrong,correct}`; `official.stageId` é o identificador da avaliação canônica e `official.questions` é lista de `{question,wrong,correct}` com respostas de **fixture sintética aprovada**. `official.stageId` deve coincidir com o identificador registrado no ledger e pode ser diferente do ID visual da unidade.
   - `resume80`: mesmos campos de identidade e URLs, `expectedResumeUnitId`, `creditedNavigationIds`, `minPreviousPct` (80 a 99).
   - `external`: mesmos campos de identidade e URLs; `scormSnapshotPath`, `frameSelectors` (seletores dos iframes em ordem), `visualLastPageButton`, `wrongAnswerButton`, `correctAnswerButton`, `submitButton`, `finishButton`, `learnerCompletionButton` (botão real de **confirmação de fechamento pelo aluno** no wrapper, nunca mensagem sintética). Usar um pacote SCORM 1.2 de fornecedor externo, não a fixture M8 da Factory.
4. Disponibilizar `PLAYER3_QA_STORAGE_STATE` apenas no workspace seguro local do executor: estado de sessão QA autenticada, não um `.auth` versionado. API read-only pode exigir `PLAYER3_QA_READONLY_BEARER_TOKEN` em variável protegida. Nunca registrar credenciais, respostas autorais/gabaritos, dados reais ou arquivos de storage state no Git.
5. Confirmar a origem exata do Pages em `PLAYER3_QA_STAGING_ORIGIN` e a do Worker em `PLAYER3_QA_API_ORIGIN`. O teste exige que `/api/version` reporte `environment=staging` e `sourceSha=expectedSourceSha` antes de interação mutável. Aceitar explicitamente writes **apenas nas matrículas sintéticas** via `PLAYER3_QA_ALLOW_WRITES=SYNTHETIC_STAGING_ONLY`. Host HTTPS deve conter `staging`, `stage` ou `qa`; `airtrust.online` e `www.airtrust.online` são recusados. A pré-validação é obrigatória, não é opção de skip. `PLAYER3_QA_SYNTHETIC_TENANT_ID` deve conter **o ID exato da empresa sintética autorizada**, independentemente do perfil privado; qualquer divergência bloqueia a suíte. `PLAYER3_QA_READONLY_BEARER_TOKEN` é obrigatório em variável protegida para leitura do Worker; não expor seu valor.

### Interface observável que a Frente B deve fornecer/confirmar
- Rotas de leitura autenticada de *snapshot* por matrícula/ciclo/edição, retornando `{success:true,data:{empresa_id,matricula_id,ciclo_id,edition_sha256,status,progresso_pct,completed_unit_ids,attempts,qualificacao_historico_id,certificate_id}}`. `attempts[]` contém `stage_id,attempt_number,passed,score_pct`. Se a API final usar outra forma, **adaptar somente o driver de leitura da Frente D após revisar o contrato**; não mudar a regra de negócio da B.
- Host HTML5 em `iframe[title^="Conteúdo original"]` de origem HTTPS separada. HTML original deve manter o texto/mídia/autoria; cada `visualCue` privativo precisa ser encontrável no frame renderizado. Fidelidade *pixel a pixel* exige revisão da captura frente ao original RC8.1: screenshot automatizado sozinho **não comprova paridade**.
- Locators observáveis sugeridos: `player3-root`, `player3-active-unit-id`, `player3-next-unit`, `player3-practice`, `player3-offline-pending`, `player3-resume-review-state`, `player3-request-finalization`, `scorm-compat-root`. São **contratos de teste propostos**, NÃO afirmação de que já existem. A prova oficial usa o overlay já previsto em #1389: `role=dialog` nome `Avaliação AirTrust`, botões `Enviar avaliação ao AirTrust` e `Prosseguir para o próximo módulo`.
- O snapshot deve ser lido realmente do Worker/D1, não de estado React, `localStorage`, contador de slides ou `postMessage`. O endpoint de qualificação deve retornar `empresa_id,matricula_id,id,certificate_id,linked_records`, onde `linked_records=1` assegura que não houve duplicação. O certificado deve ser PDF real (assinatura de bytes `%PDF-`).
- SCORM externo: `scormSnapshotPath` lê `lesson_status` persistido pelo adaptador Worker. O harness **não escreve CMI**, não envia eventos de aprovação, não marca matrícula como concluída artificialmente e não simula mensagem de finalização.
- Quando faltar API, locator, conteúdo, edição, dados de teste ou permissão, falhar com `PLAYER3_CONTRACT_MISSING:<nome>` ou assertion de etapa; **não fazer skip com status verde**.

## Execução
Após QA aprovada e ambiente provisionado (com variáveis de ambiente protegidas, fora do log):

```bash
npx vitest run --config vitest.player3-front-d.config.ts
npx playwright test --config=e2e/player3/playwright.player3.config.ts --list
npx playwright test --config=e2e/player3/playwright.player3.config.ts --project=chromium
npx playwright test --config=e2e/player3/playwright.player3.config.ts --project=webkit
```

Capturas só com `PLAYER3_QA_CAPTURE_ALLOWED=SYNTHETIC_ONLY`, anexadas ao relatório privado; o opt-in salva cada uma das 42 unidades para revisão de fidelidade visual, sem commits. Falhas HTTP ou de rede de CSS, JS, imagens, vídeo e fontes da origem original são erros de QA; `trace: retain-on-failure`. Sanitizar antes de compartilhar o artefato. Nunca commitar capturas de alunos reais ou respostas. Registrar runner/browser, SHA testado, edição/ZIP SHA-256, staging version/provenance, hora, evidências, status **PASS/FAIL/BLOCKED/INCONCLUSIVE**, diferença real vs contrato e IDs sintéticos apenas em cofre privado.

## Gates de liberação
- **QA de contrato:** compile do Playwright e preflight negativo (sem fixture/sem autorização deve falhar fechado).
- **Homologação de runtime:** 42/42 unidades reais + fixação + avaliação autoral legítima (erro/aprovação) + persistência D1 + revisão histórica + certificado PDF + sessão reaberta, Chromium/WebKit; SCORM externo real pelo adaptador.
- **Gate visual:** revisão comparada por humano ao **RC8.1 fonte**, texto, cores, fontes, vídeo, navegação e responsividade; achado visual impeditivo bloqueia a aprovação.
- **Gate release:** oito checks Actions no SHA candidato e staging autorizado/validado. PR #1389 em draft NÃO é implantação. Produção não está autorizada por esta frente.

## Dependência e handoff
A Frente D pode integrar esta suíte numa branch independente da `main` enquanto B finaliza APIs. **Não fundir na #1389 nem liberar staging sem sincronizar SHA e janela com B.** Publicar no PR de D a matriz e, na #1389, apenas o link para os contratos faltantes. Não reabrir auditoria histórica do 99%; homologar a cadeia nova.


## Contratos existentes da Frente B que não substituem o E2E

Na PR #1389 (leitura do código em 2026-10-14), as rotas autenticadas já projetadas incluem:

- `POST /matriculas/:matriculaId/etapas/:stageId/tentativas`: grava evidência de etapa, responde `stage_id`, `edition_sha256`, `score_pct` e `stage_passed`, mas declara `completion_supported:false`. Não se trata de certificado.
- `GET /matriculas/:matriculaId/sessao`: responde edição e navegação resumida, **não** um ledger completo com histórico/certificado.
- `POST /matriculas/:matriculaId/concluir`: chama o escritor canônico sob allowlist de staging; o recibo `certificate_state:REQUIRES_VERIFICATION` **não prova PDF emitido**.

A D ainda precisa mapear rotas reais de leitura de tentativas, matrícula, histórico e PDF, adaptando exclusivamente o driver de QA. Se a B não disponibilizar leitura suficiente, usar inspeção read-only governada da fixture D1 staging, sem writes, sem autenticação contornada e sem `localStorage` como evidência oficial. **Estas rotas, embora implementadas no código DRAFT, ainda não foram homologadas em staging.**


## Reconciliação modular real — API da Frente B

Foi confirmado no código da PR #1389 o endpoint autenticado
`GET /api/lms/native/matriculas/{matriculaId}/etapas/sessao`. Ele retorna
`editionSha256`, `cycleId`, `allOfficialStagesPassed`,
`completionSupported` e `stages[]` com
`stageId, attempts, lastScorePct, passed, nextAttemptNumber`.

O E2E da D lê **essa API real** antes da primeira unidade, após a primeira reprovação,
após cada aprovação, depois de reabrir o browser e antes da finalização. Verifica
oito IDs de etapa exatamente iguais aos do manifesto revisto, edição/ciclo fixos,
contagem de tentativas, nota de 0–100 e numeração monotônica. O leitor recalcula
o resultado com banco privado da B. `allOfficialStagesPassed=true` **não**
é uma matrícula concluída: a D exige ainda snapshot persistido de matrícula,
vínculo único no histórico e certificado PDF verificável. `completionSupported`
é somente capacidade informativa e **não** é aceito como recibo.

**Bloqueio de B identificado em 2026-10-14:** `canCompleteNative` desabilita
expressamente a rota antiga de conclusão Native para tenants com
`PLAYER3_MODULE_ATTEMPTS_ENABLED_TENANTS`. Isso evita certificar via
single-attempt, mas o novo terminal canônico Player3 só poderá homologar
a RC8.1 quando reconciliar as oito provas e resultar no certificado verificável.
Não desligar o gate modular como atalho. A D não altera esse writer.

O SCORM 1.2 externo consulta o snapshot em `apiBaseUrl` do Worker, nunca
no frontend Pages (endereços corrigidos), e só solicita conclusão pelo
controle explícito do aluno depois de `lesson_status=passed`.

A revisão local independente da B em HEAD `b41b8fc451086cbaf0b33c8ec2a9ec04a5942398`
executou **23/23 testes PASS**: `lms-player3-stage-attempts.test.ts`,
`lms-player3-module-progress-reader.test.ts` e
`lms-native-completion.test.ts`. É teste isolado local, **não** prova
de migration aplicada, staging, SCORM real ou certificado.

A validação de perfil impede URLs com segredo/JWT em query ou fragmento e
recusa origem de assets que não seja explicitamente HTTPS staging/QA.

## Evidência independente disponível

- Preflight puro: **30/30 Vitest PASS** (inclui módulo autenticado, origem privada e allowlist de tenant); ESLint e TypeScript focados PASS.
- Playwright da D: 3 jornadas × Chromium/WebKit = **6 testes descobertos**, não executados em staging.
- Suíte SCORM protocolo Factory/M8 já existente: **2/2 PASS** em Chromium/WebKit (não é SCO externo nem certificado RC8.1).
- GitHub Actions no HEAD inicial D `78a52ba52aca2b5180af535e6fa71a4db7066bb7`: oito gates PASS; cada commit posterior tem que ter sua própria evidência CI.

- No HEAD desta etapa, tentativa de rodar um cenário de browser sem `PLAYER3_QA_ALLOW_WRITES` terminou com `PLAYER3_CONTRACT_MISSING:STAGING_SYNTHETIC_WRITE_APPROVAL` **antes de navegar ou ler APIs** (preflight de segurança PASS, cenário E2E intencionalmente não executado).

### Limite de homologação confirmado
Mesmo com 17 testes de contrato, 23 testes locais relevantes da B e seis E2E descobertos, **não houve execução dos 6 E2E contra staging real**. As matrículas RC8.1 e SCORM externos sintéticos, o manifesto de 42 unidades, o terminal canônico Player3, o histórico e a certidão PDF precisam de integração oficial. Não converter o status DRAFT em aprovação antes dessas evidências.

## Prontidão conjunta — atualização 2026-10-14

A B incluiu (em draft) a rota autenticada
`GET /api/lms/native/matriculas/{matriculaId}/etapas/prontidao`.
A D passou a consumi-la diretamente no E2E (sem simular seus resultados).
O preflight puro verifica tenant/matrícula, hash da edição e ciclo fixados, 42
lições requeridas, oito etapas oficiais, contagens válidas, motivo e coerência
do booleano `readyForAtomicTerminalPreflight`. O JSON retorna ambos
`completionSupported:false` e `completion_supported:false`, que devem
continuar falsos mesmo com 42/42 e 8/8.

Matriz explicitamente coberta por preflight independente: edição/ciclo/matrícula
divergentes; 41/42; 7/8; certificado alegado indevidamente; lição/etapa
a mais ou ausente; razão contraditória. No E2E real, o GET é consultado
na abertura, após reprovação, após reabertura do navegador e imediatamente
antes do pedido de finalização. No último estado exige 42/42, 8/8, `READY_FOR_TERMINAL_PREFLIGHT`
e matrícula **ainda não concluída**, até que o fechamento canônico gere
histórico/certificado verificáveis em transação.

**Diferença de escopo:** essa API prova um cruzamento lógico das evidências
registradas; não demonstra a fidelidade visual do HTML5, a origem real de cada
interação, a existência de certificados ou um cutover em staging. Os testes
automatizados de contrato rodam offline, sem credenciais ou dados de clientes.

### Condições para relatório final à coordenação

O aceite final exige, com referências verificáveis: PRs/SHAs integrados,
oito gates oficiais verdes no **mesmo** SHA candidato, staging Worker/Pages e
Schema V2 publicados via fluxo autorizado, assets autorais e política aprovados,
seis jornadas reais Chromium/WebKit aprovadas, retomada dos 80%, compatibilidade
externa SCORM 1.2, conclusão canônica/histórico/qualificação únicos e PDF
inspecionado. O relatório ao coordenador deve distinguir QA/integração/staging
de eventual produção, cuja autorização é separada e específica por SHA.

### Última execução independente de testes focados — 14/10/2026

- Frente D: `c3a72fa36e21ac86213f34612ff6650617c5782d`:
  **30/30 Vitest PASS**, ESLint PASS, TypeScript PASS;
  Playwright descobriu 6 testes (3 casos × Chromium/WebKit),
  ainda **não executados contra staging**.
- Segurança: sem `PLAYER3_QA_ALLOW_WRITES`, o Playwright interrompeu
  antes da navegação com
  `PLAYER3_CONTRACT_MISSING:STAGING_SYNTHETIC_WRITE_APPROVAL`.
  Falha **esperada e correta**; não equivale a E2E positivo.
- Frente B: `765bef2c96ce864fcaf893a4281dc273a84b5f04`:
  **41/41 testes focados PASS**, seis arquivos
  (prontidão conjunta, middleware de rota, módulo, progresso, guarda de terminal,
  conclusão Native). Executados independentemente em worktree limpo.
  Não constitui staging nem transação de certificado.
- Frente A: `95abaf023eeb82de6cc15cef06612b1f44ddfbc0`:
  **35 testes Python OK, um SKIP** por falta do arquivo RC8.1 original privado.
  A geração review-only foi testada; prova com pacote autoral real
  não foi executada. Manter qualquer pacote com resposta embutida
  fora do ambiente aluno até revisão de segurança.

Toda mudança posterior de SHA exige nova verificação dos checks aplicáveis.
Os oito gates da D deste SHA devem ser confirmados no GitHub Actions antes
de afirmar conclusão de CI; sucesso local não substitui Actions.

## Crosswalk de unidades autorais × recibos Native (bloqueio explícito)

A extração de A para o **RC8.1** informa `stage_count=8` para as
**avaliações certificadoras**, com 80 questões no total. Esse número não
informa sozinho o total de telas autorais nem equivale aos recibos
`kind='lesson'` da B. O valor histórico 42/42 também não pode ser usado
para afirmar que o banco precisa de 42 registros de lição.

O contrato de D mantém a jornada de **42 unidades visuais** como hipótese de
homologação a confirmar contra o original; as oito avaliações oficiais são
diferenciadas desses eventos. O perfil privado agora exige
`requiredLessonIds`, a lista **integral e única dos IDs de lição**
aprovada no manifesto Native da B, e `lessonId` para cada tela que cria
recibo de lição. É proibido mapear um ID de lição que não exista em unidade
autoral revisada, repetir IDs ou deduzir notas oficiais de navegação.
O diagnóstico real `etapas/prontidao` deve confirmar
`totalRequiredLessons=requiredLessonIds.length`, com todas as lições
registradas, e `officialStageCount=8`, com todas as provas válidas.
O perfil sintético prova tanto 34 lições/8 provas entre 42 telas como
42 lições com oito provas sobrepostas, **sem declarar qual corresponde
ao original**.

**Dependência A → B → D:** conferir o `slides[]` exato do ZIP RC8.1
SHA-pinned; publicar em canal privado o crosswalk de IDs de tela e
`kind='lesson'` do manifesto da edição aprovada (sem gabaritos);
e confrontar o cenário histórico 42/42 com esses IDs. Somente então
criar as matrículas QA e executar a E2E positiva. Não ajustar ratchet,
fabricar eventos para produzir 42/42 ou usar indicador visual como
autorização de fechamento.

### Revalidação independente do crosswalk — 17h23 BRT, 14/10/2026
- SHA D `25a6f7f52f7f60de698dd5a7e4ca2a45bf38cc6a`: **30/30 Vitest PASS**, ESLint PASS, TypeScript PASS, 6 Playwright descobertos em Chromium/WebKit; não são testes de staging concluídos.
- O preflight aceita 42 telas com 34 lições e 8 provas ou 42 lições com oito provas embutidas, desde que o manifesto privado **declare explicitamente** os IDs canônicos e eles correspondam às telas autorais; a decisão real aguarda A/B. Sem essa evidência, o teste positivo **não deve iniciar**.
- Não há alteração em D1/R2 nem em matrícula real; staging e terminal canônico continuam condicionantes.

## Auditoria independente de offline e PDF — 2026-10-14

**Frente D, SHA `222ae8e67ab22b417022513a686ae012fefab421`:**
30/30 testes de contrato Vitest PASS, ESLint PASS, TypeScript PASS,
seis cenários Chromium/WebKit descobertos (ainda não executados em staging).
O teste de retomada offline deixou de usar `unit.id` como se fosse
necessariamente `lessonId` do Worker: agora escolhe uma unidade autoral
que tem recibo de lição, usa a identidade canonizada no snapshot e exige
exatamente um recibo após reconexão.

O certificado agora exige MIME `application/pdf`, tamanho plausível,
cabeçalho PDF completo, marcador `startxref` e `%%EOF` no final do
arquivo — além da vinculação já verificada de
`qualificacao_historico_id`, `certificate_id` e
`linked_records=1`. A D tenta recuperar e validar o PDF novamente após
abrir uma sessão de navegador nova. Essa checagem é **mais forte que
verificar os cinco primeiros bytes**, mas não substitui inspeção
semântica/visual do certificado por humano, nem prova criptográfica de
autenticidade do documento. Precisa de staging real.

**Frente A independente:** revisão do SHA
`f0a7634261b9614ff211dadadab9c314838bdd8f`: 46 testes Python
executados, 42 aprovados e quatro explicitamente ignorados por exigirem
originais privados ou condições opcionais. Nenhum pacote review-only
passou a ser publicável por causa desses testes.
A B já teve 67/67 testes focados PASS no SHA
`4291f25276b493e378a31876fccaaffe811603ed`; o código do
writer canônico ainda não constitui uma rota operacional certificadora.

**Bloqueios invariáveis:** crosswalk original aprovado, rota terminal,
histórico/PDF real, seis matrículas sintéticas provisionadas, Schema V2 e
Worker/Pages no mesmo candidato governado, E2E real e evidência visual.
Até lá, esta PR continua DRAFT. Cada HEAD requer seus próprios checks CI.

## Origem dos assets com allowlist independente — 14/10/2026

Apenas o nome DNS conter `qa` ou `staging` é insuficiente para autorizar
acesso a uma terceira origem. O perfil privado já exigia que Pages/Worker
fossem HTTPS e allowlisted independentemente; agora
`PLAYER3_QA_CONTENT_ORIGIN` também é obrigatório e deve ser **idêntico**
à origem `contentOrigin` da edição aprovada. Um domínio arbitrário
`https://qa-qualquer-outro...` é recusado com
`PLAYER3_CONTRACT_MISSING:ISOLATED_CONTENT_ORIGIN_ALLOWLIST`,
mesmo sendo HTTPS e contendo `qa`. O segredo de login e o banco de
respostas jamais transitam pelo iframe. Autorização de staging exige
concordância de três origens distintas: Pages, Worker e HTML5.

**SHA de código D `2f63c8a428568cfee89f4bcfb20bf618a48706ec`:**
31/31 Vitest PASS; ESLint e TypeScript PASS; seis cenários Playwright
listados sem erros. A suíte não foi executada em staging real por ausência
de pacote original publicável, matrícula/identidade sintética aprovada,
terminal canônico ativo e publicação governada. Oito gates oficiais
precisam ser verificados na versão final do HEAD; CI de SHA anterior
não implica CI aprovado neste SHA.
