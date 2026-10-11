# AirTrust Native V1 — schema/readiness e sequência de integração (SEM apply)

**Estado:** especificação e mudança Schema V2 `lms-native-v1-evidence-0549` versionadas na PR #1389 / incidente #1325, com testes SQLite sintéticos. **Nenhuma migration aplicada em staging/produção.**
**Não é** autorização de staging ou produção; o manifesto versionado não aplica SQL por si só.
**Fonte canônica:** GitHub/main + D1 schema efetivo de cada ambiente (verificar ao vivo antes de preparar o SQL).
**Risco:** alto — LMS multi-tenant com matrículas e certificados regulamentares.

## Fato técnico que impede publicação imediata

O catálogo atual registra `lms_cursos.tipo_conteudo` com uma restrição SQLite `CHECK` para formatos existentes. A migration histórica `0341_lms_pdf_pptx.sql` precisou reconstruir a tabela `lms_cursos` para acrescentar PDF/PPTX. Não existe alteração segura `ALTER TABLE ... DROP CHECK` no SQLite.

O esquema **real** tem colunas, índices, gatilhos e FKs posteriores a 0341. Portanto é proibido copiar a criação de tabela de 0341 para uma migration nova. Primeiro identificar o SQL efetivo do ambiente; depois planejar alteração conservadora, assinada e testada. Os cursos históricos e seus IDs/FKs devem permanecer intocados.

## Modelo persistido pretendido

As quatro tabelas abaixo estão definidas no SQL Schema V2 **0549**, mas NÃO foram aplicadas em runtime por esta PR:

1. `lms_native_edicoes`: `empresa_id`, `curso_id`, `artifact_sha256` (64 hex), `package_version`, `r2_prefix`, status revisado/ativo/revogado, hash de conteúdo e revisão QA. Unicidade por tenant/curso/hash. Versão imutável; não reescrever R2 ativo.
2. `lms_native_matricula_edicoes`: vínculo entre `empresa_id`, `matricula_id`, `ciclo_id` e `edicao_id`. Unicidade de vínculo por ciclo; nunca atualizar o conteúdo de quem começou uma edição sem migração explícita comprovada.
3. `lms_native_eventos`: ledger imutável vinculado por `vinculo_id` à edição e à matrícula/ciclo/empresa, com `event_id`, `sequencia`, `unidade_id`, tempo no servidor e hash de payload; o backend valida o resultado. UNIQUE da chave do evento e da sequência no escopo. Condicional atômica (não fazer leitura+gravação sem proteção contra concorrência).
4. `lms_native_tentativas`: resultado de correção **no Worker**, vinculado por `vinculo_id` ao tenant/matrícula/ciclo/edição, com política, tentativa e conteúdo imutável. Não confiar em score/status enviados pelo navegador. Proteger questões e gabaritos no backend; não incluir respostas particulares em logs.

O pacote guarda dois digests diferentes: `nativeCandidateSha256` identifica a versão da conversão; `artifactBytesSha256` é o SHA-256 dos **bytes exatos** do JSON privado publicado. A coluna `lms_native_edicoes.artifact_sha256` e o prefixo `lms/native/{empresa_id}/{curso_id}/{artifact_sha256}/` usam o segundo. Não resolver versões por listagem R2 ou por `latest`. Os índices, FKs e unicidades devem ser confrontados com o schema contract real antes da aplicação.

## API/serviço em desenvolvimento

