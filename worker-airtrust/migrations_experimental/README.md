# Experimental migrations

Esta pasta contem migrations experimentais e candidatas de desenvolvimento local.

Regras:

- nao faz parte da cadeia normal de migrations;
- nao e referenciada por `migrations_dir` em `wrangler.toml` ou `wrangler.dev.toml`;
- nao deve ser aplicada em staging ou producao;
- nao deve ser usada por deploy, CI ou `wrangler d1 migrations apply --remote`;
- serve apenas para testes locais e bancos descartaveis de desenvolvimento;
- qualquer promocao para `worker-airtrust/migrations/` exige revisao, novo commit e aprovacao explicita.

Migration atual:

- `0410_experimental_regulated_records_core.sql`: Regulated Records Core development-local candidate.

Documento de status:

- `docs/REGULATED_RECORDS_CORE_DEVELOPMENT_LOCAL_CANDIDATE.md`
