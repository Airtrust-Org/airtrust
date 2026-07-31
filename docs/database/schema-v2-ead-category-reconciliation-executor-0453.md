# Schema V2 — EAD reconciliation executor 0453

- `change_id`: `ead-category-reconciliation-executor-0453`
- `baseline_id`: `production-d1-baseline-v2-20260714` (baseline ativo)
- `file_path`: `worker-airtrust/schema-v2/changes/ead-category-reconciliation-executor-0453.sql`
- `file_hash` (SHA-256 do SQL final): `d32b22e055ae50614f16f3d4061ff47f6df48149b86db23ce1a61dcd9d211d69`
- `plan_hash`: `9c8a1e9c87ad6946193d352ac3da02e3ce63458160ed800e8b8c6c54f3735dbb`
- `expected_sha`: o SHA exato de `main` no momento do dispatch; o workflow o compara com `github.sha` antes de qualquer escrita.

O `plan_hash` é SHA-256 do payload canônico abaixo (linhas terminadas por LF):

```text
change_id=ead-category-reconciliation-executor-0453
baseline_id=production-d1-baseline-v2-20260714
file_path=worker-airtrust/schema-v2/changes/ead-category-reconciliation-executor-0453.sql
file_hash=d32b22e055ae50614f16f3d4061ff47f6df48149b86db23ce1a61dcd9d211d69
rollback=retain-additive-ledger-and-disable-executor-flag
staging_validator=scripts/staging/validate-0453-postconditions.sh
production_validator=scripts/schema-v2/validate-ead-category-reconciliation-executor-0453.sh
```

O change é exclusivamente aditivo: cria o ledger e seu índice parcial único, sem DML funcional. A neutralização compatível preserva a evidência do ledger e desabilita a flag do executor após a conclusão; não remove estrutura nem dados.
