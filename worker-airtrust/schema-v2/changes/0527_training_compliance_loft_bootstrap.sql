-- 0527_training_compliance_loft_bootstrap.sql
-- Forward-only prerequisite discovered by the 2026-10-02 staging preflight for 0526.
-- Ensures tenant 6 has exactly one current LOFT qualification model without rewriting
-- qualification history, certificates, LMS enrollments, training requirements or other tenants.
-- source_reference: PTO vigente Costa do Sol; Training Manager decision 2026-10-02.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/training-compliance-loft-bootstrap-0527.md

-- Prefer preserving an existing LOFT identity (including a soft-deleted historical row)
-- so any historical references keep pointing to the same qualification_type id.
UPDATE qualificacoes_tipos
   SET ativo=1,
       deleted_at=NULL,
       validade=COALESCE(validade,12),
       nome=CASE WHEN NULLIF(TRIM(nome),'') IS NULL THEN 'LOFT' ELSE nome END,
       categoria=CASE WHEN NULLIF(TRIM(categoria),'') IS NULL THEN 'Treinamento' ELSE categoria END,
       updated_at=datetime('now')
 WHERE id=(
   SELECT id
     FROM qualificacoes_tipos
    WHERE empresa_id=6 AND UPPER(codigo)='LOFT'
    ORDER BY CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END, id DESC
    LIMIT 1
 )
   AND NOT EXISTS (
     SELECT 1 FROM qualificacoes_tipos
      WHERE empresa_id=6 AND UPPER(codigo)='LOFT' AND ativo=1 AND deleted_at IS NULL
   );

-- Normalize the single current row conservatively. Existing non-null validity remains authoritative.
UPDATE qualificacoes_tipos
   SET ativo=1,
       validade=COALESCE(validade,12),
       nome=CASE WHEN NULLIF(TRIM(nome),'') IS NULL THEN 'LOFT' ELSE nome END,
       categoria=CASE WHEN NULLIF(TRIM(categoria),'') IS NULL THEN 'Treinamento' ELSE categoria END,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(codigo)='LOFT' AND deleted_at IS NULL;

-- If no current or historical LOFT identity exists, create the minimal tenant-scoped model.
INSERT INTO qualificacoes_tipos (
  empresa_id,codigo,nome,descricao,categoria,validade,observacoes,ativo,created_at,updated_at
)
SELECT 6,'LOFT','LOFT','Line Oriented Flight Training','Treinamento',12,
       'Modelo LOFT criado pelo bootstrap governado 0527 para suportar o alinhamento de Compliance 0526.',
       1,datetime('now'),datetime('now')
 WHERE NOT EXISTS (
   SELECT 1 FROM qualificacoes_tipos
    WHERE empresa_id=6 AND UPPER(codigo)='LOFT' AND ativo=1 AND deleted_at IS NULL
 );
