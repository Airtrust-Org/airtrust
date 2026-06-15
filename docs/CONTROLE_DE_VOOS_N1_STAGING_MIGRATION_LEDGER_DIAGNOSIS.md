# Controle de Voos N1 - Diagnostico do Ledger de Migrations do Staging

Data do diagnostico: 2026-06-14  
Escopo: diagnostico read-only do D1 `airtrust-db-staging` para preparar piloto Controle de Voos N1.  
Modo de execucao: read-only, sem apply, sem deploy, sem production, sem secrets, sem alteracao de codigo.

## 1. Sumario executivo

O D1 `airtrust-db-staging` **nao esta vazio**. Ele possui schema materializado do AirTrust, com 233 tabelas no total e 231 tabelas excluindo objetos internos `sqlite_%`. Foram encontradas tabelas principais antigas e recentes, incluindo `empresas`, `usuarios`, `funcionarios`, `qualificacoes_historico`, `aeronaves`, `frms_jornada`, `frms_acumulo_rolling`, `audit_events_v2`, `lms_cursos`, `documentos`, `user_platform_roles` e `support_access_sessions`.

O problema principal e que o schema remoto existe, mas o ledger `d1_migrations` do Wrangler esta **fortemente incompleto/desalinhado**:

- existem 381 arquivos SQL locais em `worker-airtrust/migrations/`;
- `wrangler d1 migrations list airtrust-db-staging --env staging --remote` retornou 377 migrations pendentes;
- a tabela remota `d1_migrations` existe, mas contem apenas 4 linhas;
- as 4 entradas do ledger sao exatamente os 4 arquivos locais que nao aparecem como pendentes:
  - `0000_production_schema.sql`;
  - `0003_create_usuarios.sql`;
  - `0370_create_escala_voo_diaria_justificativas.sql`;
  - `0371_create_escala_voo_diaria_publicacoes.sql`.

Diagnostico principal: **staging esta materialmente populado, mas o ledger de migrations nao representa a cadeia canonica local.** Isso indica ambiente desalinhado para `wrangler d1 migrations apply`, nao um banco vazio. O estado e compativel com rebaseline/import de schema ou execucoes diretas fora do ledger, seguido por poucas entradas registradas no `d1_migrations`.

Veredito: **nao usar o staging atual para aplicar a `0410` via Wrangler neste estado.** O apply arrastaria 377 pendencias fora do escopo do piloto.

Recomendacao objetiva: **preferir criar um D1 dedicado e descartavel para o piloto Controle de Voos N1, com snapshot/rollback e ledger controlado, apos autorizacao explicita.** Se a organizacao quiser reaproveitar o staging atual, primeiro deve executar uma fase separada de rebaseline/correcao do ledger, com backup e aprovacao, fora do Dia 0 do piloto.

## 2. Estado local

Auditoria Git:

- Branch atual: `main`;
- HEAD: `46d69b2e77bf6662acc5cd51ad45549a4e2ba69e`;
- `origin/main` curto: `971f95fe`;
- working tree ja estava sujo com alteracoes e arquivos nao rastreados fora deste diagnostico.

Arquivos de configuracao:

- `worker-airtrust/wrangler.toml` define:
  - `env.staging`;
  - D1 staging: `airtrust-db-staging`;
  - D1 id: `b7f50907-c110-45f5-ad17-e97ea47f2826`;
  - `migrations_dir = "./migrations"`;
  - production separado: `airtrust-db`, id `7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae`.
- `worker-airtrust/wrangler.dev.toml` define apenas ambiente local isolado:
  - `airtrust-db-local`;
  - id fake local `00000000-0000-0000-0000-000000000001`;
  - `migrations_dir = "./migrations"`.

Cadeia local de migrations:

