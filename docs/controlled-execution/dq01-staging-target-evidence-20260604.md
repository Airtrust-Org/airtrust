# AirTrust — DQ01 Staging Target Evidence 2026-06-04

**Data:** 2026-06-04  
**Branch:** `main`  
**HEAD base:** `5c4c690`  
**Modo:** `staging`, com D1 remoto apenas para snapshot/read-only/backfill controlado de `DQ-01`. Sem deploy. Sem `MIG-01`. Sem `0389`. Sem produção.

## 1. Target escolhido

- **Nome do target:** `staging`
- **Ambiente Cloudflare Worker:** `airtrust-api-staging`
- **Binding D1:** `DB`
- **Database name:** `airtrust-db-staging`
- **Database id:** `b7f50907-c110-45f5-ad17-e97ea47f2826`
- **Origem da evidência:** `worker-airtrust/wrangler.toml` no bloco `[env.staging]`
- **Finalidade:** janela controlada de `DQ-01 staging controlled backfill`

## 2. Confirmação anti-produção

- `worker-airtrust/wrangler.toml` separa explicitamente:
  - `staging` -> `airtrust-api-staging` / `airtrust-db-staging`
  - `production` -> `airtrust-api-production` / `airtrust-db`
- o target desta janela não usa o database name de produção;
- não há `deploy` acoplado à janela;
- `MIG-01` e `0389` permanecem fora de escopo;
- logs e documentação desta janela usam apenas contagens agregadas e referências sem PII.

## 3. Approval e responsável

- **Approval id:** `DQ01-STAGING-20260604-FILIPE`
- **Responsável pela janela:** `Filipe / workspace owner`
- **Responsável técnico pela execução nesta etapa:** `Codex GPT-5`
- **Restrições confirmadas:** sem PII em logs/docs, sem deploy, sem produção, sem `MIG-01`, sem `0389`

## 4. Evidência operacional mínima

Checagem read-only executada antes da janela:

```text
SELECT COUNT(*) AS total_tables
FROM sqlite_master
WHERE type='table'
  AND name NOT LIKE 'sqlite_%'
  AND name NOT LIKE '_cf_%';
```

Resultado agregado:

- **Total de tabelas visíveis:** `226`
- **Mutação na checagem:** `não`

## 5. Comandos seguros desta janela

- **Readonly:** `bash scripts/run-dq01-staging-backfill-readonly.sh`
- **Mutante:** `bash scripts/run-dq01-staging-backfill-apply.sh`

Ambos continuam subordinados ao contrato `AIRTRUST_CONTROLLED_*`, exigem target `staging`, não fazem deploy e não executam `MIG-01` nem `0389`.
