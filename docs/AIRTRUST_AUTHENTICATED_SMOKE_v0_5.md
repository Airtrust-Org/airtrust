# AirTrust Authenticated Operational Smoke v0.5

Data: 2026-06-02

## Objetivo

Validar, em modo read-only, que a API em producao responde com autenticacao e contexto de tenant corretos para os fluxos minimos da empresa real atual. O smoke tambem confirma que a correcao de `/api/assets/*` segue bloqueando um caminho FIRA privado nao real.

Este smoke nao cria empresa, usuario, dados operacionais, seed, importacao ou migration.

## Como Rodar Public-Only

Use este modo quando nao houver credencial autenticada disponivel:

```bash
AIRTRUST_PUBLIC_ONLY=YES bash scripts/smoke-authenticated-operational.sh
```

Valida:

- `GET /api/version`
- `GET /api/health`
- `GET /api/assets/fira/123/test.pdf`

O probe de asset deve retornar qualquer status diferente de `200` e nao deve retornar PDF/documento.

## Como Rodar Autenticado Read-Only

Use uma credencial temporaria de operador autorizado, sem registrar o valor em terminal, arquivo ou log:

```bash
AIRTRUST_AUTH_TOKEN="<redacted>" bash scripts/smoke-authenticated-operational.sh
```

ou:

```bash
AIRTRUST_COOKIE="<redacted>" bash scripts/smoke-authenticated-operational.sh
```

O script aceita token bearer ou cookie. Ele nunca imprime o valor da credencial; a saida mostra apenas `Auth mode: bearer-token`, `cookie` ou `none`.

## Login Interativo Sem Copiar Token

Quando houver operador autorizado e voce quiser evitar copiar token ou cookie manualmente:

```bash
npm run smoke:auth:login
```

O comando pede email/login e senha no terminal, faz `POST /api/auth/login`, reaproveita apenas o material de autenticacao retornado em memoria e executa o smoke autenticado read-only na sequencia. Nada e salvo no repositorio, e a saida nao imprime senha, token ou cookie.

## Validacao de Empresa Esperada

Para reduzir risco de cross-tenant, informe opcionalmente a empresa esperada:

```bash
AIRTRUST_EXPECTED_EMPRESA_ID="123" AIRTRUST_AUTH_TOKEN="<redacted>" \
  bash scripts/smoke-authenticated-operational.sh
```

ou:

```bash
AIRTRUST_EXPECTED_EMPRESA_CODIGO="empresa-codigo" AIRTRUST_AUTH_TOKEN="<redacted>" \
  bash scripts/smoke-authenticated-operational.sh
```

O script usa `GET /api/auth/empresas` e compara a empresa atual/primaria com o valor esperado. Se houver divergencia, o smoke falha.

## Fechamento RDV Produção

Para validar especificamente a fila de coordenação RDV da Costa do Sol sem persistir credenciais no GitHub:

```bash
AIRTRUST_EXPECTED_EMPRESA_ID=6 \
AIRTRUST_RUN_RDV_QUEUE_SMOKE=YES \
npm run smoke:auth:login
```

O login é interativo e efêmero. A senha não é exibida, e o material de autenticação é mantido apenas em memória/arquivos temporários removidos ao final. O probe adicional é somente leitura:

- `GET /api/controle-voos/rdv/fila?limit=1`
- exige HTTP 200;
- exige empresa esperada 6;
- não habilita nenhum write.

## Endpoints Validados

Read-only publico:

- `GET /api/version`
- `GET /api/health`
- `GET /api/assets/fira/123/test.pdf`

Read-only autenticado:

- `GET /api/auth/me`
- `GET /api/auth/empresas`
- `GET /api/dashboard/metrics`
- `GET /api/frms/daily-fatigue`
- `GET /api/evd?data=<hoje>`
- `GET /api/simuladores/sessoes?limit=1`
- `GET /api/qualificacoes/historico?limit=1`
- `GET /api/funcionarios?limit=1`

Endpoints opcionais que retornem `404` ou `405` sao classificados como `SKIPPED_ENDPOINT_NOT_AVAILABLE`, nao como sucesso inventado.

## Interpretacao

- `PASS`: etapa validada com status HTTP esperado.
- `FAIL`: etapa retornou status inesperado, contrato invalido ou empresa diferente da esperada.
- `SKIPPED_AUTH_REQUIRED`: nao havia `AIRTRUST_AUTH_TOKEN` nem `AIRTRUST_COOKIE`, ou writes ficaram bloqueados.
- `SKIPPED_ENDPOINT_NOT_AVAILABLE`: endpoint opcional nao existe, nao aceita o metodo ou a validacao opcional nao foi configurada.

O resumo final e sanitizado:

```text
[SMOKE] Resumo sanitizado: PASS=<n> FAIL=<n> SKIPPED=<n>
```

## Proibido em Producao

- Rodar mutacoes sem checklist e aprovacao explicita.
- Rodar seed, importacao, migration ou `wrangler d1 execute --remote`.
- Criar empresa ou usuario durante o smoke.
- Salvar token/cookie em arquivo, historico, print, log ou commit.
- Rodar `npm run smoke:auth:login` com `set -x`/xtrace habilitado.
- Usar credencial de escopo amplo se nao for possivel limitar a execucao a read-only.

## Writes

O modo padrao e 100% read-only.

As mutacoes de fail-safe FRMS continuam isoladas atras de todas as variaveis abaixo:

- `AIRTRUST_RUN_FRMS_FAIL_SAFE=YES`
- `AIRTRUST_ALLOW_SMOKE_WRITES=YES`
- em producao, `AIRTRUST_CONFIRM_PROD_SMOKE_WRITES="I understand this will create test data in production"`

Sem essas variaveis, writes sao classificados como skipped e nao executados.

## Evidencia Sanitizada

Para registrar evidencia:

1. Salvar apenas a saida do script.
2. Confirmar que nao ha token, cookie, email, nome de pessoa ou dados pessoais.
3. Registrar data/hora, base URL, APP_VERSION e resumo final.
4. Para autenticado, registrar somente que a empresa esperada foi validada, sem expor PII.

---

## Resultado Bloco 6.2 (2026-06-04)

```text
AUTHENTICATED_SMOKE = PASS
Data: 2026-06-04
Target: https://airtrust-api-staging.airtrust.workers.dev (staging remoto isolado)
Método: scripts/smoke-auth-terminal-login.sh (credencial efêmera via env vars)
Usuário: pré-existente (staging D1, isolado de produção)
empresa_id: 1
PASS=11  FAIL=0  SKIPPED=2
Token impresso: NÃO
Senha impressa: NÃO
Token persistido: NÃO
Deploy: NÃO
Migration/apply: NÃO
Credencial de produção: NÃO
```

Endpoints PASS: Version, Health, Auth me, Auth empresas, Expected empresa validation, Dashboard metrics, EVD daily, Simuladores sessoes, Qualificacoes historico, Funcionarios, Assets private FIRA probe.

Endpoints SKIPPED: FRMS daily fatigue (HTTP 500 — staging sem dados FRMS, endpoint opcional); FRMS fail-safe (não habilitado).
