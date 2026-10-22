# Player 3 — catálogo sintético QA: publicação governada em duas fases

**Revisão do candidato final-only (22/10/2026):** o curso sintético V1 `327` permanece com edição e matrículas imutáveis; não reutilizar/republicar esse curso. O novo fixture tem quatro lições e prova final na quinta unidade. O bootstrap da QA V2 usa categoria/tipo/título/version_tag de curso distintos, no mesmo tenant sintético `999006`, com novo ID físico obtido somente após execução governada. O seletor Native exige **uma única** edição `PUBLISHED` por curso. Provisionar os novos vínculos para o novo curso pela API protegida e jamais alterar a edição original. O executor confiável da `main` também precisa ter os hashes imutáveis e preflight V2 aprovados antes de qualquer dispatch; o código desta PR, sozinho, não concede permissão de D1/R2.

**Status: REVIEW ONLY.** Este roteiro não autoriza gravação D1/R2, Pages,
staging deploy, matrícula ou alteração dos 22 EADs originais. A PR #1389
permanece DRAFT enquanto seis jornadas reais e PDFs não forem comprovados.

## Escopo e controles

- D1: airtrust-db-staging-baseline-20260701, UUID bf9963f4-eb12-439b-a830-20bbf577ac22.
- Tenant: qa_examiner_training, empresa_id 999006. NUNCA cliente real.
- Schemas V2 0558, 0559, 0561 e 0562 exigidos e fisicamente verificados;
  0561/0562 já foram aplicados e não devem ser reaplicados.
- Lock único: airtrust-staging-mutations-and-scorm-qa, coordenado em #776.
  Não concorrer com Pilot, FRMS ou SCORM QA.
- Bootstrap reserva categoria QA-PLAYER3-NATIVE-CAT, tipo
  QA-PLAYER3-NATIVE-TYPE e curso QA-PLAYER3-NATIVE-ONLY-SYNTHETIC, versão
  qa-player3-native-synthetic-v1. Categoria tem lms_integrada=1.
- O formato físico do curso é 'scorm', mas sem ZIP SCORM ou arquivo de
  lançamento. O marker imutável Schema V2 0561 o vincula a Native; jamais
  remover marker, mudar formato ou retarget do catálogo legado.
- Edição R2: lms/native/999006/<courseId>/<artifactSha256>/ dentro do bucket
  privado airtrust-storage-staging. HTML5 deve residir em projeto Pages QA
  distinto da aplicação e da API. Nunca publicar gabarito/banco/crosswalk.

## Fase A — qualificação integrada, curso e marker

1. Conferir oito gates do SHA candidato, proteção, delta de main, aprovação
   F0, lock, environment protegido, instantâneo D1 Time Travel, backup/R2 e
   recovery. Executar inventário de staging com o script somente-leitura
   player3-qa-readonly-inventory.mjs --inspect. Esperado antes de provisionar:
   zero categoria/tipo/curso Native QA, marker, edição, política e vínculo;
   ledger 0561/0562 = 1 cada.
2. Preparar offline o candidato técnico inteiramente sintético.
3. Gerar SQL REVIEW ONLY com:
   python3 scripts/staging/build_player3_qa_catalog_sql_plan.py
   --phase bootstrap --candidate <PRIVATE_CANDIDATE>
   --release-sha <SHA_PR_EXATO> --out <PRIVATE_PATH>/bootstrap.sql
4. O gerador valida manifest/ZIP/bytes/hashes e gera script SQL de sentinelas,
   insert da categoria/tipo/curso e marker com pós-condições. Não executa SQL.
   Submeter hash SHA-256 do SQL e operações previstas a F0; aplicar somente
   via executor confiável de staging na main, com recovery e autorização
   específica. Não usar D1 remoto manual como substituto.
5. Ler e comprovar o courseId físico criado no D1 antes de preparar a edição.
   NUNCA inventar o ID nem usar o ID de validação offline.

## Fase B — R2 privado, HTML5 QA, edição e política

1. Com curso físico existente, executar o builder de plano de publicação
   passando tenant 999006, courseId real, SHA e origem Pages QA HTTPS real.
   O plano lista SHA/keys, não os bytes secretos.
2. Testar player3-qa-governed-publisher.py sem --apply. A variante --apply
   só pode executar em trusted GitHub Actions main/environment staging
   protegido com SHA autorizado, confirmação, lock, preflight do curso físico,
   recovery e Cloudflare target fixo. Requer entrypoint governado existente
   e auditado; a PR DRAFT não pode sozinha disponibilizar esse executor.
3. Conferir SHA do readback privado R2; recusar sobrescrita de objeto existente
   com outro hash. Conferir ainda GET HTTPS de index.html e app.js, hashes e
   origem isolada: um deploy Pages SUCCESS sozinho não basta.
4. Gerar SQL da edição, sem execução remota:
   python3 scripts/staging/build_player3_qa_catalog_sql_plan.py
   --phase edition --candidate <PRIVATE_CANDIDATE>
   --publication-plan <PRIVATE_PLAN_JSON> --approver-user-id <REAL_QA_ADMIN_ID>
   --out <PRIVATE_PATH>/edition.sql
5. Validar identidade do aprovador (admin ativo vinculado ao tenant 999006);
   publicar edição imutável DRAFT -> REVIEWED -> PUBLISHED, criar política
   privada DRAFT -> APPROVED com hashes de source/bank/policy aprovados.
   O SQL contém checagens fail-closed, nunca cria matrícula ou conclusão.
   Guard de ambiente/recovery aplica-se à execução D1 externa.

## Fase C — QA autenticada

- Publicar Worker e Pages pelo workflow oficial e validar provenance/versão.
- Habilitar somente no tenant 999006 as oito allowlists Native/Player3
  verificadas no preflight; jamais habilitar para clientes ou produção.
- Dois usuários estudantes distintos, cada qual com funcionário QA e token
  bearer/storageState próprios. Validar tenant e RBAC e negar cross-tenant.
- Criar seis matrículas/ciclos exclusivos via endpoint protegido Worker
  POST /api/lms/native/cursos/:cursoId/matricular; não usar INSERT SQL.
  Provisionar a fixture de retomada 80% e SCORM 1.2 externo QA separado.
- Executar seis testes Playwright Chromium/WebKit de verdade no staging.
  Registrar IDs distintos, timestamps, SHA, evidência de progresso/retomada,
  tentativas e score do backend, histórico, qualificação, certificado PDF
  legível e isolation. Não aceitar skip, mock ou teste apenas compilado.

## STOP, recovery e cleanup

Schema V2 impede DELETE/UPDATE de marker/edição/política/vínculo e evidências.
Não executar limpeza destrutiva improvisada, não fazer reset de dados QA
preexistentes. Se aplicação for parcial, reter recibos e solicitar plano de
compensação/aposentadoria do conteúdo e eventual Time Travel governado.
D1 compartilhado não deve retroceder sem autorização de impacto nas outras
frentes. Reportar retention/cleanup executado fisicamente, não presumido.

**Bloqueios remanescentes até evidência contrária:** lock/autorização F0,
entrypoint trusted-main para SQL de provisionamento, projeto Pages QA separado,
curso e aprovação reais, duas identidades, habilitação staging, seis
matrículas e jornadas, histórico/PDF. Sem esses comprovantes, PR fica DRAFT
e nenhuma mudança em produção está autorizada.
