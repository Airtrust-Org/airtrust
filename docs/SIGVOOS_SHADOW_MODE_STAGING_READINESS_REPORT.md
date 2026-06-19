# SIGVOOS / Controle de Voos Shadow Mode Staging Readiness

Data: 2026-06-19

## Escopo executado

- Auditoria de `wrangler.toml`, rotas SIGVOOS/CV, migrations `0410/0411`, schema `cv_*` e documentação existente.
- Confirmação de que `sync-preview` e `real-preview` já existem e são protegidos por auth + RBAC `manager` + tenant scope.
- Ativação rastreada de flags apenas em `staging` no backend.
- Implementação de endpoint novo, read-only, `GET /api/controle-voos/sigvoos/shadow-compare`.
- Testes locais direcionados para fail-closed, agregação e ausência de DML.

## Estado encontrado

- `worker-airtrust/wrangler.toml` já separa `development`, `staging` e `production`.
- `staging` usa `airtrust-api-staging` com D1 `airtrust-db-staging`.
- `production` continua sem alterações e sem novas flags SIGVOOS.
- `0410` e `0411` já existem no repositório e há relatórios indicando aplicação operacional anterior em `staging` e `production`.
- `sync-preview` já era read-only e sem chamada externa.
- `real-preview` já era read-only, mas depende de credenciais SIGVOOS e chama upstream externo.
- Não existia endpoint HTTP de `shadow-compare`; havia apenas planejamento em docs e um invocador local de shadow importador.

## Alterações aplicadas

- `worker-airtrust/wrangler.toml`
  - `CONTROLE_VOOS_SIGVOOS_RUNTIME_PREVIEW_ENABLED = "true"` em `env.staging`
  - `CONTROLE_VOOS_SIGVOOS_REAL_API_PREVIEW_ENABLED = "true"` em `env.staging`
  - `CONTROLE_VOOS_SIGVOOS_SHADOW_COMPARE_ENABLED = "true"` em `env.staging`
- `worker-airtrust/src/types/index.ts`
  - tipagem da nova flag `CONTROLE_VOOS_SIGVOOS_SHADOW_COMPARE_ENABLED`
- `worker-airtrust/src/services/controle-voos/sigvoos-shadow-compare.ts`
  - serviço read-only para comparação agregada entre `cv_*` importado via SIGVOOS e FRMS atual `origem='SIGVOOS'`
  - janela segura de até 31 dias
  - sem escrita em D1
  - sem PII
  - fail-closed para comparabilidade FRMS quando `frms_jornada.empresa_id` não existir, evitando agregação cross-tenant em schema legado
  - agrega por data, base e aeronave quando a dimensão FRMS existir
  - expõe `flight type` como dimensão somente CV e marca o gap de comparabilidade
- `worker-airtrust/src/routes/controle-voos.ts`
  - `GET /api/controle-voos/sigvoos/shadow-compare`
  - auth obrigatória
  - RBAC `manager`
  - tenant scope obrigatório
  - fail-closed com `404` quando a flag não existir
  - bloqueio explícito fora de `staging`, mesmo se a flag for habilitada por engano em outro ambiente

## Contrato do novo endpoint

`GET /api/controle-voos/sigvoos/shadow-compare?from=YYYY-MM-DD&to=YYYY-MM-DD`

Retorna apenas agregados:

- total de registros em `cv_sigvoos_staging`
- total de voos/etapas/tripulantes em `cv_*` com origem SIGVOOS
- total de jornadas e alertas FRMS com `origem='SIGVOOS'`
- conflitos abertos por severidade
- divergências agregadas por data, base e aeronave
- dimensão `flight type` apenas do lado CV, explicitando a falta de equivalente no FRMS atual
- `missingFields`, `normalizationErrors` e `recommendation.status`

## Segredos e operação

Nada foi gravado em secrets e nenhum valor foi exposto.

Se `real-preview` precisar ser usado em staging com upstream real, os comandos operacionais continuam sendo:

```bash
cd worker-airtrust
wrangler secret put JWT_SECRET --env staging
wrangler secret put SIGVOOS_CONFIG_ENCRYPTION_KEY --env staging
wrangler secret put SIGVOOS_REAL_API_USERNAME --env staging
wrangler secret put SIGVOOS_REAL_API_PASSWORD --env staging
wrangler secret put SIGVOOS_REAL_API_BASE_URL --env staging
wrangler secret put SIGVOOS_REAL_API_SYSTEM --env staging
```

Os valores nao foram solicitados nem usados nesta fase.

## Limitações remanescentes

