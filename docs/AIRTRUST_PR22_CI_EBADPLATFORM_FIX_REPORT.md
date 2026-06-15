# AirTrust PR #22 - CI EBADPLATFORM Fix Report

## Veredito

Correcao aplicada com escopo minimo para o PR #22. A falha `EBADPLATFORM` era causada por
dependencia direta indevida de pacote platform-specific macOS ARM64 na raiz do projeto.

## Diagnostico

- PR analisado: `#22`
- Branch do PR: `codex/airtrust-sanitization-final-preflight`
- Workflow com falha: `CI`
- Etapa com falha: `npm ci`
- Erro observado nos logs:
  `Unsupported platform for @cloudflare/workerd-darwin-arm64@1.20260317.1`
- Ambiente do GitHub Actions no check com falha:
  - Node `20.20.2`
  - npm `10.8.2`
  - OS `linux`
  - CPU `x64`

## Causa raiz

`package.json` declarava `@cloudflare/workerd-darwin-arm64` em `dependencies` na raiz. Isso
promovia um binario especifico de macOS ARM64 a dependencia obrigatoria, fazendo o `npm ci`
falhar em Linux x64 com `EBADPLATFORM`.

O `wrangler` ja traz `workerd` de forma transitiva, com binarios por plataforma em
`optionalDependencies`. O lockfile estava correto para `wrangler`, mas incorreto por causa da
dependencia direta na raiz.

## Correcao aplicada

- Removida a dependencia direta `@cloudflare/workerd-darwin-arm64` de `package.json`.
- Regenerado `package-lock.json` com `npm@10.8.2` e `--package-lock-only --ignore-scripts`.
- Validado tambem com simulacao de lockfile para `linux/x64` sem churn adicional.

## Resultado tecnico

- `package-lock.json` nao lista mais `@cloudflare/workerd-darwin-arm64` como dependencia direta
  da raiz.
- A entrada `node_modules/@cloudflare/workerd-darwin-arm64` permanece apenas como artefato
  transitivo/opcional de desenvolvimento, com `optional: true` e `dev: true`.
- Nenhum workflow de deploy foi alterado.
- Nenhuma dependencia funcional do produto foi atualizada.

## Validacoes executadas

- `git diff --check`: PASS
- `npx tsc --noEmit --pretty false`: PASS
- `bash scripts/check-tracked-secrets.sh`: PASS
- `bash scripts/validation/audit-deploy-scripts.sh`: PASS como inventario
- `bash scripts/audit-dangerous-ops.sh`: PASS com 1 warning preexistente
- `npx vitest run src/__tests__/lms-content-preview-readiness.test.ts --reporter=dot`: PASS
  - 1 arquivo, 16 testes
- Em `worker-airtrust`:
  `npx vitest run src/__tests__/migrations/regulated-records-core-experimental.test.ts src/__tests__/lib/regulated-records/governance-evidence-service.test.ts src/__tests__/migrations/migration-governance.test.ts`
  - PASS
  - 3 arquivos, 39 testes

## Arquivos alterados

- `package.json`
- `package-lock.json`
- `docs/AIRTRUST_PR22_CI_EBADPLATFORM_FIX_REPORT.md`

## Confirmacoes operacionais

- Nao houve merge do PR.
- Nao houve deploy.
- Nao houve migration aplicada.
- Nao houve acesso a staging ou producao.
- Nao houve uso de Cloudflare remoto, D1 remoto, R2 ou secrets.
- Nao houve alteracao em SIGVOOS, FRMS, RBAC, multi-tenant, Controle de Voos N1 ou regulated
  records alem do estritamente necessario para corrigir o lockfile/CI.

## Proximo passo

Fazer push somente para `codex/airtrust-sanitization-final-preflight` e reconsultar os checks
do PR #22. Nao fazer merge nesta fase.
