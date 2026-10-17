# Player 3 — contrato de isolamento Native/SCORM e homologação real

**Incidente:** #1325. **Frente de integração:** PR #1389 (draft). **Escopo:** Worker, player/asset routes, evidências, avaliações, conclusão canônica, certificado e Compliance. **Estado:** proteção de código validada localmente; staging end-to-end NÃO homologado.

## Invariante que autoriza o tipo efetivo

`lms_cursos.tipo_conteudo='scorm'` no D1 NÃO é prova de que o curso é SCORM: no staging, a edição Native pode estar identificada pelo side-table governado `lms_native_catalog_activation` para um curso físico SCORM vazio. O predicado único `isNativeForLegacyLmsPath(env,empresaId,cursoId,tipoConteudo)` é a decisão de tipo efetivo antes de qualquer operação SCORM/legada. Um curso físico `native` sempre bloqueia legado. Quando o marcador staging está habilitado para o tenant, falha de leitura do D1 precisa impedir a operação legada (HTTP 503), nunca assumir SCORM. Nenhum tenant selvagem; produção não interpreta o marcador experimental.

O frontend recebe a projeção de catálogo/matrícula como `tipo_conteudo:'native'` quando a ativação foi comprovada. Essa projeção NÃO autoriza matrícula, armazenamento, nota ou certificado e nunca é a autoridade do backend.

## Matriz de fronteiras de segurança

| Superfície | Contrato do curso Native efetivo | Evidência / mecanismo |
|---|---|---|
| Catálogo e matrícula por leitura | Exibir como Native; não oferecer URL SCORM por interpretação de campo físico | `projectNativeCatalogCourses/Enrollments` |
| Criação de matrícula comum/lote | Rejeitar matrícula via fluxo legado, exigir provisionamento Native por edição/ciclo | `lms-matriculas.ts` e middleware de integridade |
| SCORM launch, sessão de asset, assets por curso, preview e upload/edição de pacote SCORM | Rejeitar antes de ler ou servir bytes R2; não emitir sessão de asset SCORM para Native | `lms-scorm-asset-eligibility.ts`, `lms-assets.ts`, `lms-native-course-write-guard.ts` |
| Edição/exclusão do catálogo legado | Impedir edição, troca de pacote SCORM, ativação de versão e exclusão de curso Native | guarda em `lms-cursos.ts`, antes dos routers de CRUD/upload |
| Runtime SCORM, xAPI, finalização manual, status/progresso PATCH | Não converter localização, percentual, success_status, nota do navegador ou intenção administrativa em conclusão Native | `lms-completion-integrity.ts`, `lms-matriculas.ts`, `lms-progresso.ts` |
| Recuperação administrativa de progresso SCORM — dry-run / apply / rollback | Rejeitar todos os três para Native efetivo antes de leitura de audit record para rollback ou qualquer escrita | `lms-matriculas.ts`, código `NATIVE_SCORM_RECOVERY_DENIED` |
| Rematrícula / reversão da conclusão pelo caminho legado | Rejeitar Native efetivo antes de alterar ciclos, progressos, qualificações ou invalidar certificado | `lms-completion-integrity.ts`, código `NATIVE_LEGACY_LIFECYCLE_DENIED` |
| Prova, nota e certificado Native | Avaliação oficial exclusivamente no Worker com banco de respostas privado; `completeLmsMatricula` com comprovante transacional, edição/ciclo/tenant e recibo persistidos. PDF é pós-transação, não sinônimo de status concluído | `lms-native-completion*.ts`, `lms-player3-*`, `lms-completion.ts` |
| Compliance / qualificação | Somente status canônico e vínculo real do histórico; nota SCORM falsa, 100% visual, ou PDF ainda não emitido não satisfazem prova de Compliance | Guardas de conclusão + serviço canônico; validação de leitura Compliance continua exigida no staging real |

**Limite conhecido:** os filtros HTTP evitam writes de recuperação legada; não substituem provas de concorrência/DDL, Trigger de Schema V2 e teste de integração D1/R2. Este documento não afirma que os 22 cursos estão homologados.

## QA de regressão deste lote

- Guardas Native físicos e ativados no staging: 15 testes de middleware, mais teste estático dos 3 endpoints de recuperação; 14 de assets e 5 da arquitetura: **34/34 PASS**.
- Suítes afetadas de matrícula/terminal, admin mutation guard e integridade: **74/74 PASS**.
- `tsc --noEmit` do Worker: **PASS**; `lms-matriculas.ts` permanece no ratchet versionado (3056 linhas), sem subir baseline.
- Esses números pertencem ao código candidato testado em worktree isolado; os oito gates oficiais devem ser avaliados pelo GitHub Actions do SHA publicado. **Não atribuir gates do SHA pai a um SHA novo.**

