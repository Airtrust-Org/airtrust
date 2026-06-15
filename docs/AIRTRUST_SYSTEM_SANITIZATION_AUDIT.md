# AirTrust - System Sanitization Audit

Data: 2026-06-14  
Escopo: auditoria estrutural read-only antes de piloto, migration remota, deploy ou criacao de D1 dedicado.  
Modo: sem deploy, sem production, sem secrets, sem D1 novo, sem apply de migrations, sem commit.  
Alteracao feita nesta etapa: criacao deste documento.

## 1. Veredito executivo

O AirTrust nao deve executar piloto, deploy, rebaseline ou migration remota antes de uma sanitizacao operacional minima. O risco principal nao e a `0410` em si, mas o conjunto: working tree sujo em `main`, cadeia de migrations extensa e historica, staging com schema materializado e ledger D1 incompleto, scripts capazes de tocar production/remoto, e rotas/runtime que ainda carregam endpoints historicos de migration manual.

Decisao recomendada:

- D1 dedicado para o piloto: tecnicamente viavel como workaround isolado, mas nao substitui sanitizacao da plataforma.
- Staging atual: nao usar para `wrangler d1 migrations apply` enquanto o ledger permanecer desalinhado.
- Production: somente auditoria read-only futura com autorizacao explicita, nunca nesta fase.
- Deploy: bloqueado ate working tree, scripts perigosos e gates ficarem sob controle documentado.

## 2. Referencias obrigatorias lidas

- `docs/CONTROLE_DE_VOOS_N1_STAGING_MIGRATION_LEDGER_DIAGNOSIS.md`
- `docs/CONTROLE_DE_VOOS_N1_PILOT_DEDICATED_D1_RUNBOOK.md`
- `docs/CONTROLE_DE_VOOS_N1_DIA0_STAGING_EXECUTION_REPORT.md`
- `docs/CONTROLE_DE_VOOS_N1_PILOTO_PREFLIGHT_TECNICO.md`
- `DATABASE_SCHEMA.md`
- `TECHNICAL_DEBT.md`
- `DEPLOYMENT_AND_DEVOPS.md`
- `SECURITY.md`
- `worker-airtrust/wrangler.toml`
- `worker-airtrust/wrangler.dev.toml`
- `worker-airtrust/package.json`
- `package.json`
- `scripts/`
- `worker-airtrust/migrations/`
- `worker-airtrust/migrations_experimental/`
- `worker-airtrust/src/index.ts`
- `worker-airtrust/src/services/backup/`
- `worker-airtrust/src/lib/`
- `src/react-app/`

## 3. Git e working tree

Estado auditado:

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `4260bbb75958c54929600021c61b4fd31a9ac5e8` |
| `origin/main` | `971f95fe8082d32d4621272c95d4468a28fcdd7f` |
| Ahead/behind | `0 21` em `origin/main...HEAD` |
| `git diff --check` | sem saida |

Arquivos modificados rastreados antes deste relatorio:

- `docs/REGULATED_RECORDS_CORE_DEVELOPMENT_LOCAL_CANDIDATE.md`
- `docs/REGULATED_RECORDS_CORE_EXPERIMENTAL_MIGRATION.md`
- `index.html`
- `public/app.webmanifest`
- `public/favicon.ico`
- `src/react-app/components/AppLayout.tsx`
- `worker-airtrust/migrations_experimental/0410_experimental_regulated_records_core.sql`
- `worker-airtrust/src/__tests__/migrations/regulated-records-core-experimental.test.ts`

Arquivos/diretorios untracked relevantes:

- documentos raiz: `API_REFERENCE.md`, `ARCHITECTURE_OVERVIEW.md`, `AUTH_RBAC_MULTITENANCY.md`, `DATABASE_SCHEMA.md`, `DEPLOYMENT_AND_DEVOPS.md`, `SECURITY.md`, outros inventarios;
- docs de Controle de Voos/SIGVOOS/governanca;
- scripts novos de export/clone/producao, incluindo `scripts/clone-production-d1-to-local.sh`, `scripts/export_producao.py`;
- `lms/`;
- assets de favicon;
- testes e libs de regulated records;
- `worker-airtrust/wrangler.pilot-cv-n1.toml`.

