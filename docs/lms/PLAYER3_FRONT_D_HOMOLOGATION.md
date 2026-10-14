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
3. Criar um arquivo **privado, fora do repositório**, definido por `PLAYER3_QA_PROFILE_FILE`, com `baseUrl`, `contentOrigin`, `empresaId`, `courseTitle`, `projects.chromium` e `projects.webkit`. Em cada projeto:
   - `doutrinamento`: `enrollmentId`, `cycleId`, `editionSha256`, `launchPath`, `snapshotPath`, `qualificationPath`, `certificatePath` e `units` (exatamente 42 entradas **na ordem real da edição**; cada entrada `{id,visualCue,practice?,official?}`). `practice` é `{question,wrong,correct}`; `official.questions` é lista de `{question,wrong,correct}` com respostas de **fixture sintética aprovada**. Identificador do estágio avaliado deve coincidir com o ID registrado no ledger.
   - `resume80`: mesmos campos de identidade e URLs, `expectedResumeUnitId`, `creditedNavigationIds`, `minPreviousPct` (80 a 99).
   - `external`: mesmos campos de identidade e URLs; `scormSnapshotPath`, `frameSelectors` (seletores dos iframes em ordem), `visualLastPageButton`, `wrongAnswerButton`, `correctAnswerButton`, `submitButton`, `finishButton`. Usar um pacote SCORM 1.2 de fornecedor externo, não a fixture M8 da Factory.
4. Disponibilizar `PLAYER3_QA_STORAGE_STATE` apenas no workspace seguro local do executor: estado de sessão QA autenticada, não um `.auth` versionado. API read-only pode exigir `PLAYER3_QA_READONLY_BEARER_TOKEN` em variável protegida. Nunca registrar credenciais, respostas autorais/gabaritos, dados reais ou arquivos de storage state no Git.
5. Confirmar origem exata em `PLAYER3_QA_STAGING_ORIGIN` e aceitar explicitamente writes **apenas nas matrículas sintéticas** via `PLAYER3_QA_ALLOW_WRITES=SYNTHETIC_STAGING_ONLY`. Host HTTPS deve conter `staging`, `stage` ou `qa`; `airtrust.online` e `www.airtrust.online` são recusados. A pré-validação é obrigatória, não é opção de skip.

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
npx playwright test --config=e2e/player3/playwright.player3.config.ts --list
npx playwright test --config=e2e/player3/playwright.player3.config.ts --project=chromium
npx playwright test --config=e2e/player3/playwright.player3.config.ts --project=webkit
```

Capturas só com `PLAYER3_QA_CAPTURE_ALLOWED=SYNTHETIC_ONLY`, anexadas ao relatório privado; `trace: retain-on-failure`. Sanitizar antes de compartilhar o artefato. Nunca commitar capturas de alunos reais ou respostas. Registrar runner/browser, SHA testado, edição/ZIP SHA-256, staging version/provenance, hora, evidências, status **PASS/FAIL/BLOCKED/INCONCLUSIVE**, diferença real vs contrato e IDs sintéticos apenas em cofre privado.

## Gates de liberação
- **QA de contrato:** compile do Playwright e preflight negativo (sem fixture/sem autorização deve falhar fechado).
- **Homologação de runtime:** 42/42 unidades reais + fixação + avaliação autoral legítima (erro/aprovação) + persistência D1 + revisão histórica + certificado PDF + sessão reaberta, Chromium/WebKit; SCORM externo real pelo adaptador.
- **Gate visual:** revisão comparada por humano ao **RC8.1 fonte**, texto, cores, fontes, vídeo, navegação e responsividade; achado visual impeditivo bloqueia a aprovação.
- **Gate release:** oito checks Actions no SHA candidato e staging autorizado/validado. PR #1389 em draft NÃO é implantação. Produção não está autorizada por esta frente.

## Dependência e handoff
A Frente D pode integrar esta suíte numa branch independente da `main` enquanto B finaliza APIs. **Não fundir na #1389 nem liberar staging sem sincronizar SHA e janela com B.** Publicar no PR de D a matriz e, na #1389, apenas o link para os contratos faltantes. Não reabrir auditoria histórica do 99%; homologar a cadeia nova.
