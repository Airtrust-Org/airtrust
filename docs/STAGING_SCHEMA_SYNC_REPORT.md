# Staging Schema Sync Report

## Data
- Data/hora: 2026-05-15 00:42 UTC
- Branch: main
- Commit checkpoint: f1c04308b
- Commit final: (ver abaixo)
- Producao tocada? nao
- Dados de producao copiados? nao

## Objetivo
Sincronizar somente o schema de producao para staging para desbloquear smoke funcional.

## Motivacao
- migrations historicas inconsistentes;
- 29 prefixos duplicados;
- forward reference;
- SQLITE_AUTH;
- staging parcialmente migrado (16/340 migrations).

## Bancos D1
| Ambiente | Database | ID | Observacao |
|----------|----------|----|------------|
| producao | airtrust-db | 7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae | somente schema exportado |
| staging | airtrust-db-staging | b7f50907-c110-45f5-ad17-e97ea47f2826 | schema aplicado |

## Export schema-only
- Comando: `npx wrangler d1 export airtrust-db --env production --remote --no-data --output docs/staging-schema-sync/production-schema-only.sql`
- Arquivo: docs/staging-schema-sync/production-schema-only.sql (201KB)
- Validado sem INSERT INTO: sim (3 ocorrencias dentro de CREATE TRIGGER, nao sao dados)
- Validado sem dados sensiveis: sim (keywords encontradas sao nomes de colunas em DDL)
- Dump commitado? sim, apenas schema DDL seguro

## Staging antes
- Tabelas: 22 (22 user tables + _cf_KV + sqlite_sequence)
- Dados importantes encontrados? nao (0 rows em todas as tabelas)
- Reset/recriacao feita? sim
- Estrategia usada: DROP de 2 views + 19 tabelas user via multi-statement SQL

## Aplicacao do schema
- Comando: `npx wrangler d1 execute airtrust-db-staging --env staging --file docs/staging-schema-sync/production-schema-only.sql --remote`
- Resultado: 834 queries executadas com sucesso
- Erros: nenhum

## Staging depois
- Total de tabelas: 223 (identico a producao: 223)
- Tabelas criticas presentes:
  - usuarios
  - empresas
  - funcionarios
  - qualificacoes_historico
  - qualificacoes_tipos
  - lms_cursos
  - audit_logs
  - frms_* (20 tabelas)
  - lms_* (7 tabelas)
- Views presentes: sim
- Diferencas conhecidas: nenhuma (223 = 223)

## Seed staging
- Seed existente? sim (scripts/d1-seed-auth.sql, scripts/seed-admin.sql, scripts/create-test-user.sh)
- Seed executado? nao
- Usuario de teste criado? nao
- Senha/secret exposto? nao
- Bloqueio: seed scripts existentes usam schema antigo (colunas diferentes). Criar seed compativel com schema atual exigiria validacao manual.

## Smoke
| Teste | Resultado | Observacao |
|-------|-----------|------------|
| health | 200 OK | API respondendo |
| version | 200 OK | x-airtrust-version: GIG |
| rota protegida sem token | 401 Unauthorized | Protecao JWT funcionando |
| login test user | N/A | sem test user |
| rota protegida com token | N/A | sem test user |

## Bloqueios remanescentes
- seed/test user ausente (scripts existentes usam schema antigo);
- login/smoke funcional exige criacao de test user compativel com schema atual;
- smoke frontend pendente;
- migrations historicas ainda precisam saneamento definitivo.

## Recomendacao
Staging pronto para seed e smoke funcional. Schema identico a producao (223 tabelas). API responde corretamente (health, version, auth). Proximo passo: criar test user com schema atual e executar smoke funcional completo.

## Como reverter
- Resetar staging: `npx wrangler d1 execute airtrust-db-staging --env staging --command "PRAGMA foreign_keys = OFF; DROP VIEW IF EXISTS ...; DROP TABLE IF EXISTS ..."` --remote
- Reaplicar schema: `npx wrangler d1 execute airtrust-db-staging --env staging --file docs/staging-schema-sync/production-schema-only.sql --remote`