Risco: alto para commit acidental, porque a branch e `main`, esta 21 commits a frente de `origin/main` e mistura docs, frontend/assets, migration experimental, scripts de producao/export e config temporaria de piloto. Nao usar `git add .`.

Recomendacao: antes de qualquer fase mutante, congelar status do repo, criar branch `codex/airtrust-sanitization-guardrails`, separar commits por escopo ou usar stash seletivo. Para este relatorio, commit sugerido apenas com:

```bash
git add docs/AIRTRUST_SYSTEM_SANITIZATION_AUDIT.md
git commit -m "docs: audit airtrust system sanitization risks"
```

## 4. Migrations locais

Estado observado:

- total de arquivos `.sql` em `worker-airtrust/migrations/`: `381`;
- ordem real de aplicacao: alfabetica pelo nome do arquivo, conforme `DATABASE_SCHEMA.md` e comportamento esperado do Wrangler;
- primeiro arquivo: `0000_production_schema.sql`;
- final alfabetico inclui `0410_controle_voos_n1_schema.sql`, `132_add_funcionario_ativo.sql`, `9999_add_modelo_sessao_id_to_agendamentos.sql`, `purge-soft-deleted-qualificacoes.sql`;
- arquivo `.bkp` presente: `0020_simuladores_final.sql.bkp`;
- arquivos fora do padrao `NNNN_`: `0098-indices-performance.sql` e `purge-soft-deleted-qualificacoes.sql`;
- `0410_controle_voos_n1_schema.sql`: presente;
- `0411`: ausente como migration real em `worker-airtrust/migrations/`;
- `9999_add_modelo_sessao_id_to_agendamentos.sql`: presente;
- `purge-soft-deleted-qualificacoes.sql`: presente.

Prefixos numericos duplicados confirmados: `0049`, `0062`, `0063`, `0068`, `0069`, `0092`, `0093`, `0098`, `0107`, `0112`, `0117`, `0137`, `0140`, `0144`, `0145`, `0150`, `0151`, `0159`, `0172`, `0200`, `0215`, `0246`, `0263`, `0284`, `0320`, `0332`, `0340`, `0347`, `0362`, `0367`.

Risco em D1 novo: aplicar cadeia completa em um D1 vazio pode falhar por dependencias historicas, DDL destrutivo, seeds antigos, arquivos fora do padrao e duplicatas que dependem de ordem alfabetica. Ainda assim, se o objetivo for uma plataforma limpa, o replay completo deve ser validado em ambiente descartavel antes de qualquer remoto persistente.

Risco em staging desalinhado: nao aplicar cadeia completa no staging atual. O diagnostico anterior mostrou `381` migrations locais, ledger remoto com `4` entradas e `377` pendencias. O Wrangler tentaria arrastar centenas de migrations fora do escopo.

## 5. Migrations experimentais

`worker-airtrust/migrations_experimental/` contem:

- `0410_experimental_regulated_records_core.sql`
- `README.md`

O README declara que a pasta nao faz parte da cadeia normal, nao e referenciada por `migrations_dir`, nao deve ser usada por staging/producao e qualquer promocao exige revisao e aprovacao explicita.

Busca em `package.json`, `worker-airtrust/package.json`, `wrangler.toml`, `wrangler.dev.toml` e scripts padrao nao encontrou referencia operacional a `migrations_experimental`. Ha testes locais que leem a migration experimental diretamente, por exemplo:

- `worker-airtrust/src/__tests__/migrations/regulated-records-core-experimental.test.ts`
- `worker-airtrust/src/__tests__/lib/regulated-records/governance-evidence-service.test.ts`
- `worker-airtrust/src/__tests__/migrations/migration-governance.test.ts`

Risco residual: a migration experimental usa numero `0410`, igual ao Controle de Voos N1 canonico. Se promovida sem renumeracao e revisao, pode entrar na cadeia canonical confundindo ledger e escopo regulatorio.

## 6. Ledgers D1

Estado conhecido de staging, a partir dos documentos de Dia 0 e diagnostico:

