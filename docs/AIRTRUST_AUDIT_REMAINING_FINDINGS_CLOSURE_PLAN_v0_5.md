# AirTrust - Remaining Audit Findings Closure Plan v0.5

**Data:** 2026-06-03
**Branch:** `main`
**HEAD base:** `8ca0bcd326570a105fb64a25ada942c5de668f76`
**Modo:** Sprint consolidada de fechamento documental dos achados remanescentes. Sem migration remota, sem schema remoto, sem deploy, sem alteracao de dados reais.

## 1. Resumo executivo

O AirTrust entrou numa fase em que os achados remanescentes ja nao sao de correcao rapida de codigo em producao. O que resta se divide em tres grupos:

1. governanca e rollout controlado (`Audit v2`, `RBAC/Suporte v2`, `Data Quality`, smoke com empresa esperada);
2. DDL residual com dependencias estruturais (`R01`, `R04` — R09 = RESOLVED Sprint R09; R04 = READY_FOR_0388_CANONICAL_WITH_PROBE_BASELINE Sprint R04.2);
3. cobertura e higiene de engenharia (EVD/beta, status residual, observabilidade, R2 metadata).

Nesta sprint consolidada, a decisao correta foi **nao executar nenhuma correcao de runtime ou migration**. O estado atual real pede documentacao mais precisa e uma ordem unica de fechamento, nao mais microfases paralelas.

**Addendum OP-1:** a sprint operacional consolidada foi executada em modo read-only. Resultado: smoke autenticado na sessao atual `SKIPPED_AUTH_REQUIRED`, empresa esperada nao validada, Data Quality local `PASS=5 WARN=4 FAIL=0 SKIPPED=5`, Audit v2 reconfirmado como `READY_FOR_STAGING_FLAG_TEST`. Decisao operacional atual: `CONDITIONAL GO`.

**Addendum OP-2:** o staging operational gate foi reexecutado sem credencial efemera/read-only e sem target staging/snapshot completo configurado no ambiente do processo. Resultado: smoke autenticado continuou `SKIPPED_AUTH_REQUIRED`, empresa esperada permaneceu nao validada, Data Quality repetiu `PASS=5 WARN=4 FAIL=0 SKIPPED=5`, Audit v2 permaneceu `READY_FOR_STAGING_FLAG_TEST`. Decisao operacional atual: `CONDITIONAL GO`.

## 2. O que ja foi fechado

| Achado | Status | Evidencia |
|---|---|---|
| `R03` - link de treinamentos planejados | RESOLVED | `0386` aplicada em producao, fallback removido, Worker/API deployado |
| `0385` - `audit_events_v2` schema | APPLIED_SCHEMA_READY_FOR_FLAG_PLAN | migration aplicada em producao; writer/flag seguem controlados |
| Version reporting | RESOLVED | `d65fc9e fix(observability): align health and version reporting` |
| Scripts D1 legados | RESOLVED | wrapper/allowlist/guards ativos; `ops:guard` PASS |
| Module gating baseline | RESOLVED/PARTIAL | contratos minimos e guards principais ativos |

## 3. O que ainda falta

