# D1: Copiar dados de produção para ambiente local

Este guia sincroniza todas as tabelas do D1 de produção para o banco local de desenvolvimento.

## Pré-requisitos

- Wrangler v3 instalado e autenticado (`wrangler login`)
- Variáveis de ambiente:
  - `CF_ACCOUNT_ID` (ID da conta Cloudflare)
  - `D1_PROD_DB` (nome/binding do D1 de produção)
  - Opcional: `D1_LOCAL_DB` (nome do DB local; default: `airtrust_local`)

## Execução

```sh
# 1) Ajuste permissões
chmod +x scripts/sync-d1-from-production.sh

# 2) Defina variáveis (exemplo)
export CF_ACCOUNT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
export D1_PROD_DB=airtrust_prod
export D1_LOCAL_DB=airtrust_local

# 3) Rode o sync
./scripts/sync-d1-from-production.sh
```

O script vai:

- Exportar o SQL completo do D1 de produção para `./backups/d1_prod_export_<timestamp>.sql`
- Importar esse SQL para o seu D1 local (`wrangler d1 execute --local`)

## Verificação rápida

Depois da importação, execute alguns queries de sanidade:

```sh
wrangler d1 execute "$D1_LOCAL_DB" --local --command "SELECT COUNT(*) AS total FROM funcionarios;"
wrangler d1 execute "$D1_LOCAL_DB" --local --command "SELECT COUNT(*) AS total FROM qualificacoes;"
wrangler d1 execute "$D1_LOCAL_DB" --local --command "SELECT COUNT(*) AS total FROM habilitacoes;"
```

## Observações

- O script não mexe em produção; apenas lê/exporta.
- Se você não estiver usando D1 local, remova `--local` do comando de import e aponte para um DB de desenvolvimento.
- Backups ficam em `./backups/` para auditoria e rollback.
