# Production Deploy Runbook — AirTrust

**Status:** canônico para operação de produção após o cutover de 24/08/2026.  
**Autoridade de código:** `Airtrust-Org/airtrust` / GitHub `main`.  
**CI oficial:** GitHub Actions + Google Cloud Build (GCB).  
**Runtime:** Cloudflare.  
**GitLab/CircleCI:** legado; não usar como gate ou caminho de release.

Este documento não concede autorização de produção. `CLAUDE.md`, branch protection e os workflows atuais prevalecem se o contrato mudar.

## 1. Condições obrigatórias

Um release de produção só pode avançar quando todas forem verdadeiras:

1. O SHA de release é o **SHA exato da `main` atual**.
2. A alteração foi integrada por PR sem bypass de branch protection.
3. Os oito gates oficiais estão verdes para o SHA:
   - GitHub Actions: `lint`, `build-content-gates`, `worker-typecheck`;
   - GCB: `frontend-coverage`, `worker-tests-1`, `worker-tests-2`, `lms-smoke`, `public-e2e`.
4. Staging foi usado e validado quando a mudança depende de runtime, Cloudflare, auth, dados, migration ou integração.
5. Qualquer mudança de schema usa **Schema V2** pelo workflow governado correspondente, com preflight, recovery point/backup, aplicação controlada e pós-condições.
6. Existe autorização explícita, atual e inequívoca para o **SHA exato** que será publicado.
7. A autorização não foi consumida por um release anterior.
8. O operador conhece quais componentes serão publicados: Worker, Pages ou ambos.

`PR verde ≠ merge ≠ staging ≠ produção`.

## 2. Fluxo de código

```text
main atual
→ branch
→ correção e testes focados
→ PR
→ 8 gates oficiais
→ merge
→ confirmar nova main/SHA
→ staging quando aplicável
→ validação real
→ autorização de produção para o SHA exato
→ workflow oficial
→ validação pós-deploy
```

Nunca fazer push direto para `main` e nunca reduzir gate/baseline para obter verde.

## 3. Migrations e dados

O workflow `.github/workflows/deploy-airtrust.yml` **não é caminho para migrations históricas**. O input legado `run_migrations` deve permanecer `false`.

Mudanças de schema seguem `.github/workflows/apply-schema-change-v2.yml` e a família versionada em `worker-airtrust/schema-v2/`.

Antes de qualquer escrita remota de schema:

- confirmar arquivo/change ID e SHA;
- confirmar baseline/manifest/plan vigentes;
- executar preflight;
- criar/verificar recovery point ou backup requerido;
- aplicar somente a mudança allowlisted;
- validar pós-condições e ledger;
- ter rollback/estratégia compensatória documentada.

Não executar SQL remoto, seed, restore, reset ou importação real por comando improvisado.

## 4. Deploy de produção

Use exclusivamente o workflow:

`.github/workflows/deploy-airtrust.yml` — **Deploy AirTrust**.

O dispatch deve ser feito a partir de `main` e informar:

- `deploy_worker`: somente se o Worker deve ser publicado;
- `deploy_pages`: somente se o frontend deve ser publicado;
- `run_migrations`: `false`;
- `expected_sha`: SHA exato autorizado (recomendado e obrigatório operacionalmente);
- `reason`: motivo do release;
- `confirm_production`: `AIRTRUST_PRODUCTION`.

Não usar scripts locais antigos como caminho normal de produção.

## 5. Proveniência e artefatos

O workflow oficial deve manter a proveniência do release:

- source commit SHA;
- source tree;
- APP_VERSION/build time;
- hash do bundle do Worker;
- hash do manifest/config quando aplicável;
- Worker Version ID;
- artefatos/attestation gerados pelo workflow.

Divergência entre source SHA, bundle publicado ou manifesto é blocker de release.

## 6. Validação pós-deploy

Somente declare produção atualizada depois de confirmar, conforme os componentes afetados:

- `/api/version` identifica o release esperado;
- `/api/health` responde saudável;
- smoke protegido confirma que endpoints privados não ficaram públicos;
- frontend `/login` carrega sem erro crítico;
- `sw.js`/cache não mantém versão anterior quando aplicável;
- caso funcional real que motivou a release está correto.

Se Worker e Pages forem publicados separadamente, valide cada componente e não presuma que um implica o outro.

## 7. Falha e contenção

Se qualquer gate, proveniência, smoke ou pós-condição falhar:

1. interromper novas mutações;
2. preservar logs, SHA, IDs e artefatos;
3. classificar se o problema é Worker, Pages, schema ou dado;
4. usar somente rollback/neutralização governada;
5. não improvisar restore ou SQL de produção;
6. revalidar o estado efetivo antes de nova tentativa.

## 8. Registro mínimo do release

Registrar:

```text
AUTHORIZED_SHA:
MAIN_SHA:
WORKFLOW_RUN:
WORKER_VERSION_ID:
PAGES_RELEASE:
SCHEMA_CHANGE_ID: none | <id>
BACKUP/RECOVERY_POINT: none | <id>
8_GATES: PASS
POSTDEPLOY_SMOKE: PASS
REAL_CASE_VALIDATION: PASS
UTC:
```

## 9. Fontes

- `CLAUDE.md`
- `.github/workflows/deploy-airtrust.yml`
- `.github/workflows/apply-schema-change-v2.yml`
- `.github/workflows/deploy-staging.yml`
- `worker-airtrust/schema-v2/`

Documentos históricos de release servem apenas como evidência; não substituem este fluxo.
