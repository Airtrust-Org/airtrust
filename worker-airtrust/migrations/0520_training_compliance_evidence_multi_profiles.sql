-- 0520_training_compliance_evidence_multi_profiles.sql
-- Allows one qualification/certificate evidence row to prove more than one competency profile.
-- Depends on 0519_training_compliance_evidence_profiles.sql.
-- source_reference: Costa do Sol Compliance decision 2026-09-30; AVSEC/DGR evidence classification.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/training-compliance-evidence-multi-profiles-0520.md

CREATE TABLE IF NOT EXISTS qualificacoes_historico_perfis_competencia (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  historico_id INTEGER NOT NULL,
  perfil_competencia TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (historico_id) REFERENCES qualificacoes_historico(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_qh_perfil_competencia_ativo
ON qualificacoes_historico_perfis_competencia(empresa_id,historico_id,perfil_competencia)
WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qh_perfis_empresa_historico
ON qualificacoes_historico_perfis_competencia(empresa_id,historico_id)
WHERE deleted_at IS NULL;

CREATE TRIGGER IF NOT EXISTS trg_qh_perfil_competencia_tenant_0520
BEFORE INSERT ON qualificacoes_historico_perfis_competencia
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM qualificacoes_historico qh
   WHERE qh.id=NEW.historico_id AND qh.empresa_id=NEW.empresa_id AND qh.deleted_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'qualification evidence profile tenant mismatch');
END;

-- Backfill the 0519 scalar profile so rollout is lossless and immediately queryable as a relation.
INSERT INTO qualificacoes_historico_perfis_competencia(
  empresa_id,historico_id,perfil_competencia,created_at,updated_at
)
SELECT qh.empresa_id,qh.id,UPPER(TRIM(qh.perfil_competencia)),datetime('now'),datetime('now')
FROM qualificacoes_historico qh
WHERE qh.deleted_at IS NULL
  AND qh.perfil_competencia IS NOT NULL
  AND TRIM(qh.perfil_competencia)<>''
  AND NOT EXISTS (
    SELECT 1 FROM qualificacoes_historico_perfis_competencia qhp
     WHERE qhp.empresa_id=qh.empresa_id AND qhp.historico_id=qh.id
       AND qhp.perfil_competencia=UPPER(TRIM(qh.perfil_competencia))
       AND qhp.deleted_at IS NULL
  );
