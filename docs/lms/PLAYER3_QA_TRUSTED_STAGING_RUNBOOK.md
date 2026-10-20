# Player 3 — executar o QA sintético pelo workflow confiável da main

Contrato de governança para a PR funcional #1389; coordenação central #776. Esta documentação não é uma autorização, e o exemplo abaixo não deve ser publicado como concessão efetiva sem revisão da F0.

## 1. Pré-requisitos e escopo

- Workflow oficial proposto: `.github/workflows/staging-player3-synthetic-qa.yml`. Precisa estar integrado à `main` após revisão e oito gates. Nunca disparar o arquivo da PR DRAFT.
- Apenas `workflow_dispatch` em `refs/heads/main`; PR #1389 OPEN e mesma origem, HEAD SHA exato, oito gates + PR Check todos SUCCESS no HEAD.
- `environment: staging` com aprovação e acesso mínimo; mutex `airtrust-staging-mutations-and-scorm-qa`, sem sobreposição com Pilot, FRMS ou SCORM.
- DB D1 `airtrust-db-staging-baseline-20260701`, UUID `bf9963f4-eb12-439b-a830-20bbf577ac22`. Tenant `qa_examiner_training` / ID 999006. Verificar Schema V2 0561/0562 já aplicado uma vez; nunca reaplicar.
- Credenciais **já existentes em `staging`**, sem criação de token: `CLOUDFLARE_D1_MIGRATION_API_TOKEN` exclusivamente para D1/Time Travel e SQL; `CLOUDFLARE_WORKER_API_TOKEN` exclusivamente para R2 privado; `CLOUDFLARE_PAGES_API_TOKEN` exclusivamente para o Pages QA. Jobs `access-qa-r2` e `access-qa-pages` validam separadamente por GET somente-leitura os escopos, antes de qualquer etapa mutável, sem incluir D1. A publicação R2 e a publicação Pages usam etapas sucessivas com **um único token em cada etapa**, e comprovam hashes, proveniência e receipt do passo R2.
- O projeto Pages QA `qa-player3-staging` precisa existir separadamente de Worker/API e Pages de aplicação. O publicador recusa outro destino. A F0 criou e verificou esse projeto via Wrangler OAuth em 19/10/2026; nenhum deploy de QA foi inferido dessa criação.
- Não publicar pacotes EAD originais, não habilitar flags em clientes, não disparar produção.

## 2. Concessão específica F0 na issue #776

Um administrador autorizado deve revisar escopo, hashes, preimagem, cleanup e janela. Para **cada fase** deve publicar um novo comentário em #776 no formato abaixo (primeira linha literal, segunda parte JSON). O autor e quem dispara o workflow precisam ser `admin` no repositório; o comentário não pode ter sido editado e vale no máximo 12 horas.

```text
AIRTRUST_PLAYER3_QA_GRANT_V1
{
  "schema": "AIRTRUST_PLAYER3_QA_GRANT_V1",
  "repository": "Airtrust-Org/airtrust",
  "pr": 1389,
  "release_sha": "1c7dc659ee467a9b9bdbcc39b2a13a58878d9afb",
  "phase": "bootstrap",
  "tenant_id": 999006,
  "db_uuid": "bf9963f4-eb12-439b-a830-20bbf577ac22",
  "r2_bucket": "airtrust-storage-staging",
  "pages_project": "qa-player3-staging",
  "artifact_sha256": "0dcbbb7d50235d2e37d2c1ddda16c1f55cb2482551a6cf3a3a420829cf642b8f",
  "sql_sha256": "1192e8316a3a6f7e40531f8b80ff093d505c3479d2377553e7a42a08ff1d59ba",
  "publication_plan_sha256": "none",
  "course_id": 0,
  "approver_user_id": 0,
  "environment": "staging",
  "lock": "airtrust-staging-mutations-and-scorm-qa",
  "recovery": "D1_TIME_TRAVEL_REQUIRED",
  "cleanup": "IMMUTABLE_QA_RETENTION_REVIEW"
}
```