- `GET /api/lms/native/matriculas/:matriculaId/admissao`: **já implementada como leitura**, autenticada e tenant-scoped; responde com modo de aprendizagem/revisão e `native_package=NOT_YET_ENABLED`. Como `native` não está habilitado no catálogo, não é rota de lançamento de conteúdo e não prova que o novo player está operativo.
- `GET /api/lms/native/matriculas/:matriculaId/curso`: **preview de leitura staging-only**, autorizado apenas com `NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS` em ambiente de staging. Usa matrícula/ciclo/edição escopados, verifica SHA-256 dos bytes exatos do JSON no R2 e retorna apenas a projeção sem gabarito; produz `completion_supported=false`. A flag ausente/vazia ou ambiente de produção responde 404, sem consultar D1/R2. **Ainda depende de catálogo `native` e Schema V2 aplicados; a rota não está operacional em runtime.**
- `validateNativeCheckpoint`: valida hash da edição, sequência monotônica, evento idempotente e unidade permitida, a partir de ledger pré-carregado e validado. **Não grava nada**.
- `assessNativeCompletionReadiness`: verifica evidências efetivamente persistidas e tentativa corrigida no servidor. **Não conclui matrícula nem gera qualificações**.
- Para a fase de escrita: APIs de launch/sessão, gravação atômica por evento, avaliação e encaminhamento à **única transação canônica de LMS** já existente. Certificado/Compliance/Qualificações devem derivar de `lms_matriculas` e `qualificacoes_historico` via regras oficiais, nunca de tabela paralela.
- Erro administrativo após prova aprovada não apaga evidência: manter estado pendente e mecanismo idempotente de reconciliação.

## Preflight Schema V2 obrigatório

1. Identificar `main` e SHA de release; inspecionar `sqlite_master.sql`, `PRAGMA table_info`, `PRAGMA index_list`, `PRAGMA foreign_key_list`, gatilhos e contagem tenant por tenant de `lms_cursos` / `lms_matriculas` em staging e produção, somente leitura e com identidades de banco verificadas.
2. Conferir `CHECK` atual para `tipo_conteudo` e todas as colunas adicionadas desde 0341. Não assumir que tabelas de dois ambientes sejam idênticas.
3. Confeccionar mudança Schema V2 completa: SQL determinístico, plan/rollback/recovery, hashes de SQL e plano, manifest imutável, checks de staleness, testes de SQLite local com dados legados e FKs/índices/triggers conferidos.
4. Testar explicitamente nenhuma matrícula, status, score, data de conclusão, qualificação ou certificado alterado; nenhuma inferência de conclusão por porcentagem. Confirmar índices e constraints cross-tenant.
5. Usar workflow governado com autorização específica, recovery point e pós-condições. Nunca rodar `wrangler d1 execute --remote` avulso.
6. Compatibilizar versões do Worker/Pages com esquema de staging primeiro; evitar deploy de Worker que exija tabelas inexistentes no ambiente de destino.

## Prévia técnica de mídia (staging, ainda não publicada)

- `GET /api/lms/native/matriculas/:matriculaId/assets/:assetId` usa o mesmo `auth()`, a allowlist exata do tenant e a restrição **staging-only** da prévia de curso. A entrada externa é somente o asset ID, nunca o caminho R2.
- O Worker resolve a matrícula do próprio usuário e a edição imutável, valida o JSON privado por SHA-256, encontra o asset citado por unidade e compara o SHA-256 dos bytes da mídia. Proíbe caminhos improvisados, arquivos sem referência, tamanho inválido e acesso cruzado.
- Limite inicial intencional: **12 MiB por mídia**, com respostas `no-store`, `nosniff`, mesmo domínio e um único intervalo HTTP `Range` para vídeos curtos. Acima disso o transporte não é liberado: vídeos grandes/streaming dependerão de solução revisada de integridade e faixas.
- O componente `NativeStagingCoursePreview` usa `fetchWithAuth` existente (JWT em header, jamais URL); cria `Blob URL` local somente após receber a mídia autorizada, invalida em desmontagem/troca de unidade e não contém botão de conclusão. **Ainda não foi associado às rotas públicas do frontend.**
- Os testes locais provam transporte, range, bloqueio de R2 adulterado, tenant/usuário indevido, allowlist desativada, privacidade do gabarito, falha de autenticação e revogação dos `Blob URLs`. Nenhum desses testes substitui o fluxo navegador + D1/R2 real em staging.

## Serviços de escrita e rotas técnicas bloqueadas por padrão

Duas funções de backend foram implementadas e verificadas com testes focados. Agora existem rotas de escrita montadas sob o piloto Native, mas **não estão habilitadas em runtime** sem os dois flags independentes de staging, migração governada e publicação homologada da edição. Não houve qualquer gravação remota nesta PR:

- `commitNativeLessonCheckpoint`: lê a matrícula e vínculo de edição/ciclo pelo usuário autenticado, valida a sequência e unidade da versão privada do curso, cria hash do evento e usa **INSERT...SELECT com rechecagem atômica** de tenant/funcionário, matrícula, edição, curso publicado e ciclo ativo. O banco também exige sequência contígua e UNIQUE. Evento repetido só é reconhecido se todos os campos e hash persistidos coincidirem; colisões divergentes falham.
- `commitNativeAssessmentAttempt`: avalia as escolhas exclusivamente no Worker com gabarito privado da edição imutável; rejeita payload com nota/aprovação inventada, prova obrigatória incompleta e tentativa fora de sequência. Persiste respostas privadas e hash, política, nota calculada e resultado por INSERT...SELECT com escopo novamente conferido. Retry idêntico é idempotente; concorrência diferente falha.
- `loadNativePrivateCourse`: mantém a validação já existente de matrícula/ciclo, SHA do objeto R2 e schema, mas fornece o gabarito **somente a serviços internos do Worker**. A resposta HTTP do aluno continua usando `loadNativePublishedCourse` e sua projeção sem respostas corretas.
- `readNativeCanonicalReadiness`: recupera histórico D1, verifica hash das respostas da última tentativa, recalcula a nota e avalia se há evidência suficiente. **Não chama** `completeLmsMatricula`, não emite certificado, não grava qualificação nem atualiza o Compliance.

**Limitação pedagógica:** registro de visita a uma unidade, por si, não garante que a pessoa leu, permaneceu tempo suficiente ou assistiu todo o vídeo. Antes de uso regulamentar, definir evidências verificáveis de consumo de mídia/atividades e política para conexão intermitente, sem transformar porcentagem de navegação em certificação. Esse requisito não está resolvido apenas pelo ledger.

**Dependências para ativar escrita/início:** schema 0549 efetivamente aplicado + CHECK `native` governado no catálogo + upload/publicação privada e revisão pedagógica da edição + fluxo de sessão seguro que obtenha scope/artefato somente do servidor + autorização explícita de staging, testes com D1/R2 reais, idempotência concorrente e recuperação. Até lá as rotas permanecem **desabilitadas por configuração**, e o frontend é preview read-only.

## Montagem offline do pacote R2 para revisão (NÃO é upload)

A fábrica agora oferece `scripts/learning-factory/stage_native_r2_package.py`. Após gerar o rascunho e o candidato Native privado, a ferramenta monta em diretório **novo e exclusivo** os bytes exatos de `native-private-candidate.json` e suas mídias declaradas. Ela calcula a chave `lms/native/{empresa_id}/{curso_id}/{artifactBytesSha256}/`, que corresponde ao loader e ao Schema V2. O catálogo de objetos `private-publication-review.json` inclui hash, tamanho e MIME de cada arquivo, sem autenticação remota ou alteração de estado do LMS.

Exemplo de execução **local**, com IDs de tenant/curso de ambiente de desenvolvimento:

```bash
python3 scripts/learning-factory/stage_native_r2_package.py \
  /caminho/privado/candidato \
  /caminho/privado/rascunho \
  /caminho/privado/destino-novo \
  --empresa-id 6 --curso-id 31
```

O conteúdo contém **gabaritos privados**, portanto o diretório de saída não pode ser colocado em GitHub, Drive aberto, Pages ou storage público. A ferramenta verifica digest do JSON e das mídias, impede overwrite e symlinks e rejeita mídias acima do limite de 12 MiB suportado pela prévia atual. Não executa JavaScript de SCORM. Mesmo quando a montagem funciona, `publishable=false` e `remoteUploadPerformed=false`; o catálogo de revisões e autorizações é uma etapa posterior. Cópia local não prova aprendizagem, matrícula ou certificação.

## Barreiras de compatibilidade com o LMS legado

Antes de liberar `tipo_conteudo='native'` no catálogo, o Worker deve impedir que rotas antigas interpretem esse formato como conteúdo informativo ou SCORM/H5P:

- `POST /api/lms/matriculas/:id/finalizar`: a middleware de integridade responde `NATIVE_CANONICAL_EVIDENCE_REQUIRED`, sem inferir conclusão a partir de 100% de páginas.
- `PATCH /api/lms/matriculas/:id/status` solicitando CONCLUIDO: a middleware bloqueia a conclusão administrativa genérica de um curso Native, independentemente do papel, até existir finalização nativa governada.
- `POST /api/lms/matriculas/scorm/commit` e `POST /api/lms/xapi/statements`: além de bloquear qualquer sinal de conclusão nativa, os **handlers legados de gravação** também rejeitam eventos parciais. Um SCORM `incomplete` ou statement xAPI `experienced` não pode contaminar progresso, notas ou histórico do novo formato.
- `PATCH /api/lms/matriculas/:id/progresso`: rejeita porcentagens e slides escolhidos pelo navegador em matrícula Native (`NATIVE_CHECKPOINT_REQUIRED`); aceita apenas os formatos legados autorizados conforme o contrato existente.

Os testes focados de middleware e handlers verificam estas barreiras. A **conclusão Native futura** terá de passar por um ponto de entrada dedicado que obtenha a matrícula, ciclo e edição do servidor, revalide as evidências imutáveis e delegue a persistência ao `completeLmsMatricula` sem enfraquecer a política existente. Estes bloqueios não equivalem à implementação desse ponto de entrada; ele continua deliberadamente indisponível.

## Endpoints de evidências Native V1 — preparados, desligados e restritos a staging

A PR implementa endpoints internos sob `/api/lms/native`, com o middleware JWT/tenant existente e **dois flags independentes** que devem incluir o `empresa_id` exato (CSV; wildcard proibido):

- `NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS` — acesso à prévia de conteúdo, obrigatório para qualquer escrita.
- `NATIVE_LEARNER_WRITE_ENABLED_TENANTS` — autorização técnica adicional de escrita de **evidências**, nunca habilitada automaticamente. Ausente/vazio: responde 404 sem consultar D1/R2.

Em `ENVIRONMENT=production`, todos os endpoints abaixo recusam operação mesmo que os flags sejam indevidamente preenchidos. **Não configurar esses flags em ambientes remotos antes de migration/publicação/homologação e autorização específicas.**

| Rota | Evidência recebida | Persistência e resposta |
| --- | --- | --- |
| `POST /api/lms/native/matriculas/:id/iniciar` | Corpo JSON estrito `{}`; matrícula determinada apenas pela rota autenticada | Inicia `NAO_INICIADO` → `EM_ANDAMENTO` **simultaneamente na matrícula e no ciclo ativo** por transação `D1.batch()` com preflight/postcheck; valida usuário, empresa, curso, ciclo e SHA-256 da edição. Retry íntegro é idempotente; divergência entre status causa rollback; sem qualificação, nota ou certificado |
| `POST /api/lms/native/matriculas/:id/checkpoints` | Apenas `eventId`, `sequence`, `unitId` de aula | Worker acrescenta hash da edição encontrado no banco/R2, valida evidências anteriores, executa INSERT atômico e devolve recibo sem conclusão |
| `POST /api/lms/native/matriculas/:id/tentativas` | Apenas `attemptNumber` e pares `questionId`/`optionId` | Worker reavalia com gabarito privado da edição, executa INSERT atômico e devolve nota/satisfação da avaliação, **sem qualificação/certificado** |

Ambas as rotas exigem matrícula própria, edição imutável, `mode=LEARN`, formato Native, curso publicado e ciclo ativo; não permitem `empresaId`, `cursoId`, `cicloId`, `artifactHash`, `scorePct`, `completed` ou chaves de correção no JSON do usuário. Tamanho máximo de body JSON: 128 KiB; repetições idênticas são idempotentes e divergências são 409. A leitura da edição privada e dos seus gabaritos nunca é devolvida ao navegador.

**Limitações funcionais intencionais:** existe agora início governado de `NAO_INICIADO` sob a allowlist dupla **exclusivamente em staging**, mas ainda não há sincronização operacional de progresso percentual, retomada offline assinada, validação real do consumo de vídeo nem finalização pelo `completeLmsMatricula`. Estas rotas **não** equivalem a curso operacional. O código e testes são preparação para E2E de staging, sem ativação no ambiente remoto.

