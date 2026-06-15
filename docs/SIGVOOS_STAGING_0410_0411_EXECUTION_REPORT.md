# SIGVOOS Staging 0410/0411 Execution Report

**Veredito:** `STAGING 0410/0411 APLICADO COM SUCESSO`

Data: 2026-06-15  
Branch de execucao: `codex/sigvoos-staging-0410-0411-execution`  
Base: `main` @ `fe60b6afcf21eb3b1bf5ebae06077d7483623a77`

---

## 1. Escopo confirmado

- Execucao restrita ao D1 `staging`.
- Nenhum comando usou `--env production`.
- Nenhum comando apontou para `airtrust-db` (producao).
- Nenhum deploy foi executado.
- Nenhuma API real SIGVOOS foi chamada.
- Nenhuma credencial SIGVOOS foi usada.
- Nenhum secret novo foi criado.
- FRMS canônico permaneceu intocado.
- `worker-airtrust/src/lib/frms/frms-source-policy.ts` permaneceu intocado.

---

## 2. Estado inicial do Git

- `main` alinhado com `origin/main`.
- `git rev-parse HEAD` = `fe60b6afcf21eb3b1bf5ebae06077d7483623a77`
- `git rev-parse origin/main` = `fe60b6afcf21eb3b1bf5ebae06077d7483623a77`
- Divergencia `origin/main...HEAD` antes da branch de execucao: `0  0`
- Working tree limpa no inicio.
- Plano de preparacao para staging presente no topo do historico de `origin/main`:
  - `fe60b6af Merge: Plano de preparação para staging SIGVOOS`
  - `fbad2673 docs(controle-voos): prepare SIGVOOS staging plan`

Branch criada para a fase:

```bash
git checkout -b codex/sigvoos-staging-0410-0411-execution
```

---

## 3. Identificacao segura do D1 staging

Arquivos e evidencias usados:

- `worker-airtrust/wrangler.toml`
- `worker-airtrust/wrangler.dev.toml`
- `worker-airtrust/wrangler.pilot-cv-n1.toml`
- `docs/SIGVOOS_STAGING_PREPARATION_PLAN.md`
- `docs/CONTROLE_DE_VOOS_N1_STAGING_MIGRATION_LEDGER_DIAGNOSIS.md`
- `npx wrangler d1 list`

Bindings canônicos confirmados em `worker-airtrust/wrangler.toml`:

- `env.staging`:
  - database name: `airtrust-db-staging`
  - database id: `b7f50907-c110-45f5-ad17-e97ea47f2826`
- `env.production`:
  - database name: `airtrust-db`
  - database id: `7c8a788e-...-ff7ff55e84ae`

Listagem remota confirmada por `npx wrangler d1 list`:

- `airtrust-db-staging` = `b7f50907-c110-45f5-ad17-e97ea47f2826`
- `airtrust-db` = `7c8a788e-...-ff7ff55e84ae`
- `airtrust-db-pilot-cv-n1` = `76ec876a-8727-44b6-aa33-b8dea53cdebb`

Conclusao:

- staging foi identificado com certeza textual e por UUID;
- staging e producao sao bancos distintos;
- nenhum comando desta janela usou o nome ou o UUID de producao.

---

## 4. Snapshot pre-migration

Snapshot remoto criado antes de qualquer apply:

```text
/tmp/airtrust-d1-staging-backups/airtrust-staging-pre-0410-0411-20260615T223602Z.sql
```

Comando executado:

```bash
cd worker-airtrust
npx wrangler d1 export airtrust-db-staging --env staging --remote -y \
  --output /tmp/airtrust-d1-staging-backups/airtrust-staging-pre-0410-0411-20260615T223602Z.sql
```

Validacao:

- arquivo criado com sucesso;
- tamanho validado: `227533` bytes;
- dump nao foi versionado;
- URL temporaria de download nao foi registrada neste relatorio.

Rollback primario disponivel:

- reimportar/restaurar a partir do snapshot acima em janela controlada;
- observar limitacao de SQLite/D1 para colunas adicionadas por `ALTER TABLE ADD COLUMN`.

---

## 5. Auditoria pre-apply das migrations

Arquivos auditados:

- `worker-airtrust/migrations/0410_controle_voos_n1_schema.sql`
- `worker-airtrust/migrations/0411_controle_voos_sigvoos_integration_schema.sql`
- `docs/SIGVOOS_STAGING_PREPARATION_PLAN.md`

