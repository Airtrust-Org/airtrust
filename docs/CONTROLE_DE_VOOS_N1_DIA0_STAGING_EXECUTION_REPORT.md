# Controle de Voos N1 - Dia 0 Staging Execution Report

Data da execucao: 2026-06-14  
Escopo: Dia 0 tecnico do piloto Controle de Voos N1 em preview/staging.  
Veredito: **NO-GO para Dia 1 neste estado de staging**.

## 1. Ambiente alvo

Ambiente alvo confirmado antes de qualquer acao remota:

- Cloudflare env: `staging`;
- D1 target name: `airtrust-db-staging`;
- D1 target id em `worker-airtrust/wrangler.toml`: `b7f50907-c110-45f5-ad17-e97ea47f2826`;
- `migrations_dir`: `./migrations`.

Confirmacao de seguranca:

- Producao nao foi tocada.
- Nenhum comando com `--env production` foi executado.
- Nenhum deploy foi executado.
- Nenhuma secret foi lida, alterada ou listada.
- Nenhuma integracao SIGVOOS/FRMS foi criada ou alterada.
- A migration `0411` nao foi aplicada.

## 2. Branch, HEAD e status inicial

Auditoria local:

- Branch atual: `main`;
- HEAD: `3fbf83f13fc6f277aecb293d2d4511c68239647f`;
- HEAD curto: `3fbf83f1`;
- `origin/main` curto: `971f95fe`.

`git status --short` inicial mostrou working tree sujo preexistente, incluindo:

- alteracoes em documentacao;
- alteracoes em assets/frontend;
- alteracao em `worker-airtrust/migrations_experimental/0410_experimental_regulated_records_core.sql`;
- arquivos nao rastreados em documentacao, scripts, LMS e testes.

Analise de risco para esta execucao:

- `worker-airtrust/wrangler.toml` nao apareceu modificado no status;
- `worker-airtrust/wrangler.dev.toml` nao apareceu modificado no status;
- `worker-airtrust/migrations/0410_controle_voos_n1_schema.sql` existe e nao apareceu modificado no status;
- a alteracao em `migrations_experimental` nao e usada pela configuracao canonica auditada;
- nenhum arquivo do working tree foi revertido.

Ressalva: por estar em `main` e com working tree sujo, qualquer commit futuro deve ser autorizado explicitamente e feito com staging seletivo. Nao usar `git add .`.

## 3. Auditoria local de migrations e configuracao

Resultado:

- `worker-airtrust/migrations/0410_controle_voos_n1_schema.sql` existe.
- Nao foi encontrada migration `0411` em `worker-airtrust/migrations/`.
- `worker-airtrust/wrangler.toml` usa `migrations_dir = "./migrations"` em `development`, `staging` e `production`.
- `worker-airtrust/wrangler.dev.toml` usa `migrations_dir = "./migrations"`.
- Nao foi encontrada referencia a `migrations_experimental` em `worker-airtrust/wrangler.toml`, `worker-airtrust/wrangler.dev.toml`, `package.json` ou `worker-airtrust/package.json`.

Observacao sobre scripts:

- `worker-airtrust/package.json` contem scripts legados/perigosos de D1 e deploy, inclusive scripts que referenciam `airtrust-db` com `--env staging` ou `--env production`.
- Nenhum desses scripts foi executado nesta fase.
- A execucao usou apenas comandos explicitos contra `airtrust-db-staging --env staging --remote`.

## 4. Listagem remota de migrations em staging

Comando executado:

```bash
cd worker-airtrust
npx wrangler d1 migrations list airtrust-db-staging --env staging --remote
```

Resultado:

- Recurso: remoto (`Resource location: remote`);
- Secao retornada: `Migrations to be applied`;
- Total de migrations pendentes contado na saida: `377`;
- A `0410_controle_voos_n1_schema.sql` esta pendente;
- Ha muitas migrations pendentes fora do escopo esperado.

Evidencia curta da listagem:

```text
Migrations to be applied:
0016_habilitacoes_renovacao.sql
0026_create_instrutores_simulador.sql
0410_controle_voos_n1_schema.sql
9999_add_modelo_sessao_id_to_agendamentos.sql
purge-soft-deleted-qualificacoes.sql
```

Decisao do gate:

- **Bloqueado.**
- A regra do Dia 0 exige parar se houver qualquer migration pending fora do escopo esperado.
- Como existem `377` migrations pendentes e a `0410` nao e a unica pendencia, a aplicacao da `0410` nao foi autorizada por este runbook.

## 5. Snapshot/backup

Mecanismo auditado:

- `docs/backup-readiness/wrangler-d1-export-help.txt` documenta `wrangler d1 export <name> --remote --output`.
- `docs/PRODUCTION_BACKUP_AND_ROLLBACK_PLAN.md` documenta estrategia de backup para producao, nao para este Dia 0 de staging.
- `scripts/d1-backup-dev.sh` e apenas local/dev.
- Scripts controlados de staging, como `scripts/run-mig01-staging-rebaseline.sh`, exigem snapshot ja existente por variavel (`AIRTRUST_CONTROLLED_SNAPSHOT_PATH`) e aprovacao declarada; eles nao capturam um snapshot remoto autonomo para este piloto.