- D1: `airtrust-db-staging`;
- `database_id`: `b7f50907-c110-45f5-ad17-e97ea47f2826`;
- schema materializado AirTrust com 233 tabelas totais no diagnostico;
- `d1_migrations` existe, mas continha apenas 4 linhas;
- entries conhecidas: `0000_production_schema.sql`, `0003_create_usuarios.sql`, `0370_create_escala_voo_diaria_justificativas.sql`, `0371_create_escala_voo_diaria_publicacoes.sql`;
- Wrangler listou 377 migrations pendentes;
- `0410_controle_voos_n1_schema.sql` estava pendente;
- `cv_%` nao estava materializado no staging diagnosticado.

Mapa de ambientes:

| Ambiente | Estado | Ledger | Recomendacao |
|---|---|---|---|
| local | Miniflare/SQLite via `wrangler.dev.toml` | local, descartavel | seguro para testes locais, nao evidencia remota |
| development | `airtrust-db-dev` | desconhecido nesta fase | nao usar sem auditoria especifica |
| staging | schema amplo, ledger incompleto conhecido | 4 linhas conhecidas vs 381 locais | bloquear apply normal; requer rebaseline/replace separado |
| production | `airtrust-db` | nao auditado nesta fase | somente read-only audit futuro com autorizacao |
| pilot | `airtrust-db-pilot-cv-n1` proposto | nao criado | workaround isolado, nao sanitizacao |

Consultas read-only que seriam necessarias em production, somente se autorizado depois:

```sql
SELECT COUNT(*) AS ledger_rows FROM d1_migrations;
SELECT id, name, applied_at FROM d1_migrations ORDER BY id;
SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table';
SELECT type, COUNT(*) AS total FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' GROUP BY type;
SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'cv_%' ORDER BY name;
SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'regulated_%' ORDER BY name;
```

Nao consultar production nesta etapa.

## 7. Wrangler configs

`worker-airtrust/wrangler.toml`:

| Env | Worker | D1 name | D1 id | migrations_dir |
|---|---|---|---|---|
| development | `airtrust-api-development` | `airtrust-db-dev` | `a72fb05b-0912-4ad9-9686-e7948c8b09eb` | `./migrations` |
| staging | `airtrust-api-staging` | `airtrust-db-staging` | `b7f50907-c110-45f5-ad17-e97ea47f2826` | `./migrations` |
| production | `airtrust-api-production` | `airtrust-db` | `7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae` | `./migrations` |

`worker-airtrust/wrangler.dev.toml`:

| Uso | D1 name | D1 id | migrations_dir |
|---|---|---|---|
| local isolado | `airtrust-db-local` | `00000000-0000-0000-0000-000000000001` | `./migrations` |

Riscos:

- `worker-airtrust/package.json` usa scripts D1 com nome `airtrust-db` combinado a `--env staging`, em vez de `airtrust-db-staging`. Isso e confuso e perigoso para humanos.
- `wrangler deploy --env production` existe em scripts e pode tocar production.
- `npm run deploy` combina build, Pages e Worker; nao deve ser usado com working tree sujo.
- `worker-airtrust/wrangler.pilot-cv-n1.toml` aparece untracked; risco de commit acidental ou confusao de target se usado fora de runbook.

## 8. Scripts perigosos

Classificacao dos scripts de pacote:

| Local | Script | Classificacao | Evidencia / motivo |
|---|---|---|---|
| `package.json` | `dev`, `dev:worker:local`, `start`, `test*`, `lint` | seguro | local/teste/guard, sem remoto mutante por padrao |
| `package.json` | `dev:worker` | cuidado | `wrangler dev --env development --remote` |
| `package.json` | `build`, `preview` | cuidado | build local, mas prebuild avisa producao ativa |
| `package.json` | `deploy`, `deploy:pages`, `deploy:worker`, `deploy:worker:only`, `deploy:all` | proibido sem runbook | deploy Pages/Worker production e/ou migrations production via wrapper |
| `package.json` | `deploy:worker:safe` | perigoso | deploy production sem migrations, ainda toca production |
| `package.json` | `db:qualificacoes:*` | proibido sem runbook | chama `run-production-db-script.sh` |
| `package.json` | `logs:tail` | cuidado | leitura de logs production |
| `package.json` | `sync:prod:local:safe`, `sync:prod:dev:safe` | proibido sem runbook | exporta production e importa copia sanitizada |
| `package.json` | `storage:r2:bootstrap` | perigoso | cria/configura R2 remoto |
| `package.json` | `setup:local`, `seed:lms:*:local`, `smoke:*:local` | cuidado | local, mas muta D1 local |
| `worker-airtrust/package.json` | `deploy`, `tail` | proibido sem runbook | `--env production` |
| `worker-airtrust/package.json` | `deploy:dev`, `deploy:staging` | perigoso | deploy remoto |
| `worker-airtrust/package.json` | `d1:create` | proibido sem runbook | cria D1 |
| `worker-airtrust/package.json` | `d1:execute`, `d1:query` | proibido sem runbook | alvo `airtrust-db` sem env claro |
| `worker-airtrust/package.json` | `d1:migrate:dev`, `d1:migrate:staging`, `d1:migrate:prod` | proibido sem runbook | `wrangler d1 execute` com files historicos; prod usa `--env production` |
| `worker-airtrust/package.json` | `d1:seed:*` | proibido sem runbook | seed remoto/local com risco de dados |
| `worker-airtrust/package.json` | `secret:put`, `secret:list` | proibido sem runbook | secrets |
| `worker-airtrust/package.json` | `dev`, `dev:staging` | cuidado | remote dev contra env |

Arquivos em `scripts/` que exigem bloqueio ou runbook antes de uso:

| Script / grupo | Classificacao | Motivo |
|---|---|---|
| `scripts/deploy-worker-only.sh` | proibido sem runbook | aplica migrations production com gate e faz `wrangler deploy --env production` |
| `scripts/deploy-worker-safe.sh` | perigoso | deploy production sem migrations |
| `scripts/build-and-deploy.sh` | proibido sem runbook | Pages deploy production + Worker deploy production |
| `scripts/deploy-production-full.sh` | proibido sem runbook | `wrangler deploy --env production` |
| `scripts/deploy-production.sh` | seguro por bloqueio | arquivo legado bloqueado com erro |
| `scripts/apply-migrations-production.sh` | seguro por bloqueio | legado bloqueado com erro |
| `scripts/run-production-db-script.sh` | proibido sem runbook | SQL remoto production, allowlist e confirmacao, mas mutante |
| `scripts/sync-d1-production-sanitized.sh` | proibido sem runbook | exporta production e importa local/development sanitizado |
| `scripts/clone-production-d1-to-local.sh` | proibido sem runbook | exporta production para local; risco de dados sensiveis locais |
| `scripts/clone-prod-REAL.sh`, `scripts/clone-prod-data.sh`, `scripts/clone-prod-to-local-COMPLETO.sh` | proibido sem runbook | clones/export production legados |
| `scripts/import-prod-data.sh`, `scripts/import_legacy_data.sh` | seguro por bloqueio se mantidos assim | legados bloqueados |
| `scripts/export_producao.py`, `scripts/export-funcionarios.sh` | proibido sem runbook | export de funcionarios/dados reais ou remotos |
| `scripts/run-0389-staging-schema-apply.sh`, `scripts/run-audit-v2-staging-schema-apply.sh`, `scripts/run-dq01-staging-backfill-apply.sh` | proibido sem runbook | mutam staging remoto sob gates |
| `scripts/run-0389-staging-schema-readonly.sh`, `scripts/run-audit-rbac-v2-staging-readonly.sh` | cuidado | remoto read-only staging, permitido apenas em fase autorizada |
| `scripts/run-mig01-staging-rebaseline.sh` | cuidado/perigoso | gera baseline a partir de snapshot local; sem D1 remoto, mas altera artefatos docs |
| `scripts/bootstrap-remote-r2-buckets.sh`, `scripts/configure-r2-*`, `scripts/enable-r2-versioning.sh` | perigoso | R2 remoto |
| `scripts/force-redeploy-pages.sh` | proibido sem runbook | commit vazio + push para forcar deploy |
| `scripts/backup_d1_to_r2.sh`, `scripts/backup-database.sh`, `scripts/cleanup_old_backups.sh` | perigoso | backup/limpeza remota ou legada |
| `scripts/setup-local-db.sh`, `scripts/seed-demo-data-local.sh` | cuidado | muta D1 local, aplica schema/migrations locais |
| `scripts/legacy/**` | proibido sem auditoria | muitos scripts antigos com production, remote D1 ou import/restore |

