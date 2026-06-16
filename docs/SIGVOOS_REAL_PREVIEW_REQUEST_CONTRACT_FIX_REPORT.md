# SIGVOOS Real Preview Request Contract Fix Report

## Veredito

`SIGVOOS REAL API PREVIEW COM RESSALVAS`

A correção do contrato read-only do endpoint `POST /api/controle-voos/sigvoos/real-preview` foi implementada localmente, coberta por testes e mantida sem escrita em banco, sem migration e sem acoplamento com FRMS. A chamada real autenticada ainda nao foi repetida nesta etapa porque o foco foi corrigir o contrato antes de uma nova validacao em producao.

## Causa Raiz

O parser de request do preview real aceitava apenas os campos legados:

- `from`
- `to`
- `pageSize`
- `maxPages`

Quando a chamada autenticada real usou o body seguro:

```json
{"window":{"days":1},"limit":10}
```

o parser rejeitou `window` e `limit` com `CONTROLE_VOOS_SIGVOOS_REAL_PREVIEW_FIELD_FORBIDDEN` antes da chamada util ao provider SIGVOOS.

## Contrato Corrigido

Contrato read-only permitido:

- `window.days`
- `limit`

Regras aplicadas:

- `window.days`: inteiro positivo com maximo de `3`
- `limit`: inteiro positivo com maximo de `10`
- `maxPages`: fixado internamente em `1`
- tenant continua vindo apenas da sessao autenticada
- chamada continua read-only
- resposta continua sanitizada

## Campos Permitidos

- top-level `window`
- top-level `limit`
- nested `window.days`

## Campos Proibidos

- `empresaId`
- `empresa_id`
- `tenantId`
- `tenant_id`
- qualquer campo desconhecido fora de `window` e `limit`
- qualquer campo desconhecido dentro de `window`
- campos legados de request publico (`from`, `to`, `pageSize`, `maxPages`)

## Confirmacoes De Seguranca

- escrita em `cv_voos`: `NAO`
- escrita em `cv_voo_etapas`: `NAO`
- escrita em `cv_voo_tripulantes`: `NAO`
- escrita em `cv_sigvoos_staging`: `NAO`
- escrita em `cv_conflitos_integracao`: `NAO`
- `INSERT/UPDATE/DELETE` no servico de preview real: `NAO`
- migrations aplicadas: `NAO`
- `wrangler d1 migrations apply` executado: `NAO`
- reexecucao 0410/0411: `NAO`
- FRMS alterado: `NAO`
- `frms-source-policy.ts` alterado: `NAO`
- payload real bruto registrado: `NAO`
- token impresso ou commitado: `NAO`

## Testes E Validacoes

- `cd worker-airtrust && npx vitest run src/__tests__/routes/controle-voos.test.ts`: `PASS`
- `npx tsc --noEmit --pretty false`: `PASS`
- `npm run build`: `PASS`
- `git diff --check`: `PASS`
- `bash scripts/check-tracked-secrets.sh`: `PASS`
- `bash scripts/validation/audit-deploy-scripts.sh`: `PASS` como inventario
- `bash scripts/audit-dangerous-ops.sh`: `PASS`

Cobertura adicionada/ajustada no teste de rota:

- aceita body seguro `{"window":{"days":1},"limit":10}`
- rejeita `empresaId`
- rejeita `tenantId`
- rejeita janela grande
- rejeita `limit` alto
- rejeita campos legados fora do contrato seguro
- bloqueia usuario comum
- confirma ausencia de DML no servico
- confirma isolamento de FRMS e ausencia de `frms-source-policy.ts`
- chamada real continua mockada

## Proxima Recomendacao

1. Abrir e mergear esta correção documental e de contrato.
2. Publicar o Worker por fluxo controlado, sem migrations e sem sync real, se o ambiente publicado ainda estiver com o contrato antigo.
3. Repetir uma unica chamada autenticada read-only com:

```json
{"window":{"days":1},"limit":10}
```

4. Registrar apenas metadados sanitizados da resposta real e confirmar novamente ausencia total de escrita em `cv_*` e de impacto em FRMS.
