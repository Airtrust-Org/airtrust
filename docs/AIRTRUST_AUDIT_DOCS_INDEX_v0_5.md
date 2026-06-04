# AirTrust — Audit Docs Index v0.5

**Data:** 2026-06-04
**Branch:** `main`
**Status:** índice canônico pós-fechamento do ciclo principal e pós-cleanup residual.

## 1. Estado final do ciclo

| Stream | Status canônico |
|---|---|
| `R01` | `RESOLVED` |
| `SEC-02` | `RESOLVED` |
| `AUTH-RESIDUAL-01` | `RESOLVED` |
| `AUTH-RESIDUAL-02` | `RESOLVED` |
| `AUTH_TENANT` | `CONFIRMED_CLOSED` |
| `LOCAL_AUDIT_CLOSURE` | `CYCLE_CLOSED_FOR_CONTROLLED_SCOPE_PENDING_RELEASE_GATE` |
| `SIMULADORES_OPTIONAL_AUTH_SCOPE` | `RESOLVED` |
| `DQ-01` | `RESOLVED_FOR_CONTROLLED_SCOPE` |
| `MIG-01` | `RESOLVED_FOR_CONTROLLED_SCOPE` |
| `ARCH-01` | `MITIGATED_WITH_GUARDS` |
| `CLN-01` | `RESOLVED` |
| `SEC-04` | `MITIGATED_BY_FLAG` |
| `CLN-02` | `MITIGATED_BY_GITIGNORE_AND_INVENTORY` |
| `DOC-01` | `MITIGATED_WITH_DOC_INDEX` |
| `MNT-01` | `DOCUMENTED_ROTATION_REQUIRED` |
| `CLN-03` | `MITIGATED_BY_GITIGNORE` |
| `OPS-01` | `MITIGATED_WITH_GUARDS` |
| `VALIDATION_BASELINE` | `PASS` |
| `RBAC_SUPPORT_V2` | `GRADUAL_ENFORCEMENT_ACTIVE_FOR_CONTROLLED_SCOPE` |
| `AUDIT_V2` | `PARITY_VALIDATED_FOR_CONTROLLED_SCOPE` |
| `PRODUCT_PERFORMANCE_SCALE` | `VALIDATED_IN_STAGING_FOR_CONTROLLED_SCOPE` |
| `RES-03` | `ACCEPTED_LOW_RISK_DOCUMENTED` |
| `PRODUCTION_SCHEMA_STATE` | `VERIFIED_MISSING_AUDIT_RBAC_SCHEMA` |
| `AUTHENTICATED_SMOKE` | `BLOCKED_BY_MISSING_EPHEMERAL_CREDENTIAL` |
| `RELEASE_GATE` | `READY_WITH_CONDITIONS` |

## 2. Documentos canônicos atuais

Use estes documentos como fonte primária para status atual:

| Documento | Uso |
|---|---|
| `docs/AIRTRUST_AUDIT_CYCLE_FINAL_CLOSURE_v0_5.md` | fechamento do ciclo principal |
| `docs/AIRTRUST_MAXIMUM_LOCAL_CLOSURE_REPORT_v0_5.md` | relatorio final unico da passada atual de fechamento local maximo |
| `docs/AIRTRUST_FINAL_LOCAL_RESIDUAL_CLOSURE_AND_CONTROLLED_EXECUTION_BRIDGE_v0_5.md` | fechamento residual final de auth/tenant e ponte para execucao controlada |
| `docs/AIRTRUST_AUDIT_FINDINGS_MASTER_MATRIX_v0_5.md` | matriz mestre dos achados e streams |
| `docs/AIRTRUST_AUDIT_REMAINING_FINDINGS_CLOSURE_PLAN_v0_5.md` | plano dos remanescentes de alto impacto |
| `docs/AIRTRUST_AUDIT_CLOSURE_EXECUTIVE_SUMMARY_v0_5.md` | resumo executivo do ciclo |
| `docs/AIRTRUST_NEXT_SPRINTS_PLAN_v0_5.md` | próximos blocos grandes |
| `docs/AIRTRUST_PRODUCT_PERFORMANCE_SCALE_HARDENING_v0_5.md` | hardening local de produto/performance/scale com smoke e guards |
| `docs/AIRTRUST_PRODUCT_PERFORMANCE_SCALE_STAGING_VALIDATION_AND_FINAL_OPUS_HANDOFF_v0_5.md` | validacao staging read-only do bloco 5, reconciliacao `tsc` global e handoff final |
| `docs/AIRTRUST_DQ01_CONTROLLED_ENVIRONMENT_PACKAGE_v0_5.md` | pacote operacional rastreável de ambiente controlado para `DQ-01` |
| `docs/AIRTRUST_DQ01_LOCAL_COPY_BACKFILL_EXECUTION_RESULT_v0_5.md` | resultado da execução controlada local-copy de `DQ-01` |
| `docs/AIRTRUST_DQ01_STAGING_BACKFILL_EXECUTION_RESULT_AND_MIG01_HANDOFF_v0_5.md` | resultado da execução controlada em `staging` e handoff para `MIG-01` |
| `docs/AIRTRUST_MIG01_CONTROLLED_REBASELINE_EXECUTION_RESULT_AND_0389_HANDOFF_v0_5.md` | resultado do rebaseline controlado de `MIG-01` e handoff para a `0389` |
| `docs/AIRTRUST_0389_AUDIT_V2_RBAC_SCHEMA_EXECUTION_RESULT_AND_ENFORCEMENT_HANDOFF_v0_5.md` | resultado da janela controlada da `0389` e handoff para enforcement gradual |
| `docs/AIRTRUST_AUDIT_V2_RBAC_GRADUAL_ENFORCEMENT_RESULT_AND_PRODUCT_HANDOFF_v0_5.md` | fechamento do bloco 4 com apply da `0385`, paridade controlada de `Audit v2` e enforcement gradual de RBAC/Suporte |
| `docs/AIRTRUST_REPOSITORY_CLEANUP_GOVERNANCE_PUBLIC_SURFACE_v0_5.md` | cleanup residual, governança e superfície pública |
| `docs/AIRTRUST_AUDIT_V2_RBAC_SUPPORT_GOVERNANCE_v0_5.md` | matriz de RBAC/suporte/admin/maintenance/debug/audit da passada atual |
| `docs/AIRTRUST_AUDIT_V2_RBAC_SUPPORT_SCHEMA_READINESS_v0_5.md` | fundação de schema/readiness para `Audit v2` + `RBAC/Suporte v2` |
| `docs/AIRTRUST_AUDIT_DOCS_INDEX_v0_5.md` | este índice |
| `docs/AIRTRUST_RELEASE_GATE_RESIDUAL_RECONCILIATION_v0_5.md` | reconciliação do release gate: schema de produção verificado, residuais LOW aceitos, condições para deploy controlado |

## 3. Documentos de readiness e execution gates

Usar para `DQ-01`, `MIG-01` e trilhas controladas:

| Documento | Status |
|---|---|
| `docs/AIRTRUST_CONTROLLED_EXECUTION_ENVIRONMENT_CONTRACT_v0_5.md` | canônico |
| `docs/AIRTRUST_DQ01_MIG01_CONTROLLED_EXECUTION_RUNBOOK_v0_5.md` | canônico |
| `docs/AIRTRUST_DQ01_CONTROLLED_BACKFILL_EXECUTION_v0_5.md` | canônico |
| `docs/AIRTRUST_DQ01_CONTROLLED_ENVIRONMENT_PACKAGE_v0_5.md` | canônico |
| `docs/AIRTRUST_DQ01_LOCAL_COPY_BACKFILL_EXECUTION_RESULT_v0_5.md` | canônico |
| `docs/AIRTRUST_DQ01_STAGING_BACKFILL_EXECUTION_RESULT_AND_MIG01_HANDOFF_v0_5.md` | canônico |
| `docs/AIRTRUST_DATA_QUALITY_BACKFILL_READINESS_v0_5.md` | canônico |
| `docs/AIRTRUST_MIGRATION_REBASELINE_READINESS_v0_5.md` | canônico |
| `docs/controlled-execution/dq01-target-evidence-20260604.md` | evidência do target `local-copy` |
| `docs/controlled-execution/dq01-rollback-plan-20260604.md` | rollback testável da janela `DQ-01` |
| `docs/controlled-execution/dq01-staging-target-evidence-20260604.md` | evidência do target `staging` |
| `docs/controlled-execution/dq01-staging-rollback-plan-20260604.md` | rollback testável da janela `DQ-01` em `staging` |
| `docs/controlled-execution/mig01-staging-target-evidence-20260604.md` | evidência do target `staging` para `MIG-01` |
| `docs/controlled-execution/mig01-staging-rollback-plan-20260604.md` | rollback testável da janela `MIG-01` em `staging` |
| `docs/controlled-execution/mig01-staging-schema-baseline-20260604.sql` | baseline SQL de schema gerado a partir do snapshot `staging` |
| `docs/controlled-execution/0389-staging-target-evidence-20260604.md` | evidência do target `staging` para a `0389` |
| `docs/controlled-execution/0389-staging-rollback-plan-20260604.md` | rollback testável da janela `0389` em `staging` |
| `docs/controlled-execution/audit-v2-staging-target-evidence-20260604.md` | evidência do target `staging` para a `0385` / `Audit v2` |
| `docs/controlled-execution/audit-v2-staging-rollback-plan-20260604.md` | rollback testável da janela `Audit v2` em `staging` |

## 4. Documentos históricos/encerrados

Estes documentos continuam úteis como trilha de auditoria, mas não devem ser usados isoladamente para status atual:

| Documento | Observação |
|---|---|
| `docs/AIRTRUST_OPUS_GENERAL_AUDIT_20260601.md` | baseline Opus anterior ao fechamento |
| `docs/AIRTRUST_OPUS_REAUDIT_V2_20260602.md` | reauditoria Opus pós-hardening |
| `docs/AIRTRUST_OPUS_ARCH_EFFICIENCY_AUDIT_20260602.md` | auditoria específica, não status mestre |
| `docs/AIRTRUST_OPUS_CUSTOMER_LAUNCH_READINESS_20260602.md` | readiness temática |
| `docs/AIRTRUST_OPUS_MEGA_SCALE_PRODUCT_READINESS_20260602.md` | readiness temática |
| `docs/AIRTRUST_OPUS_MULTI_COMPANY_RBAC_PRODUCT_READINESS_20260602.md` | readiness temática |
| `docs/AIRTRUST_OPUS_STRATEGIC_ROADMAP_20260602.md` | roadmap, não status de fechamento |

## 5. Documentos que não devem ser usados como fonte atual

| Tipo | Motivo |
|---|---|
| relatórios em `docs/arquivo/` | históricos/operacionais, sem curadoria atual |
| inventários sensíveis antigos | podem conter contexto antigo ou classificado |
| artefatos soltos de smoke/deploy/staging | evidência pontual, não status canônico |
| relatórios Opus não reconciliados com o ciclo | úteis como input, não como status final |

## 6. Próximos blocos grandes

1. ✅ Reauditoria final Opus / release gate do ciclo — `RELEASE_GATE = READY_FOR_CONTROLLED_RELEASE` (2026-06-04).
2. ✅ Smoke autenticado com credencial efêmera — `AUTHENTICATED_SMOKE = PASS` (PASS=11, FAIL=0, SKIPPED=2, 2026-06-04 Bloco 6.2).
3. **Controlled Release / Deploy Gate Execution** — próximo bloco: snapshot pré-deploy, approval nominal, deploy Worker, smoke pós-deploy.
4. Ampliar o enforcement gradual de `RBAC/Suporte v2` somente após nova validação operacional controlada (post-release).