O script `scripts/audit-dangerous-ops.sh` e um guard local util. Ele possui allowlists para remoto read-only, self-protected scripts e legados bloqueados, e deve virar gate obrigatorio antes de qualquer release.

## 9. Auto-migrations e bootstrap

`worker-airtrust/src/runtime/api-bootstrap.ts` hoje nao executa DDL. O comentario registra remocao de `ensureDocumentosTableExists` e fallback runtime SIGVOOS; `runApiBootstrap` fica vazio.

Testes de governanca existem:

- `worker-airtrust/src/__tests__/architecture/no-runtime-ddl-hot-paths.test.ts` bloqueia DDL em hot paths e escaneia runtime, com allowlist explicita;
- allowlist atual de DDL runtime: `routes/admin-manual-migrations.ts`, `routes/migrations.ts`, `routes/qualificacoes/shared.ts`;
- os arquivos `admin-manual-migrations.ts` e `migrations.ts` tem DDL destrutivo/historico, mas exigem `ENABLE_MANUAL_MIGRATIONS=true`.

Risco: mesmo com gate fail-closed, as rotas de migration manual estao montadas no runtime em `/api/migrations` e rotas admin existem. Se `ENABLE_MANUAL_MIGRATIONS` for configurado por erro em staging/prod, ha capacidade de DDL destrutivo via API autenticada admin. Isso pode mascarar ou contornar migrations canonicas e ledger.

Pontos que mascaram migration ausente:

- checks em `sqlite_master` para tolerar ausencia de tabelas/colunas em auth, RBAC, FRMS, simuladores e treinamentos;
- comentarios de fallback pre-migration em FRMS;
- rotas que retornam comportamento degradado se tabela nao existe.

Recomendacao: manter tolerancia apenas fail-closed, documentada e testada; retirar endpoints historicos de migration do bundle production em fase propria.

## 10. Backup/restore

Estado observado:

- `worker-airtrust/src/services/backup/orchestrator.ts` cria backups automaticos e manuais por modulo, salva JSON em R2 e registra controle em D1;
- `worker-airtrust/src/services/backup/restore.ts` lista, exporta e restaura backups via `INSERT OR REPLACE`;
- `worker-airtrust/wrangler.toml` define crons de backup somente em production;
- `TECHNICAL_DEBT.md` registra que SHA-256 real foi corrigido e que ha restore drill local;
- `docs/BACKUP_RESTORE_DRILL.md` e referenciado como drill local, mas nao foi usado nesta auditoria;
- `docs/PRODUCTION_BACKUP_AND_ROLLBACK_PLAN.md` existe como plano de producao;
- Dia 0 registrou ausencia de snapshot/backup especifico de staging para liberar apply da `0410`.

Gaps antes de qualquer rebaseline:

- evidenciar snapshot de staging atual, com localizacao fora do repo se houver dados reais;
- evidenciar rollback testado para staging;
- separar backup local, staging e production no runbook;
- nao tratar backup modular R2 como substituto automatico de snapshot D1 schema+dados para rebaseline;
- executar restore drill em ambiente descartavel antes de depender dele para rollback.

## 11. Guardrails de producao

Pontos positivos:

- `preflight-clean-deploy.sh` exige branch `main`, working tree limpa e `HEAD == origin/main`;
- `deploy-worker-only.sh` bloqueia migrations production sem `AIRTRUST_ALLOW_PROD_MIGRATIONS_APPLY=YES` e confirmacao textual;
- `run-production-db-script.sh` exige allowlist, branch main, clean state, `HEAD == origin/main`, env vars e confirmacao textual;
- `sync-d1-production-sanitized.sh` exige `AIRTRUST_ALLOW_PROD_SYNC=1` e confirmacao;
- `wrangler.dev.toml` isola local.

Gaps:

- `worker-airtrust/package.json` tem comandos production diretos e confusos;
- `DEPLOYMENT_AND_DEVOPS.md` documenta deploy.yml com migrations production em CI; precisa validacao atual antes de confiar;
- `vite.config.ts` usa proxy local default `http://localhost:8787`, mas `src/react-app/config/api.ts` aceita `VITE_API_URL` e hosts de production; `TECHNICAL_DEBT.md` aponta risco de `.env.local` apontar para production;
- `vite.config.ts.disabled` contem default antigo para production API, deve permanecer disabled ou ser removido em fase propria;
- muitos scripts legados continuam presentes;
- `wrangler.pilot-cv-n1.toml` untracked pode ser comitado por engano.