| Achado | Status | Bloqueio | Proxima acao | Modelo recomendado |
|---|---|---|---|---|
| `R01` - SIGVOOS runtime DDL | MIGRATION_CHAIN_BLOCKED_BY_0354 | `0354` depende de `integracoes_sigvoos_config` antes da `0387` numa cadeia limpa | definir baseline/chain plan antes de qualquer apply/remocao | GPT-5.5 Altissimo |
| `R04` - Documentos bootstrap DDL | READY_FOR_0388_CANONICAL_WITH_PROBE_BASELINE (Sprint R04.2) | probe remoto já executado; `documentos` sem `historico_id`/`sha256_hash`, com `empresa_id DEFAULT 1`; `pasta_virtual.documento_id` ausente; `certificados_templates` existe; origem histórica ainda precisa de reconciliação documental | criar `0388_documentos_canonical_schema.sql` idempotente sobre baseline capturada | GPT-5.4 Alta |
| `R09` - `qualificacoes/shared.ts` dynamic DDL | ✅ RESOLVED (Sprint R09, 2026-06-03) | ALTER TABLE removido; `renovada`=0200+; `local`/`modalidade`=removidas por 0200; active path ja era no-op | Nenhuma | — |
| Audit v2 | READY_FOR_STAGING_FLAG_TEST | schema aplicado, mas flag/paridade ainda nao validadas em staging aprovado | executar staging flag test + rollback por flag | GPT-5.5 Altissimo |
| RBAC/Suporte v2 | IMPLEMENTATION_READY | depende do foundation audit-first e de migration de papeis | implementar schema + dual-read depois do Audit v2 | GPT-5.5 Altissimo |
| Data Quality | PARTIAL/OPEN | checks ainda ficaram `SKIPPED` e nao havia staging/snapshot completo configurado na OP-2 | executar em staging/schema completo | GPT-5.4 Alta |
| Smoke com empresa esperada | PARTIAL | sem credencial efemera/read-only e sem `AIRTRUST_EXPECTED_EMPRESA_*` tambem na OP-2 | configurar `AIRTRUST_EXPECTED_EMPRESA_ID` ou `CODIGO` e reexecutar | GPT-5.4 Baixa |

## 4. R01 - SIGVOOS

Estado real:
- `0387_integracoes_sigvoos_base_tables.sql` existe e cobre as 3 tabelas base + 4 indices.
- `0354_auditoria_critica_schema_hardening.sql` ainda faz `ALTER TABLE integracoes_sigvoos_config`.
- o teste local da Sprint Z1.1 provou que uma cadeia limpa falha na `0354` antes da `0387`.

Conclusao:
- nao e seguro aplicar/remover fallback apenas com `0387`;
- nao e seguro reescrever `0354` cegamente, porque ela ja faz parte da historia aplicada;
- a proxima acao correta e um **baseline/chain plan** para ambientes novos, nao uma migration remota imediata.

## 5. R04 - Documentos — READY_FOR_0388_CANONICAL_WITH_PROBE_BASELINE (Sprint R04.2, 2026-06-03)

Estado real (mapeado):
- `runApiBootstrap()` continua chamando `ensureDocumentosTableExists()` no startup — nao alterado nesta sprint.
- O helper cria `documentos` (12 colunas) + 5 indices.
- 9 lacunas confirmadas (L1-L9): `historico_id` bootstrap-only, `sha256_hash`/`empresa_id` migration-only, colunas fantasmas em 0200, `certificados_templates` sem CREATE, entre outras.
- Schema canonico alvo definido com 15 colunas + 9 indices.
- O probe estrutural remoto read-only ja foi executado em `production` com `PRAGMA table_info(...)` e `PRAGMA index_list(...)` para `documentos`, `pasta_virtual` e `certificados_templates`.
- Baseline capturada: `documentos` existe com `empresa_id DEFAULT 1`, sem `historico_id` e sem `sha256_hash`; `idx_documentos_uuid` nominal nao existe; `pasta_virtual.documento_id` nao existe; `certificados_templates` existe em producao.

Conclusao:
- `R04` = READY_FOR_0388_CANONICAL_WITH_PROBE_BASELINE.
- Proxima acao: criar `0388_documentos_canonical_schema.sql` adaptada ao baseline remoto capturado.
- Ordem segura futura: criar 0388 → testar local → staging → producao → remover bootstrap → deploy.
- Documento detalhado: `docs/AIRTRUST_DOCUMENTOS_DDL_R04_READINESS_v0_5.md`.

## 6. R09 - Qualificacoes shared.ts ✅ RESOLVED (Sprint R09, 2026-06-03)

Estado real (pos-Sprint R09):
- `shared.ts` era dead code — nunca importado; o active path em `historico-helpers.ts:131` ja era no-op.
- O ALTER TABLE foi removido e substituido por no-op documentado com comentario `R09-RESOLVED`.
- Colunas: `renovada` = presente no schema final via migrations 0107/0200/0325; `local`/`modalidade` = intencionalmente removidas pela migration 0200.
- O DDL removido era anti-migration — adicionaria de volta colunas removidas.
- Teste dedicado: `qualificacoes-historico-shared-schema.test.ts`.

