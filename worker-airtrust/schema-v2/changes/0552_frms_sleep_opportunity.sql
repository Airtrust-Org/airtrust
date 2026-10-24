-- FRMS 0552 - ANAC RBAC 117: opportunity for sleep is not sleep obtained.
-- Existing rows intentionally remain NULL: never synthesize a reported opportunity.
-- Deploy order: governed Schema V2 before the Worker/Pages check-in change.
ALTER TABLE frms_fadiga_checkin
  ADD COLUMN oportunidade_sono_horas_24h REAL
  CHECK (oportunidade_sono_horas_24h IS NULL OR
         (oportunidade_sono_horas_24h >= 0 AND oportunidade_sono_horas_24h <= 24));