## Contrato de aceitação operacional obrigatório (antes de tirar DRAFT)

1. **Snapshot staging governado:** registrar SHA candidato e main aplicável, oito gates nesse SHA, Worker/Pages e manifesto de release, controle de concorrência do ambiente, configurações per-tenant e Schema V2 realmente aplicado, com plan/hash/baseline/recovery/ledger. Planos 0553/0554 apenas versionados ou review-only NÃO contam como aplicados. Proibido D1 SQL remoto improvisado.
2. **Conteúdo:** original RC8.1 conferido contra ZIP SHA/CRC, arquivo privado entregue em origem HTTPS isolada, runtime antigo não emitindo gabaritos/SCORM status, crosswalk das 42 unidades, SHA de edição, banco e política oficial revisada/assinada, hash real dos assets hospedados e aprovação pedagógica. A fábrica converteu 22 originais em modo `REVIEW_ONLY`; nenhum deve ser publicado sem revisão.
3. **Matrículas sintéticas auditáveis**, sem manipular matrícula de empregado real: curso RC8.1 novo, uma matrícula histórica de 80% reconstruída com evidências legítimas e um SCORM externo genuíno. Tenant e funcionário autorizados; snapshot T0 somente leitura e T1 pós-ação medido contra o mesmo vínculo/edição/ciclo.
4. **Browser E2E (6 casos reais):** 3 jornadas em Chromium e WebKit pelo harness de `e2e/player3`. Caso novo: 42/42, sair/reentrar na página 22, uma prova oficial reprovada+retentativa, perda de internet, ausência de crédito na mera abertura/ACK, conclusão única, histórico+qualificação únicos e PDF íntegro reaberto. Caso 80%: só navegação válida, sem nota/certificado inventados. Caso SCORM 1.2 externo: regressão do adaptador verificada.
5. **Negativos obrigatórios:** tentativa de consumir assets SCORM para curso Native, commit SCORM/xAPI, atualização manual/administrativa, recuperação de progresso e reversão/rematrícula legadas retornam 409 sem writes; tenant errado retorna 403/404; marcador D1 indisponível falha fechado; fim do curso sem prova não gera Compliance nem certificado.
6. **Pós-condições:** verificar DB read-only, `lms_matriculas`, `lms_matricula_ciclos`, tentativas oficiais, vínculos, `qualificacoes_historico` e `documentos`. Verificar que o certificado é um documento persistido e renderizável, que o Compliance lê **o mesmo** histórico real, e que não há duplicidade nem evidência cross-tenant. Não usar somente `certificate_state:'PENDING'` como evidência de emissão.

## Bloqueios atuais e pedido à coordenação

- Aprovação pedagógica das avaliações por curso/edição; decisão sobre 90 cenários e exceção LOSA. Os 22 originais continuam `REVIEW_ONLY`.
- R2/origem isolada com hash real, política/edição aprovada sem gabarito no frontend; provisionamento controlado de 3 matrículas sintéticas com credenciais da QA, sem PII no repositório.
- Governança Schema V2 e publicação de staging do candidato autorizada e registrada, com validação real da Frente D. Não inferir staging pela existência de workflow verde de outro SHA.
- Registrar evidência de Compliance/certificado na mesma execução real.

**Não autorizado nesta PR:** habilitar Native, migrar schema, semear, escrever D1/R2 de staging/produção, emitir certificado, fazer merge/deploy ou usar produção como ambiente de testes. Bloqueios exigem coordenação; gates verdes não resolvem os pré-requisitos de conteúdo e ambiente.

## 2026-10-17 — Correção na leitura e reconciliação de Compliance

A leitura de Compliance passou a exigir prova de qualificação para **matrículas Native concluídas**. O filtro `nativeLmsComplianceEvidencePredicate` impede que `lms_matriculas.status='CONCLUIDO'` seja reconhecido como evidência Native suficiente se não existir registro `qualificacoes_historico` vinculado à matrícula, com **mesma empresa, mesmo funcionário e tipo de qualificação, status CONCLUIDA, não excluído**. O filtro preserva o contrato histórico de cursos SCORM não ativados e mantém Native em andamento como não concluído.

O side-table `lms_native_catalog_activation` é consultado com presença de schema *live*, por `hasSchemaTable(db, ..., { fresh: true })`, pois a ausência cacheada antes de uma migration pode converter indevidamente um curso Native efetivo em SCORM. O probe continua read-only, com introspecção concentrada no utilitário comum; erro no probe/lookup impede o snapshot (fail-closed), sem ampliar o ratchet de introspecção.