**R09 = RESOLVED. Nenhuma acao pendente.**

## 7. Audit v2

Estado real:
- schema `audit_events_v2` aplicado em producao via `0385`;
- writer canonico versionado;
- dual-write continua atras de flag;
- readiness local concluida;
- falta apenas validacao controlada em staging/paridade operacional antes de ampliar cobertura.

Conclusao:
- o pendente principal nao e mais schema;
- o pendente principal e **ativacao controlada**.

## 8. RBAC/Suporte v2

Estado real:
- design, readiness gate, phased plan, rollback e matriz de testes estao prontos;
- runtime ainda usa fallback legado de plataforma;
- implementacao depende da ordem `audit-first`.

Conclusao:
- nao ha trabalho seguro de runtime para esta sprint;
- o proximo passo correto continua sendo a foundation depois do Audit v2 staging flag test.

## 9. Data Quality

Estado real:
- runner existe;
- SQL ja foi validado;
- faltam checks completos em ambiente com schema/snapshot aprovados;
- o smoke autenticado ainda nao fechou empresa esperada por falta de env var.

Conclusao:
- este e o grupo de pendencias mais adequado para DeepSeek/GPT-5.4;
- tambem e o grupo mais barato de fechar antes de mexer novamente em schema/governanca.

## 10. Ordem final recomendada

1. Fechar `Smoke + Data Quality` em ambiente aprovado.
2. Executar `Audit v2 Staging Flag Test` com schema ja aplicado e rollback por flag.
3. Implementar `RBAC/Suporte v2 Foundation` somente depois da paridade minima do Audit v2.
4. ~~`R09 Readiness/Verification Sprint`~~ **CONCLUÍDO** (Sprint R09, 2026-06-03).
5. Criar/aplicar `0388_documentos_canonical_schema.sql` contra a baseline remota de R04 — READY_FOR_0388_CANONICAL_WITH_PROBE_BASELINE (Sprint R04.2).
6. Planejar `R01 SIGVOOS Baseline/Chain` antes de qualquer apply/remocao do fallback.
7. Expandir `EVD/Beta`, `status residual`, `observabilidade` e `R2 metadata`.

**Estado operacional atual:** `CONDITIONAL GO` para piloto/controlado; nao e `GO` pleno enquanto empresa esperada, Data Quality completo e staging flag test do Audit v2 nao estiverem fechados. A OP-2 nao alterou essa classificacao.

## 11. O que pode ser feito com 5.4/DeepSeek

- Smoke autenticado com empresa esperada.
- Data Quality completo em staging/snapshot aprovado.
- ~~Sprint curta de verificacao do `R09`~~ **CONCLUÍDO** (Sprint R09, 2026-06-03).
- R04 probe closure / baseline estrutural remota (Sprint R04.2 concluído — baseline capturada; `0388` pendente).
- Cobertura de testes beta/EVD.
- Expansao de `status-codes`.
- Auditorias de performance, observabilidade e repository pattern read-only.

## 12. O que realmente exige 5.5

- Audit v2 staging flag test/paridade controlada.
- RBAC/Suporte v2 com migration de papeis e dual-read.
- `R04` se envolver definicao/aplicacao de schema canonico de `documentos`.
- `R01` enquanto depender de baseline, cadeia historica e possivel estrategia de rebuild para ambientes novos.

## 13. Criterio de encerramento das auditorias

As auditorias remanescentes so podem ser consideradas encerradas quando:

1. Audit v2 tiver schema aplicado, flag validada e rollout/paridade aprovados.
2. RBAC/Suporte v2 estiver persistido, auditavel e sem dependencia do fallback legado.
3. Data Quality estiver sem `SKIPPED` relevantes em ambiente aprovado.
4. `R01` e `R04` nao dependerem mais de DDL runtime. `R09` = RESOLVED (Sprint R09, 2026-06-03).
5. Smoke autenticado com empresa esperada estiver documentado como `PASS`.
