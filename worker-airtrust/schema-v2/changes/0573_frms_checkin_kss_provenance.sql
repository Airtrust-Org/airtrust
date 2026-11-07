-- FRMS FAD-003: KSS origin must be stored on its own daily check-in row.
-- Legacy data remains NULL/UNKNOWN. Never infer CREW_REPORTED from KSS=1..9.
-- Deploy order: governed Schema V2 before Worker/Pages referencing this field.
ALTER TABLE frms_fadiga_checkin
  ADD COLUMN kss_provenance TEXT
  CHECK (kss_provenance IS NULL OR
         kss_provenance IN ('CREW_REPORTED', 'DERIVED', 'DEFAULTED'));

-- Scoped lookups for reliability checks and crew-reported-only statistics.
CREATE INDEX idx_frms_checkin_kss_provenance_scope
  ON frms_fadiga_checkin (empresa_id, kss_provenance, data_checkin)
  WHERE deleted_at IS NULL;