- total de arquivos SQL em `worker-airtrust/migrations/`: `381`;
- primeiro arquivo listado: `0000_production_schema.sql`;
- ultimo grupo inclui `0410_controle_voos_n1_schema.sql`, `132_add_funcionario_ativo.sql`, `9999_add_modelo_sessao_id_to_agendamentos.sql` e `purge-soft-deleted-qualificacoes.sql`;
- `0410_controle_voos_n1_schema.sql` existe na cadeia canonica;
- nao foi encontrada migration `0411` em `worker-airtrust/migrations/`.

Sobre a `0410`:

- cria apenas objetos `cv_*` do Controle de Voos N1;
- usa `CREATE TABLE IF NOT EXISTS` e `CREATE INDEX IF NOT EXISTS`;
- cria as tabelas esperadas:
  - `cv_aeroportos`;
  - `cv_tipos_voo`;
  - `cv_naturezas_voo`;
  - `cv_motivos_operacionais`;
  - `cv_voos`;
  - `cv_rdv_operacional`;
  - `cv_voo_tripulantes`;
  - `cv_voo_eventos`.

Scripts com risco observados, sem execucao:

- `worker-airtrust/package.json` contem scripts de deploy e D1 que nao devem ser usados no piloto:
  - `deploy`, `deploy:staging`, `deploy:prod`;
  - `d1:migrate:staging`, que referencia `airtrust-db --env staging`, nao `airtrust-db-staging`;
  - `d1:migrate:prod`, `d1:seed:prod`, `tail --env production`.
- `package.json` contem scripts de deploy production e scripts que chamam wrappers de production.
- `scripts/` contem muitos scripts legados/operacionais que tocam remote D1, deploy, production, clone/export ou seeds. Nenhum foi executado.
- Scripts controlados de staging existentes exigem aprovacao/snapshot preexistente e nao substituem o gate do piloto.

## 3. Estado remoto read-only do D1 staging

Alvo remoto consultado:

- D1: `airtrust-db-staging`;
- env: `staging`;
- modo: `--remote`;
- comandos: somente `wrangler d1 migrations list` e `wrangler d1 execute` com `SELECT`.

### 3.1 Migrations pendentes

Resultado da listagem:

- `pending_count = 377`;
- `0410_controle_voos_n1_schema.sql` esta pendente;
- ha muitas pendencias fora do escopo do piloto.

Primeiras pendencias observadas:

```text
0016_habilitacoes_renovacao.sql
0026_create_instrutores_simulador.sql
0027_create_fichas_sessao_manobras.sql
0030_preclean_extend_qualificacoes_tipos.sql
0031_clean_qualificacoes_tipos.sql
0032_normalize_qualificacoes_historico.sql
0035_create_manobras_categorias_template.sql
0040_create_modelos_sessao.sql
0045_performance_indexes_qualificacoes_historico.sql
0046_materialized_stats_qualificacoes_historico.sql
0047_cleanup_old_stats.sql
0048_additional_indexes.sql
```

Ultimas pendencias observadas:

```text
0401_add_cor_column_tipos_sessao.sql
0402_harden_empresa_id_wave4.sql
0403_reconcile_wave4_d1_ledger.sql
0404_desativar_empresa_teste.sql
0405_add_shared_session_backend.sql
0407_qualificacoes_tipos_setores.sql
0408_lms_cursos_setores.sql
0409_lms_cursos_setores_backfill.sql
0410_controle_voos_n1_schema.sql
132_add_funcionario_ativo.sql
9999_add_modelo_sessao_id_to_agendamentos.sql
purge-soft-deleted-qualificacoes.sql
```

### 3.2 Schema remoto

Contagens remotas:

- `sqlite_master` tabelas totais: `233`;
- objetos, excluindo `sqlite_%`:
  - total: `858`;
  - tabelas: `231`;
  - indexes: `596`;
  - views: `10`;
  - triggers: `21`.

Tabelas principais encontradas:

```text
aeronaves
audit_events_v2
documentos
empresas
escala_voo_diaria
frms_acumulo_rolling
frms_jornada
funcionarios
lms_cursos
qualificacoes_historico
qualificacoes_tipos
solicitacoes_treinamento
support_access_sessions
user_platform_roles
usuarios
```

