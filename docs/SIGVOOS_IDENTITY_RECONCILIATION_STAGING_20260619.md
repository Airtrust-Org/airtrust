# SIGVOOS Identity Reconciliation Staging 2026-06-19

Data: 2026-06-19

## Escopo

- Worktree limpo criado a partir de `origin/main`.
- Validacao publica e autenticada do `shadow-compare` em `staging`.
- Auditoria do unico conflito remanescente de identidade.
- Reconciliacao apenas em `staging`, com rollback definido e sem tocar producao.

## Guardrails respeitados

- Sem producao.
- Sem deploy de `production`.
- Sem migration.
- Sem alteracao em `frms-source-policy.ts`.
- Sem adaptador `CV -> FRMS`.
- Sem sync SIGVOOS real.
- Sem PII, tokens, senhas, cookies ou secrets neste relatorio.

## Baseline validado

Publico:

- `/api/version`: `environment=staging`
- `/api/health`: `healthy`
- `shadow-compare` sem token: `401 MISSING_TOKEN`

Autenticado:

- role efetiva `GESTOR`
- tenant `906`
- `tenantScoped=true`
- `writesEnabled=false`

Estado antes da reconciliacao, para `2026-06-12..2026-06-18`:

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

## Evidencia auditada

O conflito remanescente era um unico caso com:

- `staff.id=8899`
- `staff.inscription=01234`
- `import_status=CONFLICT`
- `cv_tripulante_id=NULL`

Evidencia objetiva encontrada:

1. O mapeamento historico que fazia `staff.id=8899` apontar para outro funcionario nao veio de uma fonte operacional externa.
2. Esse mapeamento foi introduzido pelo suporte sintetico do proprio validador remoto em `worker-airtrust/src/services/controle-voos/sigvoos-staging-remote-validation.ts`.
3. O catalogo sintetico do tenant `906` define a matricula `01234` para um funcionario diferente do usado no mapeamento historico artificial.
4. O conflito aberto e a staging row em `CONFLICT` derivam exatamente desse artefato sintetico.
5. Os dois registros ativos comparados no staging nao compartilham matricula, codigo ANAC nem nome, portanto isto nao se comporta como duplicidade cadastral.

## Classificacao obrigatoria

`E) Staging sintético inconsistente`

Explicacao:

- a divergencia foi criada pelo seed/validador sintetico de staging;
- o conflito nao representa uma colisao confirmada de identidade vinda da fonte operacional;
- havia evidencia suficiente para corrigir apenas o artefato sintetico, sem promover nenhuma regra canônica nova.

## Acao tomada em staging

Arquivo versionado:

- `scripts/staging/reconcile-sigvoos-synthetic-staff-conflict-8899.mjs`

Acao aplicada:

- corrigido apenas o mapeamento historico sintetico que sustentava o conflito;
- criada a associacao faltante para a staging row conflitante;
- conflito marcado como `IGNORADO` por ser artefato sintetico de staging;
- staging row promovida de `CONFLICT` para `PROCESSED`.

Reversibilidade:

- o script inclui `--dry-run`, `--apply` e `--rollback`;
- o rollback restaura o mapeamento sintético anterior, reabre o conflito e devolve a staging row a `CONFLICT`.

## Shadow-compare final

Janela validada: `2026-06-12..2026-06-18`

Estado autenticado final:

- `tenantScoped=true`
- `writesEnabled=false`
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

## Antes / depois

| Metrica | Antes | Depois |
| --- | --- | --- |
| `recommendation.status` | `PARTIAL` | `READY` |
| `recommendation.reasons` | `["OPEN_INTEGRATION_CONFLICTS"]` | `[]` |
| `openIntegrationConflicts` | `1` | `0` |
| `cv_tripulante_id` na staging row conflitante | ausente | presente |
| `import_status` da staging row conflitante | `CONFLICT` | `PROCESSED` |
| `cvCrew` | `5` | `6` |
| `NON_ZERO_AGGREGATE_DELTAS` | ausente | ausente |

## Readiness

Status final:

- `READY`

Razoes finais:

- nenhuma

Observacao:

- `FRMS_FLIGHT_TYPE_DIMENSION_UNAVAILABLE` continua em `normalizationErrors`, mas nao bloqueia o readiness deste comparador.

## Operacao e limpeza

- manager temporario criado apenas em `staging`
- `/api/auth/me` validado com role `GESTOR`
- manager temporario removido ao final
- refresh token removido ao final
- vinculo temporario removido ao final
- `AIRTRUST_STAGING_TOKEN` e `AIRTRUST_STAGING_COOKIE` limpos do shell

## Seguranca

Confirmado:

- sem producao
- sem production deploy
- sem migration
- sem source policy
- sem CV->FRMS canônico
- sem sync real
