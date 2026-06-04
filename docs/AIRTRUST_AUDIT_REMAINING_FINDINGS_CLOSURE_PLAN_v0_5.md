# AirTrust - Remaining Audit Findings Closure Plan v0.5

**Data:** 2026-06-03
**Branch:** `main`
**HEAD base:** `8ca0bcd326570a105fb64a25ada942c5de668f76`
**Modo:** Sprint consolidada de fechamento documental dos achados remanescentes. Sem migration remota, sem schema remoto, sem deploy, sem alteracao de dados reais.

## 1. Resumo executivo

O AirTrust entrou numa fase em que os achados remanescentes ja nao sao de correcao rapida de codigo em producao. O que resta se divide em tres grupos:

1. governanca e rollout controlado (`Audit v2`, `RBAC/Suporte v2`, `Data Quality`, smoke com empresa esperada);
2. DDL residual com dependencias estruturais (`R01` — R09 = RESOLVED; R04 = RESOLVED Sprint R04.6; bootstrap de Documentos já removido do runtime);
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
| `R01` - SIGVOOS runtime DDL | 0387_APPLIED_IN_PRODUCTION_BUT_CHAIN_0354_STILL_NEEDS_RECONCILIATION | `0387` já foi aplicada em produção, mas `0354` continua historicamente anterior à migration base numa cadeia limpa | definir baseline/chain plan antes de qualquer remoção do fallback | GPT-5.5 Altissimo |
| `R04` - Documentos bootstrap DDL | ✅ RESOLVED (Sprint R04.7, 2026-06-04) | `0388` já aplicada e probe pós-apply PASS desde R04.5; bootstrap runtime removido na Sprint R04.6; deploy Worker/API executado na R04.7 (APP_VERSION=2026-06-04T01:43:21Z-ca6a7d9), smoke pós-deploy PASS (3/3 público, read-only PASS). R04 = RESOLVED. | Nenhuma — concluído | — |
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

## 5. R04 - Documentos — RESOLVED (Sprint R04.7, 2026-06-04)

Estado real (pós-Sprint R04.7):
- ~~`runApiBootstrap()` continua chamando `ensureDocumentosTableExists()` no startup~~ **BOOTSTRAP REMOVIDO NA SPRINT R04.6.**
- `auto-migration-documentos.ts` deletado do runtime (`git rm src/utils/auto-migration-documentos.ts`).
- `api-bootstrap.ts` limpo — `import { ensureDocumentosTableExists }` e `await ensureDocumentosTableExists(db)` removidos.
- Guard test `no-runtime-ddl-hot-paths.test.ts` atualizado — `api-bootstrap.ts` removido de `DOCUMENTED_EXCEPTIONS`, R04 documentado como `RESOLVED` nos comentários.
- Testes: `documentos-canonical-schema` (8/8), `no-runtime-ddl-hot-paths` (13/13), `tenant-isolation` (12/12) todos PASS.
- **Sprint R04.7 (2026-06-04):** deploy Worker/API executado (`APP_VERSION=2026-06-04T01:43:21Z-ca6a7d9`). Smoke pós-deploy: read-only PASS, public-only PASS (3/3). `/api/version` e `/api/health` confirmados funcionais. Deploy Pages: NÃO.
- 9 lacunas originais (L1-L9) — a `0388` e o probe estrutural remoto já mitigaram as lacunas estruturais de `documentos`; bootstrap removido sem impacto porque a migration `0388` já garante o schema canônico nos ambientes novos.
- Histórico mantido como referência: o probe estrutural confirmou baseline parcial/legada, a Sprint R04.3 fechou o desenho, a Sprint R04.4 versionou a migration, a Sprint R04.5 executou o apply oficial (`0387` + `0388` via fila pendente) com probe pós-apply PASS.

Conclusao:
- **`R04` = RESOLVED.**
- Bootstrap removido com segurança: migration `0388` já aplicada em produção (R04.5), probe pós-apply PASS, código morto eliminado (R04.6), deploy + smoke concluídos (R04.7).
- Ordem segura executada: apply 0388 (R04.5) → probe pos-migration PASS (R04.5) → remover bootstrap (R04.6) → deploy + smoke (R04.7) ✅ COMPLETO.
- Itens explicitamente adiados/não tocados pela `0388`: `historico_id`, `idx_documentos_historico`, `sha256_hash`, `idx_documentos_sha256`, `pasta_virtual.documento_id`, qualquer DDL em `certificados_templates` e os indices de `0200` baseados em colunas fantasmas.
- Documentos detalhados: `docs/AIRTRUST_DOCUMENTOS_DDL_R04_READINESS_v0_5.md` e `docs/AIRTRUST_DOCUMENTOS_0388_CANONICAL_SCHEMA_DESIGN_v0_5.md`.

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
5. ~~Remover o bootstrap de Documentos~~ ✅ CONCLUÍDO (Sprint R04.6 + R04.7). A `0388` já estava aplicada e sondada; o bootstrap foi removido (R04.6: `auto-migration-documentos.ts` deletado, `api-bootstrap.ts` limpo, guard test atualizado). Deploy Worker/API executado (R04.7: APP_VERSION=2026-06-04T01:43:21Z-ca6a7d9, smoke pós-deploy PASS 3/3). **R04 = RESOLVED.**
6. `R01 SIGVOOS Baseline/Chain` — único resíduo runtime ativo. Planejar baseline/chain plan para ambientes novos antes de remover o fallback R01. A `0387` já está aplicada em produção.
7. Expandir `EVD/Beta`, `status residual`, `observabilidade` e `R2 metadata`.

