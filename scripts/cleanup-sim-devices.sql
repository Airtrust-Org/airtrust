-- CLEANUP: Soft-delete test/junk simuladores
-- Keep only: 11 (Simulador AW139 - CAE GRU), 16 (Simulador SK76)
-- Everything else is test data
UPDATE simuladores SET deleted_at = datetime('now') WHERE id NOT IN (11, 16) AND deleted_at IS NULL;
