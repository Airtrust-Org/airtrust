# Runbook oficial de release de staging

Escopo: staging apenas. Ambiente sintético. Nenhuma homologação/aceitação
ANAC. Nenhuma equivalência automática com produção. Nenhum dado real. Este
runbook cobre as funcionalidades mescladas pelos PRs #278 (currículos
compartilhados por segmento), #279 (migration 0424, EXA-V01..V04), #280
(fix D1-remoto da 0424) e #283 (sessões compartilhadas habilitáveis em
dev/staging).

## Visão geral do procedimento

1. **Backup** (`scripts/staging/backup-d1-staging.sh --apply`) — obrigatório
   antes de qualquer migration.
2. **Preflight de ledger** (`scripts/staging/migration-ledger-preflight.mjs`)
   — read-only, deve retornar `PREFLIGHT_OK`.
3. **Aplicar migration 0424** (`scripts/staging/apply-approved-migrations.sh
   --migration=0424_examiner_universal_training_fichas.sql --backup-file=...
   --apply`) — allowlisted, uma migration por vez, valida pós-condições.
4. **Seed QA** (`scripts/staging/seed-qa-examiner-training.mjs --apply`) —
   cria o `CRED-EXA` sintético que a 0424 exige como âncora (rodar **antes**
   do passo 3 se a 0424 ainda não foi aplicada — ver ordem abaixo).
5. **Deploy do Worker** com provenance real (`deploy-staging.yml`,
   `deploy_worker=true`).
6. **Deploy do frontend** (preview `staging`, nunca `production`).
7. **Smoke autenticado** (`scripts/staging/smoke-examiner-training.mjs`).

Ordem correta quando a 0424 ainda não foi aplicada: seed QA (cria CRED-EXA)
→ backup → preflight → aplicar 0424 → smoke. O guard da 0424 falha
explicitamente se o seed não rodou primeiro — isso é o comportamento
esperado, não um bug (ver `docs/ops/staging-migration-0424-disposable-d1-proof-20260711.md`).

Tudo isso é orquestrado por `.github/workflows/deploy-staging.yml`
(`workflow_dispatch` apenas, `confirmation=AIRTRUST_STAGING`,
`release_reason` obrigatório). Nenhum gatilho automático em push/merge.

## Worker — rollback

```bash
wrangler deployments list --name airtrust-api-staging
wrangler rollback <version-id-anterior> --env staging
curl -fsS https://airtrust-api-staging.airtrust.workers.dev/api/version
```

Validar que o `version`/`deploymentId` retornado corresponde ao SHA da versão
alvo do rollback antes de considerar concluído.

## Frontend — rollback

O frontend de staging é um preview (branch `staging` do projeto Pages
`airtrust`, nunca a branch `production` — ver
`docs/ops/staging-provenance.md`). Rollback = publicar um novo preview a
partir do SHA anterior; não há necessidade de invalidação de cache além do
`build-version` meta tag já stampado por SHA (cache do navegador nunca serve
uma versão antiga como se fosse atual porque o SHA está no HTML, não numa URL
estável).

## D1 — rollback

Migrations são **forward-only**. Nunca usar `DROP` manual como estratégia
padrão.

### Compensação para 0424 (se precisar desfazer)

```sql
DELETE FROM modelos_sessao_requisitos WHERE modelo_sessao_id IN (SELECT id FROM modelos_sessao WHERE codigo IN ('EXA-V01','EXA-V02','EXA-V03','EXA-V04'));
DELETE FROM modelos_sessao_manobras WHERE modelo_id IN (SELECT id FROM modelos_sessao WHERE codigo IN ('EXA-V01','EXA-V02','EXA-V03','EXA-V04'));
DELETE FROM manobras WHERE codigo LIKE 'EXA-V01-%' OR codigo LIKE 'EXA-V02-%' OR codigo LIKE 'EXA-V03-%' OR codigo LIKE 'EXA-V04-%';
DELETE FROM modelos_sessao WHERE codigo IN ('EXA-V01','EXA-V02','EXA-V03','EXA-V04');
```