**Estado operacional atual:** `CONDITIONAL GO` para piloto/controlado; nao e `GO` pleno enquanto empresa esperada, Data Quality completo e staging flag test do Audit v2 nao estiverem fechados. A OP-2 nao alterou essa classificacao.

## 11. O que pode ser feito com 5.4/DeepSeek

- Smoke autenticado com empresa esperada.
- Data Quality completo em staging/snapshot aprovado.
- ~~Sprint curta de verificacao do `R09`~~ **CONCLUÍDO** (Sprint R09, 2026-06-03).
- ~~R04 migration aplicada / bootstrap removido~~ ✅ CONCLUÍDO (Sprint R04.5: `0388` aplicada + probe pós-apply PASS; Sprint R04.6: bootstrap removido, `auto-migration-documentos.ts` deletado, `api-bootstrap.ts` limpo; Sprint R04.7: deploy Worker/API APP_VERSION=2026-06-04T01:43:21Z-ca6a7d9, smoke pós-deploy PASS 3/3. R04 = RESOLVED.)
- Cobertura de testes beta/EVD.
- Expansao de `status-codes`.
- Auditorias de performance, observabilidade e repository pattern read-only.

## 12. O que realmente exige 5.5

- Audit v2 staging flag test/paridade controlada.
- RBAC/Suporte v2 com migration de papeis e dual-read.
- ~~`R04` se envolver deploy do Worker/API e smoke pós-deploy~~ ✅ CONCLUÍDO (Sprint R04.7, 2026-06-04). Deploy Worker/API APP_VERSION=2026-06-04T01:43:21Z-ca6a7d9, smoke pós-deploy PASS (3/3). R04 = RESOLVED.
- `R01` enquanto depender de baseline, cadeia historica e possivel estrategia de rebuild para ambientes novos.

## 13. Criterio de encerramento das auditorias

As auditorias remanescentes so podem ser consideradas encerradas quando:

1. Audit v2 tiver schema aplicado, flag validada e rollout/paridade aprovados.
2. RBAC/Suporte v2 estiver persistido, auditavel e sem dependencia do fallback legado.
3. Data Quality estiver sem `SKIPPED` relevantes em ambiente aprovado.
4. `R01` nao depender mais de DDL runtime (único resíduo runtime ativo). `R04` = RESOLVED (Sprint R04.6 + R04.7: bootstrap removido, deploy + smoke PASS). `R09` = RESOLVED (Sprint R09, 2026-06-03).
5. Smoke autenticado com empresa esperada estiver documentado como `PASS`.

**Addendum Sprint R04.6 (2026-06-03):** o bootstrap runtime de Documentos foi removido, fechando o ciclo R04 iniciado no Sprint R04.1. Ações executadas: `auto-migration-documentos.ts` deletado; `api-bootstrap.ts` limpo (import + call); guard test atualizado com R04 documentado como RESOLVED nos comentários; 3 suites de teste PASS (8/8, 13/13, 12/12). **R04 = RUNTIME_FALLBACK_REMOVED_PENDING_DEPLOY.** Nenhuma migration nova, nenhum schema remoto alterado, nenhum backfill, nenhum dado tocado. R01 permanece o único resíduo runtime ativo (`0387_APPLIED_IN_PRODUCTION_BUT_CHAIN_0354_STILL_NEEDS_RECONCILIATION`). Próximo passo: deploy do Worker/API + smoke pós-deploy → R04 = RESOLVED.

**Addendum Sprint R04.7 (2026-06-04):** o deploy do Worker/API foi executado com sucesso (`APP_VERSION=2026-06-04T01:43:21Z-ca6a7d9`). Smoke pós-deploy: read-only PASS, public-only PASS (3/3). `/api/version` e `/api/health` confirmados funcionais. Deploy Pages: NÃO. **R04 = RESOLVED.**

**Addendum Sprint R01 Chain Reconciliation (2026-06-03):** achado de bloqueio de replay limpo formalizado para R01. Nenhuma migration anterior à `0354` cria `integracoes_sigvoos_config`. `0354` falha em cadeia limpa; `0387` aplicada em produção não resolve cadeia. Testes locais 8/8 PASS. `ensureSigvoosTables()` preservado. **R01 = MIGRATION_APPLIED_CHAIN_RECONCILIATION_REQUIRED.** Doc de decisão: `docs/AIRTRUST_SIGVOOS_MIGRATION_CHAIN_RECONCILIATION_v0_5.md`.

**Addendum Sprint R01 Baseline Strategy (2026-06-03):** estratégia de resolução definida. Editar `0354` rejeitado; `0389` isolada insuficiente. Curto prazo: `scripts/bootstrap-new-environment.sql` para novos ambientes. Longo prazo: squash/rebaseline. `ensureSigvoosTables()` preservado até condições documentadas em `AIRTRUST_SIGVOOS_R01_BASELINE_STRATEGY_v0_5.md` atendidas. Próxima fase: R01-bootstrap.
