# AirTrust Sanitization Phase 2 Worktree Segregation Report

Data local: 2026-06-14 22:50:41 -03

Modo: segregacao de working tree e higiene local. Nenhum deploy, push, migration, D1 remoto, R2, secret ou Cloudflare foi executado.

## Veredito

**FASE 2 COM RESSALVAS**

A working tree foi classificada por frente e os utilitarios untracked de exportacao de funcionarios foram removidos do working tree apos classificacao de risco. As validacoes locais passaram. A ressalva permanece porque ainda ha multiplas frentes nao commitadas/untracked, documentos de clone/producao que exigem revisao humana e warnings historicos no guard operacional.

## Inventario Git

- Branch atual: `main`
- HEAD local: `0863fe56ae7fd0b403903d06012d66700857f119`
- `origin/main`: `971f95fe8082d32d4621272c95d4468a28fcdd7f`
- Divergencia `origin/main...HEAD`: `0 30` ou seja, local 30 commits a frente e 0 atras.
- Staged: nenhum arquivo.
- Deleted tracked: nenhum.
- Modified tracked:
  - `.gitignore`
  - `docs/REGULATED_RECORDS_CORE_DEVELOPMENT_LOCAL_CANDIDATE.md`
  - `docs/REGULATED_RECORDS_CORE_EXPERIMENTAL_MIGRATION.md`
  - `index.html`
  - `public/app.webmanifest`
  - `public/favicon.ico`
  - `src/react-app/components/AppLayout.tsx`
  - `worker-airtrust/migrations_experimental/0410_experimental_regulated_records_core.sql`
  - `worker-airtrust/src/__tests__/migrations/regulated-records-core-experimental.test.ts`
- Untracked:
  - docs arquitetura: `API_REFERENCE.md`, `ARCHITECTURE_OVERVIEW.md`, `AUTH_RBAC_MULTITENANCY.md`, `DATABASE_SCHEMA.md`, `DEPLOYMENT_AND_DEVOPS.md`, `FRMS_ARCHITECTURE.md`, `FRONTEND_ARCHITECTURE.md`, `INTEGRATIONS.md`, `LMS_ARCHITECTURE.md`, `MODULES_AND_FEATURES.md`, `SECURITY.md`
  - docs Controle/SIGVOOS: `docs/AUDITORIA_SIGVOOS_CONTROLE_VOOS_FRMS.md`, `docs/DECISOES_FASE0_SIGVOOS_CONTROLE_VOOS_FRMS.md`, `docs/PLANO_MIGRACAO_SIGVOOS_PARA_CONTROLE_VOOS.md`
  - docs sensiveis/operacionais: `docs/LOCAL_PROD_CLONE.md`
  - regulated records: `docs/GOVERNANCE_EVIDENCE_RECORD_VERTICAL_SLICE.md`, `worker-airtrust/src/lib/regulated-records/governance-evidence-service.ts`, `worker-airtrust/src/__tests__/lib/`
  - LMS/SCORM: `lms/`, `src/__tests__/lms-content-preview-readiness.test.ts`
  - branding/assets: novos icons em `public/`
- Ignored relevantes:
  - `.env.local`, `.env.local.production`, `.env.production`, `.env.test`, `src/.env.production`
  - `dist/`, `node_modules/`, `tmp/`, `worker-airtrust/.wrangler/`
  - dumps/backups: `artifacts/db-backups/`, `scripts/legacy/*.sql`, `scripts/**/*prod*.sql`, `scripts/**/*backup*.sql`, `scripts/**/*dump*.sql`
  - exports de funcionarios e os tres utilitarios removidos nesta fase.

## Classificacao Por Frente

### Fase 1 Ops Hardening

Estado: ja commitado no HEAD atual (`0863fe56`). Nao ha arquivos de hardening Fase 1 sujos, exceto ajuste adicional desta Fase 2 em `.gitignore`.

Arquivos nesta frente agora:

- `.gitignore`

Classificacao: seguro para commit seletivo junto com este relatorio, apos revisar diff.

### Sanitizacao Fase 0/Fase 1/Fase 2 Docs

- Fase 0 e Fase 1 ja estao no historico local atual.
- Novo relatorio desta fase:
  - `docs/AIRTRUST_SANITIZATION_PHASE2_WORKTREE_SEGREGATION_REPORT.md`