Conclusao: o staging tem schema AirTrust substancial, incluindo objetos de modulos antigos e recentes. Portanto, **nao e banco vazio**.

### 3.3 Tabelas `cv_%`

Resultado:

- `cv_table_count = 0`;
- nenhuma tabela `cv_%` foi encontrada.

Conclusao: a `0410` nao parece materializada no staging atual.

### 3.4 Ledger `d1_migrations`

A tabela `d1_migrations` existe com DDL:

```sql
CREATE TABLE d1_migrations(
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
)
```

Contagem:

- `ledger_rows = 4`.

Entradas encontradas:

```text
1 | 0000_production_schema.sql | 2026-05-21 22:10:44
2 | 0003_create_usuarios.sql | 2026-05-21 22:10:44
3 | 0370_create_escala_voo_diaria_justificativas.sql | 2026-05-21 22:12:28
4 | 0371_create_escala_voo_diaria_publicacoes.sql | 2026-05-21 22:12:28
```

Comparacao local/remoto:

- arquivos locais: `381`;
- pendentes segundo Wrangler: `377`;
- nao pendentes: `4`;
- nao pendentes sao exatamente as 4 entradas do ledger remoto.

Conclusao: o Wrangler esta se comportando de forma coerente com o ledger: ele marca como pendente todo arquivo local que nao aparece em `d1_migrations`, mesmo quando o schema materializado ja contem objetos dessas areas.

## 4. Diagnostico provavel da divergencia

O staging atual e melhor descrito como **schema materializado com ledger incompleto**, nao como banco novo, vazio ou necessariamente alvo errado.

Hipotese mais provavel:

1. `airtrust-db-staging` foi populado por uma migration/baseline grande (`0000_production_schema.sql`) ou por import/rebaseline de schema.
2. Esse baseline criou grande parte das tabelas AirTrust.
3. O ledger registrou apenas quatro arquivos.
4. A cadeia local contem centenas de migrations historicas que representam mudancas ja embutidas no baseline ou aplicadas por caminhos fora do ledger.
5. Como essas migrations nao estao registradas em `d1_migrations`, Wrangler as mostra como pendentes.

Sinais que sustentam essa hipotese:

- staging possui 233 tabelas, entao nao e vazio;
- existem tabelas de modulos recentes como `audit_events_v2`, `lms_cursos`, `user_platform_roles` e `support_access_sessions`;
- ledger tem apenas 4 entradas;
- os 377 pendentes sao exatamente `381 - 4`;
- `0410` nao esta no schema, pois nao ha tabelas `cv_%`.

Perguntas respondidas:

1. **O staging esta vazio?** Nao. Tem schema AirTrust substancial.
2. **Existem tabelas principais antigas?** Sim: `empresas`, `usuarios`, `funcionarios`, `qualificacoes_historico`, `aeronaves`, entre outras.
3. **Existe tabela de ledger?** Sim, `d1_migrations`.
4. **O ledger esta vazio, incompleto ou incompativel?** Incompleto/desalinhado em relacao a cadeia local.
5. **As 377 pendencias indicam banco novo, banco errado ou ledger quebrado?** Indicam principalmente ledger incompleto/desalinhado. O banco nao parece novo. O alvo corresponde ao staging configurado, mas esta improprio para apply normal.
6. **A `0410` poderia ser aplicada isoladamente por SQL direto?** Tecnicamente a SQL usa `CREATE ... IF NOT EXISTS` para objetos `cv_*` ausentes, entao poderia criar o schema `cv_*` se executada diretamente. Pelo processo, isso e proibido nesta fase e nao e seguro operacionalmente, porque bypassa o ledger e deixa a `0410` ainda pendente para o Wrangler.
7. **Existe forma segura de criar ambiente descartavel de piloto?** Sim, mas exige autorizacao explicita para criar/configurar D1 dedicado ou preview isolado, com backup/snapshot e runbook proprio.
8. **Melhor caminho?** Para o piloto, preferir D1 dedicado/descartavel ou preview isolado. Rebaseline do staging atual e uma fase propria, nao um atalho para o Dia 0.

