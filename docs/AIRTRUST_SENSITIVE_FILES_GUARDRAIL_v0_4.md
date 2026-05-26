# AIRTRUST v0.4 — Sensitive Files Guardrail

## 1) O que foi encontrado (inventario por caminho, sem leitura de conteudo)

Levantamento executado com `scripts/validation/audit-sensitive-files.sh` em modo read-only.

Resumo atual de candidatos rastreados:

- `SECRET_ENV`: 4
- `PROD_DUMP_OR_BACKUP`: 92
- `LOCAL_SEED`: 17
- `TEST_FIXTURE`: 2
- `MIGRATION`: 355
- `UNKNOWN_REVIEW_REQUIRED`: 231

Observacoes:

- Foram detectados arquivos `.env*` rastreados.
- Foram detectados dumps/backups SQL grandes em caminhos legados.
- Foram detectados muitos SQLs que exigem triagem entre migration legitima vs legado operacional.

## 2) O que nao foi feito nesta fase

- Nao houve remocao de arquivos.
- Nao houve move/rename de arquivos.
- Nao houve reescrita de historico Git.
- Nao houve `git filter-repo`/BFG.
- Nao houve deploy.
- Nao houve migration.
- Nao houve escrita em banco.
- Nao houve exibicao de conteudo de segredo.

## 3) Politica de guardrail

- Segredos devem ficar fora do Git.
- Dumps/backup de producao devem ficar fora do Git.
- Seeds sanitizados so podem existir se documentados e claramente identificados.
- Migrations oficiais podem continuar versionadas.
- Arquivos sensiveis ja rastreados exigem fase separada para remocao controlada e governanca.

## 4) Proxima fase recomendada (controlada)

1. Backup seguro externo dos artefatos que precisarem ser preservados.
2. Remocao controlada do index (`git rm --cached`) apenas dos caminhos autorizados.
3. Rotacao de segredos caso qualquer `.env` rastreado contenha segredo real.
4. Se necessario, limpeza de historico apenas em clone isolado, com plano aprovado e janela controlada.

## 5) Guardrail implementado

- Script: `scripts/validation/audit-sensitive-files.sh`
- Objetivo: detectar candidatos sensiveis rastreados por caminho/categoria sem ler conteudo.
- Comportamento:
  - lista caminhos classificados;
  - retorna `exit 1` quando houver categorias bloqueantes;
  - mantem allowlist explicita para `MIGRATION` e `TEST_FIXTURE`.

## 6) H6-A — Tracked env files removed from index

- Caminhos removidos do index (sem apagar local):
  - `.env.local.production`
  - `.env.production`
  - `.env.test`
  - `src/.env.production`
- Confirmacao de preservacao local:
  - todos os caminhos acima permaneceram presentes no filesystem local apos `git rm --cached`.
- Sigilo:
  - nenhum conteudo de segredo foi exibido; apenas caminhos e status.
- Guardrail apos H6-A:
  - `SECRET_ENV`: 0 (antes: 4)
  - `PROD_DUMP_OR_BACKUP`: 92
  - `LOCAL_SEED`: 17
  - `TEST_FIXTURE`: 2
  - `MIGRATION`: 355
  - `UNKNOWN_REVIEW_REQUIRED`: 231
  - bloqueantes restantes: 340
- Pendencia:
  - dumps/seeds/unknown continuam para fase separada de classificacao e remocao controlada.

## 7) H6-B — Classification of remaining blocking files

- Data: 2026-05-25
- Ferramenta/modelo: DeepSeek (inteligencia media)
- Escopo: classificacao read-only dos 340 arquivos bloqueantes restantes (sem apagar, sem mover, sem ler conteudo)
- Resultado da classificacao:
  - `REMOVE_INDEX_CANDIDATE_HIGH_CONFIDENCE`: 230 (67.6%)
  - `KEEP_VERSIONED_LIKELY_VALID`: 19 (5.6%)
  - `MANUAL_REVIEW_REQUIRED`: 85 (25.0%)
  - `DO_NOT_TOUCH`: 6 (1.8%)
- Relatorio completo: `docs/AIRTRUST_SENSITIVE_FILES_CLASSIFICATION_H6B_v0_4.md`
- Primeiro lote H6-C recomendado: 10 arquivos (3 dumps grandes + 7 token/secret files)
- Top 3 criticos por tamanho:
  - `scripts/seed-local.sql` (19.6 MB)
  - `scripts/legacy/d1-prod-20260315-193839.sql` (19.1 MB)
  - `scripts/legacy/backup_pre_multitenant_20251207_142032.sql` (4.9 MB)
- Validacoes: `audit-sensitive-files.sh`, `npx tsc --noEmit`, `npx tsc -p worker-airtrust/tsconfig.json --noEmit`, `npm run build` — todas ok.

## 8) H6-C — First sensitive-file batch removed from Git index

- Data: 2026-05-25
- Acao: `git rm --cached` em 10 arquivos do primeiro lote (3 dumps SQL + 7 token/secret files)
- Confirmacao: todos os 10 arquivos permanecem localmente
- Guardrail apos H6-C:
  - `SECRET_ENV`: 0
  - `PROD_DUMP_OR_BACKUP`: 90 (antes: 92)
  - `LOCAL_SEED`: 16 (antes: 17)
  - `TEST_FIXTURE`: 2
  - `MIGRATION`: 355
  - `UNKNOWN_REVIEW_REQUIRED`: 224 (antes: 231)
  - bloqueantes restantes: 330 (antes: 340)
- Caminhos removidos do index:
  - `scripts/seed-local.sql` (19.6 MB)
  - `scripts/legacy/d1-prod-20260315-193839.sql` (19.1 MB)
  - `scripts/legacy/backup_pre_multitenant_20251207_142032.sql` (4.9 MB)
  - `docs/maintenance-secret-production/secret-list-after.txt`
  - `docs/maintenance-secret-production/secret-list-before.txt`
  - `docs/maintenance-secret-staging/secret-list-after.txt`
  - `docs/maintenance-secret-staging/secret-list-before.txt`
  - `docs/maintenance-secret-staging/secret-put-output.txt`
  - `docs/frontend-staging-smoke/token-extracted.txt`
  - `docs/staging-frontend-smoke/token-extracted.txt`
- Pendencia:
  - 220 REMOVE_INDEX_CANDIDATE_HIGH_CONFIDENCE restantes
  - 85 MANUAL_REVIEW_REQUIRED pendentes de revisao humana

## 9) H6-D — Second sensitive-file batch removed from Git index

- Data: 2026-05-25
- Acao: `git rm --cached` em 20 arquivos (16 dumps/exports + 4 seeds)
- Confirmacao: todos os 20 arquivos permanecem localmente
- Guardrail apos H6-D:
  - `SECRET_ENV`: 0
  - `PROD_DUMP_OR_BACKUP`: 74 (antes: 90)
  - `LOCAL_SEED`: 12 (antes: 16)
  - `TEST_FIXTURE`: 2
  - `MIGRATION`: 355
  - `UNKNOWN_REVIEW_REQUIRED`: 224
  - bloqueantes restantes: 310 (antes: 330)
- Lotes removidos:
  - 5 prod SQL backups (~8.8 MB combinados)
  - 4 prod data exports
  - 2 prod exports (qualificacoes_historico)
  - 2 timestamped prod backups
  - 2 schema dumps (docs/)
  - 1 prod export script
  - 4 seeds restantes
- Pendencia:
  - 200 REMOVE_INDEX_CANDIDATE_HIGH_CONFIDENCE restantes
  - 85 MANUAL_REVIEW_REQUIRED pendentes de revisao humana