O serviço de sincronização automática de matrículas de regras de Compliance (`training-compliance-rule-enrollment.ts`, inclusive uso via FDM72) recusa curso físico Native e curso SCORM com ativação Native antes de chamar `resetMatriculaForNewCycle` ou criar matrícula. Retorna `LMS_COURSE_MAPPING_UNAVAILABLE` para curso inapropriado e `AUTO_ENROLLMENT_DEFERRED` para falha operacional; **nunca faz fallback silencioso para SCORM**. A migração para provisionamento Native permanece governada e não é feita automaticamente.

**QA deste avanço:** 24/24 testes focados aprovados em quatro suites (10 com SQL/SQLite real, incluindo marker adicionado na vida do Worker e auto-enrollment com zero writes, 5 do comportamento de enrollment, 4 FDM72 e 5 architecture guard); Worker TypeScript PASS. Nenhuma alteração em D1/R2 remoto, nenhum schema aplicado ou deploy. **Ainda falta** demonstrar o mesmo histórico e status Compliance a partir de uma conclusão real em staging com matrículas sintéticas e PDF reaberto.



## 17/10/2026 — Divergência `native_pilot_format` / `tipo_conteudo` e gate T0

**Identidade canônica observada:** o campo `native_pilot_format` não é uma coluna Schema V2 versionada nem constitui uma ativação autorizada do catálogo. No D1 staging, a ativação proposta usa uma linha escopada `lms_native_catalog_activation(empresa_id,curso_id)`, enquanto `lms_cursos.tipo_conteudo` pode continuar `scorm` por causa do CHECK legado. Payload JSON/form-data de create/edit/upload que declare `native_pilot_format` ou `nativePilotFormat` passa a ser **rejeitado pelo schema Zod**, em vez de silenciosamente descartado para criar/manter um SCORM enganoso. A ativação é somente pelo fluxo governado, não por campo do cliente.

**Separação entre visibilidade e segurança:** `NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS` continua controlando a projeção Native e o Native staging-only. O bloqueio das rotas **legadas** agora verifica, em staging, a existência real do marcador mesmo com essa allowlist desligada. Se a tabela não existe e a flag está desligada, preserva o SCORM normal; se existe registro para empresa+curso, bloqueia SCORM; se a consulta ao D1 falha, recusa em vez de permitir downgrade. A presença da tabela é lida via `hasSchemaTable(...,{fresh:true})` para evitar cache negativo antigo após migration. Não abre capacidades Native em produção, não ativa o player, não cria registros e não altera as regras de publicação do catálogo.

**Cobertura de proteção:** a decisão compartilhada `isNativeForLegacyLmsPath` é consumida por guards de launch/assets/edição e upload SCORM, recuperação de progresso, xAPI, conclusão administrativa, rematrícula/reversão e validação de estado da matrícula; as verificações adicionais de qualificação e Compliance do lote anterior permanecem. Novos testes cobrem marker presente/ausente e flag desabilitada, escrita administrativa bloqueada e payload `native_pilot_format` não autorizado. Ainda faltam testes reais de browser e do ambiente governado; nenhum teste unitário comprova um pacote original homologado.

**Schema V2 em SHA de código de 17/10/2026:** verificação SHA-256 dos bytes extraídos do GitHub confirmou correspondência exata do SQL e plano dos manifests `lms-native-v1-evidence-0553.json` e `lms-player3-module-attempts-0554.json`, com baseline `production-d1-baseline-v2-20260714`. `0555` (catalog activation) e `0556` (intent canônico) são apenas arquivos REVIEW-ONLY, não migrations aplicáveis. Hash íntegro não significa tabela aplicada; plano de dependências, baseline real, ledger, recovery e autorização devem ser conferidos no ambiente antes de qualquer ação.

**Gate humano T0 — issue #1467:** o último registro de metadados de 17/10 aponta `CLOUDFLARE_D1_READONLY_API_TOKEN` e `AIRTRUST_PLAYER3_SNAPSHOT_KEY_B64` ausentes no environment `production`, além de ausência de required reviewer. A issue está aberta; sem esses três pré-requisitos não executar o inventário T0 de tenant 6, mesmo como read-only. A Frente 1 pode trabalhar em código, testes sintéticos e manifests sem acesso a dados reais; não pode atestar migração de alunos, equivalência 80% ou certificado/Compliance de aluno real.

**Limitação operacional deste lote:** o GitHub conectado esteve acessível para leitura, commits e checks, mas o Desktop Commander/Mac de execução de testes apareceu offline; não declarar Vitest ou typecheck local realizados para este novo SHA. Os oito gates confirmados pertencem ao SHA anterior `29c7f9dd019ce091ee19f22101c3075d42a36635` e **não devem ser herdados** após alterações. Um novo HEAD exige os próprios checks oficiais. PR permanece draft, sem merge/deploy/migration/R2/D1 remoto e sem intervenção no produtor de certificados da Frente 2.
