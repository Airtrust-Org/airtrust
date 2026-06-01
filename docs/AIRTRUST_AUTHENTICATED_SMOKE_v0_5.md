# AirTrust Authenticated Operational Smoke v0.5

## 1) Objetivo

Validar fluxos críticos operacionais após mudanças/deploys sem alterar regra de negócio:

- autenticação e contexto de tenant;
- FRMS/fadiga diária (read-only);
- EVD (read-only);
- simuladores (read-only);
- qualificações (read-only);
- health/version.

## 2) Variáveis necessárias

- `AIRTRUST_BASE_URL` (default: `https://api.airtrust.online`)
- `AIRTRUST_AUTH_TOKEN` (Bearer) **ou** `AIRTRUST_COOKIE`
- `AIRTRUST_PUBLIC_ONLY=YES` para rodar apenas endpoints públicos

Variáveis de write (opcional e bloqueada por padrão):

- `AIRTRUST_ALLOW_SMOKE_WRITES=YES`
- `AIRTRUST_RUN_FRMS_FAIL_SAFE=YES`
- se base for produção: `AIRTRUST_CONFIRM_PROD_SMOKE_WRITES="I understand this will create test data in production"`

## 3) Como rodar read-only

Sem autenticação (público):

```bash
AIRTRUST_PUBLIC_ONLY=YES bash scripts/smoke-authenticated-operational.sh
```

Autenticado:

```bash
AIRTRUST_AUTH_TOKEN="..." bash scripts/smoke-authenticated-operational.sh
```

ou

```bash
AIRTRUST_COOKIE="..." bash scripts/smoke-authenticated-operational.sh
```

## 4) Interpretação dos resultados

- Cada etapa imprime endpoint, método e HTTP status.
- Qualquer status fora do esperado interrompe a execução (`exit 1`).
- Sem credenciais no modo autenticado, o script falha cedo com instrução clara.

## 5) Proibido em produção

- Rodar mutações sem confirmação explícita.
- Rodar smoke com writes sem checklist de risco.
- Executar comandos manuais destrutivos fora do wrapper operacional.

## 6) FRMS fail-safe (apenas staging/teste)

Quando liberado, o script testa payload incompleto em `POST /api/frms/daily-fatigue` e espera erro de validação (`400`/`422`).

Recomendação: manter `AIRTRUST_ALLOW_SMOKE_WRITES=NO` em produção.

## 7) Checklist pós-deploy

1. `AIRTRUST_PUBLIC_ONLY=YES` (health/version)
2. Smoke autenticado read-only
3. Confirmar módulos críticos com HTTP 200
4. Verificar ausência de mutações não autorizadas
