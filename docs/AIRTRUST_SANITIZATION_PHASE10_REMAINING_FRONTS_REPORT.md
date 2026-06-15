# AirTrust Sanitization Phase 10 - Remaining Fronts Report

Data: 2026-06-14

## Veredito

`COMMITS SELETIVOS CRIADOS`

A Fase 10 classificou as frentes remanescentes, criou commits apenas para grupos isolados e seguros, e manteve bloqueadas as frentes com risco operacional, regulatorio ou de exposicao de superficie de ataque.

Nao houve push, pull, merge, rebase, reset destrutivo, deploy, migration, staging, producao, Cloudflare, D1 remoto, R2 ou secrets.

## Estado Git

Estado inicial observado:

```text
## main...origin/main [ahead 39]
origin/main...HEAD = 0 39
```

Estado apos os commits seletivos desta fase:

```text
## main...origin/main [ahead 41]
origin/main...HEAD = 0 41
```

Stage permaneceu controlado por `git add -- <arquivo...>`; nao foi usado `git add .` nem `git add -A`.

## Commits criados

1. `41f5da81 chore: update app icons and manifest branding`
   - `index.html`
   - `public/app.webmanifest`
   - `public/favicon.ico`
   - `public/android-chrome-192x192.png`
   - `public/android-chrome-512x512.png`
   - `public/apple-touch-icon.png`
   - `public/favicon-16x16.png`
   - `public/favicon-32x32.png`

2. `19749c66 test: add lms content preview readiness coverage`
   - `src/__tests__/lms-content-preview-readiness.test.ts`

## Decisao por frente

| Frente | Decisao | Justificativa |
| --- | --- | --- |
| Branding/assets/layout | Commitavel agora; commit criado | Alteracoes restritas a manifest, favicon e icones publicos. Sem codigo funcional, sem secrets e sem dependencia operacional remota. |
| LMS/SCORM | Parcialmente commitavel; apenas teste criado | O teste de readiness e isolado e passou em Vitest. Os arquivos `lms/scorm/6/26/index.html` e `lms/scorm/6/27/index.html` estao vazios e continuam fora do repo ate decisao explicita de versionamento/licenca/tamanho. |
| Regulated records experimental | Fase futura propria | A frente inclui migration experimental, testes e service local. Mesmo isolada de `migrations/` canonico, e materialmente uma frente funcional/regulatoria e nao deve ser misturada nesta fase. |
| Docs Controle de Voos/SIGVOOS/FRMS | Bloqueada para sanitizacao propria | Os documentos contem detalhes operacionais, rotas, fluxos e informacoes que exigem sanitizacao restritiva antes de qualquer commit. |
| Docs/governanca Records Core | Fase futura junto com regulated records | O documento novo esta ligado a evidencias e modelagem de records core. Deve acompanhar a revisao da frente experimental. |
| Migrations experimentais | Fase futura propria | `0410_experimental_regulated_records_core.sql` permanece em `migrations_experimental`; nao foi criado `0411` e nada foi movido para a cadeia canonica. |
| Arquivos temporarios/ignored | Manter fora do repo | `.env*`, dumps, backups, exports, artefatos, `node_modules`, `.wrangler`, configs piloto e temporarios permaneceram ignorados e nao foram abertos nem versionados. |

## Inventario final da working tree

Arquivos tracked ainda modificados:

```text
docs/REGULATED_RECORDS_CORE_DEVELOPMENT_LOCAL_CANDIDATE.md
docs/REGULATED_RECORDS_CORE_EXPERIMENTAL_MIGRATION.md
worker-airtrust/migrations_experimental/0410_experimental_regulated_records_core.sql
worker-airtrust/src/__tests__/migrations/regulated-records-core-experimental.test.ts
```

Arquivos untracked ainda presentes:

```text
docs/AUDITORIA_SIGVOOS_CONTROLE_VOOS_FRMS.md
docs/DECISOES_FASE0_SIGVOOS_CONTROLE_VOOS_FRMS.md
docs/GOVERNANCE_EVIDENCE_RECORD_VERTICAL_SLICE.md
docs/PLANO_MIGRACAO_SIGVOOS_PARA_CONTROLE_VOOS.md
lms/
worker-airtrust/src/__tests__/lib/
worker-airtrust/src/lib/regulated-records/governance-evidence-service.ts
```

Arquivos removidos nesta fase: nenhum.

## Arquivos bloqueados

Permanecem bloqueados para commit nesta fase:

```text
docs/AUDITORIA_SIGVOOS_CONTROLE_VOOS_FRMS.md
docs/DECISOES_FASE0_SIGVOOS_CONTROLE_VOOS_FRMS.md
docs/PLANO_MIGRACAO_SIGVOOS_PARA_CONTROLE_VOOS.md
docs/GOVERNANCE_EVIDENCE_RECORD_VERTICAL_SLICE.md
docs/REGULATED_RECORDS_CORE_DEVELOPMENT_LOCAL_CANDIDATE.md
docs/REGULATED_RECORDS_CORE_EXPERIMENTAL_MIGRATION.md
lms/
worker-airtrust/migrations_experimental/0410_experimental_regulated_records_core.sql
worker-airtrust/src/__tests__/migrations/regulated-records-core-experimental.test.ts
worker-airtrust/src/__tests__/lib/
worker-airtrust/src/lib/regulated-records/governance-evidence-service.ts
```

## Validacoes executadas

| Validacao | Resultado |
| --- | --- |
| `git diff --check` | PASS |
| `npx tsc --noEmit --pretty false` | PASS |
| `bash scripts/check-tracked-secrets.sh` | PASS (`[tracked-secrets] OK`) |
| `bash scripts/validation/audit-deploy-scripts.sh` | PASS como inventario; listou referencias historicas a migrations/deploy em scripts/docs |
| `bash scripts/audit-dangerous-ops.sh` | PASS com 1 aviso de revisao sobre scripts historicos |
| `npx vitest run src/__tests__/lms-content-preview-readiness.test.ts --reporter=dot` | PASS, 16 testes |

## Risco de push

Push ainda nao recomendado como fase final porque a working tree continua contendo frentes bloqueadas e untracked relevantes. Os dois commits criados nesta fase sao seletivos, mas a preparacao para PR/push deve acontecer somente depois de decidir o destino das frentes bloqueadas ou preservar explicitamente esses artefatos fora do pacote de publicacao.

## Recomendacao objetiva

1. Executar uma fase propria para sanitizar ou arquivar os docs Controle de Voos/SIGVOOS/FRMS antes de qualquer commit desses arquivos.
2. Executar uma fase propria para regulated records experimental, incluindo decisao explicita sobre service, testes, migration experimental e documentos de governanca.
3. Decidir se os arquivos vazios em `lms/` devem ser removidos do working tree ou substituidos por assets versionaveis aprovados.
4. Fazer preflight final somente depois que a working tree estiver sem frentes bloqueadas ou com exclusao consciente documentada.