Os valores são uma **amostra de concessão bootstrap**, não uma concessão já emitida. A F0 deve revisar e postar o comentário; o input `grant_id` do workflow é o ID real desse comentário, nunca seu conteúdo copiado de um modelo. A guarda compara todos os campos, sem tolerar extras, inclusões de outros tenants ou reaproveitamento de fase.

## 3. Inputs de workflow_dispatch

| Input | Bootstrap | Publish | Edition |
|---|---|---|---|
| `confirmation` | `AIRTRUST_PLAYER3_SYNTHETIC_STAGING` | igual | igual |
| `release_sha` | SHA atual aprovado da #1389 | mesmo SHA aprovado | mesmo SHA aprovado |
| `phase` | `bootstrap` | `publish` | `edition` |
| `grant_id` | comentário F0 novo na #776 | novo comentário específico | novo comentário específico |
| `sql_sha256` | SHA real do bootstrap SQL | `none` | SHA real do edition SQL |
| `plan_sha256` | `none` | SHA real do JSON de publicação | mesmo SHA real |
| `course_id` | `0` | courseId físico obtido no D1 após A | mesmo courseId físico |
| `approver_user_id` | `0` | `0` | admin QA real vinculado ao tenant |

Os scripts e os hashes dos **quatro geradores/publicadores** da #1389 estão pinados dentro do executor confiável. Uma modificação nesses scripts após revisão exige nova autorização e alteração revisada dos pins; não existe fallback para código novo não revisado.

## 4. Ordem de execução e comprovação

**Pré-gate comum — acesso:** com grant vigente, o workflow consulta somente os metadados de `qa-player3-staging` com o token Pages e de `airtrust-storage-staging` com o token Worker. Qualquer HTTP 401/403, ausência de escopo ou nome errado aborta antes de SQL ou publicação. Diagnóstico remoto #39360785002 comprovou Pages `PASS` e R2 `DENIED` **quando se usou o token Pages para R2**, justificando a separação.

**Fase A — bootstrap:** após lock e approval, regenerar candidato privado sintético em diretório efêmero, confrontar `sql_sha256` aprovado, executar inventário D1 SELECT read-only, capturar bookmark Time Travel, gravar somente categoria/tipo QA, curso SCORM-alias **sem pacote**, e marcador Native; conferir ID físico de volta no D1. Preservar timestamp UTC do recovery nos logs sanitizados. Não criar matrícula nem certificado.

**Fase B — publish:** com ID físico e novo grant, gerar plano R2/Pages específico, conferir SHA do plano, inventário físico e recuperação. Etapa 1 (`publish-r2`) usa somente token Worker para quatro objetos imutáveis do tenant QA, proibindo overwrite divergente e exigindo readback integral. Etapa 2 (`publish-pages`) aceita apenas o recibo da etapa 1 no mesmo runner, usa somente token Pages para dois assets revisados, publica no **branch `main` do projeto isolado `qa-player3-staging`** (o domínio canônico `.pages.dev` corresponde ao branch de produção desse projeto QA, não à produção AirTrust) e comprova GET HTTPS com hashes exatos. `source-stage-crosswalk` e gabaritos ficam exclusivamente em R2 privado.

**Fase C — edition:** com novo grant, aprovar SHA da edição/política SQL e identidade do aprovador QA, verificar outra vez R2 privado e HTTPS usando token QA **antes** de liberar a credencial D1, aplicar transições DRAFT → REVIEWED → PUBLISHED e política DRAFT → APPROVED, depois verificar D1 read-only.