## Consulta autenticada de sessão e retomada (somente leitura)

`GET /api/lms/native/matriculas/:matriculaId/sessao` é uma nova rota staging-only, sob o `auth()` existente e a allowlist exata `NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS`. Nunca é acessível em produção nem consulta D1/R2 com o flag desabilitado. Exige matrícula própria, edição publicada e JSON **privado** com SHA-256 e schema validados. Consulta o ledger do ciclo atual, verifica ordem/identificadores/unidades e recalcula a última avaliação internamente com gabarito privado.

A resposta traz apenas `edition_sha256`, `ciclo_id`, `mode`, `next_sequence`, `seen_lesson_ids`, `last_visited_unit_id`, `total_lessons` e um resumo limitado da última tentativa (número, nota e aprovação da avaliação). **Não expõe eventos brutos, answers_json, IDs de respostas escolhidas, gabaritos, feedback privado, readiness de conclusão, qualificação ou certificados.** Retorna `completion_supported=false` para não sugerir que este fluxo certifica o aluno.

A prévia React consulta primeiro o curso e depois esse estado. Só aceita a retomada se **matrícula, ciclo, SHA da edição e modo coincidirem** e todas as unidades referenciadas pertencerem ao curso recuperado. Se alguma verificação falhar, não usa progresso parcial nem mídias; caso válido, abre diretamente a última unidade visitada, sem carregar antes a mídia da primeira página. A interface identifica a contagem como *registros de visita*, nunca como conclusão pedagógica.

**Escopo:** retomada técnica de navegação na prévia, sem gravação ou status oficial no LMS. Persistência entre dispositivos somente poderá ser comprovada no D1/R2 de staging **após** migrar e publicar o pacote de teste no fluxo governado. Não é retomada offline assinada nem implantação em produção.

## QA estrutural sobre os pacotes SCORM fornecidos (dados privados)

Inspeção **offline, somente leitura**, do ZIP privado de treinamentos fornecido à conversa (arquivos e mídia **não** anexados ao GitHub): nove pacotes, dos quais **sete** usam `window.COURSE_DATA` com slides `lesson/scenario/assessment` e **dois** usam apenas `window.AIRTRUST_COURSE_MODEL` com contratos de slides/avaliação especializados. A inspeção verifica estrutura e formatos, **não** equivale a executar a conversão, revisar conteúdo pedagógico ou homologar certificados.

Resultados relevantes:

- Nos sete cursos `COURSE_DATA`, todas as referências principais `media` das unidades examinadas correspondem a entradas no arquivo original. Há conteúdo pedagógico em `steps`, `columns`, `sectionGroups` e `gateItems` que o primeiro compilador ignorava. O compilador agora transforma essas estruturas em headings/listas, preservando texto e ordem dos grupos. O relatório fornece `richContentFieldsConverted`. A paridade **visual** de layouts originais (grades, colunas, botões) ainda não está certificada.
- Em um dos sete cursos existe vídeo MP4 com cerca de **18,7 MiB**, acima do limite de **12 MiB** do transporte de mídia autenticado do piloto Native. O compilador agora devolve `mediaTransportBlockers` com identificação do asset, tamanho real e motivo `REQUIRES_APPROVED_LARGE_MEDIA_TRANSPORT`. A preparação para R2 continua bloqueando a mídia; não contornar por link público sem autenticação.
- Os dois formatos especializados continuam **fora da cobertura certificada do compilador**: usam tipos como `matrix`, `roadmap`, `bowtie`, `quiz` ou assessment de escopo global, inclusive decisões de cenário com outras estruturas de alternativas. Devem receber adaptadores testados e crosswalk próprio de requisitos de conclusão, sem interpretar `cover`/`quiz` como prova genérica.
- Nenhum dos nove cursos foi automaticamente declarado publicável, e não houve importação no catálogo, migration, gravação de histórico, publicação R2 ou alteração dos ZIPs originais.

Os testes unitários da fábrica são sintéticos; sua aprovação demonstra contratos de transformação e bloqueio, mas não comprova que os nove pacotes reais passam integralmente pela pipeline. A QA por curso ainda terá de comparar slides, mídias, decisões obrigatórias, notas e referências com o SCORM de origem.

