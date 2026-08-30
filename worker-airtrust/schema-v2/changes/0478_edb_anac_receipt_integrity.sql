-- 0478 — eDB ANAC outbox/receipt integrity hardening
--
-- Additive hardening for the disabled eDB foundation. This change does not
-- implement an ANAC protocol or infer external acceptance semantics.

CREATE TRIGGER IF NOT EXISTS trg_edb_anac_outbox_identity_immutable
BEFORE UPDATE ON edb_anac_outbox
WHEN
  NEW.id <> OLD.id OR
  NEW.empresa_id <> OLD.empresa_id OR
  NEW.revision_id <> OLD.revision_id OR
  NEW.operation_kind <> OLD.operation_kind OR
  NEW.idempotency_key <> OLD.idempotency_key OR
  COALESCE(NEW.payload_json, '') <> COALESCE(OLD.payload_json, '')
BEGIN
  SELECT RAISE(ABORT, 'EDB_ANAC_OUTBOX_IDENTITY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_anac_outbox_no_delete
BEFORE DELETE ON edb_anac_outbox
BEGIN
  SELECT RAISE(ABORT, 'EDB_ANAC_OUTBOX_IMMUTABLE_HISTORY');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_anac_recibo_require_outbox_scope
BEFORE INSERT ON edb_anac_recibos
BEGIN
  SELECT CASE WHEN trim(NEW.external_receipt_id) = ''
    THEN RAISE(ABORT, 'EDB_ANAC_RECEIPT_EXTERNAL_ID_REQUIRED') END;

  SELECT CASE WHEN datetime(NEW.received_at) IS NULL
    THEN RAISE(ABORT, 'EDB_ANAC_RECEIPT_TIMESTAMP_INVALID') END;

  SELECT CASE WHEN NEW.http_status IS NOT NULL
    AND (NEW.http_status < 100 OR NEW.http_status > 599)
    THEN RAISE(ABORT, 'EDB_ANAC_RECEIPT_HTTP_STATUS_INVALID') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM edb_anac_outbox o
    WHERE o.id = NEW.outbox_id
      AND o.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'EDB_ANAC_OUTBOX_NOT_FOUND_OR_SCOPE_MISMATCH') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_anac_recibos_no_update
BEFORE UPDATE ON edb_anac_recibos
BEGIN
  SELECT RAISE(ABORT, 'EDB_ANAC_RECEIPT_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_anac_recibos_no_delete
BEFORE DELETE ON edb_anac_recibos
BEGIN
  SELECT RAISE(ABORT, 'EDB_ANAC_RECEIPT_IMMUTABLE');
END;