## 12. Controle de Voos N1

Confirmacoes:

- `0410_controle_voos_n1_schema.sql` e aditiva e cria apenas objetos `cv_*` de Controle de Voos N1.
- Tabelas criadas pela `0410`: `cv_aeroportos`, `cv_tipos_voo`, `cv_naturezas_voo`, `cv_motivos_operacionais`, `cv_voos`, `cv_rdv_operacional`, `cv_voo_tripulantes`, `cv_voo_eventos`.
- `0411` nao existe como migration real em `worker-airtrust/migrations/`.
- `0411` existe como design documental e nao deve ser aplicada no piloto.
- D1 dedicado `airtrust-db-pilot-cv-n1` e workaround de piloto, nao sanitizacao de staging, production ou processo de migrations.

Pre-condicoes antes de liberar piloto:

1. congelar working tree e separar artefatos de piloto;
2. bloquear scripts production/remotos fora do runbook;
3. decidir formalmente se piloto usara D1 dedicado;
4. criar config temporaria de piloto sem tocar `wrangler.toml`, se aprovado;
5. aplicar somente baseline minimo + `0410` em D1 dedicado, com ledger documentado;
6. validar ausencia de `0411`, `regulated_%`, e tabelas fora do escopo;
7. validar RBAC, login, usuarios de teste e dados sinteticos;
8. registrar rollback/descarte do D1 piloto.

## 13. Preparacao ANAC

Esta sanitizacao ajuda governanca futura porque cria evidencia de:

- separacao entre piloto interno, staging, production e ambientes descartaveis;
- trilha de decisoes para migrations e ledger;
- controle de scripts capazes de mutar dados;
- backup/restore e rollback antes de mudancas;
- classificacao explicita de modulo nao regulado.

Nao declarar o AirTrust homologado. Nao misturar esta fase com eDB, SDRMe, Records Core ou qualquer escopo de registro regulado. A `0410` do Controle de Voos N1 permanece operacional interna e nao regulada.

## 14. Matriz de riscos

| ID | Risco | Area | Severidade | Probabilidade | Impacto | Evidencia | Recomendacao | Prioridade |
|---|---|---|---|---|---|---|---|---|
| R01 | Commit acidental de artefatos mistos em `main` | Git | Alta | Alta | Deploy/config/scope incorreto | branch `main`, 21 ahead, muitos modified/untracked | branch dedicada, staging seletivo, nunca `git add .` | P0 |
| R02 | Aplicar 377 migrations pendentes em staging | D1/migrations | Critica | Alta | DDL/DML fora do escopo, falhas, drift maior | diagnostico staging: 381 locais, ledger 4, pendentes 377 | bloquear apply normal; rebaseline separado | P0 |
| R03 | Production tocada por script direto | Scripts/deploy | Critica | Media | impacto em usuarios reais/dados | scripts com `--env production`, `airtrust-db`, deploy | congelar scripts perigosos e exigir runbook | P0 |
| R04 | Scripts `worker-airtrust/package.json` usam `airtrust-db --env staging` | Config/scripts | Alta | Media | operador confunde alvo | scripts D1 legados | remover/renomear em fase S1 | P0 |
| R05 | Migration experimental `0410` entrar na cadeia canonica | Migrations | Alta | Media | escopo regulatorio indevido | `migrations_experimental/0410_experimental...` | guard de promocao e renumeracao obrigatoria | P1 |
| R06 | Endpoints manuais de migration habilitados por erro | Runtime | Critica | Baixa/Media | DDL destrutivo via API | `/api/migrations`, `ENABLE_MANUAL_MIGRATIONS` | excluir do bundle remoto ou bloquear por env != local | P1 |
| R07 | D1 dedicado usado como falsa sanitizacao | Processo | Alta | Alta | staging/prod continuam inseguros | runbook declara workaround | separar piloto de sanitizacao | P0 |
| R08 | Backup/restore insuficiente para rebaseline | Backup | Alta | Media | sem rollback confiavel | Dia 0 sem snapshot staging; restore drill local apenas | snapshot + restore drill staging descartavel | P1 |
| R09 | Vite/API local apontar para production | Frontend/devops | Alta | Media | escrita acidental em production | `TECHNICAL_DEBT.md`, env vars | guard hard para proxy production em dev | P1 |
| R10 | Cadeia completa falhar em D1 novo | Migrations | Alta | Media | piloto atrasado ou schema parcial | 381 SQL, duplicatas, `9999`, `purge` | replay em D1 descartavel antes de uso | P1 |
| R11 | Ledger manual/bypass via SQL direto | D1 | Alta | Media | Wrangler continua pendente/ambiguidade | docs Dia 0 | nao aplicar SQL direto sem ledger policy | P0 |
| R12 | Dados reais exportados para local | Dados | Alta | Media | LGPD/confidencialidade | clone/export production scripts | runbook, criptografia, cleanup local | P1 |
| R13 | CI deploy aplica migrations production | CI/CD | Critica | Desconhecida | mutacao automatica production | `DEPLOYMENT_AND_DEVOPS.md` descreve deploy.yml | auditar workflows antes de merge | P0 |
| R14 | `wrangler.pilot-cv-n1.toml` untracked comitado | Config | Media | Media | config temporaria vira canonica | untracked no status | `.gitignore` ou remocao pos-piloto | P2 |
| R15 | Tolerancias de schema mascaram migration ausente | Runtime | Media | Media | falha silenciosa/feature degradada | checks `sqlite_master`, fallbacks pre-migration | fail-closed e teste por rota | P2 |

