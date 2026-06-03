# AirTrust Authenticated Smoke Evidence - 2026-06-02

**Sprint:** M — Data Quality completo + Smoke com empresa esperada

## Escopo

Evidencia sanitizada do Sprint M, incluindo smoke público baseline e tentativa de smoke com empresa esperada.

- Branch: `main`
- HEAD do gate: `1b496afc1f7e9e1e001c5d734710dbdaf94f22d8`
- `origin/main`: `1b496afc1f7e9e1e001c5d734710dbdaf94f22d8`
- Divergencia `origin/main...HEAD`: `0 0`
- Base URL: `https://api.airtrust.online`
- Deploy neste gate: nao executado
- Writes: zero writes executados

## Controle de Credencial

- Senha registrada nesta evidencia: nao
- Token/cookie registrado nesta evidencia: nao
- E-mail, nome, usuario, funcionario, FRMS, qualificacao ou payload bruto registrado: nao
- `AIRTRUST_AUTH_TOKEN` no ambiente: nao presente
- `AIRTRUST_COOKIE` no ambiente: nao presente
- `AIRTRUST_EXPECTED_EMPRESA_ID` no ambiente: **nao configurado**
- `AIRTRUST_EXPECTED_EMPRESA_CODIGO` no ambiente: **nao configurado**

## Smoke Public-Only (Sprint M)

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

## Smoke Autenticado com Empresa Esperada (Sprint M)

Status: `SKIPPED_EXPECTED_EMPRESA_NOT_CONFIGURED`

Motivo: Nem `AIRTRUST_EXPECTED_EMPRESA_ID` nem `AIRTRUST_EXPECTED_EMPRESA_CODIGO` foram configurados no ambiente. Sem essas variáveis, não é possível validar que o tenant retornado corresponde à empresa esperada.

Para executar, o operador deve configurar uma das variáveis antes de rodar `npm run smoke:auth:login`:

```bash
export AIRTRUST_EXPECTED_EMPRESA_ID="..."
# ou
export AIRTRUST_EXPECTED_EMPRESA_CODIGO="..."
```

## Smoke Autenticado Anterior (Sprint Z.1 — 2026-06-02)

Evidência mantida da execução anterior para referência:

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

## Validacao de Empresa Esperada

Status: `NAO VALIDADA`

- Sprint Z.1: smoke autenticado PASS=11 mas `AIRTRUST_EXPECTED_EMPRESA_ID`/`CODIGO` nao configurado.
- Sprint M: mesma situacao — variaveis continuam nao configuradas.

## Resultado do Gate Autenticado (Sprint M)

Status: `PARTIAL`

- Smoke público: PASS=3 ✅
- Smoke autenticado com empresa esperada: SKIPPED (variáveis não configuradas)
- Smoke autenticado anterior (Z.1): PASS=11 ✅ (sem validação de empresa)

Pendencia restante:

- Configurar `AIRTRUST_EXPECTED_EMPRESA_ID` ou `AIRTRUST_EXPECTED_EMPRESA_CODIGO` e reexecutar `npm run smoke:auth:login`.
- Ou registrar aprovacao formal da excecao antes de liberar acesso do cliente.