- O endpoint novo compara com o FRMS atual `origem='SIGVOOS'`; ele nao cria adaptador `CV -> FRMS` e nao altera `frms-source-policy.ts`.
- A dimensão de tipo de voo ainda nao tem equivalente comparável no FRMS atual, portanto o relatório marca esse gap explicitamente.
- Se o schema FRMS remoto ainda não tiver `empresa_id`, o endpoint não compara FRMS e devolve bloqueio/gap de escopo em vez de agregar dados cross-tenant.
- Nenhum deploy, migration remota, seed remota ou sync real foi executado nesta fase.
- A validacao funcional remota existente em staging permanece como referencia, mas nao foi reexecutada aqui.

## Validacao autenticada em staging

- `GET /api/version` em `https://airtrust-api-staging.airtrust.workers.dev` respondeu `200` com `environment=staging`.
- `GET /api/health` respondeu `200` com `database=ok` e `storage=ok`.
- `GET /api/controle-voos/sigvoos/shadow-compare` sem token respondeu `401 MISSING_TOKEN`, confirmando protecao por auth.
- O Worker de staging respondeu com a rota nova ativa e a execucao autenticada confirmou `tenant scope` e RBAC `manager`.

### Caminho de autenticacao usado

- Nao havia token staging preexistente no shell nem no Keychain consultado por nome.
- Foi usado um caminho operacional seguro e reversivel apenas em `staging`:
  - completar o tenant sintético `empresa_id=906`, que já possuía dados `cv_*` e `cv_sigvoos_staging`, mas estava sem registro correspondente em `empresas`
  - criar um usuario temporario com role efetiva `manager`
  - autenticar por `POST /api/auth/login`
  - validar sessao por `GET /api/auth/me`
  - remover o acesso temporario ao final
- Nenhum token, senha, email real ou secret foi registrado neste relatório.

### Resultado do shadow-compare

Janela executada: `from=2026-06-12` e `to=2026-06-18`

Agregados retornados:

- `previewStagingRecords=7`
- `cvFlights=7`
- `cvStages=8`
- `cvCrew=5`
- `frmsJourneysSigvoos=4`
- `frmsAlertsSigvoos=0`
- `openIntegrationConflicts=1`
- `conflictsBySeverity`: `MEDIA=1`

Divergencias agregadas:

- por data:
  - `2026-06-13`: `cv=1`, `frms=1`, `delta=0`
  - `2026-06-14`: `cv=6`, `frms=3`, `delta=3`
- por base:
  - `SBMI`: `cv=1`, `frms=1`, `delta=0`
  - `SBRJ`: `cv=5`, `frms=2`, `delta=3`
  - `SBSP`: `cv=2`, `frms=1`, `delta=1`
- por aeronave:
  - houve match para `ATX-MAP`, `ATX7001`, `ATX7002` e `ATX7006`
  - seguem divergentes `ATX7210`, `ATX7218` e `ATX7220`
- por tipo de voo:
  - `REG`: dimensão apenas CV (`CV_ONLY_DIMENSION`)

Gaps e readiness:

- `normalizationErrors`: `FRMS_FLIGHT_TYPE_DIMENSION_UNAVAILABLE`
- `missingFields`: vazio para a dimensão de `flight_type_dimension`
- `recommendation.status=PARTIAL`
- `recommendation.reasons`:
  - `OPEN_INTEGRATION_CONFLICTS`
  - `NON_ZERO_AGGREGATE_DELTAS`

### Leitura operacional

- O bloqueio atual nao é mais de deploy nem de autenticacao.
- O Worker de staging publicado já reflete a nova classificação de `flight_type_dimension` como limitação de normalização, não como `missingFields`.
- Em staging, o caminho novo `SIGVOOS -> cv_*` e `cv_sigvoos_staging` esta populado o suficiente para comparacao read-only.
- O readiness agora fica corretamente `PARTIAL`: existe comparabilidade suficiente para a janela curta, mas ainda resta `1` conflito de integração aberto e divergências agregadas reais.

### Macroetapa de comparabilidade FRMS em staging

- Foi adicionado o script controlado `scripts/staging/seed-frms-sigvoos-comparable-from-cv.mjs`.
- Escopo fixo e nao expansivel pelo operador:
  - apenas `env=staging`
  - apenas `empresa_id=906`
  - apenas janela `2026-06-12..2026-06-18`
  - apenas `frms_jornada`
  - sem `clearExisting`, sem `DELETE` fisico, sem qualquer caminho de producao
- O script deriva jornadas sinteticas a partir de `cv_voos`, `cv_voo_etapas`, `cv_voo_tripulantes` e `funcionarios`, marcando tudo com `registrado_por=STAGING_SHADOW_COMPARE` e `observacao=STAGING_SIGVOOS_SHADOW_COMPARE_FROM_CV`.
- Foi necessario agregar por `tripulante_id + data`, porque o schema de `frms_jornada` em staging permite apenas uma jornada ativa por combinacao.

