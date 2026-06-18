# AirTrust Docs Consolidation - 2026-06-18

## Veredito

**CONSOLIDADA COM RESSALVAS**

Foi identificado um subconjunto pequeno de documentacao segura e util para PR, um grupo de documentos sensiveis que deve permanecer localmente e um grupo de snapshots duplicados ou obsoletos que pode ser descartado sem perda do estado canonico.

## Docs analisados

| Arquivo | Classificacao | Destino |
|---|---|---|
| `docs/AIRTRUST_PERFORMANCE_QUALIFICACOES_CERTIFICADOS_AUDIT_20260617.md` | `SAFE_COMMIT` | Incluir em PR documental |
| `docs/AIRTRUST_CERTIFICADOS_YNGRID_VALIDATION_ROADMAP_20260617.md` | `SANITIZE_THEN_COMMIT` | Substituido por versao sanitizada |
| `docs/AIRTRUST_CERTIFICADOS_SETORIAIS_VALIDATION_ROADMAP_SANITIZED_20260618.md` | `SAFE_COMMIT` | Incluir em PR documental |
| `docs/RBAC_SETORIAL_PR69_POST_DEPLOY_VALIDATION_20260617.md` | `SANITIZE_THEN_COMMIT` | Preservar localmente nesta etapa |
| `docs/RBAC_SETORIAL_VALIDACAO_FINAL_20260618.md` | `KEEP_LOCAL_SENSITIVE` | Manter fora do Git |
| `docs/AIRTRUST_CONSOLIDACAO_POS_INCIDENTES_20260617.md` | `DUPLICATE_OR_OBSOLETE` | Remover localmente |
| `docs/AIRTRUST_DATA_INTEGRITY_BRANCH_CONSOLIDATION_20260618.md` | `DUPLICATE_OR_OBSOLETE` | Preservar localmente por conter conteudo misto |
| `docs/AIRTRUST_OPEN_PRS_TRIAGE_20260618.md` | `DUPLICATE_OR_OBSOLETE` | Remover localmente |
| `docs/AIRTRUST_PR32_REVIEW_20260618.md` | `DUPLICATE_OR_OBSOLETE` | Remover localmente |
| `docs/AIRTRUST_REPO_CLEANUP_STATUS_20260618.md` | `KEEP_LOCAL_SENSITIVE` | Manter fora do Git |
| `docs/AIRTRUST_SAFE_TESTS_RECONCILIATION_20260618.md` | `DUPLICATE_OR_OBSOLETE` | Remover localmente |

## Docs sanitizados

- `docs/AIRTRUST_CERTIFICADOS_YNGRID_VALIDATION_ROADMAP_20260617.md`
  Resultado: `docs/AIRTRUST_CERTIFICADOS_SETORIAIS_VALIDATION_ROADMAP_SANITIZED_20260618.md`
  Ajustes aplicados: remocao de nome pessoal, referencias a setor especifico, exemplos de identificadores internos e detalhes operacionais direcionados.

## Docs removidos localmente

- `docs/AIRTRUST_CONSOLIDACAO_POS_INCIDENTES_20260617.md`
  Motivo: snapshot superado por merges posteriores e por documentacao canonica ja absorvida.
- `docs/AIRTRUST_OPEN_PRS_TRIAGE_20260618.md`
  Motivo: triagem vencida no mesmo dia; estado ja alterado apos merge de PRs.
- `docs/AIRTRUST_PR32_REVIEW_20260618.md`
  Motivo: PR #32 ja absorvido por `origin/main`; valor residual baixo.
- `docs/AIRTRUST_SAFE_TESTS_RECONCILIATION_20260618.md`
  Motivo: reconciliacao de testes ja refletida em `origin/main`; registro local sem valor permanente.

## Docs preservados fora do Git

- `docs/RBAC_SETORIAL_VALIDACAO_FINAL_20260618.md`
  Motivo: contem PII, IDs internos, contagens operacionais e SQL de rollback.
- `docs/RBAC_SETORIAL_PR69_POST_DEPLOY_VALIDATION_20260617.md`
  Motivo: ainda exige sanitizacao adicional antes de eventual publicacao.
- `docs/AIRTRUST_REPO_CLEANUP_STATUS_20260618.md`
  Motivo: inventario operacional com paths locais, worktrees e estado efemero.
- `docs/AIRTRUST_DATA_INTEGRITY_BRANCH_CONSOLIDATION_20260618.md`
  Motivo: mistura fatos ja absorvidos com detalhes sensiveis-adjacentes e notas operacionais locais.
