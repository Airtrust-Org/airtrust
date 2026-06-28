# AirTrust Release Flow Standardization Closeout 2026-06-27

## Escopo fechado

- PR: `#170`
- Título: `ops: standardize AirTrust release and deploy workflow`
- Merge commit: `13b3fd2efe40d636cc18e1f4112f37a97c7c4e62`
- Branch de origem: `codex/ops-release-workflow-20260627`

## Escopo confirmado

- O PR contém apenas workflow, scripts OPS, docs OPS e `package.json` para scripts operacionais.
- Nenhum arquivo funcional de produto entrou no diff do PR #170.
- Decisão: `NO_PRODUCT_CODE_CHANGED`

## Revisão do workflow

- `Deploy AirTrust` valida `refs/heads/main`.
- Exige `confirm_production=AIRTRUST_PRODUCTION`.
- Aceita `expected_sha` e falha quando não bate com `github.sha`.
- Separa `deploy_worker`, `deploy_pages` e `run_migrations`.
- `run_migrations` permanece `false` por padrão.
- Migrations exigem confirmação extra `AIRTRUST_MIGRATIONS_APPROVED`.
- Instala dependências da raiz e de `worker-airtrust`.
- Smoke de Worker e Pages é bloqueante.
- Logs do workflow não imprimem secrets.

## Repo doctor e deploy emergencial

- `npm run repo:doctor` confirma path, branch, HEAD, `origin/main`, sujeira da árvore, worktrees, dependências e versão pública do Worker.
- `repo:doctor` consulta apenas `https://api.airtrust.online/api/version` e não usa secret.
- Deploy local permanece marcado como emergência.
- O script emergencial exige confirmação explícita, pasta canônica, `HEAD == origin/main`, árvore limpa e dependências instaladas.
- O script seguro e o emergencial aceitam `main` limpa ou detached HEAD exatamente em `origin/main`.
- Decisões:
  - `REPO_DOCTOR_ADDED`
  - `LOCAL_DEPLOY_EMERGENCY_ONLY`
  - `WORKTREE_DEPLOY_PROHIBITED`

## Checks e merge

- Checks aprovados no último commit do PR:
  - `build`
  - `check-demo-data`
  - `lint`
  - `lms-smoke`
  - `test`
  - `🧪 Check PR`
- Merge executado com sucesso em `2026-06-28T07:53:23Z`.
- `main` local foi atualizado por `git pull --ff-only` até `13b3fd2efe40d636cc18e1f4112f37a97c7c4e62`.

## No-op do workflow

- O workflow atual não permite no-op.
- Motivo: a job `guard` falha quando `deploy_worker=false` e `deploy_pages=false`.
- Nenhum deploy de Worker ou Pages foi executado nesta etapa.
- Decisão: `NO_OP_WORKFLOW_NOT_AVAILABLE`

## Observações operacionais

- Para liberar o `git pull --ff-only` em `main`, os docs LMS/SCORM untracked locais foram preservados em backup externo:
  - `/tmp/airtrust-pr170-untracked-backup-20260628T0800Z`
- Isso evitou sobrescrever material local não relacionado durante o fast-forward.

## Regra futura

- Deploy padrão via GitHub Actions.
- Deploy local só em emergência.
- Worktree nunca é fonte de deploy.

## Decisão final

- `AIRTRUST_RELEASE_FLOW_STANDARDIZED`
- `GITHUB_ACTIONS_DEPLOY_PRIMARY`
- `LOCAL_DEPLOY_EMERGENCY_ONLY`
- `REPO_DOCTOR_ADDED`
- `WORKTREE_DEPLOY_PROHIBITED`
- `NO_PRODUCT_CODE_CHANGED`
- `NO_OP_WORKFLOW_NOT_AVAILABLE`
