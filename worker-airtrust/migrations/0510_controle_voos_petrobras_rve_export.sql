-- source_reference: Petrobras RVE XML supplied by Costa do Sol on 2026-09-21 (AE_2026-09-19_SBME_CDS)
-- operational_decision: persist only the external identifiers that cannot be derived safely from flight/RDV data.
-- dry_run_required: true
-- rollback_plan_required: additive columns; use governed D1 recovery point on failed apply.

ALTER TABLE cv_voos ADD COLUMN petrobras_equipamento TEXT;
ALTER TABLE cv_voos ADD COLUMN petrobras_atendimento TEXT;

UPDATE cv_voos
SET petrobras_atendimento = CAST(sigvoos_flight_report_id AS TEXT)
WHERE petrobras_atendimento IS NULL
  AND sigvoos_flight_report_id IS NOT NULL
  AND COALESCE(sigvoos_flight_report_id_confident, 0) = 1;

UPDATE cv_voos
SET petrobras_equipamento = (
  SELECT a.codigo
  FROM aeronaves a
  WHERE a.id = cv_voos.aeronave_id
    AND a.empresa_id = cv_voos.empresa_id
    AND a.deleted_at IS NULL
    AND TRIM(a.codigo) <> ''
    AND TRIM(a.codigo) NOT GLOB '*[^0-9]*'
  LIMIT 1
)
WHERE petrobras_equipamento IS NULL
  AND aeronave_id IS NOT NULL;