**Fase D — aceite físico posterior:** publicar Worker/Pages pela rota oficial e proveniência exata quando autorizado; habilitar as oito allowlists somente ao tenant 999006; provisionar dois alunos dedicados com bearer e storageState distintos, seis matrículas/ciclos por `POST /api/lms/native/cursos/:cursoId/matricular`; executar seis jornadas autênticas Chromium/WebKit, incluindo SCORM 1.2 externo QA, retomada, tentativa errada, avaliação calculada pelo Worker, progresso, histórico, qualificação e certificados PDF. A aprovação das fases A–C não demonstra 6/6.

## 5. Segurança, recovery e limpeza

- Time Travel registra preimagem **antes** do write; timestamp de recuperação determinístico deve ficar auditável no log protegido. O bookmark permanece privado durante o job e é descartado ao fim. Cloudflare permite recuperação por timestamp equivalente dentro da retenção. Não realizar restore de banco compartilhado sem concessão própria e coordenação de impactos.
- Os triggers V2 tornam marcador, edição, política e evidências em parte imutáveis. Não remover por DELETE/UPDATE improvisados; registrar os IDs e solicitar compensação/retirement/retention governada. R2 privado órfão precisa de decisão específica de retenção ou expurgo por manifesto.
- Salvar metadados e hashes, não exportar gabaritos, credenciais, D1 PII nem storageStates para artefatos GitHub públicos, PR ou logs.
- Se nenhum grant for publicado, o workflow nunca realiza mutações. Se o secret QA não existir ou o Pages QA não estiver provisionado, B/C falham fechados.

## 6. Critério de aceite funcional da PR #1389

Não sair de DRAFT nem fazer merge da PR funcional antes dos oito gates do candidato final, staging com Worker/Pages/schema corretos, seis evidências físicas sem mocks, proteção por aluno/tenant, histórico, qualificação e PDF real, replay e cleanup/retention documentados. Cada fase deve atualizar a issue #776 sem alegar sucesso antecipadamente.

## F0 cloud-only release request for isolated technical QA (no Mac)

When a local Desktop Commander/Wrangler session is unavailable, F0 can still request the **existing official** staging Worker+Pages deployment directly from the trusted GitHub main workflow, without installing tokens or using a workstation:

- An administrator of `Airtrust-Org/airtrust` creates exactly one single-line comment on **issue #776**: `AIRTRUST_F0_PLAYER3_STAGING_V1 <reviewed-PR-1389-HEAD-SHA>`.
- Trusted GitHub Actions workflow `.github/workflows/f0-player3-staging-issueops.yml` checks comment author and collaborator **admin** permission, exact same-repository PR #1389 head SHA, no fork, its 8 required gates plus browser SCORM and PR Check, and that the only main/main-vs-F4 delta is the already-reviewed F0 QA infrastructure. Any changed runtime file causes a **hard stop** until renewed review.
- If all guards pass it calls **only** the official `deploy-staging.yml` dispatch on main, pinning that PR head for **Worker+Pages staging** with `apply_migrations=false`, baseline authenticated smoke, and the exact originating admin issue-comment ID encoded in the already-existing `release_reason` field (without adding an 11th workflow_dispatch input). The dispatch runs as `github-actions[bot]`: the **official** staging guard resolves the comment via GitHub, re-verifies its literal command, author admin role, immutability, freshness (at most four hours), exact release SHA, PR #1389, Worker+Pages, smoke and migrations disabled; otherwise fails closed. Direct human dispatches retain their independent permission check. It has **no Cloudflare secrets**, does not execute SQL and cannot call the production deploy.
- The target official staging workflow remains responsible for its own SHA/gate verification, reviewer-protected `staging` environment, global `airtrust-staging-mutations-and-scorm-qa` mutex, version/provenance and smoke. This request does **not** grant production approval, nor certify 6/6 physical Chromium/WebKit QA journeys.
- Re-dispatching a new SHA requires a new admin comment and recomparison. After staging success, provision distinct synthetic learners/enrollments through the authorized Worker and run real browser acceptance before considering PR #1389 integration.

This route exists to support overnight GitHub-only execution when the owner's Mac is asleep. The command must never contain credentials or personal data.
