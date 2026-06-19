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

## Próximos passos seguros

1. Deployar apenas o Worker de `staging` com esse endpoint e flags rastreadas.
2. Validar `sync-preview`, `real-preview` e `shadow-compare` em `staging` autenticado.
3. Se necessario, reutilizar apenas o seed sintético controlado já embutido no runner remoto de staging.
4. Só depois discutir adaptador `CV -> FRMS` em shadow, ainda sem virada canônica.
