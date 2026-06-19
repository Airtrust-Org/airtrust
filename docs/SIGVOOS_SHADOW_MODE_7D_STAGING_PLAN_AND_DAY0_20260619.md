# SIGVOOS Shadow Mode 7D Staging Plan And Day 0

Data: 2026-06-19

## Escopo

- Inicio do shadow mode de 7 dias apenas em `staging`.
- Coleta read-only do `shadow-compare`.
- Sem producao, sem migration, sem source policy e sem adaptador `CV -> FRMS`.
- Dia 0 executado apos merge do PR #95 e apos reconciliacao sintetica de identidade.

## Guardrails

- Endpoint continua privado e protegido por token.
- RBAC mantido em `GESTOR`.
- Tenant mantido em `906`.
- `writesEnabled=false`.
- Nenhum token, cookie, senha, email, documento ou PII registrado neste relatorio.
- Nenhum sync SIGVOOS real foi executado nesta macro.

## Runtime staging

- `/api/version`: `environment=staging`
- `/api/health`: `healthy`
- `shadow-compare` sem token: `401 MISSING_TOKEN`
- `/api/auth/me`: role efetiva `GESTOR`

## Dia 0

Janela observada:

- `from=2026-06-12`
- `to=2026-06-18`

Resultado autenticado do dia 0:

- `recommendation.status=READY`
- `recommendation.reasons=[]`
- `previewStagingRecords=7`
- `cvFlights=7`
- `cvStages=8`
- `cvCrew=6`
- `frmsJourneysSigvoos=4`
- `frmsAlertsSigvoos=0`
- `openIntegrationConflicts=0`
- `missingFields=[]`
- `normalizationErrors=["FRMS_FLIGHT_TYPE_DIMENSION_UNAVAILABLE"]`
- agregados por data: todos `MATCH`
- agregados por base: todos `MATCH`
- agregados por aeronave: todos `MATCH`

## Leitura operacional do dia 0

- O comparador entrou em `READY`.
- O blocker anterior `OPEN_INTEGRATION_CONFLICTS` foi zerado em `staging`.
- `NON_ZERO_AGGREGATE_DELTAS` segue ausente.
- O `normalizationErrors` remanescente de `flight type` nao bloqueia o comparador atual.

## Plano operacional de 7 dias

Frequencia:

- 1 coleta por dia, sempre sobre a mesma janela fixa `2026-06-12..2026-06-18`, para manter comparabilidade do experimento atual.

Script read-only:

- `scripts/staging/collect-sigvoos-shadow-compare-7d.mjs`
- usa `AIRTRUST_STAGING_TOKEN` apenas via env
- nao grava token em arquivo
- emite apenas JSON sanitizado com agregados

Comando padrao:

```bash
AIRTRUST_STAGING_TOKEN=... \
node scripts/staging/collect-sigvoos-shadow-compare-7d.mjs --day-label day-0
```

## Metricas a registrar por dia

- `recommendation.status`
- `recommendation.reasons`
- `previewStagingRecords`
- `cvFlights`
- `cvStages`
- `cvCrew`
- `frmsJourneysSigvoos`
- `frmsAlertsSigvoos`
- `openIntegrationConflicts`
- `missingFields`
- `normalizationErrors`
- `byDateAllMatch`
- `byBaseAllMatch`
- `byAircraftAllMatch`

## Critérios de acompanhamento

Sinal verde diario:

- `recommendation.status=READY`
- `recommendation.reasons=[]`
- `openIntegrationConflicts=0`
- agregados `byDate`, `byBase` e `byAircraft` todos em `MATCH`

Sinal amarelo:

- `normalizationErrors` permanece limitado a `FRMS_FLIGHT_TYPE_DIMENSION_UNAVAILABLE`
- sem novos conflitos abertos
- sem deltas agregados

Sinal vermelho:

- retorno de `OPEN_INTEGRATION_CONFLICTS`
- retorno de `NON_ZERO_AGGREGATE_DELTAS`
- regressao de auth/RBAC/tenant scoping
- `missingFields` nao vazio
- qualquer necessidade de tocar producao para manter o experimento

## Readiness ao fim dos 7 dias

Ao final do periodo, considerar a leitura de readiness do shadow mode como sustentada somente se:

- os 7 snapshots diarios preservarem `READY`
- `openIntegrationConflicts` permanecer em `0`
- nao houver reintroducao de deltas agregados
- o endpoint permanecer read-only e tenant-scoped

Isso nao equivale a aprovacao regulatoria nem a virada canonica de fonte.

## Seguranca

Confirmado:

- sem producao
- sem production deploy
- sem migration
- sem source policy
- sem CV->FRMS canônico
- sem sync real