Classificacao: seguro para commit seletivo junto com `.gitignore`.

### Controle de Voos N1 e SIGVOOS Docs

- `docs/AUDITORIA_SIGVOOS_CONTROLE_VOOS_FRMS.md`
- `docs/DECISOES_FASE0_SIGVOOS_CONTROLE_VOOS_FRMS.md`
- `docs/PLANO_MIGRACAO_SIGVOOS_PARA_CONTROLE_VOOS.md`

Risco: medio a alto. Toca narrativa de SIGVOOS, Controle de Voos e FRMS. Nao foi alterado nesta fase. Deve aguardar revisao humana e fase propria. Nao criar `0411`.

### Branding, Assets e Layout

- `index.html`
- `public/app.webmanifest`
- `public/favicon.ico`
- `public/android-chrome-192x192.png`
- `public/android-chrome-512x512.png`
- `public/apple-touch-icon.png`
- `public/favicon-16x16.png`
- `public/favicon-32x32.png`
- `src/react-app/components/AppLayout.tsx`

Risco: medio. Pode ser commitavel apos revisao visual/local, mas deve ficar separado de scripts, docs e regulated records.

### LMS/SCORM

- `lms/scorm/6/26/index.html`
- `lms/scorm/6/27/index.html`
- `src/__tests__/lms-content-preview-readiness.test.ts`

Risco: medio. SCORM pode conter assets/dados de curso e deve ser revisado por tamanho, licenca e politica de versionamento antes de commit. O teste pode ser commitado separado se fizer sentido sem versionar os pacotes SCORM.

### Regulated Records Experimental

- `docs/REGULATED_RECORDS_CORE_DEVELOPMENT_LOCAL_CANDIDATE.md`
- `docs/REGULATED_RECORDS_CORE_EXPERIMENTAL_MIGRATION.md`
- `docs/GOVERNANCE_EVIDENCE_RECORD_VERTICAL_SLICE.md`
- `worker-airtrust/migrations_experimental/0410_experimental_regulated_records_core.sql`
- `worker-airtrust/src/__tests__/migrations/regulated-records-core-experimental.test.ts`
- `worker-airtrust/src/lib/regulated-records/governance-evidence-service.ts`
- `worker-airtrust/src/__tests__/lib/regulated-records/governance-evidence-service.test.ts`

Risco: alto. Envolve migration experimental e trilha regulada. Pode ser preparado como commit isolado, mas deve aguardar revisao tecnica/humana. Nao aplicar migration, nao mover para cadeia canonica, nao criar `0411`.

### Scripts/Export

Removidos do working tree nesta fase apos classificacao:

- `scripts/export-funcionarios.sh`
- `scripts/export_funcionarios.py`
- `scripts/export_producao.py`

Decisao: manter fora do repo. `.gitignore` agora bloqueia a reintroducao desses tres utilitarios e dos outputs CSV/JSON/relatorios de funcionarios.

### Docs Arquiteturais

- `API_REFERENCE.md`
- `ARCHITECTURE_OVERVIEW.md`
- `AUTH_RBAC_MULTITENANCY.md`
- `DATABASE_SCHEMA.md`
- `DEPLOYMENT_AND_DEVOPS.md`
- `FRMS_ARCHITECTURE.md`
- `FRONTEND_ARCHITECTURE.md`
- `INTEGRATIONS.md`
- `LMS_ARCHITECTURE.md`
- `MODULES_AND_FEATURES.md`
- `SECURITY.md`

Risco: medio. Podem ser commitados como pacote documental se forem revisados contra estado real do repo e sanitizados. `AUTH_RBAC_MULTITENANCY.md`, `FRMS_ARCHITECTURE.md` e `SECURITY.md` exigem revisao humana reforcada.

### Sujeira Temporaria/Local

- `.env*` locais ignorados.
- `tmp/`, `dist/`, `node_modules/`, `worker-airtrust/.wrangler/`.
- backups/dumps ignorados em `_arquivos_nao_usados/`, `artifacts/db-backups/`, `scripts/legacy/*.sql` e padroes `prod/backup/dump`.

Decisao: manter fora do Git. Nao abrir valores e nao mover para o repo.

## Decisao Sobre Utilitarios Untracked De Export

