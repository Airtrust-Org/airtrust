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

**Dependências para ativar escrita:** schema 0549 efetivamente aplicado + CHECK `native` governado no catálogo + upload/publicação privada e revisão pedagógica da edição + fluxo de sessão seguro que obtenha scope/artefato somente do servidor + autorização explícita de staging, testes com D1/R2 reais, idempotência concorrente e recuperação. Até lá as rotas permanecem **desabilitadas por configuração**, e o frontend é preview read-only.

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
| `POST /api/lms/native/matriculas/:id/checkpoints` | Apenas `eventId`, `sequence`, `unitId` de aula | Worker acrescenta hash da edição encontrado no banco/R2, valida evidências anteriores, executa INSERT atômico e devolve recibo sem conclusão |
| `POST /api/lms/native/matriculas/:id/tentativas` | Apenas `attemptNumber` e pares `questionId`/`optionId` | Worker reavalia com gabarito privado da edição, executa INSERT atômico e devolve nota/satisfação da avaliação, **sem qualificação/certificado** |

Ambas as rotas exigem matrícula própria, edição imutável, `mode=LEARN`, formato Native, curso publicado e ciclo ativo; não permitem `empresaId`, `cursoId`, `cicloId`, `artifactHash`, `scorePct`, `completed` ou chaves de correção no JSON do usuário. Tamanho máximo de body JSON: 128 KiB; repetições idênticas são idempotentes e divergências são 409. A leitura da edição privada e dos seus gabaritos nunca é devolvida ao navegador.

**Limitações funcionais intencionais:** ainda não há start governado para matrículas `NAO_INICIADO`, sincronização operacional de progresso percentual, retomada offline assinada, validação real do consumo de vídeo nem finalização pelo `completeLmsMatricula`. Estas rotas **não** equivalem a curso operacional. O código e testes são preparação para E2E de staging, sem ativação no ambiente remoto.

## Consulta autenticada de sessão e retomada (somente leitura)

`GET /api/lms/native/matriculas/:matriculaId/sessao` é uma nova rota staging-only, sob o `auth()` existente e a allowlist exata `NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS`. Nunca é acessível em produção nem consulta D1/R2 com o flag desabilitado. Exige matrícula própria, edição publicada e JSON **privado** com SHA-256 e schema validados. Consulta o ledger do ciclo atual, verifica ordem/identificadores/unidades e recalcula a última avaliação internamente com gabarito privado.

A resposta traz apenas `edition_sha256`, `ciclo_id`, `mode`, `next_sequence`, `seen_lesson_ids`, `last_visited_unit_id`, `total_lessons` e um resumo limitado da última tentativa (número, nota e aprovação da avaliação). **Não expõe eventos brutos, answers_json, IDs de respostas escolhidas, gabaritos, feedback privado, readiness de conclusão, qualificação ou certificados.** Retorna `completion_supported=false` para não sugerir que este fluxo certifica o aluno.

A prévia React consulta primeiro o curso e depois esse estado. Só aceita a retomada se **matrícula, ciclo, SHA da edição e modo coincidirem** e todas as unidades referenciadas pertencerem ao curso recuperado. Se alguma verificação falhar, não usa progresso parcial nem mídias; caso válido, abre diretamente a última unidade visitada, sem carregar antes a mídia da primeira página. A interface identifica a contagem como *registros de visita*, nunca como conclusão pedagógica.

**Escopo:** retomada técnica de navegação na prévia, sem gravação ou status oficial no LMS. Persistência entre dispositivos somente poderá ser comprovada no D1/R2 de staging **após** migrar e publicar o pacote de teste no fluxo governado. Não é retomada offline assinada nem implantação em produção.

## Aceitação funcional antes de matrícula real

- upload/revisão de candidato Native, versão por hash e reabertura da mesma edição em nova sessão;
- início/retomada após desconexão, idempotência sob dois dispositivos, replay com mesmo ID e payload diferente, sequência perdida ou duplicada, mudança de edição durante curso, novo ciclo;
- tenant cruzado, funcionário sem matrícula, usuário sem vínculo e curso inativo/publicação pendente;
- cenário obrigatório incorreto, reprovação com prova insuficiente, aprovação com nota comprovada e sem arredondamento favorável;
- conclusão administrativa idempotente via serviço canônico, qualificação única, certificado real, Compliance/Histórico atualizados, revisão read-only sem reiniciar matrícula;
- exames completos em mobile/iPad/desktop com erros de assets, login expirado, retomada e indisponibilidade de rede;
- uma turma-piloto real somente depois da prova de staging e da autorização de release pertinente.

**Regra:** não dar merge/deploy da nova trilha como se fosse pronta para produção; PR #1389 permanece draft até as dependências reais estarem resolvidas.
