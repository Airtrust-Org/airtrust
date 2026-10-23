-- Schema V2 0564: immutable original supplier code for offline fuelings.
-- Additive only: no UPDATE/backfill of historical/manual records.
ALTER TABLE cv_voo_abastecimentos ADD COLUMN supplier_code_at_acceptance TEXT;

CREATE TRIGGER trg_cv_pilot_fueling_supplier_code_insert
BEFORE INSERT ON cv_voo_abastecimentos
WHEN NEW.client_local_id IS NOT NULL
 AND (NEW.supplier_code_at_acceptance IS NULL
   OR length(trim(NEW.supplier_code_at_acceptance)) = 0
   OR length(NEW.supplier_code_at_acceptance) > 80
   OR NEW.supplier_code_at_acceptance <> upper(NEW.supplier_code_at_acceptance))
BEGIN
 SELECT RAISE(ABORT, 'PILOT_FUELING_SUPPLIER_CODE_REQUIRED');
END;

CREATE TRIGGER trg_cv_pilot_fueling_supplier_code_immutable
BEFORE UPDATE OF supplier_code_at_acceptance ON cv_voo_abastecimentos
WHEN NEW.supplier_code_at_acceptance IS NOT OLD.supplier_code_at_acceptance
BEGIN
 SELECT RAISE(ABORT, 'PILOT_FUELING_SUPPLIER_CODE_IMMUTABLE');
END;
