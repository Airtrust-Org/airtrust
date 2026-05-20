-- Migration: Fix ALERTA_VIOLACAO_PCT from 100 to 101
-- Summary: Violation alert should only trigger at >100% (101%+), not at exactly 100%.
--          Default seed (0213) incorrectly seeded 100.0. This corrects the DB row.

UPDATE frms_configuracao_limites
SET valor_numerico = 101,
    updated_at = datetime('now')
WHERE nome = 'ALERTA_VIOLACAO_PCT';
