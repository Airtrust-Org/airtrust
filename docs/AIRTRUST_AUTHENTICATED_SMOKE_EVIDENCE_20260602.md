# AirTrust Authenticated Smoke Evidence - 2026-06-02

## Escopo

Evidencia sanitizada do gate pre-segunda empresa para smoke operacional da empresa real atual.

- Branch: `main`
- HEAD inicial: `230135841c93074bd5d27b48078d43589a32b99b`
- `origin/main` inicial: `230135841c93074bd5d27b48078d43589a32b99b`
- Divergencia inicial `origin/main...HEAD`: `0 0`
- Base URL: `https://api.airtrust.online`
- APP_VERSION em producao: `2026-06-02T13:50:46Z-abf9002`
- Deploy neste sprint: nao executado
- Writes: zero writes executados

## Controle de Credencial

- `AIRTRUST_AUTH_TOKEN`: nao presente no ambiente
- `AIRTRUST_COOKIE`: nao presente no ambiente
- Modo autenticado: `SKIPPED_AUTH_REQUIRED`
- Token/cookie registrados nesta evidencia: nao
- PII registrada nesta evidencia: nao

Nao foi executado smoke autenticado porque nao havia credencial no ambiente. Nenhuma credencial foi solicitada, inventada, gravada ou exibida.

## Validacao Public-Only

Comando:

```bash
AIRTRUST_PUBLIC_ONLY=YES bash scripts/smoke-authenticated-operational.sh
```

Resultado: `PASS`

| Endpoint | Metodo | HTTP | Resultado |
| --- | --- | --- | --- |
| `/api/version` | GET | 200 | PASS |
| `/api/health` | GET | 200 | PASS |
| `/api/assets/fira/123/test.pdf` | GET | 404, `application/json` | PASS |

Resumo sanitizado: `PASS=3 FAIL=0 SKIPPED=0`

## Validacao Sem Credencial

Comando:

```bash
env -u AIRTRUST_AUTH_TOKEN -u AIRTRUST_COOKIE bash scripts/smoke-authenticated-operational.sh
```

Resultado: `PASS` para probes publicos e `SKIPPED_AUTH_REQUIRED` para smoke autenticado.

| Endpoint | Metodo | HTTP | Resultado |
| --- | --- | --- | --- |
| `/api/version` | GET | 200 | PASS |
| `/api/health` | GET | 200 | PASS |
| `/api/assets/fira/123/test.pdf` | GET | 404, `application/json` | PASS |
| Smoke autenticado read-only | n/a | n/a | SKIPPED_AUTH_REQUIRED |

Resumo sanitizado: `PASS=3 FAIL=0 SKIPPED=1`

## Smoke Autenticado Read-Only

Resultado: `SKIPPED_AUTH_REQUIRED`

Motivo: nenhuma credencial (`AIRTRUST_AUTH_TOKEN` ou `AIRTRUST_COOKIE`) estava presente no ambiente.

Endpoints autenticados nao executados:

- `GET /api/auth/me`
- `GET /api/auth/empresas`
- `GET /api/dashboard/metrics`
- `GET /api/frms/daily-fatigue`
- `GET /api/evd?data=<hoje>`
- `GET /api/simuladores/sessoes?limit=1`
- `GET /api/qualificacoes/historico?limit=1`
- `GET /api/funcionarios?limit=1`

## Validacao de Empresa Esperada

Status: `SKIPPED_AUTH_REQUIRED`

Motivo: sem credencial autenticada, `GET /api/auth/empresas` nao foi executado e nao foi possivel validar `AIRTRUST_EXPECTED_EMPRESA_ID` ou `AIRTRUST_EXPECTED_EMPRESA_CODIGO`.

## Probe de Assets

Status: `PASS`

`GET /api/assets/fira/123/test.pdf` retornou HTTP `404` com corpo `application/json`, sem PDF/documento publico.

## Gate Pre-Segunda Empresa

Status: `PENDENTE`

O gate tecnico publico passou, mas a criacao da segunda empresa real continua bloqueada ate executar smoke autenticado read-only com credencial autorizada e validar a empresa esperada.

## Itens Pendentes

- Executar `bash scripts/smoke-authenticated-operational.sh` com `AIRTRUST_AUTH_TOKEN` ou `AIRTRUST_COOKIE` em ambiente seguro.
- Preferencialmente informar `AIRTRUST_EXPECTED_EMPRESA_ID` ou `AIRTRUST_EXPECTED_EMPRESA_CODIGO`.
- Registrar nova evidencia sanitizada com o resultado autenticado.
- Somente depois disso avaliar criacao da segunda empresa real.