## 5. Riscos

Riscos principais:

- aplicar `wrangler d1 migrations apply` no staging atual arrastaria ate 377 migrations fora do escopo;
- muitas migrations antigas podem falhar por objetos ja existentes ou por diferencas de schema;
- mesmo que algumas usem `IF NOT EXISTS`, aplicar em massa pode introduzir DDL/DML fora do piloto;
- aplicar `0410` por SQL direto cria o schema sem atualizar corretamente o ledger;
- corrigir ledger manualmente com `INSERT` em `d1_migrations` e mutacao de banco, proibido neste diagnostico e arriscado sem auditoria arquivo a arquivo;
- scripts legados podem tocar production, remote D1, deploy ou secrets se usados fora de runbook;
- staging atual contem schema amplo e possivelmente dados controlados/historicos; nao deve ser tratado como descartavel sem decisao formal;
- `0411` deve permanecer fora do piloto.

Risco especifico de SQL direto da `0410`:

- criaria tabelas `cv_*`, mas o Wrangler continuaria vendo `0410` como pendente se o ledger nao for atualizado;
- atualizar ledger manualmente seria outra mutacao sensivel;
- futuras execucoes de `migrations apply` ficariam ambiguas;
- viola o gate do Dia 0, que exige ledger coerente.

## 6. Opcoes de remediacao

| Opcao | Vantagens | Riscos | Impacto em producao | Impacto em rollback | Impacto no piloto | Complexidade | Recomendacao | GO/NO-GO |
|---|---|---|---|---|---|---|---|---|
| A - Corrigir/rebaseline do staging atual | Preserva URL/ambiente staging existente; pode tornar staging saudavel para futuros applies; corrige causa raiz operacional | Exige backup, comparacao schema-versus-migrations, decisao de ledger, possivel recriacao; risco de afetar outros usos de staging | Nenhum se mantido estritamente em staging, mas alto risco operacional se scripts errados forem usados | Medio/alto: precisa snapshot completo e plano de restauracao | Atrasa o piloto; util para plataforma, nao como atalho | Alta | Fazer em fase separada, nao no Dia 0 | NO-GO para piloto imediato |
| B - Criar D1 dedicado para piloto Controle de Voos N1 | Isola o piloto; evita contaminar staging atual; rollback simples por descarte/restauracao; permite ledger limpo e escopo controlado | Exige autorizacao para novo D1/config/binding/preview; precisa seed/auth/RBAC controlados; precisa documentar dados e acesso | Nenhum, se nao usar production nem secrets production | Baixo: ambiente descartavel ou snapshot pequeno | Melhor equilibrio para piloto real restrito | Media | **Recomendado** apos autorizacao explicita | GO condicionado |
| C - Criar ambiente preview isolado temporario | Tambem isola o piloto; pode usar config temporaria sem mexer no staging canonico; bom para ensaio tecnico | Pode nao refletir multiusuario/operacao real; precisa amarrar frontend/API/DB temporarios | Nenhum se isolado | Baixo | Bom para dry-run ou piloto tecnico limitado | Media | Alternativa boa se D1 dedicado formal demorar | GO condicionado |
| D - Usar producao com feature flag restrita | Ambiente mais fiel; evita divergencia de staging | Contraria o objetivo atual; aumenta risco regulatorio e operacional; exige controles e aprovacao separados | Alto | Alto | Nao adequado para primeiro piloto N1 | Alta | Nao usar nesta fase | NO-GO |
| E - Aplicar 0410 por SQL direto fora do ledger | Pode criar `cv_*` sem arrastar 377 migrations; tecnicamente simples porque objetos `cv_*` estao ausentes | Bypassa Wrangler; ledger continua falso; futuras migrations ficam ambiguas; viola processo; exige DDL remoto direto | Nenhum direto se staging, mas risco operacional alto | Medio: precisa rollback manual de `cv_*` ou restore | Aparenta resolver rapido, mas deixa divida operacional | Baixa tecnica, alta governanca | Nao recomendado | NO-GO |

