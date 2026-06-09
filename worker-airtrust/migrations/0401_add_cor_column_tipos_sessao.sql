-- 0401: Restore the `cor` column on tipos_sessao that was inadvertently
-- dropped by the Wave 3 table rebuild (0399_harden_empresa_id_wave3.sql).
--
-- The backend (simuladores-modelos.ts) dynamically detects the column via
-- PRAGMA table_info and writes the value when present; no runtime change needed.
--
-- Existing rows will have NULL for `cor` until the user explicitly sets a
-- color through the UI. The frontend already falls back to a stable palette
-- when `cor` is NULL, so no visual regression occurs.

ALTER TABLE tipos_sessao ADD COLUMN cor TEXT;
