# AirTrust Player 3 — execução estrutural, estado para retomada

**Atualização:** 2026-10-14. **Autoridade:** `Airtrust-Org/airtrust` — PR [#1389](https://github.com/Airtrust-Org/airtrust/pull/1389) (DRAFT). **Prioridade:** reconstrução estrutural do LMS; não reabrir remendos do player SCORM legado.

## Decisão irrevogável até evidência nova

Recriar o player de execução e o motor de aprendizagem do zero, preservando os **HTML/CSS/JS/imagens/vídeos/interações autorais** e os dados históricos do LMS. Não converter slides para um visual genérico. Conteúdo HTML5 fica isolado, sem credenciais LMS, em origem distinta; o backend controla matrícula/ciclo/edição, progressos persistidos, tentativas, nota, conclusão atômica, qualificação, certificado e reconciliação. O próprio HTML5 e suas mensagens SCORM não certificam aluno.

**Exercícios após cada módulo:** fixação com explicação; acertar é requisito de avanço na navegação, com estado revalidado no servidor, mas sem nota e sem gastar tentativa oficial. **Avaliação certificadora:** contrato explícito por edição; modos `MODULE_CERTIFIED` (módulos avaliados, *não inventar prova final*), `FINAL_CERTIFIED` (prova final controlada pelo AirTrust) ou `ATTENDANCE_ONLY` quando pedagogicamente cabível. Não reclassificar sem aprovação módulos já certificados. O aluno segue uma matrícula única. Compatibilidade para SCORM externo fica em adaptador independente, com prova real de conclusão — não baseada em contador visual.

## Arquivos originais recebidos e materializados — 2026-10-14

- `SMS(5).zip`: **9 cursos**, **81.564.282 bytes**, SHA-256 `4ab977d88559c238bf0f1d6226f28959f241276aadd30d5e9183e7ab24dca55b`.
- `Segurança Operacional(2).zip`: **13 cursos**, **91.927.214 bytes**, SHA-256 `b1e274cd6b316ab25797b9062bfeff68b532469a96d3e26bbbe7a8063ad8ff7e`.
- No conjunto: **22 pacotes, 1.016 arquivos autorais preservados byte a byte**, incluindo um SGSO em duas versões. Não considerar todos os 22 versões atuais de produção: comparar edição/versão antes de publicar.

**Artefatos privados entregues na conversa (NÃO são para deploy):**
- `AIRTRUST_PLAYER3_SMS_9_ORIGINAIS_PRESERVADOS_REVISAO_NAO_PUBLICAR.zip` — 81.600.386 bytes, SHA-256 `a0744267ffd8b5294d4c277927f2f614a0ab6dba09dc3cc5668e1afd26c4cfa0`.
- `AIRTRUST_PLAYER3_SEGURANCA_OPERACIONAL_13_ORIGINAIS_PRESERVADOS_REVISAO_NAO_PUBLICAR.zip` — 91.985.007 bytes, SHA-256 `8d98b40182891f9ab046b3720663ac73b002966c52ce7384106b5247c7267ecf`.
- `AIRTRUST_PLAYER3_INVENTARIO_22.csv` (identidades/quantidade/política, sem gabaritos).
- No repositório: `scripts/learning-factory/convert_preserved_html5.py` (conversor determinístico) e `test_convert_preserved_html5.py`. **Não adicionar ZIPs originais, mídia ou chaves de resposta ao GitHub.**

**Atenção:** os arquivos de autoria podem ter **gabaritos embutidos no JavaScript**. As conversões são preservação **para revisão**, não são conteúdo aprovado para servir no navegador do aluno. É necessário separar a avaliação certificadora em banco privativo servidor, validar respostas por política/evidência e isolar os assets/autorização antes de publicar.

## Código novo (não alteração do player SCORM existente)

- `worker-airtrust/src/lib/lms-player3/engine.ts`: domínio independente de contratos `AIRTRUST_PLAYER3_POLICY_V1`, fixação, prova oficial calculada exclusivamente a partir de gabarito privado e `readiness` exigindo estados persistidos. Não aceita escore enviado pelo aluno, dom counters ou conclusão autoafirmada. **Não é ainda o escritor transacional D1**.
- `worker-airtrust/src/__tests__/lib/lms-player3-engine.test.ts`: **11 testes aprovados** incluindo gates modulares, prova final, edição, nota inventada, falha, idempotência.
- `src/react-app/pages/lms/player3/Player3Html5Host.tsx`: casca nova que exibe **o HTML5 original** em iframe de origem HTTPS distinta e não aceita mensagens da página como confirmação de progresso/nota/certificado. **Prévia isolada**, não registrada na árvore de rotas ou conectada a R2 definitivo.
- `src/__tests__/Player3Html5Host.test.tsx`: **4 testes aprovados** de isolamento do iframe, origem e ausência de conclusão autoafirmada.
- **3 testes do conversor** aprovados, incluindo travessia de ZIP/arquivo e integridade exata.
- **Worker TypeScript typecheck PASS** para HEAD contendo engine. Host React tests PASS. Oito gates oficiais do HEAD e build completo ainda precisam de avaliação; não declarar CI verde.

## O que NÃO está pronto

- Host ainda não integrado à rota autenticada do LMS nem a endpoint seguro de HTML5 no R2; qualquer publicação de assets exige CSP, isolamento de origem, autorização multi-tenant, SHA de edição e revisão das respostas embutidas.
- **Não existe ainda uma transação Player3 real aplicada em D1** para prova por módulo, recuperação/replay, finalização canônica e reconciliação/certificado. O engine é puro e testado, não um backend implantado.
- As políticas pedagógicas dos 22 originais precisam ser comparadas com seus manifests; Doutrinamento contém 8 avaliações modulares, NR-20 4 e SGSO 5, por isso não renomear tudo para fixação.
- O navegador headless do container bloqueou navegação com `ERR_BLOCKED_BY_ADMINISTRATOR`, impedindo o smoke visual de fidelidade nesta superfície; solicitar execução browser com origem/ambiente autorizados no Mac/staging, não afirmar validação visual.
- Nenhum conteúdo nem migration de cliente publicado em staging/produção. Nenhuma matrícula 42/42 finalizada no novo motor.
- `npm run lint` geral apresentou anteriormente falha em guard sobre scripts históricos remote-D1; nunca bypassar para obter verde.

## Próxima ação EXECUTÁVEL (não refazer auditoria)

1. Não usar mais a PR #1458 como estratégia principal, nem converter os originais ao layout genérico Native antigo. Manter a PR #1389 como frente única.
2. Implementar versão imutável, isolamento seguro e endpoint de assets HTML5 privados na Cloudflare, com origem segregada e controles exatos `empresa_id`/matrícula/edição.
3. Implementar API de avaliação e checkpoint persistidos por módulo com `moduleGate` explicitamente versionado, gabarito **somente no Worker**, tentativas e replay idempotentes no Schema V2 governado; integrar ao escritor canônico LMS de conclusão/qualificação/recibo de certificado.
4. Conectar Player3 HTML5 Host à navegação dos conteúdos preservados, sem reescrever design e exercícios, e criar prova final do AirTrust apenas se política autoral exigir.
5. Concluir E2E real em staging com matrícula teste Doutrinamento 42/42, queda/retomada, quiz errado/correto, aprovação, histórico, certificado e reabertura Safari/WebKit e Chromium; verificar **oito gates oficiais**.
6. Produção somente com autorização explícita e específica para SHA/artefatos/escopo exato; nunca migrar matrículas reais automaticamente sem governança.

## Estado compacto
OBJETIVO=Player3 real sem 99%; CASO=Doutrinamento matrícula 911, 42/42 e 100 mas 99%; MAIN=verificar ao vivo; PR=#1389 DRAFT; HEAD=consultar PR; ARQUIVOS=engine+host+factory+testes; EXECUTADO=22 candidatos fiéis e domínio independente; TESTES=11+4+3 PASS, Worker TSC PASS; BLOQUEIO=servir HTML5 segregado + schema/persistência+certificação real+smoke visual+CI; PRÓXIMO=desenvolver camada segura e ponta-a-ponta, não corrigir SCORM legado; NÃO_AUTORIZADO=bypass, fabricação de progresso, D1/R2 write improvisado, produção sem SHA/especificidade.

**Este documento prevalece sobre anotações temporárias conflitantes da PR que ainda recomendem renderizador genérico Native.**

## Nova exigência incorporada — continuidade de todos os alunos (2026-10-14)

**Solicitação:** antes do cutover, mapear TODAS as matrículas em andamento de TODAS as empresas, preservar progresso individual existente (ex.: 80%), posição e provas comprovadas, sem forçar alunos a começar do zero. Repetir o levantamento até a janela de corte para incluir novos avanços.

**Implementado na PR #1389 (não publicado, nenhum write remoto):**

- `scripts/learning-factory/player3-active-enrollments-readonly.sql`: SELECT fixo de matrículas `EM_ANDAMENTO` e `NAO_INICIADO` multi-tenant, JOIN curso/ciclo/SCORM; coleta % de matrícula e ciclo, versão, slide, bookmark, CMI e timestamps; identificar divergências. Resultado é PRIVADO.
- `scripts/learning-factory/player3-seal-active-inventory.mjs`: lê resultado D1 via stdin, cifra todos os registros e estados SCORM em AES-256-GCM autenticado e gera apenas contagens gerais sem IDs/nome no log; arquivo local 0600, não sobrescreve.
- `.github/workflows/production-player3-enrollment-inventory-readonly.yml`: execução preparada, governada, **somente workflow_dispatch na main e somente SELECT**, com SHA exato, confirmação, oito gates, proteção ambiente production, token D1 readonly, chave privada de snapshot, artefato apenas cifrado com retenção provisória de 30 dias.
- `worker-airtrust/src/lib/lms-player3/continuity.ts`: regra individual de crosswalk do andamento, separa `EXACT_RESTORE` / `UNIT_CROSSWALK` / `ADMIN_EQUIVALENCE_REVIEW` / `NO_PROGRESS` / `SOURCE_CONFLICT`. Preserva porcentagem anterior sem fabricar nota, evento ou conclusão. `compareContinuityInventories` detecta avanço novo, matrícula nova/removida, troca de ciclo, regressão e instantâneo obsoleto.
- `docs/lms/PLAYER3_CONTINUIDADE_MATRICULAS.md`: contrato T0, delta, janela de corte, crédito administrativo de retomada, auditoria, segurança, recovery e reconciliação.

**Evidência local do HEAD de 14:08:** 25 testes core Worker (11 engine + 14 continuidade) PASS; Worker `tsc --noEmit` PASS; quatro testes AES-GCM PASS; dois testes SQLite do SELECT multi-tenant PASS; YAML do workflow válido. Nada disso equivale a consultar D1 de produção.

**Bloqueio real:** ainda **não existe contagem de alunos verificada em produção nem backup real da matrícula**. A PR permanece DRAFT e o workflow não está integrado na main, não pode ser disparado para dados reais. Requer token `CLOUDFLARE_D1_READONLY_API_TOKEN` e segredo `AIRTRUST_PLAYER3_SNAPSHOT_KEY_B64` no ambiente protegido, configuração a verificar; jamais imprimir, commitar ou solicitar essas credenciais em chat. Até o fluxo ser governado e rodar, não afirmar que mapeou todos os alunos.

**Próxima ação desta frente:** validar CI aplicável e estado de PR/main, integrar de forma isolada o fluxo de captura seguro quando autorizável pelo contrato (não mergear #1389 prematuramente), executar inventário T0 e conservar cópia cifrada em cofre corporativo além do prazo temporário do artefato; depois construir o serviço governado de equivalência por módulo/ciclo com auditoria e validar em staging. Antes de produção/cutover executar T1 final, confirmar delta e nunca sobrepor progressos novos. Continua pendente a integração Player3 aos assets HTML5 privados, módulos e certificação real.

## Continuidade — execução adicional e isolamento de tenant (2026-10-14)

**Correção de escopo prioritária:** o inventário individual de produção da primeira implantação pertence EXCLUSIVAMENTE à Costa do Sol (`empresa_id=6`). A solicitação de levantar "todos os alunos" significa todos os alunos e treinamentos desta empresa; outros clientes AirTrust só podem ser inventariados em fluxos segregados, previamente autorizados. A SQL `player3-active-enrollments-readonly.sql` agora restringe `m.empresa_id=6`; o selador recusa qualquer `empresa_id!=6` mesmo se o export do D1 vier misturado, e o workflow valida que o SELECT contém filtro exato. Não há acesso cross-tenant.

**Novo componente composto:** `worker-airtrust/src/lib/lms-player3/legacy-continuity-plan.ts` conecta o leitor das quatro famílias de `suspend_data` original (v2/v3, v4 compacto, Resíduos v4 e SGSO A10 sob verificação de hash) à política de mapeamento unitário `planContinuity`. Recebe exclusivamente evidência legada armazenada no servidor e manifesto de pacote original privado verificado. Quando há IDs de unidades persistidos, sugere retomada na próxima unidade equivalida sem produzir nota; quando há só bookmark ou incompatibilidade de edição, encaminha para crédito administrativo auditado. Uma matrícula em 80%, 99% ou 100% pode manter o progresso histórico e nunca receber conclusão automática.

**QA verificado nesta etapa:** 38/38 testes Worker Player3 (11 engine, 14 continuidade/deltas, 10 parser SCORM, 3 integração de plan), Worker TypeScript PASS; 2/2 testes SQLite de inventário restrito tenant6 PASS (tenant7 deliberadamente excluído); 5/5 testes de criptografia/negação cross-tenant PASS; YAML do workflow PASS. Testes locais, não comprovação de CI oficial.

**Bloqueios:** workflow somente leitura ainda DRAFT na PR #1389 e não integrado à main, logo **nenhum snapshot de matrículas reais foi extraído** e as quantidades de alunos continuam não verificadas. Credenciais de D1 readonly e chave protegida precisam ser validadas por execução governada. O workflow não é um aplicativo de migração; o Writer Player3 e a publicação de HTML5 privados ainda não foram integrados. `npm run lint`/auditoria de operações perigosas seguem com falhas em scripts antigos/pins, e a alteração nova de workflow já foi ajustada para não adicionar erro de operação remota fora do contrato. Oito gates oficiais não confirmados para o HEAD.

**Próxima ação precisa:** resolver integração/governança da consulta protegida no main, executar T0 tenant6 e guardar cofre cifrado corporativo; comparar T1 antes do cutover, resolver filas de equivalência e implementar aplicação governada de créditos de retomada. Continuar rebuild Player3 de endpoints, schema, grader e certificado real em staging; não remendar SCORM antigo.


## 2026-10-14 — isolamento do inventário e retomada a partir do SCORM original

**Execução na PR #1389:** `worker-airtrust/src/lib/lms-player3/continuity-from-scorm.ts` integra o decodificador do `suspend_data` legado com o plano de retomada por matrícula/ciclo/edição. Retorna posição proposta após crosswalk total e fonte pinada, sempre `review_required=true`; NUNCA credita automaticamente os slides reportados pelo SCORM nem a nota, conclusão ou certificado. **31 testes focados PASS**, Worker tsc PASS, HEAD de implementação `1a318d3b13c6be2f9a19a226810b371764ea1b8a` (SHA do documento pode avançar; verificar ao vivo).

**Descoberta impeditiva:** a `main` em `4ea8c1ab561672c0c8f3cae1adfe38d333bf2f14` já contém `worker-airtrust/schema-v2/changes/0550_usuarios_costa_do_sol_viewer_aluno.sql` e `0551_coordenacao_role_user_restore.sql`, enquanto esta PR ainda reserva `0550_lms_native_v1_evidence.sql` e marca planos Native 0551/0552. A numeração precisa ser reconstruída no Schema V2 vigente, com manifest/plan/hash/baseline revisados; arquivos da PR **NÃO aplicáveis** com 0550 atual. `git merge-tree --write-tree main PR` apontou três conflitos adicionais: `docs/database/schema-contracts/production-d1-baseline-v2.json`, `worker-airtrust/src/middleware/lms-completion-integrity.ts` e `worker-airtrust/src/routes/lms-matriculas.ts`. Não mergear a PR grande até resolver delta e gates, sem sobrescrever alterações de `main`.

**Inventário de alunos agora tem PR independente saudável:** [#1461](https://github.com/Airtrust-Org/airtrust/pull/1461), branch `feat/player3-enrollment-inventory-readonly-20261014`, partiu da main atual, apenas seis arquivos, execução manual SHA-pin e criptografia AES-256-GCM, SQL e selador **limitados à Costa do Sol (`empresa_id=6`)** por isolamento multi-tenant. Outras empresas exigem execução segregada e autorização própria. Testes locais 2 SQLite + 5 Node PASS, YAML validado, `git merge-tree` sem conflitos. CI Actions ainda em andamento na última consulta. **Não há inventário D1 de produção executado**. Após merge/approvals e secrets protegidos, disparar T0, conferir contagens, arquivar bytes cifrados com chave protegida; T1 antes de cutover. Ao integrar #1461, absorver o delta na #1389 para não duplicar arquivos.

**Próximo trabalho da #1389:** motor de estágio/conteúdo HTML5 original realmente conectado a Worker/R2 privado, Schema V2 com identificador único válido, plano administrativo por ciclo, teste real de matrícula e certificado. Não fazer migração enquanto PR #1389 tiver colisão 0550. Não declarar problema resolvido até E2E de aluno 42/42 e certificado.

## Atualização da continuidade — 2026-10-14, último lote

- A leitura do inventário individual da Costa do Sol foi delimitada por **`empresa_id=6`** no SELECT, com confirmação de escopo no workflow e bloqueio independente no selador AES-256-GCM. Não há autorização indiscriminada para coletar CMI/PII dos demais clientes AirTrust.
- A SQL lê, na empresa 6, `EM_ANDAMENTO` e `NAO_INICIADO` (inclui anomalias de dados legados); preserva `lms_matriculas`, ciclo SSOT, último slide, `suspend_data`, CMI e contagem de eventos xAPI/H5P. Todos dados sensíveis seriam cifrados imediatamente (sem impressão de linhas) e requerem cofre privado corporativo.
- Serviço puro `legacy-continuity-plan.ts` liga estados SCORM persistidos aos IDs de unidades da edição original validada, produzindo mapa de reentrada quando a evidência permite ou fila para equivalência administrativa quando só existe bookmark/porcentagem.
- Serviço puro `resume-credit.ts` modela **crédito administrativo de POSIÇÃO**, nunca aprovação/certificação: exige mesma empresa/curso/matrícula/ciclo/edição, SHA do snapshot, justificativa, aprovação autenticada da Gerência de Treinamento e segundo aprovador independente; estado `REVIEW_APPROVED_NOT_APPLIED`, nenhum D1 write.
- **Testes focados atuais:** 43 Worker Player3 PASS (11 engine + 14 continuity + 10 parser + 3 composite + 5 credit), Worker TypeScript PASS, 5 AES/inventário/cross-tenant PASS, 2 SQLite SQL restrito ao tenant PASS, workflow YAML PASS; Actions completos e lint da PR ainda não verdes/homologados.
- **Limite estrito:** nenhum snapshot de D1 produção foi capturado e nenhum aluno teve andamento convertido. O fluxo é novo e está numa PR DRAFT, não na main. Contagens de alunos permanecem **não verificadas**; será necessário SHA exato, oito gates, ambiente de produção protegido, token D1 readonly, chave AES segura e guarda corporativa de longo prazo antes do corte.
- **Próxima ação:** governar integração/execução do T0 Costa do Sol, manter T1 delta até cutover, completar aplicação auditada de equivalência/retomada por edição e novo motor Player3 com E2E real até qualificação/certificado. Não recomeçar investigação dos remendos SCORM.

## Contrato único de retomada após consolidação — 2026-10-14 14:43 BRT

**Evitar duplicação de motor/estado.** A PR teve duas implementações equivalentes de retomada e crédito administrativo: uma promovia `suspend_data` (relato originado no SCORM cliente) a `verified_completed_source_units`, o que não é prova independente. Foi eliminada essa implementação redundante e seus testes para manter **uma única cadeia**, com confiança explícita:

`legacy-resume-evidence.ts` → `continuity-from-scorm.ts` → `continuity.ts` → `admin-resume-credit.ts` (intenção revisada, **sem D1 writes**).

A nova cadeia valida origem/curso/empresa/versão/edição, propõe bookmark de retomada sujeito a revisão e exige dois aprovadores autorizados por RBAC do backend, snapshot SHA, timestamps atuais e ciclo, justificativa e unidade exata. **Nunca trata suspend_data como prova oficial de presença, aprovação ou certificado.** Foram removidos `legacy-continuity-plan.ts`, `resume-credit.ts` e seus testes (não tinham uso de produção; apenas seus próprios testes). Não reintroduzir esses nomes/implementações sem nova evidência de necessidade.

**Teste final do novo contrato unificado:** 49/49 testes focados Player3 PASS (engine 11, continuidade 14, parser 10, ligação SCORM 7, crédito administrativo 7). Worker `tsc --noEmit` PASS. HEAD do lote `fc96afa5e91349ed31733f7ef7db6283482a743d` (consultar HEAD vivo). Nenhum serviço de escrita/certificação/produção implementado por esse lote.

**Inventário separado:** PR [#1461](https://github.com/Airtrust-Org/airtrust/pull/1461) tem SQL de leitura restrita ao tenant6, cifra, verificação de cardinalidade `COUNT(*) OVER()` para detectar truncamento e workflow em CI; só após merge+secrets+aprovação poderá produzir contagem real. Sem snapshot efetivo nesta execução.

**Blocagem principal:** schema V2 `0550` da PR #1389 conflita com a `main` (0550 de usuários); conflito de merge adicional em baseline, LMS middleware e matrículas. Não executar DB writes/staging ou anunciar resolução antes de corrigir delta/schema e demonstrar matrícula real até certificado.


## 2026-10-14 — overlay de avaliação AirTrust sobre HTML5 preservado

**Objetivo pedagógico:** o treinamento HTML5 conserva integralmente seus HTML/CSS/JS/mídias/visual; as avaliações *oficiais* aparecem em janela do próprio AirTrust, no mesmo contexto de matrícula, sob critérios do servidor, sem depender de `LMSFinish`, contadores DOM ou `postMessage` originado pelo curso para conceder aprovação.

**Implementação na PR #1389:** 
- `src/react-app/pages/lms/player3/Player3AssessmentModal.tsx`: overlay acessível de exame/certificação por módulo; recebe **somente projeção de questões**, sem gabaritos e sem calcular nota. O `submitOfficialAttempt` deve estar conectado à rota Worker autenticada pelo chamador. Rejeita recibos com empresa, matrícula, ciclo, edição, unidade ou tentativa diferentes, respostas sem persistência e score inválido; não prossegue a unidade sem confirmação; bloqueia nova tentativa em resultado de rede ambíguo até reabrir sessão. **Não gera certificado ou status de conclusão.**
- `src/react-app/pages/lms/player3/Player3Html5Host.tsx`: preserva original em iframe de origem HTTPS distinta, exibe prova somente quando `pendingAssessment` é fornecido pelo orquestrador do Worker autorizado. Mensagens emitidas pelo iframe nunca abrem prova nem concluem treinamento; modo `reviewOnly` nunca mostra avaliação oficial. Um novo tenant/matrícula/ciclo/edição/stage remonta o formulário, impedindo reutilização de notas/seleções do contexto anterior.
- Testes `src/__tests__/Player3AssessmentModal.test.tsx` e `src/__tests__/Player3Html5Host.test.tsx`: **13/13 PASS**; build frontend **PASS** (warning chunks legados >600kb); Worker tsc **PASS** no HEAD `e65c34af674b6d0eb2b3bde7dbd5e2555a5fe014` após commits de integração visual. Esse lote não usa APIs externas nem escreve banco.

**Não homologado ainda:** esse overlay é **componente técnico não conectado à rota autenticada nem ao Worker com tentativas persisitidas por módulo, sem migrations/Schema V2 e sem E2E real**. `pendingAssessment` deve ser gerado pelo estado durável do backend, não por contador ou sinalização JS do HTML5. Faltam endpoint e escritor transacional versão-presa e prova/retomada Safari+Chromium+certificado. Não fazer deploy/cutover para learners com esse componente isolado.

**Coleta de alunos:** PR #1461 merged na main `daf143ba9aedcfa2b08aca6e888b35897a6fe0e9`. Segredos verificavelmente ausentes em environment production/repo: `CLOUDFLARE_D1_READONLY_API_TOKEN`, `AIRTRUST_PLAYER3_SNAPSHOT_KEY_B64`; a configuração só pode ser feita por ação autorizada no GitHub/provedor, não tentar contornar bloqueio da ferramenta. T0 ainda não capturado. A extração inicial foi restringida ao tenant6. Até secret/provisionamento, não existem contagens de aluno conferidas, nem estado real salvo.

**Próximo avanço estrutural:** integrar API Player3 de checkpoints/questões fixativas/provas por módulo com ledger idempotente no Worker + D1 schema governado de número único após 0551 de `main`, fixar versões R2 privadas e concluir transação canônica sem heurísticas; depois comparar original visual e E2E da matrícula 911 do Doutrinamento. PR #1389 ainda draft com conflitos de merge e esquema V2, não mergear prematuramente.


## Atualização pós-integração do inventário e crosswalk dos 22 originais — 2026-10-14

1. **PR #1461 foi MERGEADA** pela rota normal, sem bypass, na `main` em `daf143ba9aedcfa2b08aca6e888b35897a6fe0e9`. Oito gates Actions obrigatórios **PASS** no SHA da PR `18ac11893da914d4ee08c26c21fd0596b1a3d38a`. O workflow read-only está na main para coletar matrículas do **tenant 6 somente**, com verificação de export integral e snapshot AES-256-GCM.
2. **Inventário de produção continua NÃO executado.** Verificação de secrets do ambiente `production` encontrou apenas **1 de 3 nomes exigidos** e nenhum na coleção de secrets do repositório. Não imprimir/solicitar valores; somente nomes das variáveis. Sem `CLOUDFLARE_D1_READONLY_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `AIRTRUST_PLAYER3_SNAPSHOT_KEY_B64` disponíveis conforme contrato, não despachar Action para execução inútil nem usar token amplo como substituto. Ambiente `production` protegido. Necessário provisionamento governado antes de T0, cofre criptográfico de longo prazo, T1 no corte; escopo de outros tenants depende de autorização segregada.
3. **PR #1389 permanece DRAFT/não mergeável.** A limpeza eliminou módulos duplicados `legacy-continuity-plan` e `resume-credit`, mantendo como contrato de retomada `continuity.ts`, `legacy-resume-evidence.ts`, `continuity-from-scorm.ts` e `admin-resume-credit.ts`. O crédito é **navegação apenas**, requer reconhecimento de edição, dois revisores autorizados e prova documental; nunca atribuir nota/conclusão/certificado. 49 testes Worker Player3 PASS e Worker `tsc --noEmit` PASS na versão atual.
4. **Cruzamento REAL dos 22 pacotes originais recebidos** (`SMS(5).zip` 9 e `Segurança Operacional(2).zip` 13): 22 variantes SCORM, **21 cursos distintos** (duas edições de SGSO), **674 unidades/quadros**, **63 grupos de avaliação**. Roteiro de avaliação apenas candidato: 12 pacotes com gates por módulo declarados, 9 com avaliação terminal única, 1 **LOSA** com múltiplas avaliações sem contrato inequívoco de finalização (revisão pedagógica obrigatória). Nenhum pacote automaticamente aprovado para aluno.
5. **Código novo:** `scripts/learning-factory/build_player3_source_crosswalk.py` gera mapa de IDs e tipos a partir de `course_data.js` ou `course-model.js`, com SHA do ZIP e referência modular sem exportar questões/opções/gabaritos. Inclui suporte SGSO `window.AIRTRUST_COURSE_MODEL=...` sem espaços. Seis testes Python PASS. `src/__tests__/Player3Html5Host.test.tsx`: seis testes PASS. Todos os original HTML5 e mídias continuam preservados.
6. **Artefato de revisão gerado nesta conversa:** `AIRTRUST_PLAYER3_CROSSWALK_22_ORIGINAIS_REVISAO.json` (sandbox da conversa, SHA256 `20fc97a21b7a3b9289e7a9849fc50491a2ee24377f6ed434ebdea3293b6bfd51`). Apenas metadados e IDs de unidades; zero respostas/gabaritos. O arquivo não é autoritativo como publicação: o script versionado no GitHub pode gerar novamente quando originais estiverem disponíveis no workspace privado.
7. **Próxima dependência fundamental:** integrar conteúdo HTML5 privado em origem isolada e protegido por tenant+matrícula+ciclo+edição; retirar lógica avaliativa certificadora do JavaScript servido ao aluno, suportar quesitos formativos e avaliações modulares/finais formalmente versionadas no Worker; writer transacional Schema V2, retomada auditada e certificação real. O arquivo `0550_lms_native_v1_evidence.sql` da PR tem colisão numérica com 0550+0551 já integrados na `main`. Corrigir pelo plano Schema V2 atualizado (manifest/hash/baseline/recovery), sem SQL remoto improvisado.
8. **SCORM externos:** continuar suportando adaptador legado até fluxo externo novo estar comprovadamente homologado; não migrar/remover cursos externos silenciosamente. O player novo não deve depender de contador DOM, janela fechada ou `postMessage` autoafirmado para concluir.
**Estado compacto:** objetivo=Player3 completo+continuidade; main=`daf143ba9aedcfa2b08aca6e888b35897a6fe0e9` (validar ao vivo); PR=#1389 DRAFT, #1461 merged; HEAD=#1389 verificar ao vivo; dados reais ainda não consultados; testes=49 Player3 Worker+6 host+6 crosswalk PASS, typecheck Worker PASS; blockers=secrets inventário, Schema V2 0550, API/R2 segura, test browser/certificado; não autorizado=produção sem SHA, D1/R2 writes não governados, reduzir critérios de conclusão.


## Reconciliacao da branch com main daf143b — 2026-10-14

**Local worktree isolado** `/tmp/airtrust-player3-main-sync-20261014`; integração planejada na PR #1389 (DRAFT). Base exata `main=daf143ba9aedcfa2b08aca6e888b35897a6fe0e9`, inclui PR #1461 (inventário cifrado tenant6). Não publicar nova edição ou executar D1 remoto a partir desta etapa.

- Conflitos resolvidos: aceitar `main` como autoridade do inventário já integrado e do baseline de produção; preservar tanto os guards de matrícula cancelada/ciclo novo da `main` quanto a recusa do caminho SCORM legado para Native no middleware e rota. Não reintroduzir funções antigas de conclusão por heurística.
- Schema V2 rebase governado: `0550` e `0551` da `main` permanecem intactos. Evidência Native foi **renumerada para candidato `0552_lms_native_v1_evidence.sql`**; manifest `lms-native-v1-evidence-0552.json`, plano revisado `lms-native-v1-evidence-0552.md`, tests atualizados; planos futuros apenas `.REVIEW-ONLY.sql.txt` identificados como 0553 (catalog) e 0554 (terminal), sem autorização de execução.
- SQL SHA256 `2eef2cf2732115efbf05fd4ad57b163196cc787c83c8dc10312cfc957e1daf95`; plan SHA256 `bb70e535da0bdbf3ea2c7e22651bfa3eeda59ed70c8cdaa47ae8fee11272802d`; digest global schema `ce7c0dde71da22c053a1e4a82f047e0fadfbc8135a404bcbeea5e8d6a9d15055`, já conferido pelo `check-contract-staleness` local. `governance_state=REMOTE_APPLY_PENDING` significa versionado, **não aplicado**.
- Testes: Python Schema Native evidência 13 PASS, marker 2 PASS, pin atômico 19 PASS, intent terminal 9 PASS (**43**); Worker 64 testes focados PASS e `tsc --noEmit` PASS; frontend `npm run build` PASS (warning apenas chunk grande).
- `npm run lint` local FAIL por scripts históricos de D1 remoto (p. ex. `scripts/apply-migration-production.sh`, `scripts/production/apply-simuladores-matriz-remote-migration.sh`, `scripts/run-0389-staging-schema-apply.sh`). **Não foi feito bypass nem alterada regra/ratchet**. GitHub Actions do novo HEAD deve ser consultado após push, sem alegar CI verde.
- **Blocker final do produto** permanece: host HTML5 isolado e gabaritos privados sem exportação no JS público; Writer Schema V2 + API autenticação/persistência por módulo; dados de T0 produção ainda não coletados por secrets ausentes; staging E2E matrícula 42/42 + histórico/qualificação/certificado + Safari/Chromium; produção só autorização exata.