## 15. Plano de sanitizacao em fases

### Fase S0 - congelar scripts perigosos e status do repo

- Capturar status Git e divergencia.
- Criar branch de sanitizacao.
- Proibir `git add .`.
- Rodar `scripts/audit-dangerous-ops.sh`.
- Listar e bloquear scripts legados que tocam production/remoto.
- Remover ou isolar `wrangler.pilot-cv-n1.toml` antes de qualquer commit.

### Fase S1 - documentacao/guardrails

- Transformar este relatorio em baseline de riscos.
- Adicionar guard CI para scripts perigosos, production proxy e `migrations_experimental`.
- Documentar politica de migration/ledger.
- Bloquear endpoints manuais de migration em env remoto.

### Fase S2 - staging rebaseline ou substituicao

- Fazer backup/snapshot staging aprovado.
- Executar auditoria read-only do ledger e schema.
- Decidir rebaseline vs recriar staging.
- Testar replay em ambiente descartavel.
- Somente entao executar plano controlado.

### Fase S3 - migracao do piloto em D1 dedicado

- Se aprovado, criar D1 descartavel `airtrust-db-pilot-cv-n1`.
- Usar config temporaria explicita.
- Aplicar baseline minimo + `0410`.
- Validar `cv_%`, ausencia de `0411` e ausencia de `regulated_%`.
- Descartar ou arquivar snapshot ao final.

### Fase S4 - production read-only audit

- Somente com autorizacao explicita.
- Executar apenas SELECTs de ledger/schema.
- Comparar production vs staging/local/pilot.
- Sem `--env production` nesta fase atual; isso e fase futura separada.

### Fase S5 - limpeza de migrations duplicadas/legadas

- Nao editar migrations historicas aplicadas sem estrategia.
- Criar baseline/policy futura.
- Renumerar apenas novas migrations.
- Arquivar legados com redirect documentado, se aprovado.

### Fase S6 - politica permanente de migrations/deploy

- Toda migration nova deve ter numero unico, teste de replay e rollback.
- Toda execucao remota deve ter target, snapshot, rollback e aprovacao.
- Production deploy deve ser worker-only por padrao e migrations separadas.
- CI deve falhar para scripts/remotos nao allowlisted.

## 16. Decisao recomendada

Podemos criar D1 dedicado agora?  
Nao nesta etapa. Tecnicamente sim apos autorizacao explicita, mas primeiro S0 deve congelar repo/scripts para evitar confusao de config e commit.

Devemos sanitizar antes?  
Sim. Sanitizar guardrails e status do repo antes. Sanitizacao completa de staging pode ocorrer em paralelo ao piloto dedicado, mas nao deve ser ignorada.