Decisao:

- Nenhum snapshot/backup de staging foi criado nesta execucao.
- Nenhum backup remoto foi executado porque a listagem de migrations ja bloqueou a fase antes da aplicacao.
- Nao ha evidencia suficiente de backup/snapshot especifico de staging para liberar apply da `0410`.

## 6. Aplicacao da 0410

Status: **nao aplicada**.

Motivos:

- staging tem migrations pendentes fora do escopo esperado;
- nao ha evidencia de snapshot/backup especifico de staging para este apply;
- o runbook exige parar nessas condicoes.

Comando permitido que **nao** foi executado:

```bash
cd worker-airtrust
npx wrangler d1 migrations apply airtrust-db-staging --env staging --remote
```

## 7. Validacao estrutural

Status: **nao executada como validacao pos-0410**, porque a `0410` nao foi aplicada.

Validacao estrutural esperada antes de liberar usuarios, quando o gate for corrigido e a `0410` for aplicada:

- listar tabelas `cv_%`;
- confirmar:
  - `cv_aeroportos`;
  - `cv_tipos_voo`;
  - `cv_naturezas_voo`;
  - `cv_motivos_operacionais`;
  - `cv_voos`;
  - `cv_rdv_operacional`;
  - `cv_voo_tripulantes`;
  - `cv_voo_eventos`;
- confirmar ausencia de `regulated_%`;
- confirmar ausencia das tabelas de design 0411:
  - `cv_voo_etapas`;
  - `cv_sigvoos_staging`;
  - `cv_conflitos_integracao`.

## 8. Validacao funcional

Status: **nao executada**.

Motivos:

- a migration `0410` nao foi aplicada;
- o ambiente nao foi liberado para testes funcionais de piloto;
- nao foram usadas credenciais de usuario real ou de teste nesta execucao.

Pontos de codigo verificados localmente:

- `worker-airtrust/src/routes/controle-voos.ts` contem rota autenticada `GET /dashboard`;
- o dashboard retorna `nao_regulado: true`;
- rotas de escrita usam `requireControleVoosWrite`;
- `src/react-app/hooks/useControleVoos.ts` consome `/controle-voos/dashboard`, `/controle-voos/voos` e RDV;
- telas de Controle de Voos existem em `src/react-app/pages/controle-voos/`;
- atalhos demonstrativos exibem badge `Demo` em `ControleVoosDashboard` e subnav.

Validacao funcional minima pendente para novo Dia 0:

- autenticar com usuario de teste autorizado;
- chamar `GET /api/controle-voos/dashboard`;
- confirmar `success: true`;
- confirmar `nao_regulado: true`;
- chamar `GET /api/controle-voos/voos`;
- testar perfil viewer sem escrita, se houver credencial adequada.

## 9. Confirmacoes negativas

Durante esta execucao:

- Producao nao foi tocada.
- Nao houve deploy em producao.
- Nao houve deploy em staging.
- Nenhuma migration foi aplicada em qualquer ambiente.
- `0411` nao foi aplicada.
- Nenhuma secret foi alterada.
- A fonte canonica do FRMS nao foi alterada.
- SIGVOOS nao foi integrado ao Controle de Voos.
- eDB, SDRMe, Records Core e MRO real nao foram criados.
- Nenhum commit foi criado.

## 10. Pendencias para liberar usuarios

Pendencias bloqueantes:

1. Corrigir a divergencia do ledger de migrations em `airtrust-db-staging`, pois ha `377` migrations pendentes antes/junto da `0410`.
2. Definir e registrar mecanismo seguro de snapshot/backup para `airtrust-db-staging`, com caminho fora do repositorio quando contiver dados.
3. Reexecutar `wrangler d1 migrations list airtrust-db-staging --env staging --remote` e confirmar que a unica pendencia do escopo do Dia 0 e `0410_controle_voos_n1_schema.sql`.
4. Aplicar `0410` somente apos os gates acima.
5. Executar validacao estrutural `cv_*` e ausencia de `regulated_%`/0411.
6. Executar validacao funcional minima com usuarios de teste autorizados.
7. Registrar evidencia de usuarios, RBAC, dados controlados, rollback e comunicacao do escopo nao regulado antes do Dia 1.

## 11. Veredito para Dia 1

**NO-GO para Dia 1 neste estado de staging.**

Justificativa:

- a `0410` esta pendente, mas nao e a unica migration pendente;
- ha `377` migrations pendentes no D1 remoto de staging;
- aplicar a `0410` pelo comando permitido arrastaria pendencias fora do escopo esperado;
- nao ha snapshot/backup especifico de staging evidenciado para esta execucao;
- validacoes estrutural e funcional nao podem ser consideradas concluidas sem aplicacao controlada da `0410`.

## 12. Sugestao de commit

Nao fazer commit sem autorizacao explicita.

Quando autorizado, sugestao de commit escopado:

```bash
git add docs/CONTROLE_DE_VOOS_N1_DIA0_STAGING_EXECUTION_REPORT.md
git commit -m "docs: registra execucao dia 0 staging controle voos"
```
