-- AirTrust Schema V2 0563: durable Pilot offline fueling event identity.
-- Additive: no data write, backfill or modification of legacy/manual rows.
ALTER TABLE cv_voo_abastecimentos ADD COLUMN client_local_id TEXT;

CREATE UNIQUE INDEX uq_cv_voo_abastecimentos_client_event
  ON cv_voo_abastecimentos (empresa_id, voo_id, client_local_id)
  WHERE client_local_id IS NOT NULL;

CREATE TRIGGER trg_cv_voo_abastecimentos_client_id_insert
BEFORE INSERT ON cv_voo_abastecimentos
WHEN NEW.client_local_id IS NOT NULL
 AND (length(trim(NEW.client_local_id)) = 0 OR length(NEW.client_local_id) > 240)
BEGIN
 SELECT RAISE(ABORT, 'PILOT_FUELING_CLIENT_ID_INVALID');
END;

CREATE TRIGGER trg_cv_voo_abastecimentos_client_id_immutable
BEFORE UPDATE OF client_local_id ON cv_voo_abastecimentos
WHEN NEW.client_local_id IS NOT OLD.client_local_id
BEGIN
 SELECT RAISE(ABORT, 'PILOT_FUELING_CLIENT_ID_IMMUTABLE');
END;
