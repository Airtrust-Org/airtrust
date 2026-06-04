# AirTrust — DQ01 Staging Rollback Plan 2026-06-04

**Data:** 2026-06-04  
**Branch:** `main`  
**HEAD base:** `5c4c690`  
**Modo:** rollback documentado para janela `DQ-01` em `staging`. Sem produção. Sem deploy.

## 1. Escopo

Este rollback cobre apenas a janela controlada de `DQ-01` em `staging`, restrita ao alinhamento inequívoco de soft delete em `funcionarios`.

Fora de escopo:

- `MIG-01`
- apply da `0389`
- deploy funcional
- qualquer ação em produção

## 2. Snapshot associado

- **SQL dump pré-janela:** `worker-airtrust/.wrangler/state/v3/d1/controlled-execution-snapshots/staging/dq01-staging-pre-window-20260604T190420Z.sql`
- **SQLite derivado para diagnóstico:** `worker-airtrust/.wrangler/state/v3/d1/controlled-execution-snapshots/staging/dq01-staging-pre-window-20260604T190420Z.sqlite`
- **SHA-256 do dump SQL:** `fb609db3c6783d0a101e17204eb85244a1d375a599a3c66a37ed8d96b42f8f1b`
- **Integridade local do snapshot SQLite:** `PRAGMA integrity_check = ok`
- **Total de tabelas restauradas localmente:** `226`

## 3. Como restaurar o snapshot

Restauro remoto somente se a janela falhar ou se a validação pós-execução indicar divergência fora do plano aprovado.

Comando planejado de rollback:

```bash
cd /Users/filipedaumas/SAAS/Airtrust/worker-airtrust
npx wrangler d1 execute airtrust-db-staging --env staging --remote \
  --file /Users/filipedaumas/SAAS/Airtrust/worker-airtrust/.wrangler/state/v3/d1/controlled-execution-snapshots/staging/dq01-staging-pre-window-20260604T190420Z.sql
```

Observações:

- este comando não foi executado nesta janela;
- ele restaura o dump pré-janela integral, portanto deve ser usado apenas em cenário de abort/rollback aprovado;
- nenhuma referência de secret é necessária na documentação; a autenticação já fica fora do repositório.

## 4. Critérios de rollback

Executar rollback se ocorrer qualquer um destes:

1. divergência entre a contagem esperada do snapshot e a contagem pré-execução em `staging`;
2. quantidade alterada diferente da quantidade planejada;
3. validações pós-execução falharem;
4. surgir evidência de mutação fora do domínio `funcionarios`;
5. aparecer risco de target incorreto.

## 5. Validação pós-rollback

Após restaurar:

1. rerodar a checagem read-only de tabelas (`226` esperado como referência desta janela);
2. rerodar `bash scripts/run-dq01-staging-backfill-readonly.sh`;
3. confirmar `PRAGMA integrity_check = ok` na cópia SQLite derivada do dump, se uma nova cópia local for regenerada;
4. registrar somente contagens agregadas, sem PII.

## 6. Aprovação do rollback

- **Quem aprova o rollback:** mesmo aprovador da janela `DQ01-STAGING-20260604-FILIPE` ou operador explicitamente delegado na mesma cadeia de aprovação
- **Quem executa:** operador humano com autorização explícita para `staging`

## 7. Evidência de testabilidade

O snapshot desta janela foi validado localmente sem tocar o target remoto:

- restauração SQLite local do dump SQL: `exit code 0`
- `PRAGMA integrity_check = ok`
- `226` tabelas visíveis após restauração

Isso confirma que o ponto de restauração pré-janela é legível e reexecutável.
