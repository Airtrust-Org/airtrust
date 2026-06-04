# AirTrust — Audit Docs Index v0.5

**Data:** 2026-06-04
**Branch:** `main`
**Status:** índice canônico pós-fechamento do ciclo principal e pós-cleanup residual.

## 1. Estado final do ciclo

| Stream | Status canônico |
|---|---|
| `R01` | `RESOLVED` |
| `SEC-02` | `RESOLVED` |
| `SIMULADORES_OPTIONAL_AUTH_SCOPE` | `RESOLVED` |
| `DQ-01` | `BLOCKED_BY_CONTROLLED_ENVIRONMENT_NOT_AVAILABLE` |
| `MIG-01` | `BLOCKED_BY_CONTROLLED_ENVIRONMENT_NOT_AVAILABLE` |
| `ARCH-01` | `MITIGATED_WITH_GUARDS` |
| `CLN-01` | `RESOLVED` |
| `SEC-04` | `MITIGATED_BY_FLAG` |
| `CLN-02` | `MITIGATED_BY_GITIGNORE_AND_INVENTORY` |
| `DOC-01` | `MITIGATED_WITH_DOC_INDEX` |
| `MNT-01` | `DOCUMENTED_ROTATION_REQUIRED` |
| `CLN-03` | `MITIGATED_BY_GITIGNORE` |
| `OPS-01` | `MITIGATED_WITH_GUARDS` |
| `VALIDATION_BASELINE` | `PASS` |
| `RBAC_SUPPORT_V2` | `READY_FOR_CONTROLLED_SCHEMA_MIGRATION` |
| `AUDIT_V2` | `READY_FOR_CONTROLLED_SCHEMA_MIGRATION` |
| `RES-03` | `ACCEPTED_LOW_RISK_DOCUMENTED` |

## 2. Documentos canônicos atuais

Use estes documentos como fonte primária para status atual:

| Documento | Uso |
|---|---|
| `docs/AIRTRUST_AUDIT_CYCLE_FINAL_CLOSURE_v0_5.md` | fechamento do ciclo principal |
| `docs/AIRTRUST_AUDIT_FINDINGS_MASTER_MATRIX_v0_5.md` | matriz mestre dos achados e streams |
| `docs/AIRTRUST_AUDIT_REMAINING_FINDINGS_CLOSURE_PLAN_v0_5.md` | plano dos remanescentes de alto impacto |
| `docs/AIRTRUST_AUDIT_CLOSURE_EXECUTIVE_SUMMARY_v0_5.md` | resumo executivo do ciclo |
| `docs/AIRTRUST_NEXT_SPRINTS_PLAN_v0_5.md` | próximos blocos grandes |
| `docs/AIRTRUST_REPOSITORY_CLEANUP_GOVERNANCE_PUBLIC_SURFACE_v0_5.md` | cleanup residual, governança e superfície pública |
| `docs/AIRTRUST_AUDIT_V2_RBAC_SUPPORT_GOVERNANCE_v0_5.md` | matriz de RBAC/suporte/admin/maintenance/debug/audit da passada atual |
| `docs/AIRTRUST_AUDIT_V2_RBAC_SUPPORT_SCHEMA_READINESS_v0_5.md` | fundação de schema/readiness para `Audit v2` + `RBAC/Suporte v2` |
| `docs/AIRTRUST_AUDIT_DOCS_INDEX_v0_5.md` | este índice |

## 3. Documentos de readiness e execution gates

Usar para `DQ-01`, `MIG-01` e trilhas controladas:

| Documento | Status |
|---|---|
| `docs/AIRTRUST_CONTROLLED_EXECUTION_ENVIRONMENT_CONTRACT_v0_5.md` | canônico |
| `docs/AIRTRUST_DQ01_MIG01_CONTROLLED_EXECUTION_RUNBOOK_v0_5.md` | canônico |
| `docs/AIRTRUST_DQ01_CONTROLLED_BACKFILL_EXECUTION_v0_5.md` | canônico |
| `docs/AIRTRUST_DATA_QUALITY_BACKFILL_READINESS_v0_5.md` | canônico |
| `docs/AIRTRUST_MIGRATION_REBASELINE_READINESS_v0_5.md` | canônico |

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

1. `DQ-01` em ambiente controlado real com snapshot, rollback e aprovação explícita.
2. `MIG-01` em janela controlada, somente após `DQ-01`.
3. `Audit v2` staging flag test seguido de foundation `RBAC/Suporte v2`.
