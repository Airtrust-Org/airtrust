-- 0527_training_compliance_loft_bootstrap.sql
-- Forward-only prerequisite discovered by the 2026-10-02 staging preflight for 0526.
-- Ensures tenant 6 has exactly one current LOFT qualification model without rewriting
-- qualification history, certificates, LMS enrollments, training requirements or other tenants.
-- source_reference: PTO vigente Costa do Sol; Training Manager decision 2026-10-02.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/training-compliance-loft-bootstrap-0527.md

-- Since 0457, every current qualification model must point to an active tenant-scoped
-- canonical category. LOFT is operational flight training, so resolve the stable
-- TREINAMENTO_OPERACIONAL code instead of inventing or relying on display text.

-- Prefer preserving an existing LOFT identity (including a soft-deleted historical row)
-- so any historical references keep pointing to the same qualification_type id.
UPDATE qualificacoes_tipos
   SET ativo=1,
       deleted_at=NULL,
       validade=COALESCE(validade,12),
       nome=CASE WHEN NULLIF(TRIM(nome),'') IS NULL THEN 'LOFT' ELSE nome END,
       categoria_id=COALESCE(
         categoria_id,
         (
           SELECT id FROM qualificacoes_categorias
            WHERE empresa_id=6
              AND UPPER(TRIM(codigo))='TREINAMENTO_OPERACIONAL'
              AND ativo=1 AND deleted_at IS NULL
            LIMIT 1
         )
       ),
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

-- Normalize the single current row conservatively. Existing non-null validity and
-- a pre-existing valid category identity remain authoritative; missing category FK
-- is filled from the canonical operational-training category.
UPDATE qualificacoes_tipos
   SET ativo=1,
       validade=COALESCE(validade,12),
       nome=CASE WHEN NULLIF(TRIM(nome),'') IS NULL THEN 'LOFT' ELSE nome END,
       categoria_id=COALESCE(
         categoria_id,
         (
           SELECT id FROM qualificacoes_categorias
            WHERE empresa_id=6
              AND UPPER(TRIM(codigo))='TREINAMENTO_OPERACIONAL'
              AND ativo=1 AND deleted_at IS NULL
            LIMIT 1
         )
       ),
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(codigo)='LOFT' AND deleted_at IS NULL;

-- If no current or historical LOFT identity exists, create the minimal tenant-scoped
-- model with the canonical category FK required by the 0457 contract. The 0457
-- snapshot trigger writes the display text from qualificacoes_categorias.
INSERT INTO qualificacoes_tipos (
  empresa_id,codigo,nome,descricao,categoria,categoria_id,validade,observacoes,ativo,created_at,updated_at
)
SELECT 6,'LOFT','LOFT','Line Oriented Flight Training',qc.nome,qc.id,12,
       'Modelo LOFT criado pelo bootstrap governado 0527 para suportar o alinhamento de Compliance 0526.',
       1,datetime('now'),datetime('now')
  FROM qualificacoes_categorias qc
 WHERE qc.empresa_id=6
   AND UPPER(TRIM(qc.codigo))='TREINAMENTO_OPERACIONAL'
   AND qc.ativo=1 AND qc.deleted_at IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM qualificacoes_tipos
      WHERE empresa_id=6 AND UPPER(codigo)='LOFT' AND ativo=1 AND deleted_at IS NULL
   );
