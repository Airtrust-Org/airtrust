# AirTrust LMS Tripulacao/Operacoes Closeout 2026-06-28

## Escopo

- Frente: LMS/SCORM Tripulacao/Operacoes.
- Pasta canonica: `/Users/filipedaumas/SAAS/Airtrust`.
- ZIPs fonte oficiais: `~/EADs/Tripulação/*.zip`.
- Nao houve SQL de escrita, migration, rollback, conclusao manual de matricula ou qualificacao manual nesta fase.

## Estado do repositório

- `origin/main` confirmado em `16d9fed7db354c5472175f7e2b1dacbe6c667821` no inicio desta retomada.
- `main` local continha dois commits LMS ainda nao publicados:
  - `23082fe` `fix(lms): batch R2 puts + post-upload verification to prevent silent partial uploads`
  - `f174bee` `fix(lms): prevent silent partial upload via R2 count verification + skip_purge mode`
- Arquivos de produto envolvidos nesses commits:
  - `worker-airtrust/src/routes/lms-cursos.ts`
  - `src/react-app/hooks/useLms.ts`
  - `src/react-app/pages/lms/LmsCatalogo.tsx`
  - `src/react-app/pages/lms/lmsContentUpload.ts`

## Correção adicional aplicada nesta fase

Problema confirmado:

- `skip_purge` no fluxo `content-upload` podia mascarar falta de arquivo novo, porque `/content-upload/complete` validava apenas a contagem total sob o prefixo R2.
- Em modo merge, arquivos legados podiam fazer `r2Count >= files_uploaded` mesmo com upload novo incompleto.

Correção aplicada:

- frontend agora envia `uploaded_paths` no `POST /content-upload/complete`;
- backend valida a presenca exata dos objetos esperados no prefixo;
- o fallback por contagem continua existindo apenas quando a lista exata nao for enviada;
- teste dedicado adicionado para o cenario `skip_purge` com arquivo legado mascarando ausencia de arquivo novo.

Arquivos alterados nesta fase:

- `worker-airtrust/src/routes/lms-cursos.ts`
- `src/react-app/pages/lms/lmsContentUpload.ts`
- `worker-airtrust/src/__tests__/routes/lms-cursos-structured-upload-complete.test.ts`

Validacoes executadas:

- `cd worker-airtrust && npx vitest run src/__tests__/routes/lms-cursos-structured-upload-complete.test.ts src/__tests__/routes/lms-cursos-beta-contract.test.ts src/__tests__/routes/lms-cursos-schema-compat.test.ts`
- `npm run lint`

Resultado:

- 13 testes LMS relacionados passaram.
- `lint` passou.

## ZIPs fonte oficiais

Contagem auditada:

- Total de ZIPs em `~/EADs/Tripulação/`: `12`

Evidencia objetiva confirmada em todos os 12 ZIPs:

- ZIP nao vazio;
- `imsmanifest.xml` presente e XML bem-formado;
- `app.js` presente;
- `scorm_api.js` presente;
- `styles.css` presente;
- sem `alert()` nativo no runtime auditado;
- sinais estaticos de `cmi.suspend_data`;
- sinais estaticos de `LMSInitialize`, `LMSCommit`, `LMSFinish`;
- `beforeunload` com `commit`;
- uso explicito de `passed`, `completed` e `failed`;
- compatibilidade de retomada indicada por `suspend_data` + progresso + commit.

### Correcao aplicada aos ZIPs fonte

Problema confirmado nos 12 ZIPs:

- `lesson_location` ainda era gravado como base zero via `Scorm.progress(current+'/'+(SLIDES.length-1))`.

Correcao aplicada nos 12 ZIPs oficiais:

- substituido por `Scorm.progress((current+1)+'/'+SLIDES.length)`.

Backup preservado antes da troca:

- `/tmp/airtrust-tripulacao-zips-backup-20260628T122442Z`

Estado apos a correcao:

- `BAD_ZERO_BASED=false` em todos os 12 ZIPs;
- `GOOD_N_OVER_TOTAL=true` em todos os 12 ZIPs.

## Offshore

Pacote fonte oficial confirmado:

- `~/EADs/Tripulação/Operacoes_Offshore_SCORM12_Rev01.zip`

Inventario confirmado do ZIP fonte:

- total de arquivos: `35`
- `12` arquivos `.mp4`
- `23` arquivos nao-`.mp4`
- `imsmanifest.xml`, `app.js`, `scorm_api.js`, `styles.css` presentes

Sinais estaticos confirmados no runtime do pacote fonte Offshore:

- `app.js` contem `cmi.suspend_data`;
- `app.js` usa `passed`, `completed` e `failed`;
- `scorm_api.js` contem `lesson_location`, `LMSInitialize`, `LMSCommit`, `LMSFinish` e `beforeunload`;
- o padrao `lesson_location` foi corrigido no ZIP fonte para `n/total`.

### Estado confirmado em producao

Ultima evidencia objetiva localizada para o curso publicado de Offshore esta em:

- `/tmp/airtrust-pr170-untracked-backup-20260628T0800Z/docs/AIRTRUST_LMS_TRIPULACAO_POST_UPLOAD_SCORM_AUDIT_20260627.md`

Estado confirmado nesse relatorio:

- empresa: `6`
- curso Offshore: `ID=7`
- `course_data.js` em R2 estava correto;
- `app.js` em R2 ainda estava pre-patch;
- evidencia registrada: `OFFSHORE_APP_JS_NAO_CORRIGIDO`
- acao requerida registrada: reupload do ZIP correto via painel admin.

Conclusao operacional sobre Offshore:

- o ZIP fonte oficial agora esta correto;
- o ultimo estado confirmado de producao ainda exige reupload do Offshore pelo fluxo normal do painel;
- sem leitura nova do R2 ou upload autenticado nesta sessao, o estado de producao permanece `REUPLOAD_PENDENTE`.

## Estado de deploys

Estado observado durante a retomada:

- `GET https://api.airtrust.online/api/version` respondeu `version=dev-local`;
- `https://airtrust.online/login` expunha `build-version` antigo (`22031113`);
- isso indica rastreabilidade de runtime defasada antes da publicacao desta frente.

## Riscos remanescentes

- Critico: Offshore em producao ainda nao foi revalidado apos reupload do ZIP fonte corrigido.
- Medio: correcoes do pipeline LMS estavam locais e sem rastreabilidade remota no inicio desta retomada.
- Baixo: os 12 ZIPs fonte exigiram patch direto fora do repositório; o backup externo foi preservado.

## Decisao antes da publicacao

- Pipeline LMS: corrigido localmente e validado.
- ZIPs fonte: corrigidos e auditados.
- Offshore em producao: ultimo estado confirmado ainda pendente de reupload.

Decisao operacional neste ponto:

- `NO-GO` para declarar a frente encerrada sem publicar o codigo e sem reupload do Offshore no painel.

## Próximo passo recomendado

1. Publicar as correcoes do pipeline LMS com rastreabilidade Git completa.
2. Fazer deploy seguro de Worker e Pages sem migrations.
3. Reupload do ZIP `Operacoes_Offshore_SCORM12_Rev01.zip` no curso `ID=7` pelo painel admin.
4. Revalidar R2 do Offshore apos upload:
   - `app.js` corrigido;
   - `alert()` ausente;
   - `suspend_data` presente;
   - `lesson_location=n/total`;
   - total de arquivos esperado confirmado.
5. Só entao promover a decisao final para `GO COM RESSALVAS` ou `GO`.
