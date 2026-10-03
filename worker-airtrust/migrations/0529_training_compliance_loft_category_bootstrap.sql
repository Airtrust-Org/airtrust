-- 0529_training_compliance_loft_category_bootstrap.sql
-- Forward-only replacement for the unapplied 0527 bootstrap after the real staging
-- category-integrity trigger rejected a LOFT insert without categoria_id.
-- Ensures tenant 6 has exactly one current LOFT qualification model with a valid
-- tenant-scoped qualification category, without touching histories/evidence/requirements.
-- source_reference: PTO vigente Costa do Sol; Training Manager decision 2026-10-02; staging incident 37085353764.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/training-compliance-loft-category-bootstrap-0529.md

-- Prefer the operational training category in staging and the canonical theoretical
-- category used by production reconciliation. Fail closed through the 0457 trigger if
-- neither reviewed category exists.
UPDATE qualificacoes_tipos
   SET ativo=1,
       deleted_at=NULL,
       validade=COALESCE(validade,12),
       nome=CASE WHEN NULLIF(TRIM(nome),'') IS NULL THEN 'LOFT' ELSE nome END,
       categoria=CASE WHEN NULLIF(TRIM(categoria),'') IS NULL THEN 'Treinamento' ELSE categoria END,
       categoria_id=CASE
         WHEN categoria_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM qualificacoes_categorias qc
            WHERE qc.id=qualificacoes_tipos.categoria_id AND qc.empresa_id=6
              AND qc.ativo=1 AND qc.deleted_at IS NULL
         ) THEN categoria_id
         ELSE (
           SELECT qc.id FROM qualificacoes_categorias qc
            WHERE qc.empresa_id=6 AND qc.ativo=1 AND qc.deleted_at IS NULL
              AND UPPER(TRIM(qc.codigo)) IN ('TREINAMENTO_OPERACIONAL','TERICO')
            ORDER BY CASE UPPER(TRIM(qc.codigo)) WHEN 'TREINAMENTO_OPERACIONAL' THEN 0 ELSE 1 END, qc.id
            LIMIT 1
         )
       END,
       updated_at=datetime('now')
 WHERE id=(
   SELECT id FROM qualificacoes_tipos
    WHERE empresa_id=6 AND UPPER(codigo)='LOFT'
    ORDER BY CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END, id DESC
    LIMIT 1
 )
   AND NOT EXISTS (
     SELECT 1 FROM qualificacoes_tipos
      WHERE empresa_id=6 AND UPPER(codigo)='LOFT' AND ativo=1 AND deleted_at IS NULL
   );

UPDATE qualificacoes_tipos
   SET ativo=1,
       validade=COALESCE(validade,12),
       nome=CASE WHEN NULLIF(TRIM(nome),'') IS NULL THEN 'LOFT' ELSE nome END,
       categoria=CASE WHEN NULLIF(TRIM(categoria),'') IS NULL THEN 'Treinamento' ELSE categoria END,
       categoria_id=CASE
         WHEN categoria_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM qualificacoes_categorias qc
            WHERE qc.id=qualificacoes_tipos.categoria_id AND qc.empresa_id=6
              AND qc.ativo=1 AND qc.deleted_at IS NULL
         ) THEN categoria_id
         ELSE (
           SELECT qc.id FROM qualificacoes_categorias qc
            WHERE qc.empresa_id=6 AND qc.ativo=1 AND qc.deleted_at IS NULL
              AND UPPER(TRIM(qc.codigo)) IN ('TREINAMENTO_OPERACIONAL','TERICO')
            ORDER BY CASE UPPER(TRIM(qc.codigo)) WHEN 'TREINAMENTO_OPERACIONAL' THEN 0 ELSE 1 END, qc.id
            LIMIT 1
         )
       END,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(codigo)='LOFT' AND deleted_at IS NULL;

INSERT INTO qualificacoes_tipos (
  empresa_id,codigo,nome,descricao,categoria,categoria_id,validade,observacoes,ativo,created_at,updated_at
)
SELECT 6,'LOFT','LOFT','Line Oriented Flight Training','Treinamento',
       (
         SELECT qc.id FROM qualificacoes_categorias qc
          WHERE qc.empresa_id=6 AND qc.ativo=1 AND qc.deleted_at IS NULL
            AND UPPER(TRIM(qc.codigo)) IN ('TREINAMENTO_OPERACIONAL','TERICO')
          ORDER BY CASE UPPER(TRIM(qc.codigo)) WHEN 'TREINAMENTO_OPERACIONAL' THEN 0 ELSE 1 END, qc.id
          LIMIT 1
       ),
       12,
       'Modelo LOFT criado pelo bootstrap governado 0529, substituto da 0527 não aplicada após validação do contrato de categoria 0457.',
       1,datetime('now'),datetime('now')
 WHERE NOT EXISTS (
   SELECT 1 FROM qualificacoes_tipos
    WHERE empresa_id=6 AND UPPER(codigo)='LOFT' AND ativo=1 AND deleted_at IS NULL
 );