## Adaptadores de formatos especiais — desenvolvimento e QA

O piloto agora inclui `scripts/learning-factory/normalize_scorm_model.py` para dois tipos do arquivo privado de nove SCORM recebido:

- **SGSO M10.4**: normaliza slides `cover/content/roadmap/concept_map/matrix/rule_exception/scenario/quiz/compare/process/bowtie` para aulas, cenários obrigatórios e avaliações Native, preservando os textos, gráficos vinculados e questões da origem em candidato privado. O modelo real revelou duas regras distintas: `requiredSlideIds` referencia todos os slides; `requiredInteractionIds` referencia os **cinco slides de quiz**, não os slides de cenário. O adaptador verifica as provas obrigatórias separadamente das decisões `requiredDecision=true`. Uma inspeção direta do ZIP real mostrou objetivos `outcomes` como objetos `{title,text}` e **20 questões com `originalText` distinto de `text`**, além de fonte por questão. O adaptador converte objetivos estruturados, inclui referências de fonte nas unidades e registra `originalQuestionWordingPending` e `questionSourceReviewRequired` no relatório. A redação original permanece preservada em `legacyAuthoringModel`; exige decisão pedagógica explícita de paridade antes de homologação.
- **Gerenciamento de Resíduos RC4.1**: normaliza decisões `choices` e a avaliação global `assessment.questions` para um exame Native; preserva pontos `gateItems` e texto dos `hotspots`, mas as coordenadas/efeitos visuais desses hotspots continuam pendentes de QA. **As 10 questões da prova original não incluem justificativa pedagógica**: o adaptador identifica `missingPedagogicalFeedback=10` e registra placeholder explícito, sem criar explicação normativa fictícia. O curso continua bloqueado para publicação.
- A fonte original completa permanece em `legacyAuthoringModel` somente no rascunho privado. Qualquer campo de slide novo/desconhecido bloqueia a conversão até haver mapeamento explícito. Todos os cursos exigem revisão visual, crosswalk de interações, notas e fonte normativa antes de certificação.

**Evidência:** testes sintéticos do adaptador em conjunto com importador e compilador, sem cópia de conteúdo proprietário ao GitHub. Verificações de formato/arquivo privado mostraram nove pacotes intactos, sete `COURSE_DATA` extraídos por leitura offline (42+26+20+20+19+29+25 = **181 slides**) e dois modelos especiais estruturalmente elegíveis para normalização. **Isso ainda não equivale a nove cursos integralmente convertidos e homologados**.

## Conversão privada em lote — sem publicar, sem R2/D1

A fábrica inclui `scripts/learning-factory/batch_convert_scorm_to_native.py` para arquivos como `SMS(3).zip` que contêm diversos ZIPs SCORM em subpastas. O comando verifica caminhos, symlinks e limites; ignora apenas metadados Finder AppleDouble seguros, bloqueia nomes duplicados e preserva os originais. Para cada curso chama extração + compilação em diretório privado independente e registra resultado com `publishable=false`. Um pacote malformado é isolado, sem perder candidatos dos demais.

```bash
umask 077
python3 scripts/learning-factory/batch_convert_scorm_to_native.py \
  "/caminho/privado/SMS(3).zip" \
  "/caminho/privado/nativo-candidatos-NOVO"
```

A saída contém `draft/` e `candidate/` por curso, incluindo **gabaritos privados**, e um `batch-conversion-review.json` sem opções corretas ou feedback confidencial. Diretório existente nunca é sobrescrito. `publicationPerformed=false` e `remoteUploadPerformed=false` são invariantes; o script não acessa GitHub, D1, R2, Pages ou produção.

**Condição para encerrar a conversão:** executar o lote sobre todos os ZIPs originais em ambiente privado, revisar os resultados reais, conferir a paridade de aulas, interações, notas e imagens, corrigir os casos especiais e obter aprovação pedagógica/técnica. Testes sintéticos do lote não são homologação do conteúdo real. O vídeo de 18,7 MiB e as 10 justificativas ausentes de Resíduos continuam bloqueadores do respectivo curso.

## Evidência real de schema em staging (2026-10-10, consultas somente leitura)