## 7. Recomendacao

Recomendacao para o proximo passo:

1. **Nao aplicar migrations no `airtrust-db-staging` atual.**
2. **Nao aplicar `0410` por SQL direto.**
3. **Nao corrigir ledger manualmente neste fluxo.**
4. Abrir uma decisao separada:
   - ou rebaseline/correcao do staging atual com snapshot completo, diff de schema, plano de rollback e autorizacao formal;
   - ou criar um D1 dedicado e descartavel para o piloto Controle de Voos N1.
5. Para o piloto, escolher preferencialmente a opcao B:
   - novo D1 dedicado ao piloto;
   - sem production;
   - sem 0411;
   - schema base minimo/aprovado;
   - `0410` aplicada apenas quando o ledger estiver limpo e o snapshot/rollback estiver documentado;
   - usuarios e dados controlados;
   - destruicao/restauracao simples ao final.

Racional:

- o staging atual nao e confiavel para `migrations apply`;
- o piloto N1 precisa de ambiente previsivel, reversivel e com escopo restrito;
- aplicar 377 pendencias sem analise viola diretamente o gate aprovado;
- bypassar ledger cria um problema mais dificil para a proxima fase.

## 8. Comandos read-only executados

Auditoria local:

```bash
git branch --show-current
git rev-parse HEAD
git rev-parse --short origin/main
git status --short
rg -n "\\[env\\.staging\\]|\\[env\\.production\\]|database_name|database_id|migrations_dir" worker-airtrust/wrangler.toml worker-airtrust/wrangler.dev.toml
find worker-airtrust/migrations -maxdepth 1 -type f -name '*.sql' | wc -l
ls -1 worker-airtrust/migrations | rg '^(0410|0411)|0411_'
rg -n "wrangler (deploy|d1|secret|tail)|d1 (migrations|execute|export)|--env (production|staging)|airtrust-db($|[^-])|airtrust-db-staging|production|deploy" scripts package.json worker-airtrust/package.json --glob '!node_modules/**'
rg -n "CREATE TABLE|CREATE INDEX|CREATE TRIGGER|CREATE VIEW|DROP|ALTER|INSERT|UPDATE|DELETE" worker-airtrust/migrations/0410_controle_voos_n1_schema.sql
```

Auditoria remota read-only:

```bash
cd worker-airtrust
npx wrangler d1 migrations list airtrust-db-staging --env staging --remote
npx wrangler d1 execute airtrust-db-staging --env staging --remote --json --command "SELECT COUNT(*) AS table_count FROM sqlite_master WHERE type = 'table';"
npx wrangler d1 execute airtrust-db-staging --env staging --remote --json --command "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name LIMIT 80;"
npx wrangler d1 execute airtrust-db-staging --env staging --remote --json --command "SELECT COUNT(*) AS cv_table_count FROM sqlite_master WHERE type = 'table' AND name LIKE 'cv_%';"
npx wrangler d1 execute airtrust-db-staging --env staging --remote --json --command "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'cv_%' ORDER BY name;"
npx wrangler d1 execute airtrust-db-staging --env staging --remote --json --command "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'd1_migrations';"
npx wrangler d1 execute airtrust-db-staging --env staging --remote --json --command "SELECT COUNT(*) AS ledger_rows FROM d1_migrations;"
npx wrangler d1 execute airtrust-db-staging --env staging --remote --json --command "SELECT * FROM d1_migrations ORDER BY id;"
npx wrangler d1 execute airtrust-db-staging --env staging --remote --json --command "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('empresas','usuarios','funcionarios','qualificacoes_historico','qualificacoes_tipos','aeronaves','frms_jornada','frms_acumulo_rolling','audit_events_v2','lms_cursos','integracoes_sigvoos_base','sigvoos_import_batches','user_platform_roles','support_access_sessions','solicitacoes_treinamento','documentos','escala_voo_diaria') ORDER BY name;"
npx wrangler d1 execute airtrust-db-staging --env staging --remote --json --command "SELECT COUNT(*) AS object_count, SUM(CASE WHEN type = 'table' THEN 1 ELSE 0 END) AS tables, SUM(CASE WHEN type = 'index' THEN 1 ELSE 0 END) AS indexes, SUM(CASE WHEN type = 'view' THEN 1 ELSE 0 END) AS views, SUM(CASE WHEN type = 'trigger' THEN 1 ELSE 0 END) AS triggers FROM sqlite_master WHERE name NOT LIKE 'sqlite_%';"
```

