-- 0531_training_compliance_nr20_modality_repair.sql
-- Forward-only repair for the NR-20 modality postcondition of Schema V2 change 0526.
-- source_reference: production post-validation failure in GitHub Actions run 37231357958;
--                   training-compliance-matrix-alignment-0526 reviewed decision.
-- operational_decision: preserve existing active requirement ids and normalize only the reviewed
--                       tenant-6 NR-20 function requirements to HIBRIDO.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/training-compliance-nr20-modality-repair-0531.md

UPDATE treinamento_requisitos
   SET modalidade_requerida='HIBRIDO',
       updated_at=datetime('now')
 WHERE empresa_id=6
   AND ativo=1
   AND deleted_at IS NULL
   AND escopo='FUNCAO'
   AND qualificacao_tipo_id=(
     SELECT id
       FROM qualificacoes_tipos
      WHERE empresa_id=6
        AND UPPER(codigo)='NR-20'
        AND ativo=1
        AND deleted_at IS NULL
      LIMIT 1
   )
   AND funcao_id IN (
     SELECT id
       FROM funcoes
      WHERE empresa_id=6
        AND ativo=1
        AND deleted_at IS NULL
        AND TRIM(nome) IN (
          'Mecânico','Mecanico','MECÂNICO','MECANICO',
          'Aux Manutenção','Aux Manutencao','AUX MANUTENÇÃO','AUX MANUTENCAO',
          'Auxiliar de Manutenção','Auxiliar de Manutencao','AUXILIAR DE MANUTENÇÃO','AUXILIAR DE MANUTENCAO',
          'Aux Suprimentos','Auxiliar de Suprimentos',
          'Supervisor Suprimentos','Supervisor de Suprimentos'
        )
   )
   AND COALESCE(UPPER(TRIM(modalidade_requerida)),'') <> 'HIBRIDO';
