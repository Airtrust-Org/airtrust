-- 0537_training_compliance_manager_designation_nr05.sql
-- Training Management decision 2026-10-07:
-- 1) "Gestor" is an explicit employee designation, never inferred from job-title text.
-- 2) Manager-only training applicability follows that designation.
-- 3) NR-05 remains EAD under the Petrobras requirement adopted by the company, with
--    a 24-month cycle, 2-hour load and company-wide applicability.
-- Tenant-scoped to empresa_id=6. No employee is designated by this migration.
-- No LMS enrollment, completion evidence, qualification history or certificate is written here.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/training-compliance-manager-designation-nr05-0537.md

INSERT INTO compliance_condicoes
  (empresa_id,codigo,nome,tipo,descricao,referencia_normativa,ativo,created_at,updated_at)
SELECT 6,'GESTOR','Gestor','DESIGNACAO',
       'Funcionário formalmente designado pela empresa como Gestor para fins de aplicabilidade de treinamentos.',
       'Designação organizacional da empresa / Matriz de Treinamentos',
       1,datetime('now'),datetime('now')
 WHERE NOT EXISTS (
   SELECT 1 FROM compliance_condicoes
    WHERE empresa_id=6 AND codigo='GESTOR' AND ativo=1 AND deleted_at IS NULL
 );

UPDATE compliance_condicoes
   SET nome='Gestor',
       tipo='DESIGNACAO',
       descricao='Funcionário formalmente designado pela empresa como Gestor para fins de aplicabilidade de treinamentos.',
       referencia_normativa='Designação organizacional da empresa / Matriz de Treinamentos',
       updated_at=datetime('now')
 WHERE empresa_id=6 AND codigo='GESTOR' AND ativo=1 AND deleted_at IS NULL;

UPDATE treinamento_requisitos
   SET ativo=0,deleted_at=datetime('now'),updated_at=datetime('now')
 WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
   AND escopo='FUNCAO' AND condicao_id IS NULL
   AND qualificacao_tipo_id IN (
     SELECT id FROM qualificacoes_tipos
      WHERE empresa_id=6 AND codigo IN ('PPSP_SUP','BOWTIEXP')
        AND ativo=1 AND deleted_at IS NULL
   );

INSERT INTO treinamento_requisitos
  (empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,critico_operacional,origem,
   referencia_normativa,justificativa,condicao_id,fundamento_tipo,fundamento_documento,
   validade_fonte,auto_matricular_ead,ativo,created_at,updated_at)
SELECT 6,qt.id,'EMPRESA','OBRIGATORIA',1,'EMPRESA',
       'Designação organizacional de Gestor / Matriz de Treinamentos',
       'Aplicável somente a funcionários formalmente designados como Gestor.',
       cc.id,'DESIGNACAO','Decisão da Gerência de Treinamento 2026-10-07',
       'MODELO',1,1,datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt
  JOIN compliance_condicoes cc
    ON cc.empresa_id=6 AND cc.codigo='GESTOR' AND cc.ativo=1 AND cc.deleted_at IS NULL
 WHERE qt.empresa_id=6 AND qt.codigo IN ('PPSP_SUP','BOWTIEXP')
   AND qt.ativo=1 AND qt.deleted_at IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM treinamento_requisitos tr
      WHERE tr.empresa_id=6 AND tr.qualificacao_tipo_id=qt.id
        AND tr.escopo='EMPRESA' AND tr.condicao_id=cc.id
        AND tr.obrigatoriedade='OBRIGATORIA'
        AND tr.ativo=1 AND tr.deleted_at IS NULL
   );

UPDATE qualificacoes_tipos
   SET categoria='EAD',
       validade=24,
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND codigo='NR-05' AND ativo=1 AND deleted_at IS NULL;

UPDATE treinamento_requisitos
   SET ativo=0,deleted_at=datetime('now'),updated_at=datetime('now')
 WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
   AND qualificacao_tipo_id=(
     SELECT id FROM qualificacoes_tipos
      WHERE empresa_id=6 AND codigo='NR-05' AND ativo=1 AND deleted_at IS NULL
      LIMIT 1
   );

INSERT INTO treinamento_requisitos
  (empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,critico_operacional,origem,
   referencia_normativa,justificativa,fundamento_tipo,fundamento_documento,
   validade_fonte,auto_matricular_ead,ativo,created_at,updated_at)
SELECT 6,qt.id,'EMPRESA','OBRIGATORIA',1,'CLIENTE',
       'Requisito Petrobras adotado pela empresa; decisão da Gerência de Treinamento 2026-10-07',
       'NR-05 EAD obrigatória para todos os funcionários, com ciclo de 24 meses e carga horária de 2 horas.',
       'MATRIZ','Matriz de Treinamentos / requisito Petrobras','MODELO',0,1,datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt
 WHERE qt.empresa_id=6 AND qt.codigo='NR-05' AND qt.ativo=1 AND qt.deleted_at IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM treinamento_requisitos tr
      WHERE tr.empresa_id=6 AND tr.qualificacao_tipo_id=qt.id
        AND tr.escopo='EMPRESA' AND tr.condicao_id IS NULL
        AND tr.obrigatoriedade='OBRIGATORIA'
        AND tr.ativo=1 AND tr.deleted_at IS NULL
   );

UPDATE lms_cursos AS c
   SET titulo=(SELECT qt.nome FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),
       carga_horaria_inicial_horas=2,
       carga_horaria_recorrente_horas=2,
       carga_horaria_minutos=120,
       updated_at=datetime('now')
 WHERE c.empresa_id=6 AND c.ativo=1 AND c.deleted_at IS NULL
   AND c.qualificacao_tipo_id=(
     SELECT id FROM qualificacoes_tipos
      WHERE empresa_id=6 AND codigo='NR-05' AND ativo=1 AND deleted_at IS NULL
      LIMIT 1
   );
