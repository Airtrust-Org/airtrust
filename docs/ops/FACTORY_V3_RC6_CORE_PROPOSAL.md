# Factory V3 RC6 — proposta de núcleo (CANDIDATO, não ativado)

**Estado:** proposta. Nenhum pacote publicado foi tocado; nada foi ativado, enviado a R2/D1 ou aprovado. O RC5 (`abf5b151561c…`) e o RC4 permanecem imutáveis. Ativar o RC6 em qualquer curso exige novo pacote, QA, revisão pedagógica assinada, homologação governada e *handoff* de edição — exatamente como o runbook `SCORM_FORMATIVE_EDITION_REPLACEMENT_RUNBOOK.md`.

Origem: auditoria do curso "Inglês Técnico Aplicado à Manutenção Aeronáutica" (pacote RC10, núcleo RC5). Quatro melhorias exigem alterar o núcleo.

## Artefatos

| Arquivo | Papel |
|---|---|
| `scripts/learning-factory/cores/AIRTRUST_FORMATIVE_V3_RC6_CANDIDATE.app.js.txt` | núcleo RC6 (sha256 `5c86a4d603e4…`), arquivo **novo** |
| `scripts/learning-factory/build_factory_v3_rc6_core.py` | gera o RC6 a partir do RC5 por 22 substituições ancoradas (cada âncora ocorre exatamente 1× no RC5). **A lista `REPLACEMENTS` é o diff legível** (o núcleo é minificado em linhas longas); `--check` prova que o arquivo versionado é a saída exata |
| `scripts/__tests__/factory-v3-rc6-browser.cjs` | regressão sintética Chromium + WebKit (roda em `heavy-ci`, junto do teste V3) |
| `scripts/qa/factory-v3-rc6-package-browser.cjs` | exercício **privado/local** de um ZIP real com o RC6 (`AIRTRUST_RC6_PACKAGE_ZIP_PATH`), não roda no CI |
| `scripts/learning-factory/verify_golden_core.py` | registra `AIRTRUST_GOLDEN_MASTER_CORE_V3_RC6_FINISH_ON_COMPLETE_CANDIDATE` (só permite verificar o lock de um ZIP que o declare; aditivo; RC4/RC5 intocados) |

## O que mudou (por prioridade)

### 1. T1 — `LMSFinish` só ao concluir
RC5 chamava `finishSession` em `beforeunload`, `pagehide` e `unload`. Após `finish()`, `scorm_api.js` recusa `set/commit` e `persist()` devolvia `true` sem gravar → no celular (pagehide/visibilitychange sem descarregar a página) o progresso deixava de ser salvo em silêncio.

RC6: `saveOnLeave()` em `beforeunload`/`pagehide`, e `visibilitychange→hidden` — só `persist()`+`commit`. `LMSFinish` só em `completeCourse()` (clique explícito, uma vez). O handler `unload` (obsoleto, bloqueia bfcache) foi removido. O host (`lms-assets.ts` ~2581) já faz commit nesses três eventos e seu `LMSFinish` só faz commit.

**Desvio deliberado da instrução literal** ("só em `completeCourse()`"): num curso **já concluído** reaberto (modo `review`, nenhuma escrita possível), `pagehide`/`beforeunload` ainda chamam `Finish` uma vez por sessão SCORM. Motivo: o produtor independente (`scorm-independent-zip-producer.mjs`, `FINISH_NOT_OBSERVED`) e o contrato (`PRODUCER_CONTRACT` §"Quatro estados": `PROTOCOL_PASS` exige *Finish real no teardown*) observam o `Finish` ao remover o iframe de um curso concluído. Cursos incompletos **nunca** finalizam ao sair. É o mesmo comportamento RC5 para o estado terminal, onde não há mais o que perder. Se a revisão preferir o literal, basta trocar `saveOnLeave(true)` por `saveOnLeave(false)` — ao custo de `PROTOCOL_PASS` local passar a ser `INCONCLUSIVE`.

