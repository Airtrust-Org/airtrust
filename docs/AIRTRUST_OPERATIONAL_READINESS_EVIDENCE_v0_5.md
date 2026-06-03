# AirTrust - Operational Readiness Evidence v0.5

**Data:** 2026-06-03
**Branch:** `main`
**HEAD base:** `b094f97f45797ff3728f0bdb9915845090ac31e5`
**Modo:** Sprint OP-2 staging operational gate. Sem migration, sem schema remoto, sem D1 remoto, sem deploy, sem alteracao de dados reais.

## 1. Objetivo

Consolidar e revalidar a evidencia operacional restante em tres frentes:

1. smoke autenticado com empresa esperada;
2. data quality read-only em ambiente permitido;
3. readiness do Audit v2 para ativacao futura por flag.

## 2. Estado inicial

- branch: `main`
- `HEAD == origin/main`: `b094f97f45797ff3728f0bdb9915845090ac31e5`
- divergencia: `0 0`
- tracked changes locais: nenhuma
- `npm run ops:guard`: PASS
- `bash scripts/preflight-clean-deploy.sh`: PASS
- observacao: `git pull --ff-only origin main` voltou a retornar o erro conhecido `Cannot fast-forward to multiple branches`, mas sem divergencia real porque `HEAD` ja estava igual a `origin/main`

## 3. Smoke autenticado

| Item | Resultado | Observacao |
|---|---|---|
| `/api/version` | PASS | HTTP 200 |
| `/api/health` | PASS | HTTP 200 |
| assets private FIRA probe | PASS | HTTP 404, nao expos documento privado |
| bloco autenticado | SKIPPED_AUTH_REQUIRED | sem `AIRTRUST_AUTH_TOKEN` ou `AIRTRUST_COOKIE` nesta sessao |
| empresa esperada | NAO VALIDADA | `AIRTRUST_EXPECTED_EMPRESA_ID` e `AIRTRUST_EXPECTED_EMPRESA_CODIGO` ausentes |
| writes | NO | nenhuma mutacao autorizada/executada |

Observacao OP-2:

- a sessao voltou a rodar somente o trecho public/read-only do smoke;
- nenhuma credencial efemera/read-only estava presente no processo;
- a tentativa de fechar empresa esperada continuou bloqueada por ausencia simultanea de auth material e `AIRTRUST_EXPECTED_EMPRESA_*`.

## 4. Data Quality

| Categoria | Resultado | Observacao |
|---|---|---|
| validacao estatica SQL | PASS | `validate-data-quality-sql.sh` e `npm run validate:data-quality-sql` passaram |
| runner local | PASS | execucao local permitida com copia temporaria do SQLite |
| resumo agregado | PASS=5 WARN=4 FAIL=0 SKIPPED=5 | sem alteracao de dados, sem PII |
| tenant/auth checks | SKIPPED parcial | colunas ausentes no snapshot local (`u.role`, `u.ativo`, `ue.is_current`) |
| simuladores | SKIPPED | tabelas ausentes no snapshot local |
| FRMS | SKIPPED | tabela `frms_jornadas` ausente no snapshot local |
| decisao do runner | SKIPPED | cobertura parcial de schema/snapshot |

Observacao OP-2:

- nao havia `AIRTRUST_DATA_QUALITY_TARGET`, `AIRTRUST_DATA_QUALITY_DB_PATH` nem `AIRTRUST_DATA_QUALITY_STAGING_DB_PATH` configurados no ambiente;
- por isso, nao existia staging/snapshot completo aprovado nesta sessao;
- a execucao segura possivel continuou sendo o runner local read-only, com o mesmo perfil agregado da OP-1.

## 5. Audit v2 readiness

Estado confirmado nesta sprint:

- migration `0385_audit_events_v2.sql`: aplicada e documentada;
- schema `audit_events_v2`: aplicado;
- writer `recordAuditEventV2()`: existe;
- dual-write parcial: existe no fluxo LMS documentado;
- flag `AUDIT_EVENTS_V2_DUAL_WRITE`: default off;
- readiness local: concluida e documentada;
- staging flag test: ainda pendente;
- ativacao em producao: nao autorizada nesta sprint.
- ativacao em staging: nao autorizada nesta sprint.

Classificacao operacional:

`Audit v2 = READY_FOR_STAGING_FLAG_TEST`

## 6. Achados ainda abertos

| Achado | Status | Proxima acao | Modelo |
|---|---|---|---|
| Smoke autenticado com empresa esperada | PARTIAL | fornecer credencial efemera/read-only e `AIRTRUST_EXPECTED_EMPRESA_ID` ou `CODIGO`, depois reexecutar | GPT-5.4 Baixa |
| Data Quality com cobertura completa | PARTIAL | executar em staging/snapshot aprovado com schema completo | GPT-5.4 Alta |
| Audit v2 staging flag test | READY_FOR_STAGING_FLAG_TEST | validar flag em staging aprovado com rollback por flag | GPT-5.5 Altissimo |
| `R01` SIGVOOS | MIGRATION_CHAIN_BLOCKED_BY_0354 | baseline/chain plan | GPT-5.5 Altissimo |
| `R04` Documentos | DESIGN_READY | planejar `0388_documentos_canonical_schema.sql` | GPT-5.5 Alta |
| `R09` shared.ts | OPEN_VERIFICATION_REQUIRED | provar cobertura de migrations e remover localmente se seguro | GPT-5.4 Alta |
| RBAC/Suporte v2 | IMPLEMENTATION_READY | implementar depois do foundation audit-first | GPT-5.5 Altissimo |

## 7. Decisao operacional

`CONDITIONAL GO`

## 8. Justificativa

O estado atual suporta piloto/controlado com guardrails ja conhecidos, mas nao fecha readiness plena para cliente externo amplo.

Motivos:

- smoke autenticado real nao pode ser reproduzido nesta sessao por ausencia de credencial e de empresa esperada;
- data quality rodou com sucesso tecnico em local, mas com `SKIPPED` relevantes por schema/snapshot incompleto e sem target staging aprovado na sessao;
- Audit v2 esta pronto para proxima etapa controlada, mas ainda sem validacao de staging flag/paridade;
- os abertos estruturais (`R01`, `R04`, `R09`, RBAC v2) continuam fora do escopo desta sprint operacional.

## 9. Proxima sprint recomendada

`U - Audit v2 staging flag test`

Pre-condicoes obrigatorias antes da proxima sprint:

1. fornecer credencial efemera/read-only para reexecutar smoke autenticado;
2. definir `AIRTRUST_EXPECTED_EMPRESA_ID` ou `AIRTRUST_EXPECTED_EMPRESA_CODIGO`;
3. fornecer staging/snapshot aprovado com schema completo para Data Quality;
4. somente depois disso abrir o staging flag test do Audit v2.

## 10. Confirmacoes de seguranca

- sem migration remota
- sem schema remoto
- sem D1 remoto
- sem backfill
- sem dados reais alterados
- sem deploy
- sem runtime alterado
- sem auth/RBAC/tenant alterado
- sem R2 real
- sem secrets
- sem PII
- sem `git add .`
- untracked historicos fora do escopo nao commitados
