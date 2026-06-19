# SIGVOOS / Controle de Voos Shadow Compare Staging Readiness

Data: 2026-06-19

## Escopo

- Worktree limpo criado a partir de `origin/main`.
- Revalidacao do endpoint `shadow-compare` em `staging`.
- Reexecucao autenticada com RBAC `manager` e tenant `906`.
- Investigacao do conflito remanescente `staff.id` versus `staff.inscription`.
- Correcao apenas do comparador read-only do Worker.
- Deploy apenas em `staging`.

## Guardrails respeitados

- Nenhuma acao em producao.
- Nenhuma migration.
- Nenhuma alteracao em `frms-source-policy.ts`.
- Nenhum adaptador `CV -> FRMS`.
- Nenhuma mudanca de fonte canonica.
- Nenhum secret, token, cookie ou PII exposto neste relatorio.

## Validacao inicial de staging

- `GET /api/version`: `environment=staging`
- `GET /api/health`: `healthy`
- `GET /api/controle-voos/sigvoos/shadow-compare?...` sem token: `401 MISSING_TOKEN`

## Auth / RBAC

- Foi criado um manager temporario apenas em `staging` para o tenant `906`.
- `GET /api/auth/me` confirmou acesso com role efetiva `GESTOR`.
- O manager temporario foi removido ao final.
- Refresh token removido e vinculo `usuarios_empresas` removido ao final.

## Estado confirmado antes da correcao

Janela validada: `2026-06-12` a `2026-06-18`

- `tenantScoped=true`
- `writesEnabled=false`
- `recommendation.status=PARTIAL`
- `recommendation.reasons`:
  - `OPEN_INTEGRATION_CONFLICTS`
  - `NON_ZERO_AGGREGATE_DELTAS`
- `previewStagingRecords=7`
- `cvFlights=7`
- `cvStages=8`
- `cvCrew=5`
- `frmsJourneysSigvoos=4`
- `frmsAlertsSigvoos=0`
- `openIntegrationConflicts=1`
- `missingFields=[]`
- `normalizationErrors=["FRMS_FLIGHT_TYPE_DIMENSION_UNAVAILABLE"]`

Divergencias agregadas observadas antes da correcao:

- por data:
  - `2026-06-13`: `cv=1`, `frms=1`, `delta=0`
  - `2026-06-14`: `cv=6`, `frms=3`, `delta=3`
- por base:
  - `SBMI`: `cv=1`, `frms=1`, `delta=0`
  - `SBRJ`: `cv=5`, `frms=2`, `delta=3`
  - `SBSP`: `cv=2`, `frms=1`, `delta=1`
- por aeronave:
  - match para `ATX-MAP`, `ATX7001`, `ATX7002`, `ATX7006`
  - divergencia para `ATX7210`, `ATX7218`, `ATX7220`

## Investigacao do conflito remanescente

Conflito preservado em `staging`:

- `campo=funcionario_id`
- `status=ABERTO`
- `justificativa=staff.id e staff.inscription resolvidos para funcionarios diferentes`

Evidencia consolidada:

- `staff.id=8899` resolve para um funcionario.
- `staff.inscription=01234` resolve para outro funcionario.
- O conflito permanece aberto e vinculado ao voo que explica `ATX7218`.

Classificacao:

- Nao e bug do comparador.
- Nao ha evidencia suficiente para reconciliar automaticamente sem risco.
- Deve permanecer como divergencia real de identidade em `staging`.

## Causa raiz dos deltas agregados

O comparador estava cruzando granularidades diferentes:

- lado CV: voos e etapas
- lado FRMS: jornadas unicas por `tripulante_id + data`

Como `frms_jornada` em `staging` possui unicidade por `tripulante_id + data`, varios voos do mesmo tripulante no mesmo dia colapsam na mesma jornada FRMS. Isso fazia o compare marcar delta onde nao havia divergencia real de comparabilidade.

Exemplo na janela auditada:

- `ATX7210` e `ATX7220` nao estavam faltando no seed comparavel
- eles estavam representados no mesmo bucket diario de jornada
- o delta vinha do algoritmo de comparacao, nao de ausencia de dado comparavel

## Correcao aplicada

Arquivo alterado:

- `worker-airtrust/src/services/controle-voos/sigvoos-shadow-compare.ts`

Resumo:

- o lado CV passou a ser agregado em unidades comparaveis de jornada
- a agregacao agora parte de `funcionario_id + data_programacao`
- base e aeronave passam a usar o voo/etapa representativos desse bucket comparavel
- os totais brutos continuam inalterados

Teste adicionado:

- `worker-airtrust/src/__tests__/routes/controle-voos.test.ts`
- cobre o caso de varios voos do mesmo tripulante no mesmo dia sem penalizar o readiness quando as jornadas equivalentes batem

## Validacoes locais

- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `git diff --check`
- `npm run guard:tracked-secrets`
- `npm run ops:guard`
- `cd worker-airtrust && npx vitest run src/__tests__/routes/controle-voos.test.ts`

Todas passaram.

## Deploy realizado

- Deploy apenas do Worker de `staging`.
- Nenhum deploy em `production`.

## Shadow-compare final em staging

Janela validada: `2026-06-12` a `2026-06-18`

Estado autenticado final:

- `role=GESTOR`
- `tenantScoped=true`
- `writesEnabled=false`
- `recommendation.status=PARTIAL`
- `recommendation.reasons=["OPEN_INTEGRATION_CONFLICTS"]`
- `previewStagingRecords=7`
- `cvFlights=7`
- `cvStages=8`
- `cvCrew=5`
- `frmsJourneysSigvoos=4`
- `frmsAlertsSigvoos=0`
- `openIntegrationConflicts=1`
- `missingFields=[]`
- `normalizationErrors=["FRMS_FLIGHT_TYPE_DIMENSION_UNAVAILABLE"]`

Divergencias finais:

- por data:
  - `2026-06-13`: `cv=1`, `frms=1`, `delta=0`, `MATCH`
  - `2026-06-14`: `cv=3`, `frms=3`, `delta=0`, `MATCH`
- por base:
  - `SBMI`: `cv=1`, `frms=1`, `delta=0`, `MATCH`
  - `SBRJ`: `cv=2`, `frms=2`, `delta=0`, `MATCH`
  - `SBSP`: `cv=1`, `frms=1`, `delta=0`, `MATCH`
- por aeronave:
  - `ATX-MAP`: `cv=1`, `frms=1`, `delta=0`, `MATCH`
  - `ATX7001`: `cv=1`, `frms=1`, `delta=0`, `MATCH`
  - `ATX7002`: `cv=1`, `frms=1`, `delta=0`, `MATCH`
  - `ATX7006`: `cv=1`, `frms=1`, `delta=0`, `MATCH`

## Antes / depois

| Item | Antes | Depois |
| --- | --- | --- |
| recommendation.status | `PARTIAL` | `PARTIAL` |
| reasons | `OPEN_INTEGRATION_CONFLICTS`, `NON_ZERO_AGGREGATE_DELTAS` | `OPEN_INTEGRATION_CONFLICTS` |
| byDate `2026-06-14` | `cv=6`, `frms=3`, `delta=3` | `cv=3`, `frms=3`, `delta=0` |
| byBase `SBRJ` | `cv=5`, `frms=2`, `delta=3` | `cv=2`, `frms=2`, `delta=0` |
| byAircraft | havia deltas artificiais | todos os buckets comparaveis em `MATCH` |
| conflito de identidade | aberto | aberto |

## Veredito

`PARTIAL` justificado e correto.

O readiness nao pode ser promovido para `READY` porque ainda existe um conflito real de identidade `staff.id` versus `staff.inscription`. O bloqueio falso de agregacao foi removido com seguranca.