Confirmacoes:

- `0410` e `0411` sao aditivas para o escopo proposto.
- Nao ha `DROP TABLE`.
- Nao ha `DELETE`.
- Nao ha `TRUNCATE`.
- Nao ha `UPDATE` destrutivo de dados existentes.
- Nao ha DDL/DML de FRMS.
- Nao ha referencia a `frms-source-policy.ts`.
- Nao ha chamada de rede ou API real SIGVOOS.
- Nao ha insercao de dados reais nas migrations.

Observacao importante de governanca:

- o staging continua com ledger remoto incompleto (`d1_migrations = 4`);
- por isso a janela usou `wrangler d1 execute --file` controlado, e nao `wrangler d1 migrations apply`;
- isso segue o precedente de execucao controlada ja registrado para `0389`.

---

## 6. Baseline pre-migration em staging

Estado remoto antes do apply:

```text
D1_MIGRATIONS_TOTAL=4
D1_MIGRATIONS_0410=0
D1_MIGRATIONS_0411=0
CV_TABLES_TOTAL=0
CV_INDEXES_TOTAL=0
CV_TRIGGERS_TOTAL=0
SCHEMA_0411_TABLES_PRE=0
CV_VOOS_SIGVOOS_COLUMNS_PRE=0
CV_TRIP_SIGVOOS_COLUMNS_PRE=0
FRMS_JORNADA_COUNT_PRE=0
FRMS_ALERTA_COUNT_PRE=0
```

Interpretacao:

- staging nao continha objetos `cv_*`;
- staging nao tinha objetos do schema `0411`;
- o ledger remoto nao registrava `0410` nem `0411`;
- FRMS permaneceu com baseline estavel (`0/0`) nesta base de staging.

---

## 7. Aplicacao da 0410 em staging

Comando executado:

```bash
cd worker-airtrust
npx wrangler d1 execute airtrust-db-staging --env staging --remote \
  --file migrations/0410_controle_voos_n1_schema.sql
```

Resultado do Wrangler:

- `success: true`
- `Total queries executed: 37`
- `Rows read: 66`
- `Rows written: 45`

Validacao pos-0410:

```text
CV_TABLES_POST_0410=8
CV_INDEXES_POST_0410=29
CV_TRIGGERS_POST_0410=0
SCHEMA_0410_CORE_TABLES=8
D1_MIGRATIONS_TOTAL_POST_0410=4
D1_MIGRATIONS_0410_POST=0
FRMS_JORNADA_COUNT_POST_0410=0
FRMS_ALERTA_COUNT_POST_0410=0
```

Conclusao:

- as 8 tabelas N1 foram criadas;
- os indices esperados de `0410` foram materializados;
- nenhuma trigger `trg_cv_*` existia ainda, como esperado antes da `0411`;
- o ledger permaneceu inalterado em `4`;
- FRMS nao mudou.

---

## 8. Aplicacao da 0411 em staging

Comando executado:

```bash
cd worker-airtrust
npx wrangler d1 execute airtrust-db-staging --env staging --remote \
  --file migrations/0411_controle_voos_sigvoos_integration_schema.sql
```

Resultado do Wrangler:

- `success: true`
- `Total queries executed: 57`
- `Rows read: 16941`
- `Rows written: 61`

Validacao pos-0411:

```text
SCHEMA_0411_TABLES_POST=3
CV_VOOS_SIGVOOS_COLUMNS_POST=10
CV_TRIP_SIGVOOS_COLUMNS_POST=6
CV_INDEXES_POST_0411=20
CV_TRIGGERS_POST_0411=18
D1_MIGRATIONS_TOTAL_POST_0411=4
D1_MIGRATIONS_0411_POST=0
FRMS_JORNADA_COUNT_POST_0411=0
FRMS_ALERTA_COUNT_POST_0411=0
```

Confirmacoes objetivas:

- `cv_voo_etapas` existe;
- `cv_sigvoos_staging` existe;
- `cv_conflitos_integracao` existe;
- 10 colunas SIGVOOS existem em `cv_voos`;
- 6 colunas SIGVOOS existem em `cv_voo_tripulantes`;
- 20 indices especificos da `0411` existem;
- 18 triggers `trg_cv_*` de isolamento existem;
- FRMS permaneceu inalterado;
- `d1_migrations` permaneceu em `4`.

