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
5. Confirmar a origem exata do Pages em `PLAYER3_QA_STAGING_ORIGIN` e a do Worker em `PLAYER3_QA_API_ORIGIN`. O teste exige que `/api/version` reporte `environment=staging` e `sourceSha=expectedSourceSha` antes de interação mutável. Aceitar explicitamente writes **apenas nas matrículas sintéticas** via `PLAYER3_QA_ALLOW_WRITES=SYNTHETIC_STAGING_ONLY`. Host HTTPS deve conter `staging`, `stage` ou `qa`; `airtrust.online` e `www.airtrust.online` são recusados. A pré-validação é obrigatória, não é opção de skip. `PLAYER3_QA_READONLY_BEARER_TOKEN` é obrigatório em variável protegida para leitura do Worker; não expor seu valor.

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

- Preflight puro: **9/9 Vitest PASS**; ESLint e TypeScript focados PASS.
- Playwright da D: 3 jornadas × Chromium/WebKit = **6 testes descobertos**, não executados em staging.
- Suíte SCORM protocolo Factory/M8 já existente: **2/2 PASS** em Chromium/WebKit (não é SCO externo nem certificado RC8.1).
- GitHub Actions no HEAD inicial D `78a52ba52aca2b5180af535e6fa71a4db7066bb7`: oito gates PASS; cada commit posterior tem que ter sua própria evidência CI.

- No HEAD desta etapa, tentativa de rodar um cenário de browser sem `PLAYER3_QA_ALLOW_WRITES` terminou com `PLAYER3_CONTRACT_MISSING:STAGING_SYNTHETIC_WRITE_APPROVAL` **antes de navegar ou ler APIs** (preflight de segurança PASS, cenário E2E intencionalmente não executado).