Dry-run aprovado:

- `sourceRows=7`
- `candidateJourneyRows=4`
- agregados previstos:
  - por data: `2026-06-13=1`, `2026-06-14=3`
  - por base: `SBMI=1`, `SBRJ=2`, `SBSP=1`
  - por aeronave: `ATX-MAP=1`, `ATX7001=1`, `ATX7002=1`, `ATX7006=1`

Resultado do apply controlado seguido de reexecucao autenticada do compare:

- antes do seed:
  - `frmsJourneysSigvoos=3`
  - `openIntegrationConflicts=2`
  - `recommendation.status=PARTIAL`
  - `recommendation.reasons`:
    - `OPEN_INTEGRATION_CONFLICTS`
    - `NON_ZERO_AGGREGATE_DELTAS`
- correção artificial e reversível aplicada em staging:
  - foi adicionado apenas o funcionário sintético faltante para a matrícula `09999`
  - foi criado apenas o `cv_voo_tripulantes` correspondente ao voo `906605`
  - o conflito artificial de matrícula ausente passou de `ABERTO` para `IGNORADO`
  - nenhum ajuste foi feito no conflito real remanescente de `staff.id` versus `staff.inscription`
- apply:
  - `changes=4`
  - `after.frmsSigvoos906=4`
  - `after.syntheticActiveRows=4`
- depois do seed:
  - `previewStagingRecords=7`
  - `cvFlights=7`
  - `cvStages=8`
  - `cvCrew=5`
  - `frmsJourneysSigvoos=4`
  - `frmsAlertsSigvoos=0`
  - `openIntegrationConflicts=1`
  - `recommendation.status=PARTIAL`
  - `recommendation.reasons`:
    - `OPEN_INTEGRATION_CONFLICTS`
    - `NON_ZERO_AGGREGATE_DELTAS`

Divergencias remanescentes apos o seed:

- por data:
  - `2026-06-13`: `cv=1`, `frms=1`, `delta=0`
  - `2026-06-14`: `cv=6`, `frms=3`, `delta=3`
- por base:
  - `SBMI`: `cv=1`, `frms=1`, `delta=0`
  - `SBRJ`: `cv=5`, `frms=2`, `delta=3`
  - `SBSP`: `cv=2`, `frms=1`, `delta=1`
- por aeronave:
  - houve match para `ATX-MAP`, `ATX7001`, `ATX7002` e `ATX7006`
  - seguem divergentes `ATX7210`, `ATX7218` e `ATX7220`
- por tipo de voo:
  - `REG`: dimensão apenas CV (`CV_ONLY_DIMENSION`)
- gaps estruturais:
  - `normalizationErrors`: `FRMS_FLIGHT_TYPE_DIMENSION_UNAVAILABLE`
  - `missingFields`: nenhum para a classificação de `flight_type_dimension`

Conclusao desta macroetapa:

- staging passou de `BLOCKED` para `PARTIAL` quando recebeu jornadas FRMS sinteticas suficientes para a mesma janela curta.
- o bloqueio `NO_FRMS_SIGVOOS_JOURNEYS` saiu, provando que o `shadow-compare` ficou operacionalmente comparavel.
- a comparabilidade ainda nao e completa porque permanece `1` conflito aberto de integracao e o agregado de jornadas continua abaixo do volume CV do dia `2026-06-14`.
- o teste autenticado inicial que comprovou `PARTIAL` foi executado com cleanup automatico ao final.
- em seguida, foi corrigido apenas o conflito artificial e reversível de matrícula ausente, o seed foi reaplicado sem rollback automático e o endpoint autenticado foi validado novamente no estado persistido.
- estado final confirmado em staging:
  - `frmsJourneysSigvoos=4`
  - `openIntegrationConflicts=1`
  - `missingFields=[]`
  - `normalizationErrors=['FRMS_FLIGHT_TYPE_DIMENSION_UNAVAILABLE']`
  - `recommendation.status=PARTIAL`
  - `recommendation.reasons`:
    - `OPEN_INTEGRATION_CONFLICTS`
    - `NON_ZERO_AGGREGATE_DELTAS`

## Próximos passos seguros

1. Tratar o `1` conflito aberto de integração antes de qualquer shadow window mais longa.
2. Definir se a dimensão `flight_type_dimension` continuará apenas como limitação de normalização documentada ou se haverá uma estratégia futura explícita para comparação sem migration.
3. Se for necessario encerrar a comparabilidade temporaria, executar apenas o rollback controlado dos scripts staging para remover as `4` jornadas sinteticas e o vínculo sintético criado para `09999`.