---

## 9. Validacao funcional com payloads sinteticos

Status:

```text
PENDENTE CONTROLADA — SEM RUNNER REMOTO APROVADO
```

Motivo:

- o invocador validado no workspace e explicitamente local:
  - `worker-airtrust/src/services/controle-voos/sigvoos-shadow-local-invoker.ts`
  - `mode: 'LOCAL_SHADOW'`
  - rejeita URLs externas;
  - restringe paths a roots locais de fixture/teste;
- os testes existentes de importador/runner usam SQLite/D1 local temporario e fixtures locais:
  - `worker-airtrust/src/__tests__/services/controle-voos-sigvoos-shadow-local-invoker.test.ts`
  - `worker-airtrust/src/__tests__/services/controle-voos-sigvoos-importer-runner.test.ts`

Decisao:

- nao foi improvisado adaptador remoto para staging;
- nenhum payload foi inserido no D1 staging nesta janela;
- a validacao funcional remota permanece fase separada, com runbook proprio e runner governado.

---

## 10. Validacoes locais obrigatorias

Executadas apos a janela remota:

```text
npx tsc --noEmit --pretty false                          PASS
npm run build                                            PASS
git diff --check                                         PASS
bash scripts/check-tracked-secrets.sh                    PASS
bash scripts/validation/audit-deploy-scripts.sh          PASS como inventario
bash scripts/audit-dangerous-ops.sh                      PASS com 1 warning inventariado
```

Observacoes:

- `npm run build` exibiu aviso textual fixo do projeto sobre banco de producao ativo, mas o build foi local e concluiu com sucesso;
- `audit-deploy-scripts.sh` permaneceu inventariando referencias historicas a `migrations apply`, sem indicar execucao fora do escopo;
- `audit-dangerous-ops.sh` terminou em `RESULT: PASS` com warning historico inventariado.

---

## 11. Confirmacoes de seguranca e escopo

- Producao intocada: **SIM**
- `airtrust-db` usado: **NAO**
- `--env production` usado: **NAO**
- Deploy executado: **NAO**
- API real SIGVOOS chamada: **NAO**
- Credenciais SIGVOOS usadas: **NAO**
- FRMS alterado: **NAO**
- `frms-source-policy.ts` alterado: **NAO**
- Dados reais nao sanitizados importados: **NAO**
- E-mails enviados: **NAO**

---

## 12. Riscos restantes

1. O ledger remoto continua desalinhado:
   - `d1_migrations` permaneceu em `4`;
   - `0410` e `0411` nao foram registradas automaticamente;
   - `wrangler d1 migrations apply` continua inadequado para este staging enquanto o rebaseline nao for reconciliado.

2. Rollback estrutural continua dependente do snapshot:
   - `0411` adiciona colunas em SQLite/D1 via `ALTER TABLE ADD COLUMN`;
   - remover essas colunas exige recriacao de tabela ou restore do snapshot.

3. Validacao funcional remota do importador SIGVOOS continua pendente:
   - nao existe runner remoto governado para staging no estado atual do repo;
   - qualquer prova com payload remoto exige fase propria, fixtures aprovadas e guardrails adicionais.

---

## 13. Proxima recomendacao

1. Manter o schema `0410/0411` em staging como aplicado com sucesso.
2. Nao executar `wrangler d1 migrations apply` neste staging atual.
3. Abrir fase separada para validacao funcional remota com fixtures sinteticas aprovadas e runner governado.
4. Planejar reconciliacao/rebaseline do ledger de staging antes de qualquer uso futuro de fila canônica de migrations.

---

## 14. Resumo final

```text
VEREDITO=STAGING_0410_0411_APLICADO_COM_SUCESSO
STAGING_APLICADO=SIM
SNAPSHOT_CRIADO=SIM
MIGRATION_0410_APLICADA=SIM
MIGRATION_0411_APLICADA=SIM
PRODUCAO_INTOCADA=SIM
FRMS_INTOCADO=SIM
API_REAL_SIGVOOS_CHAMADA=NAO
VALIDACAO_FUNCIONAL_REMOTA=PENDENTE_CONTROLADA
RELATORIO_CRIADO=SIM
```
