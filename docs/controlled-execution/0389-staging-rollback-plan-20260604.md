# AirTrust - 0389 Staging Rollback Plan - 2026-06-04

**Data:** 2026-06-04  
**Target:** `staging`  
**Escopo:** rollback da aplicacao controlada da `0389_platform_roles_support_access_foundation.sql`

## 1. Criterios de rollback

Executar rollback se ocorrer qualquer um destes:

- objetos da `0389` forem criados parcialmente;
- validacao read-only pos-apply falhar;
- houver evidencia de alteracao fora do escopo aprovado;
- o target nao puder mais ser garantido como `staging`;
- surgir qualquer indicio de producao/deploy/DQ/MIG fora do escopo.

## 2. Responsavel operacional

- operador da janela aprovada com `AIRTRUST_CONTROLLED_APPROVAL` registrado;
- mesma sessao que aplicou a `0389` ou sessao equivalente com acesso auditado ao target `staging`.

## 3. Procedimento de rollback

1. Confirmar que o target continua `staging`.
2. Rodar o diagnostico read-only e registrar o estado atual.
3. Executar somente o SQL de reversao abaixo em `staging`.
4. Rerodar o diagnostico read-only.
5. Confirmar ausencia dos objetos da `0389`.
6. Registrar o resultado no artefato final da janela.

SQL de reversao:

```sql
DROP INDEX IF EXISTS idx_support_access_sessions_request;
DROP INDEX IF EXISTS idx_support_access_sessions_active;
DROP TABLE IF EXISTS support_access_sessions;

DROP INDEX IF EXISTS idx_support_access_grants_lookup;
DROP INDEX IF EXISTS idx_support_access_grants_active_unique;
DROP TABLE IF EXISTS support_access_grants;

DROP INDEX IF EXISTS idx_user_platform_roles_lookup;
DROP INDEX IF EXISTS idx_user_platform_roles_active_unique;
DROP TABLE IF EXISTS user_platform_roles;
```

## 4. Validacao pos-rollback

Confirmar:

- `user_platform_roles` ausente;
- `support_access_grants` ausente;
- `support_access_sessions` ausente;
- `audit_events_v2` continua integro;
- `d1_migrations` nao ganhou entrada inesperada da `0389`;
- nenhuma evidência de deploy;
- nenhuma evidência de `DQ-01`/`MIG-01` reexecutados.

## 5. Observacao de escopo

Como esta janela nao liga enforcement amplo nem deploya runtime novo, o rollback esperado e estrutural e limitado a objetos aditivos da `0389`.