### 2. Avanço só com a resposta correta
- `canAdvance()` de cenário exige a alternativa correta (`scenarioOk`).
- Alternativa errada: registra interação, mostra o feedback da alternativa, **desabilita** essa alternativa, rótulo do `#next` = "Escolha a alternativa adequada", dica no rodapé; **não** é gravada em `scenario` → `suspend_data` continua no formato RC5 (`v:4`; único campo novo, opcional: `x`). Após a correta, as alternativas travam.
- Tentativas erradas **não** persistem entre recargas (o aluno pode tentar de novo); o contador de interações persiste.
- Reparo de resposta ausente (caminho do RC5 de recuperação): também exige a correta (errada não conclui o reparo).
- Estado legado: resposta errada persistida pelo RC5 na tela ativa é tratada como não aceita ao restaurar. `study_end` mantém a regra RC5 (`!= null`) para não travar telas já concluídas sob RC5.

**Compatibilidade com o driver funcional e com o roteiro assinado**
- `driveFactoryCourse` (`lms-scorm-functional-driver.ts`) escolhe a alternativa **correta** do modelo (`option[1]===true`) quando `scenarioState===undefined`, clica `[data-opt]` (cai no fallback `.screen.active [data-opt]`) e depois `#next`: **compatível sem mudança**. Só olha `scenarioState` `undefined` — que agora só deixa de ser `undefined` após a correta.
- Tentar alternativas **em sequência até o `#next` habilitar basta**: as erradas ficam `disabled`, então "clicar a primeira habilitada" converge em ≤ N−1 tentativas (provado nos 30 cenários do RC10 em Chromium/WebKit: 75 cliques no total, dos quais 30 corretas).
- **Incompatibilidade real:** um roteiro externo assinado (`scorm-independent-zip-producer.mjs`, ação `click` com seletor fixo) que clique uma alternativa **errada** e siga para `#next` travará (`#next` desabilitado → `INCONCLUSIVE`, não condena o ZIP). Como o roteiro é preso por SHA do ZIP e do driver e o RC6 muda o SHA do pacote, o roteiro/jornada precisa mesmo ser reemitido; ele deve apontar a correta (ou sequência até habilitar). Roteiros revisados sob o RC5 **não** devem ser reaproveitados sem conferência.
- Ferramentas que param ao ver `.selected` (`lms-learner-e2e-homologation.mjs`) hoje escolhem a correta quando o gabarito está no modelo; o fallback "primeira habilitada" pode travar se a primeira for errada — usar o gabarito do modelo (já é o caminho principal).
- Revisão pedagógica assinada (14 itens do MGM / equivalente): o RC6 muda o comportamento visível (alternativa errada bloqueia avanço e tem estado desabilitado) → **precisa ser reapresentada ao revisor**; não herdar a assinatura do RC5.

### 3. Interações SCORM 1.2 (`cmi.interactions.n.*`)
Por tentativa de cenário: `id` (id do slide, saneado), `type=choice`, `time` (hh:mm:ss local), `correct_responses.0.pattern` (letra), `student_response` (letra), `result` (`correct|wrong`). Em curso com prova: uma interação por questão a cada avaliação (`<id>_qN`).
- Verificação do host: `LMSSetValue` aceita qualquer elemento no dicionário `cmi`; `buildPayload()` serializa tudo em `cmi_json` (restaurado no relançamento, então o contador sobrevive). `scheduleCommit` só dispara em status/location/suspend_data — as interações viajam no `commit()` que o próprio `persist()` já faz. `checkCompletion` só olha `lesson_status`; `protectTerminalValue` só trata status, `suspend_data` e score → **não afeta a detecção de conclusão** (teste: status segue `incomplete` até o fim e `completed` ao concluir; Finish uma vez).
- Tamanho: `cmi_json` não tem teto no schema de commit; o teto conhecido é 65 535 caracteres (F0 de staging). ≈250 B/interação; teto de `MAXI = clamp(4×cenários + 2×questões, 80, 140)` ⇒ ≤ ~35 KB no pior caso. Medido no RC10 (30 cenários, tentativas sequenciais: 75 interações): `cmi_json` 19 371 B, `suspend_data` ≤ 868 car. (limite 3 900). Passado o teto, o núcleo para de registrar interações e **nunca** falha por isso.
- Não grava em preview/`qa=1`, nem em modo `review` (zero escritas após conclusão). Falha de `set` é ignorada.
- Pendência de integração (fora do núcleo): nenhum relatório/leitor do Worker consome `cmi.interactions.*` hoje; ficam disponíveis em `cmi_json` para evolução.