O que bloqueia piloto?  
Staging bloqueia piloto via ledger desalinhado. Para D1 dedicado, bloqueiam apenas autorizacao, config temporaria controlada, baseline minimo, snapshot/descarte e usuarios de teste.

O que bloqueia deploy?  
Working tree sujo, branch `main` ahead de `origin/main`, scripts perigosos e incerteza de CI/migrations production.

O que bloqueia rebaseline?  
Falta autorizacao, snapshot staging atual, rollback testado, comparacao ledger/schema e decisao rebaseline vs substituicao.

O que nao fazer sob hipotese alguma:

- nao rodar `wrangler d1 migrations apply` em staging atual;
- nao rodar qualquer `--env production` sem fase S4/S6 autorizada;
- nao aplicar `0410` por SQL direto em staging para bypassar ledger;
- nao inserir manualmente no `d1_migrations` sem runbook;
- nao criar D1 ou deploy nesta etapa;
- nao executar scripts de clone/export production;
- nao commitar com `git add .`;
- nao promover `migrations_experimental/0410_experimental...` para canonical.

## 17. Proximo prompt recomendado

Como o veredito exige congelar scripts perigosos e status antes de piloto/rebaseline, o proximo prompt macro recomendado e:

```text
Voce esta no monorepo AirTrust. Modo seguro, sem production, sem deploy, sem D1 remoto, sem migrations apply e sem secrets.

Objetivo: implementar guardrails documentais/CI para congelar scripts perigosos antes do piloto Controle de Voos N1.

Escopo:
- criar/atualizar apenas testes/guards locais e docs;
- nao alterar backend/frontend funcional;
- nao tocar wrangler env production;
- nao executar scripts remotos;
- adicionar verificacoes para:
  - bloquear `migrations_experimental` em configs/scripts;
  - detectar scripts com `--env production`, `airtrust-db`, `wrangler deploy`, `wrangler d1 execute --remote`, `d1 export`, secrets e clone/export production fora de allowlist;
  - falhar se `worker-airtrust/package.json` mantiver scripts D1 ambiguos sem banner;
  - falhar se `VITE_DEV_PROXY_TARGET`/`VITE_API_URL` apontar production em dev sem override explicito;
  - documentar politica de D1 dedicado vs staging rebaseline.

Entrega:
- diff minimo;
- testes locais de guard executados;
- recomendacao de commit seletivo.
```

Modelo recomendado para a proxima fase: Codex 5.5, esforco alto.

## 18. Validacoes executadas nesta auditoria

Comandos executados nesta etapa:

- `git status --short`
- `git log -5 --oneline`
- `git rev-parse HEAD`
- `git rev-parse origin/main`
- `git rev-list --left-right --count origin/main...HEAD`
- `git diff --check`
- leituras com `sed`
- buscas com `rg`
- listagens com `find`
- `bash scripts/audit-dangerous-ops.sh`
- `cd worker-airtrust && npx vitest run src/__tests__/migrations/migration-governance.test.ts src/__tests__/architecture/no-runtime-ddl-hot-paths.test.ts`

Resultados:

- `git diff --check`: passou sem saida.
- `migration-governance.test.ts` e `no-runtime-ddl-hot-paths.test.ts`: 2 arquivos, 24 testes, todos passaram.
- `scripts/audit-dangerous-ops.sh`: falhou, como esperado para o estado atual. Achados:
  - `git add -A` em `scripts/remove-confirm-dialogs.sh`, `scripts/00-checkpoint-inicial.sh`, `scripts/fix-all-select-star.sh`, `scripts/fix-urls.sh`, `scripts/fix-auditoria-columns.sh`;
  - remote D1 fora de allowlist em `scripts/clone-production-d1-to-local.sh`;
  - scripts com `--remote` e padroes DDL/DML a revisar em `scripts/sync-production-to-local.sh` e `scripts/sync-production-clean.sh`.

Comandos deliberadamente nao executados:

- `wrangler d1 migrations apply`
- `wrangler d1 execute --remote`
- qualquer comando com `--env production`
- `wrangler deploy`
- `npm run deploy`
- criacao de D1
- alteracao de secrets
- commit