Critério exato, executar antes de qualquer `DELETE` acima — a contagem deve
retornar `0`:

```sql
SELECT COUNT(*) FROM fichas_sessao fs
JOIN modelos_sessao ms ON ms.id = fs.template_id
WHERE ms.codigo IN ('EXA-V01','EXA-V02','EXA-V03','EXA-V04')
  AND fs.deleted_at IS NULL;
```

Se o resultado for diferente de `0`, **não executar a compensação** — há
ficha real vinculada a esses modelos; parar e escalar para revisão humana em
vez de perder histórico de avaliação.

### Restauração de backup completo

Reservada a incidente grave, com autorização explícita — nunca como primeira
opção. Usar o arquivo produzido por
`scripts/staging/backup-d1-staging.sh --apply` (fora do Git, com SHA-256
registrado no output do script).

### Quando restaurar backup vs. compensar

| Situação | Ação |
|---|---|
| 0424 aplicada, mas pós-condições falharam (contagens erradas) | Compensação SQL acima, nunca restauração completa. |
| Corrupção de schema generalizada / `foreign_key_check` não-vazio em múltiplas tabelas não relacionadas | Restauração de backup, com autorização explícita. |
| Ledger ambíguo (`registrada_mas_nao_aplicada`/`ambigua`) | Parar, não aplicar nada, revisão humana — nem compensação nem restauração até o estado ser entendido. |

## Seed QA — rollback

```bash
CONFIRM_STAGING_QA_SEED=AIRTRUST_STAGING_QA_SEED \
node scripts/staging/seed-qa-examiner-training.mjs --rollback --apply
```

Dry-run por padrão (sem `--apply`). Remove (soft-delete) apenas
instrutor/participantes/aeronave/simulador QA — nunca a empresa QA nem o
CRED-EXA sintético automaticamente (ver
`docs/ops/staging-qa-seed.md#nota-sobre-o-rollback-do-cred-exaempresa-qa`).
Nunca apaga dado preexistente não criado pelo seed.

## Critérios de abort (interrompem o release imediatamente)

- Provenance incorreta (`/api/version` não confere com o SHA do run, ou
  reporta `dev-local`/`latest`/ambiente errado após deploy).
- Backup inválido (vazio, ou checksum não calculável).
- Ledger ambíguo (`ambigua` ou `registrada_mas_nao_aplicada`).
- Migration parcial (qualquer contagem diferente do esperado).
- Tabela auxiliar `_migration_0424_requires_existing_cred_exa_tenant_anchor`
  remanescente em `sqlite_master` após qualquer tentativa de 0424.
- `foreign_key_check` diferente de vazio.
- Menos ou mais que 4 modelos EXA-V0x, ou contagem de técnicos ≠ 18 por
  modelo.
- Qualquer indício de vazamento cross-tenant.
- Autoassinatura possível em qualquer teste.
- Ficha ou minutos duplicados.
- Frontend apontando para a API de produção.

Se qualquer critério de abort disparar após backup+preflight mas antes da
migration: parar, não aplicar nada, registrar o incidente. Se disparar depois
da migration: aplicar a compensação documentada acima, nunca improvisar DML
corretivo.

## Limitações declaradas

- Ambiente inteiramente sintético — nenhum dado, tenant, usuário ou
  credencial real.
- Nenhuma homologação ou aceitação ANAC decorre deste procedimento.
- Nenhuma FAP, FAP13-CRED-*, ou credenciamento regulatório é criado por
  nenhum script deste PR.
- `PRAGMA integrity_check` não é suportado pelo D1 remoto — usar cópia local
  restaurada do backup como proxy (mesmo padrão já usado em
  `docs/ops/staging-examiner-training-release-20260710.md`).
- Contratos exatos de request/response do smoke (seção "Limitação conhecida"
  em `docs/ops/staging-smoke-examiner-training.md`) ainda não foram
  confirmados contra uma execução real — nenhuma execução do procedimento
  completo foi realizada nesta entrega.