### 4. Acessibilidade
- Região viva dedicada `#liveMsg` (`role=status`, `aria-live=polite`, `aria-atomic`), **criada pelo núcleo se o `index.html` não a tiver** (o `index.html` não é pinado, mas assim o RC6 funciona sobre o HTML do RC10 sem tocá-lo; estilos inline porque `styles.css` é pinado). `aria-live` do `#viewport` é removido. Anuncia: "Tela N de T: título" (só ao trocar de tela, não a cada re-render) e o feedback das alternativas.
- `lang="en"`: **opt-in** com `COURSE_DATA.enLangMarking === true` (não invasivo para NR-26 etc., onde aspas curvas em português seriam marcadas por engano). Convenções reconhecidas: colunas "Leitura em inglês", itens `EN — …`, notas `Exemplo de leitura: … — …`, trechos entre aspas curvas nas perguntas/alternativas e `enOpts` (índices de alternativas inteiras em inglês); `ptQuote` desliga a marcação da pergunta. No RC10, ligar a flag marca 66 trechos. **Requer uma linha no `course-model.js`** (conteúdo, não núcleo).

## Evidências (locais)

- `node scripts/__tests__/factory-v3-rc6-browser.cjs` → Chromium e WebKit PASS: controle negativo (RC5 perde a resposta após `pagehide`), T1 (sair não finaliza; voltar grava; recarregar retoma; concluir = 1 Finish; sair depois não repete; reabrir concluído = 0 escritas e 1 Finish por sessão; teardown de iframe concluído = 1, incompleto = 0), gate, reparo, interações, teto, prova, a11y, `lang`.
- Regressão RC4/RC5: `factory-v3-browser.cjs`, `factory-v3-resume-recovery-browser.cjs`, `f5-factory-v3-visual-witness.test.mjs`, `test_scorm_golden_core_lock.py` passam; os dois testes de navegador também passam **apontados para o RC6** (compatibilidade comportamental).
- ZIP real RC10 (77 telas, 30 cenários, `scorm_api.js` real, emulador `window.API`): jornada completa em Chromium e WebKit, com e sem `enLangMarking`; sem alterar o ZIP.

## Fora de escopo (backlog)

1. Campo de escrita livre.
2. Componente "Exemplo EN" com tradução sob demanda.
3. Alterar o contrato de conclusão formativa (`assessment.mode=NONE`).
4. Foco de teclado: o `render()` recria o DOM e o foco se perde (já era assim no RC5); devolver foco à primeira alternativa habilitada / ao `#next`.
5. `cmi.core.exit=suspend` ao sair incompleto; `cmi.core.session_time`.
6. Consumo de `cmi.interactions.*` em relatórios do Worker e eventual limite de `cmi_json` no schema de commit.
7. Script de preparação de ZIP (como `prepare_nr26_resume_recovery_candidate.py`): não incluído — exigiria SHA do ZIP-fonte privado e a alteração de conteúdo (`enLangMarking`, versão do pacote) que cabe à edição, não ao núcleo.

## Riscos de compatibilidade (resumo)

| Risco | Efeito | Mitigação |
|---|---|---|
| Roteiro/jornada assinado que clique alternativa errada | `#next` desabilitado → jornada `INCONCLUSIVE` | reemitir roteiro com a correta ou sequência até habilitar; SHA do pacote muda de qualquer forma |
| Revisão pedagógica assinada sob RC5 | comportamento visível mudou | nova revisão do RC6 |
| Finish no teardown de curso concluído (desvio) | nenhum risco de perda; necessário p/ `PROTOCOL_PASS` | decisão do revisor; ver §1 |
| Mais dados em `cmi_json` | ≤ ~35 KB; teto 65 535 só em F0 | cap + medição; sem leitura no Worker |
| `lang="en"` por convenção textual | falso-positivo se o curso usar aspas curvas em PT | opt-in por flag no modelo |
| Registro do hash no verificador | permite validar ZIP RC6; não autoriza ativação | PR separável se a revisão preferir |
