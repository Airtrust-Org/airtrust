-- Schema V2 0547 - Corporate Regras de Ouro requirement reinstatement, 2026-10-10.
-- Management's explicit decision: the model applies to all active employees.
-- Enrollment is operational and derived from qualification history; this change
-- does not touch enrollments, SCORM records, employee data or certificates.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/training-compliance-regras-ouro-corporate-0547.md

-- 0546 removed all requirements for this model under a contradictory footnote.
-- Recreate exactly one active company-wide obligation. Never infer designations.
INSERT INTO treinamento_requisitos
 (empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,critico_operacional,
  origem,referencia_normativa,justificativa,fundamento_tipo,fundamento_documento,
  validade_fonte,auto_matricular_ead,ativo,created_at,updated_at)
SELECT 6,qt.id,'EMPRESA','OBRIGATORIA',0,
 'EMPRESA','Matriz QSMS e Seguranca Operacional - decisao gerencial 2026-10-10',
 'Regras de Ouro - Petrobras exigido de todos os funcionarios de todos os cargos.',
 'MATRIZ','Matriz QSMS e Seguranca Operacional - decisao gerencial 2026-10-10',
 'MODELO',1,1,datetime('now'),datetime('now')
 FROM qualificacoes_tipos qt
 WHERE qt.empresa_id=6 AND qt.codigo='REGRAS_OURO_PETROBRAS'
   AND qt.ativo=1 AND qt.deleted_at IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM treinamento_requisitos tr
      WHERE tr.empresa_id=6 AND tr.qualificacao_tipo_id=qt.id AND tr.ativo=1
        AND tr.deleted_at IS NULL
   );
