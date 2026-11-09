# 0576 — notificacoes_log (empresa_id, assunto) index

## Motivation
Incident #2078: D1 reports "D1 DB is overloaded. Too many resources consumed
within a 10 second window" while the Compliance screen loads. For the largest
tenant, `notificacoes_log` holds ~176k rows, ~168k of them legacy rows with a
NULL `assunto`. Every query filtering the subject prefix
(`[COMPLIANCE_TREINAMENTO:`, `[COMPLIANCE_GESTOR:`, `[LMS_MATRICULA_RESERVA:`)
reads the whole table (measured rows_read equal to the table size per call);
no existing index covers `assunto`.

## Contract
- Additive: one `CREATE INDEX idx_notificacoes_log_empresa_assunto` on
  `(empresa_id, assunto)`. No backfill, no data change, no table rewrite.
- Worker queries add equivalent range predicates on `assunto`
  (`assunto >= prefix AND assunto < prefix-with-last-char-plus-one`) next to
  the original `LIKE`, so semantics are unchanged and SQLite can SEARCH the index.
- The Worker is safe before the index exists (same results, only slower), so
  deploy order is not a correctness dependency.

## Risk & release
Index build on a ~176k row table is brief. Stage the change first via
`staging-apply-schema-v2.yml`, then production through
`apply-schema-change-v2.yml` with separate owner authorization. Post-apply:
verify the index exists and row counts are unchanged.
