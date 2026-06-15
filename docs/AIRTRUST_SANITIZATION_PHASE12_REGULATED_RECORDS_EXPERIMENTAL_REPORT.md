# AirTrust Sanitization Phase 12 - Regulated Records Experimental Report

## Veredito

`REGULATED EXPERIMENTAL COMMITADO`

A frente Regulated Records Core foi revisada e sanitizada como artefato experimental/local
isolado. Ela pode ser versionada nesta fase somente como evidência técnica local, sem
promocao para cadeia canonica, sem 0411, sem aplicacao de migration e sem promessa de
homologacao, certificacao, aprovacao ou autorizacao ANAC.

## Estado inicial

- Branch inicial: `main`.
- Divergencia inicial: `origin/main...HEAD = 0 43`.
- Working tree inicial: alteracoes em artefatos regulated records experimentais, `lms/`
  nao rastreado e vazio pelo scan de arquivos.
- Sem pull, merge, rebase, push, deploy, staging, producao ou migration aplicada nesta fase.

## Arquivos revisados

- `docs/GOVERNANCE_EVIDENCE_RECORD_VERTICAL_SLICE.md`
- `docs/REGULATED_RECORDS_CORE_DEVELOPMENT_LOCAL_CANDIDATE.md`
- `docs/REGULATED_RECORDS_CORE_EXPERIMENTAL_MIGRATION.md`
- `worker-airtrust/migrations_experimental/0410_experimental_regulated_records_core.sql`
- `worker-airtrust/src/lib/regulated-records/governance-evidence-service.ts`
- `worker-airtrust/src/__tests__/lib/regulated-records/governance-evidence-service.test.ts`
- `worker-airtrust/src/__tests__/migrations/regulated-records-core-experimental.test.ts`

## Riscos encontrados

- O documento de candidate listava comandos perigosos em bloco copiavel, ainda que em
  secao proibitiva.
- O cabecalho SQL nao dizia explicitamente que o arquivo nao e 0411, nao deve ser movido
  para `worker-airtrust/migrations/` e nao autoriza uso regulado.
- A suite e o servico continuam limitados a SQLite temporario/local; isso nao prova
  concorrencia real em D1, restore drill em D1 temporario, rollback regular, assinatura,
  retencao regulatoria ou prontidao para uso regulado.

## Alteracoes feitas

- Removida a lista executavel de comandos perigosos do documento
  `REGULATED_RECORDS_CORE_DEVELOPMENT_LOCAL_CANDIDATE.md`, mantendo a proibicao em texto
  nao operacional.
- Sanitizadas referencias textuais a comandos D1 aplicaveis no documento
  `REGULATED_RECORDS_CORE_EXPERIMENTAL_MIGRATION.md`.
- Reforcado o cabecalho de
  `worker-airtrust/migrations_experimental/0410_experimental_regulated_records_core.sql`
  com as garantias: experimental/local, nao aplicar em staging/producao, nao mover para
  `worker-airtrust/migrations/`, nao representa 0411 e nao autoriza uso regulado.

## Confirmacoes de isolamento

- A migration permanece em `worker-airtrust/migrations_experimental/`.
- Nenhum arquivo `worker-airtrust/migrations/0411*` foi criado.
- Nenhum `0410_experimental*` foi criado em `worker-airtrust/migrations/`.
- Nenhuma migration foi aplicada.
- Nenhum push foi feito.
- Nenhum deploy foi feito.
- Nenhum acesso a staging ou producao foi executado.
- Nenhum Cloudflare, D1 remoto, R2 ou secret foi usado.
- Nenhum arquivo LMS/SCORM, branding/assets, docs CV/SIGVOOS, scripts, `.env`, dump,
  snapshot, export ou temporario foi incluido.
- Nenhuma declaracao de sistema homologado, certificado, aprovado ou autorizado pela
  ANAC foi introduzida.
- Records Core permanece `development-local candidate`, sem prontidao para uso regulado.

## Validacoes executadas

- `git diff --check`: PASS.
- `npx tsc --noEmit --pretty false`: PASS.
- `bash scripts/check-tracked-secrets.sh`: PASS (`[tracked-secrets] OK`).
- `bash scripts/validation/audit-deploy-scripts.sh`: PASS como inventario; listou
  referencias historicas a migrations/deploy em scripts/docs, e confirmou
  `deploy-worker-safe` sem comandos proibidos.
- `bash scripts/audit-dangerous-ops.sh`: PASS com 1 warning preexistente sobre scripts de
  sync remoto/read-only a revisar fora desta fase.
- `npx vitest run src/__tests__/migrations/regulated-records-core-experimental.test.ts src/__tests__/lib/regulated-records/governance-evidence-service.test.ts`
  em `worker-airtrust`: PASS, 2 arquivos, 32 testes.
- `npx vitest run src/__tests__/migrations/migration-governance.test.ts` em
  `worker-airtrust`: PASS, 1 arquivo, 7 testes.

## Commit

Commit seletivo criado nesta fase com a mensagem:

`chore: isolate regulated records experimental artifacts`

O commit contem apenas artefatos regulated records experimentais e este relatorio. O
diretorio `lms/` permanece fora do commit.

## Recomendacao

- Tratar `lms/` SCORM vazio em fase propria antes do preflight final: confirmar se deve ser
  removido, preenchido com artefato real ou documentado como placeholder nao rastreado.
- Depois disso, executar o preflight final com nova checagem seletiva de status, cadeia de
  migrations, docs sensiveis e artefatos nao rastreados.
