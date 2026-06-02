# AirTrust Authenticated Smoke Evidence - 2026-06-02

## Escopo

Evidencia sanitizada do Launch Gate final antes da segunda empresa real.

- Branch: `main`
- HEAD do gate: `f9adfa2c8fcd4041ca86c82414b114e5b2e1bbe0`
- `origin/main`: `f9adfa2c8fcd4041ca86c82414b114e5b2e1bbe0`
- Divergencia `origin/main...HEAD`: `0 0`
- Base URL: `https://api.airtrust.online`
- APP_VERSION em producao: `2026-06-02T17:36:07Z-a543132`
- Deploy neste gate: nao executado
- Writes: zero writes executados por Codex

## Controle de Credencial

- Senha registrada nesta evidencia: nao
- Token/cookie registrado nesta evidencia: nao
- E-mail, nome, usuario, funcionario, FRMS, qualificacao ou payload bruto registrado: nao
- `AIRTRUST_AUTH_TOKEN` no ambiente Codex: nao presente
- `AIRTRUST_COOKIE` no ambiente Codex: nao presente
- `AIRTRUST_EXPECTED_EMPRESA_ID/CODIGO` no ambiente Codex: nao presente

Codex nao coletou credenciais e nao reexecutou login autenticado interativo nesta sessao. A evidencia autenticada abaixo foi informada pelo operador como resultado manual sanitizado de `npm run smoke:auth:login`.

## Smoke Public-Only Codex

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

## Smoke Autenticado Manual Operador

Comando operacional usado pelo operador:

```bash
npm run smoke:auth:login
```

Resultado sanitizado informado:

| Check | Resultado |
| --- | --- |
| Login efemero | LOGIN_OK |
| Auth mode | token ou cookie, valor nao registrado |
| Auth me | PASS |
| Auth empresas | PASS |
| Dashboard metrics | PASS |
| FRMS daily fatigue | PASS |
| EVD daily | PASS |
| Simuladores sessoes | PASS |
| Qualificacoes historico | PASS |
| Funcionarios | PASS |
| Assets private FIRA probe | PASS, HTTP 404 |
| Writes habilitados | NO |
| Resumo sanitizado | `PASS=11 FAIL=0 SKIPPED=2` |

Nenhum token, cookie, senha, e-mail, nome, ID de usuario, payload bruto ou PII foi registrado.

## Validacao de Empresa Esperada

Status: `NAO VALIDADA POR VARIAVEL EXPLICITA`

Motivo: `AIRTRUST_EXPECTED_EMPRESA_ID` ou `AIRTRUST_EXPECTED_EMPRESA_CODIGO` nao foi informado no ambiente Codex nem registrado na evidencia sanitizada do operador.

Conclusao: smoke autenticado passou, mas a decisao maxima do gate e `CONDITIONAL GO`.

## Probe de Assets

Status: `PASS`

`GET /api/assets/fira/123/test.pdf` retornou HTTP `404` com corpo `application/json`, sem PDF/documento publico.

## Resultado do Gate Autenticado

Status: `PASS COM PENDENCIA CONTROLADA`

Pendencia restante:

- validar empresa esperada por `AIRTRUST_EXPECTED_EMPRESA_ID` ou `AIRTRUST_EXPECTED_EMPRESA_CODIGO`, ou registrar aprovacao formal da excecao antes de liberar acesso do cliente.