| Arquivo | Toca producao/remoto? | Dados pessoais/CSV/JSON? | Secrets/Cloudflare? | Risco | Decisao |
|---|---|---|---|---:|---|
| `scripts/export-funcionarios.sh` | D1 local; nao remoto | Sim, gera CSV/JSON/MD de funcionarios | Nao identificado | Alto | Removido do working tree; manter fora do repo |
| `scripts/export_funcionarios.py` | SQLite local | Sim, exporta campos pessoais de funcionarios/usuarios | Nao identificado | Alto | Removido do working tree; manter fora do repo |
| `scripts/export_producao.py` | Processa output de producao recebido por stdin | Sim, gera CSV/JSON/MD com dados pessoais e batimentos | Nao identificado no script; depende de insumo externo | Alto | Removido do working tree; manter fora do repo |

Nenhum desses scripts foi executado.

## Exports, Producao E Clone Remanescentes

Nao ha mais arquivos untracked de export de funcionarios em `scripts/`. A busca ainda lista arquivos tracked/ignored historicos com nomes `producao`/`clone`, incluindo docs em `docs/arquivo/`, scripts antigos de clone e dumps ignorados. Eles nao foram abertos nem removidos nesta fase.

Arquivos novos/untracked com risco especial:

- `docs/LOCAL_PROD_CLONE.md`: risco alto; nao commitar antes de revisar se contem comandos perigosos ou referencia a dados reais.

Arquivos tracked historicos que continuam exigindo governanca futura:

- scripts de clone/producao em `scripts/` e `scripts/legacy/`.
- docs historicos com `producao`/`clone`.
- dumps/backups ignorados.

## .gitignore

Confirmado:

- bloqueia `.env` e `.env.*`, preservando `.env.example`;
- bloqueia dumps/backups locais e artefatos `prod/backup/dump`;
- bloqueia `artifacts/db-backups/`;
- bloqueia outputs CSV/JSON/relatorios de export de funcionarios;
- agora bloqueia tambem:
  - `scripts/export-funcionarios.sh`
  - `scripts/export_funcionarios.py`
  - `scripts/export_producao.py`

## Plano De Commits Recomendado

### 1. `chore: isolate employee export artifacts`

Arquivos:

- `.gitignore`
- `docs/AIRTRUST_SANITIZATION_PHASE2_WORKTREE_SEGREGATION_REPORT.md`

Seguro agora: sim.

Revisao humana: baixa/media. Confirmar apenas que a politica desejada e manter os utilitarios de export fora do repo.

### 2. `chore: update branding and app shell assets`

Arquivos:

- `index.html`
- `public/app.webmanifest`
- `public/favicon.ico`
- `public/android-chrome-192x192.png`
- `public/android-chrome-512x512.png`
- `public/apple-touch-icon.png`
- `public/favicon-16x16.png`
- `public/favicon-32x32.png`
- `src/react-app/components/AppLayout.tsx`

Seguro agora: nao automaticamente.

Revisao humana: sim. Precisa validacao visual/local e revisao de diff.

### 3. `docs: add airtrust architecture references`

Arquivos:

- `API_REFERENCE.md`
- `ARCHITECTURE_OVERVIEW.md`
- `AUTH_RBAC_MULTITENANCY.md`
- `DATABASE_SCHEMA.md`
- `DEPLOYMENT_AND_DEVOPS.md`
- `FRMS_ARCHITECTURE.md`
- `FRONTEND_ARCHITECTURE.md`
- `INTEGRATIONS.md`
- `LMS_ARCHITECTURE.md`
- `MODULES_AND_FEATURES.md`
- `SECURITY.md`

Seguro agora: com ressalvas.

Revisao humana: sim, especialmente docs de RBAC, FRMS, security e database.

### 4. `docs: record controle voos sigvoos decisions`

Arquivos:

- `docs/AUDITORIA_SIGVOOS_CONTROLE_VOOS_FRMS.md`
- `docs/DECISOES_FASE0_SIGVOOS_CONTROLE_VOOS_FRMS.md`
- `docs/PLANO_MIGRACAO_SIGVOOS_PARA_CONTROLE_VOOS.md`

Seguro agora: nao.

Revisao humana: obrigatoria. Deve aguardar fase dedicada porque toca SIGVOOS, Controle de Voos e FRMS.

### 5. `test: add lms content preview readiness coverage`

Arquivos:

- `src/__tests__/lms-content-preview-readiness.test.ts`
- possivelmente `lms/scorm/6/26/index.html`
- possivelmente `lms/scorm/6/27/index.html`

Seguro agora: nao automaticamente.

Revisao humana: sim. Confirmar politica de versionamento de SCORM antes de incluir `lms/`.

### 6. `chore: isolate regulated records experimental artifacts`

Arquivos:

- `docs/REGULATED_RECORDS_CORE_DEVELOPMENT_LOCAL_CANDIDATE.md`
- `docs/REGULATED_RECORDS_CORE_EXPERIMENTAL_MIGRATION.md`
- `docs/GOVERNANCE_EVIDENCE_RECORD_VERTICAL_SLICE.md`
- `worker-airtrust/migrations_experimental/0410_experimental_regulated_records_core.sql`
- `worker-airtrust/src/__tests__/migrations/regulated-records-core-experimental.test.ts`
- `worker-airtrust/src/lib/regulated-records/governance-evidence-service.ts`
- `worker-airtrust/src/__tests__/lib/regulated-records/governance-evidence-service.test.ts`

Seguro agora: nao.

Revisao humana: obrigatoria. Nao aplicar migration, nao promover para canonico e nao criar `0411`.

### 7. `docs: review local production clone runbook`

Arquivos:

- `docs/LOCAL_PROD_CLONE.md`

Seguro agora: nao.

Revisao humana: obrigatoria. Pode conter comandos/fluxos de producao e deve ser sanitizado ou removido em fase separada.

## Bloqueios Restantes Antes De Staging/Deploy

1. Working tree ainda contem varias frentes misturadas.
2. Branch local esta 30 commits a frente de `origin/main`.
3. `docs/LOCAL_PROD_CLONE.md` segue untracked e deve ser revisado/sanitizado.
4. Regulated records experimental ainda envolve migration experimental `0410`; nao aplicar e nao promover.
5. Controle de Voos/SIGVOOS docs precisam revisao antes de qualquer decisao de `0411`.
6. LMS/SCORM precisa decisao de versionamento/licenca/tamanho.
7. Guard operacional passa, mas ainda reporta warning em scripts historicos de sync.
8. Staging atual e migrations continuam fora de escopo ate fase propria.

## Validacoes

- `git diff --check`: PASS
- `npx tsc --noEmit --pretty false`: PASS
- `bash scripts/check-tracked-secrets.sh`: PASS
- `bash scripts/validation/audit-deploy-scripts.sh`: PASS como inventario
- `bash scripts/audit-dangerous-ops.sh`: PASS com warning residual em scripts historicos de sync

## Confirmacoes

- Nenhum comando remoto foi executado.
- Nenhum Cloudflare foi executado.
- Nenhum D1 remoto foi tocado.
- `airtrust-db-staging` nao foi tocado.
- Nenhum R2 foi tocado.
- Nenhum secret foi lido, listado, alterado ou exibido.
- Nenhum valor de secret foi exibido.
- Nenhum deploy foi feito.
- Nenhum push foi feito.
- Nenhuma migration foi aplicada.
- `git add .` e `git add -A` nao foram usados.
- Nenhum commit foi criado automaticamente.
- `0411` nao foi criado.
- SIGVOOS, FRMS, RBAC e multi-tenant nao foram alterados.
- Nenhum arquivo de `/tmp` foi movido para o repo.

## Recomendacao Objetiva Da Fase 3

Executar **Fase 3: Commit seletivo minimo e saneamento documental**, com foco em:

1. Commitar apenas `.gitignore` + relatorio da Fase 2 se a politica de manter exports fora do repo for aceita.
2. Revisar e decidir `docs/LOCAL_PROD_CLONE.md`: remover, reescrever como runbook seguro, ou manter fora do repo.
3. Revisar docs arquiteturais por aderencia ao estado real, sem mexer em codigo.
4. Somente depois planejar fases separadas para branding/layout, LMS/SCORM e regulated records experimental.

Comando de commit seletivo seguro sugerido, se aprovado:

```bash
git add -- .gitignore docs/AIRTRUST_SANITIZATION_PHASE2_WORKTREE_SEGREGATION_REPORT.md
git commit -m "chore: isolate employee export artifacts"
```

Nao incluir outros arquivos nesse commit.