## 9. Comandos explicitamente nao executados

Nao foram executados:

```bash
npx wrangler d1 migrations apply ...
npx wrangler d1 execute ... --command "INSERT ..."
npx wrangler d1 execute ... --command "UPDATE ..."
npx wrangler d1 execute ... --command "DELETE ..."
npx wrangler d1 execute ... --command "DROP ..."
npx wrangler d1 execute ... --command "CREATE ..."
npx wrangler d1 execute ... --command "ALTER ..."
npx wrangler deploy ...
npm run deploy
wrangler secret ...
npx wrangler d1 create ...
```

Tambem nao foram executados:

- qualquer comando com `--env production`;
- qualquer comando contra `airtrust-db` de producao;
- qualquer apply da `0410`;
- qualquer apply ou criacao da `0411`;
- qualquer script perigoso/legado;
- qualquer commit.

## 10. Proximo prompt recomendado

Prompt recomendado para a proxima fase, se a decisao for seguir com ambiente isolado:

```text
Voce esta no monorepo AirTrust.

Objetivo: preparar um plano controlado, ainda sem executar, para criar um D1 dedicado e descartavel do piloto Controle de Voos N1, sem tocar production, sem secrets production, sem deploy production, sem aplicar 0411 e sem usar scripts legados.

Base: docs/CONTROLE_DE_VOOS_N1_STAGING_MIGRATION_LEDGER_DIAGNOSIS.md.

Tarefa:
1. Propor nome do D1 piloto, bindings e arquivos temporarios necessarios.
2. Definir baseline minimo de schema/auth/RBAC/dados controlados.
3. Definir snapshot/rollback.
4. Definir comandos exatos, separados em dry-run/read-only e comandos que exigem autorizacao humana.
5. Nao executar criacao de D1, migrations, deploy ou alteracao de secrets.
6. Criar um runbook em docs/CONTROLE_DE_VOOS_N1_PILOT_DEDICATED_D1_RUNBOOK.md.
```

Se a decisao for recuperar o staging atual, usar prompt separado para rebaseline/correcao de ledger, com backup obrigatorio e sem piloto no mesmo fluxo.

## 11. Confirmacoes finais

- Production nao foi tocada.
- Nenhum comando `--env production` foi executado.
- Nenhuma migration foi aplicada.
- `0410` nao foi aplicada.
- `0411` nao foi aplicada.
- Nenhum deploy foi executado.
- Nenhuma secret foi lida, listada ou alterada.
- Nenhum codigo frontend/backend/config foi alterado.
- Apenas este documento de diagnostico foi criado nesta fase.

## 12. Sugestao de commit

Nao fazer commit sem autorizacao explicita.

Quando autorizado, sugestao de commit escopado:

```bash
git add docs/CONTROLE_DE_VOOS_N1_STAGING_MIGRATION_LEDGER_DIAGNOSIS.md
git commit -m "docs: diagnostica ledger de migrations do staging"
```
