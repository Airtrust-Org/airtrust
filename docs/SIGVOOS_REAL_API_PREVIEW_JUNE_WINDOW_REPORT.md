# SIGVOOS Real API Preview June Window Report

## Veredito

`BLOQUEADO`

`BLOQUEADO — VALIDACAO REAL SIGVOOS SEM CREDENCIAL NESTA SESSAO`

O Worker de producao foi publicado com a ampliacao read-only do contrato do endpoint `POST /api/controle-voos/sigvoos/real-preview` para aceitar a janela explicita de junho. A validacao autenticada real nao foi executada porque esta sessao nao tinha `AIRTRUST_AUTH_TOKEN`, nao tinha `AIRTRUST_COOKIE` e o navegador in-app abriu `https://airtrust.online/login`, sem sessao reutilizavel autenticada.

## Escopo Executado

- Contrato read-only publicado:
  - `from`
  - `to`
  - `limit`
- Regras mantidas:
  - `limit <= 10`
  - janela maxima de `31` dias
  - `to` nao pode ser futuro
  - `maxPages = 1` fixado internamente
  - tenant somente pela sessao
  - `empresaId`, `empresa_id`, `tenantId`, `tenant_id` proibidos
  - campos desconhecidos proibidos
- Compatibilidade preservada para o POST vazio usado no refresh seguro do frontend.

## Validacoes Locais

- `cd worker-airtrust && npx vitest run src/__tests__/routes/controle-voos.test.ts`: `PASS`
- `npx tsc --noEmit --pretty false`: `PASS`
- `npm run build`: `PASS`
- `git diff --check`: `PASS`
- `bash scripts/check-tracked-secrets.sh`: `PASS`
- `bash scripts/validation/audit-deploy-scripts.sh`: `PASS`
- `bash scripts/audit-dangerous-ops.sh`: `PASS`

Cobertura confirmada em teste de rota:

- aceita `{"from":"2026-06-01","to":"2026-06-16","limit":10}`
- rejeita `to` futuro
- rejeita janela maior que `31` dias
- rejeita `limit > 10`
- rejeita `empresaId`
- rejeita `tenantId`
- rejeita campos desconhecidos
- bloqueia usuario comum
- bloqueia chamada anonima
- confirma ausencia de DML
- confirma isolamento de FRMS
- confirma ausencia de import/alteracao de `frms-source-policy.ts`

## Deploy Do Worker

- Branch/merge aplicado em `main`: PR #57
- Merge commit: `48bcabb54d53c6420b2b3d27c2ab7808dbd6be93`
- Worker publicado: `SIM`
- Versao publicada:
  - `version=2026-06-16T15:55:34Z-48bcabb5`
  - `builtAt=2026-06-16T15:55:34Z`
  - `deploymentId=2026-06-16T15:55:34Z-48bcabb5`
- Current Version ID Cloudflare: `2562ba60-70e7-4a76-b71c-c5b163eab837`

Confirmacoes operacionais:

- `wrangler d1 migrations apply`: `NAO`
- `wrangler d1 execute` com DDL/DML: `NAO`
- migrations aplicadas: `NAO`
- Pages publicado: `NAO`

## Backend Publicado

Health:

- `success=true`
- `status=healthy`
- `environment=production`
- `version=2026-06-16T15:55:34Z-48bcabb5`

Version endpoint:

- `version=2026-06-16T15:55:34Z-48bcabb5`
- `environment=production`
- `builtAt=2026-06-16T15:55:34Z`

## Autenticacao

Metodo pretendido para a chamada real:

- body: `{"from":"2026-06-01","to":"2026-06-16","limit":10}`
- auth por token efemero de Admin/Gestor

Resultado nesta sessao:

- `AIRTRUST_AUTH_TOKEN`: ausente
- `AIRTRUST_COOKIE`: ausente
- navegador in-app: abriu `https://airtrust.online/login`
- metodo auth efetivamente disponivel: `NENHUM`

## Chamada Anonima

Endpoint:

- `POST https://api.airtrust.online/api/controle-voos/sigvoos/real-preview`

Body enviado:

```json
{"from":"2026-06-01","to":"2026-06-16","limit":10}
```

Resultado:

- HTTP `401`
- `code=MISSING_TOKEN`
- conclusao: o endpoint continua protegido para chamada anonima

## Chamada Real SIGVOOS

- API real chamada: `NAO`
- endpoint autenticado chamado: `NAO`
- janela usada: `NAO APLICAVEL`
- status HTTP da chamada autenticada: `NAO APLICAVEL`
- `recordsReceived`: `NAO MEDIDO`
- `candidateFlights`: `NAO MEDIDO`
- `withFlightReportId`: `NAO MEDIDO`
- `withoutFlightReportId`: `NAO MEDIDO`
- `crewWithStaffId`: `NAO MEDIDO`
- `crewWithOnlyInscription`: `NAO MEDIDO`

Cobertura real de campos permanece pendente:

- origem/destino
- horarios
- legs/etapas
- `flight_report.id`
- `report_number`
- `flight_number`
- `staff.id`
- `staff.inscription`
- CANAC
- campos ausentes
- campos extras relevantes

## Baseline Read-Only

Contagens antes e depois da validacao remota permaneceram iguais:

| Tabela | Antes | Depois |
| --- | ---: | ---: |
| `cv_voos` | 0 | 0 |
| `cv_voo_etapas` | 0 | 0 |
| `cv_voo_tripulantes` | 0 | 0 |
| `cv_sigvoos_staging` | 0 | 0 |
| `cv_conflitos_integracao` | 0 | 0 |
| `frms_jornada` | 5262 | 5262 |
| `frms_alerta` | 4899 | 4899 |

Metadados D1 observados nas consultas read-only:

- `changed_db=false`
- `rows_written=0`

## Confirmacoes De Seguranca

- Sync real executado: `NAO`
- Escrita em `cv_voos`: `NAO`
- Escrita em `cv_voo_etapas`: `NAO`
- Escrita em `cv_voo_tripulantes`: `NAO`
- Escrita em `cv_sigvoos_staging`: `NAO`
- Escrita em `cv_conflitos_integracao`: `NAO`
- `INSERT/UPDATE/DELETE` em producao: `NAO`
- FRMS alterado: `NAO`
- `frms-source-policy.ts` alterado: `NAO`
- payload bruto registrado: `NAO`
- token impresso: `NAO`
- credenciais SIGVOOS impressas: `NAO`
- credenciais commitadas: `NAO`

## Recomendacao Objetiva Para Sync Real

Nao executar sync real ainda.

Proximo passo objetivo:

1. Exportar localmente um `AIRTRUST_AUTH_TOKEN` efemero de Admin ou Gestor sem imprimir o valor.
2. Repetir uma unica chamada autenticada read-only com `{"from":"2026-06-01","to":"2026-06-16","limit":10}`.
3. Registrar apenas metadados sanitizados da resposta.
4. Se a chamada continuar com `HTTP 200`, `writesEnabled=false`, contagens `cv_*` e `frms_*` inalteradas e cobertura de campos suficiente, somente entao decidir sobre uma etapa separada de sync real.