A consulta direta ao D1 `airtrust-db-staging-baseline-20260701` confirmou que o CHECK de `lms_cursos.tipo_conteudo` ainda restringe os cinco formatos legados; as quatro tabelas `lms_native_*` da change 0549 **não existem** em staging. Foram inventariados a tabela do catálogo, seus **seis índices e cinco triggers**, além de **três tabelas com FKs** para `lms_cursos`: `lms_matriculas`, `lms_cursos_setores` e `lms_scorm_package_versions`.

O snapshot capturado teve fingerprint SHA-256 `bb867870b5524b0dda21784a017fd0d3f855f116b3c8ff49fd947f05f80a89de` para os 12 objetos. A ferramenta `scripts/schema-v2/native-v1-catalog-readonly-preflight.mjs` foi testada contra esse snapshot e bloqueia qualquer drift; **não gera nem aplica SQL de reconstrução**. O plano de riscos e comandos read-only estão em `worker-airtrust/schema-v2/plans/lms-native-catalog-check-preparation.md`.

A implementação de início de matrícula agora usa uma única transação `D1.batch()` para sincronizar `lms_matriculas.status` **e** `lms_matricula_ciclos.status`, exigindo invariantes antes e depois das duas atualizações. Sete testes SQLite executam o SQL real extraído do TypeScript e verificam rollback integral em falhas, drift, revogação e cross-tenant. O endpoint permanece duplamente gated e não está ativado remotamente.

**Atenção:** o snapshot vale só para staging no momento da consulta. Não inferir paridade com produção, não reconstruir `lms_cursos` sem prova de FKs/índices/triggers/rollback, nem habilitar Native com Schema V2 ainda não aplicado.

## Harden 0549 — integridade de ciclo e contrato de edição

A mudança governada `lms-native-v1-evidence-0549` agora valida no próprio SQLite que **o funcionário e o status da matrícula correspondem aos do ciclo atual** antes de vincular uma edição. Vinculações em matrículas canceladas/concluídas não são admitidas; inserções de eventos e tentativas exigem `EM_ANDAMENTO` em **ambos** os registros. O identificador de versão imutável da edição deve seguir o padrão `n-` + 32 caracteres hexadecimais minúsculos. O Worker aplica as mesmas verificações em suas consultas autenticadas.

**Validações sem escrita remota:** 13 testes SQLite sintéticos da change 0549, incluindo divergência de funcionário/status e formato inválido de versão; 37 testes Worker focados de writers, readiness, paginação e guardas arquiteturais; TypeScript Worker aprovado. Os hashes novos do SQL e do plano foram sincronizados no manifest e conferidos pelo construtor oficial `build-reviewed-schema-apply.mjs`. O SQL resultante foi gerado **apenas em arquivo temporário local**, sem aplicação a staging ou produção.

**Dependência não resolvida:** antes de ativar o formato `native` em qualquer empresa, ainda será necessária a migration independente do CHECK do catálogo, via executor governado com preservação de FKs, índices, triggers e rollback testado. Nenhuma alteração estrutural foi aplicada remotamente nesta etapa.

## Aceitação funcional antes de matrícula real

- upload/revisão de candidato Native, versão por hash e reabertura da mesma edição em nova sessão;
- início/retomada após desconexão, idempotência sob dois dispositivos, replay com mesmo ID e payload diferente, sequência perdida ou duplicada, mudança de edição durante curso, novo ciclo;
- tenant cruzado, funcionário sem matrícula, usuário sem vínculo e curso inativo/publicação pendente;
- cenário obrigatório incorreto, reprovação com prova insuficiente, aprovação com nota comprovada e sem arredondamento favorável;
- conclusão administrativa idempotente via serviço canônico, qualificação única, certificado real, Compliance/Histórico atualizados, revisão read-only sem reiniciar matrícula;
- exames completos em mobile/iPad/desktop com erros de assets, login expirado, retomada e indisponibilidade de rede;
- uma turma-piloto real somente depois da prova de staging e da autorização de release pertinente.

**Regra:** não dar merge/deploy da nova trilha como se fosse pronta para produção; PR #1389 permanece draft até as dependências reais estarem resolvidas.
