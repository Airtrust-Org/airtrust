-- 0519_training_compliance_evidence_profiles.sql
-- Persists the competency profile proved by DGR/AVSEC evidence without multiplying qualification models.
-- source_reference: Costa do Sol Compliance decision 2026-09-30; PRG-OPS-003/PTAP; PRG-SSO-006/AVSEC.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/training-compliance-evidence-profiles-0519.md

ALTER TABLE qualificacoes_historico ADD COLUMN perfil_competencia TEXT;
ALTER TABLE lms_matriculas ADD COLUMN perfil_competencia TEXT;

CREATE INDEX IF NOT EXISTS idx_qh_empresa_func_tipo_perfil
ON qualificacoes_historico(empresa_id,funcionario_id,qualificacao_id,perfil_competencia)
WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_lms_matriculas_empresa_func_perfil
ON lms_matriculas(empresa_id,funcionario_id,perfil_competencia)
WHERE deleted_at IS NULL;

-- Preserve the meaning of existing flight-crew D1/D4 evidence. Production audit on 2026-09-30
-- found D1/D4 historical evidence only for pilots, apart from one D1 row without a recognized role.
UPDATE qualificacoes_historico
SET perfil_competencia='AVSEC_TRIPULANTE', updated_at=datetime('now')
WHERE empresa_id=6 AND perfil_competencia IS NULL AND deleted_at IS NULL
  AND qualificacao_id=(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo)='D1' AND deleted_at IS NULL LIMIT 1)
  AND funcionario_id IN (SELECT f.id FROM funcionarios f JOIN funcoes fn ON fn.id=f.funcao_id AND fn.empresa_id=f.empresa_id
    WHERE f.empresa_id=6 AND f.deleted_at IS NULL AND fn.deleted_at IS NULL AND UPPER(TRIM(fn.nome)) IN ('COMANDANTE','COPILOTO'));
UPDATE qualificacoes_historico
SET perfil_competencia='PTAP_TRIPULANTE_VOO', updated_at=datetime('now')
WHERE empresa_id=6 AND perfil_competencia IS NULL AND deleted_at IS NULL
  AND qualificacao_id=(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo)='D4' AND deleted_at IS NULL LIMIT 1)
  AND funcionario_id IN (SELECT f.id FROM funcionarios f JOIN funcoes fn ON fn.id=f.funcao_id AND fn.empresa_id=f.empresa_id
    WHERE f.empresa_id=6 AND f.deleted_at IS NULL AND fn.deleted_at IS NULL AND UPPER(TRIM(fn.nome)) IN ('COMANDANTE','COPILOTO'));

-- Snapshot profiles for already-open D1/D4 enrollments where the role alone is unambiguous.
UPDATE lms_matriculas SET perfil_competencia='AVSEC_TRIPULANTE', updated_at=datetime('now')
WHERE empresa_id=6 AND perfil_competencia IS NULL AND deleted_at IS NULL
  AND curso_id IN (SELECT lc.id FROM lms_cursos lc JOIN qualificacoes_tipos qt ON qt.id=lc.qualificacao_tipo_id AND qt.empresa_id=lc.empresa_id WHERE lc.empresa_id=6 AND UPPER(qt.codigo)='D1')
  AND funcionario_id IN (SELECT f.id FROM funcionarios f JOIN funcoes fn ON fn.id=f.funcao_id AND fn.empresa_id=f.empresa_id WHERE f.empresa_id=6 AND UPPER(TRIM(fn.nome)) IN ('COMANDANTE','COPILOTO'));
UPDATE lms_matriculas SET perfil_competencia='PTAP_TRIPULANTE_VOO', updated_at=datetime('now')
WHERE empresa_id=6 AND perfil_competencia IS NULL AND deleted_at IS NULL
  AND curso_id IN (SELECT lc.id FROM lms_cursos lc JOIN qualificacoes_tipos qt ON qt.id=lc.qualificacao_tipo_id AND qt.empresa_id=lc.empresa_id WHERE lc.empresa_id=6 AND UPPER(qt.codigo)='D4')
  AND funcionario_id IN (SELECT f.id FROM funcionarios f JOIN funcoes fn ON fn.id=f.funcao_id AND fn.empresa_id=f.empresa_id WHERE f.empresa_id=6 AND UPPER(TRIM(fn.nome)) IN ('COMANDANTE','COPILOTO'));

-- A qualification generated from LMS inherits the enrollment snapshot. A renewal inherits its predecessor.
CREATE TRIGGER IF NOT EXISTS trg_qh_profile_from_evidence_source_0519
AFTER INSERT ON qualificacoes_historico
FOR EACH ROW WHEN NEW.perfil_competencia IS NULL
BEGIN
  UPDATE qualificacoes_historico
     SET perfil_competencia=COALESCE(
       (SELECT lm.perfil_competencia FROM lms_matriculas lm WHERE lm.id=NEW.lms_matricula_id AND lm.empresa_id=NEW.empresa_id AND lm.deleted_at IS NULL),
       (SELECT prev.perfil_competencia FROM qualificacoes_historico prev WHERE prev.id=NEW.renovacao_de AND prev.empresa_id=NEW.empresa_id)
     )
   WHERE id=NEW.id AND empresa_id=NEW.empresa_id;
END;
