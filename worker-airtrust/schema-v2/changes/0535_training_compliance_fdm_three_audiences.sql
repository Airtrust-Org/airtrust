-- 0535_training_compliance_fdm_three_audiences.sql
-- Governed forward-only extension to final matrix 0534 for Costa do Sol (empresa_id=6).
-- Training Management decision: FDM Tripulação / FDM MNT / FDM Comitê e Gatekeeper.
-- Reuse existing separate FDM_COMITE (0526) and GATEKEEPER (0517) designations.
-- No inferred employee membership, SCORM/LMS content, enrollments, history changes or other tenants.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/training-compliance-fdm-three-audiences-0535.md

-- Delivery modality, hours and validity are not specified for these two new
-- models. Use the existing generic operational-training category; do NOT infer EAD.
INSERT INTO qualificacoes_tipos
  (empresa_id,codigo,nome,descricao,categoria,categoria_id,validade,carga_horaria,area_id,ativo,is_check,observacoes,created_at,updated_at)
SELECT 6,'FDM-TRIPULACAO','Treinamento de FDM - Tripulação',
       'Treinamento FDM obrigatório para comandantes e copilotos.',qc.nome,qc.id,NULL,NULL,
       (SELECT id FROM qualificacoes_areas WHERE empresa_id=6 AND codigo='SEGURANCA_OPERACIONAL' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
       1,0,'Modalidade, duração e validade ainda não definidas; sem pacote LMS nesta mudança.',
       datetime('now'),datetime('now')
  FROM qualificacoes_categorias qc
 WHERE qc.empresa_id=6 AND UPPER(TRIM(qc.codigo))='TREINAMENTO_OPERACIONAL' AND qc.ativo=1 AND qc.deleted_at IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM qualificacoes_tipos q WHERE q.empresa_id=6 AND UPPER(TRIM(q.codigo))='FDM-TRIPULACAO' AND q.ativo=1 AND q.deleted_at IS NULL
   );

INSERT INTO qualificacoes_tipos
  (empresa_id,codigo,nome,descricao,categoria,categoria_id,validade,carga_horaria,area_id,ativo,is_check,observacoes,created_at,updated_at)
SELECT 6,'FDM-COMITE-GATEKEEPER','Treinamento de FDM - Comitê e Gatekeeper',
       'Treinamento FDM para as funções indicadas, membros designados do Comitê FDM e Gatekeepers designados.',qc.nome,qc.id,NULL,NULL,
       (SELECT id FROM qualificacoes_areas WHERE empresa_id=6 AND codigo='SEGURANCA_OPERACIONAL' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
       1,0,'Modalidade, duração e validade ainda não definidas; sem pacote LMS nesta mudança.',
       datetime('now'),datetime('now')
  FROM qualificacoes_categorias qc
 WHERE qc.empresa_id=6 AND UPPER(TRIM(qc.codigo))='TREINAMENTO_OPERACIONAL' AND qc.ativo=1 AND qc.deleted_at IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM qualificacoes_tipos q WHERE q.empresa_id=6 AND UPPER(TRIM(q.codigo))='FDM-COMITE-GATEKEEPER' AND q.ativo=1 AND q.deleted_at IS NULL
   );

-- Existing FDM-MECANICO (0534): preserve ID, EAD / 1 h / lifetime and
-- existing mechanic/maintenance-assistant requirements; align display name.
UPDATE qualificacoes_tipos
   SET nome='Treinamento de FDM - MNT',updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='FDM-MECANICO' AND ativo=1 AND deleted_at IS NULL;

-- FDM - Tripulação applies to Comandante and Copiloto by role.
INSERT INTO treinamento_requisitos
  (empresa_id,qualificacao_tipo_id,escopo,funcao_id,obrigatoriedade,critico_operacional,origem,referencia_normativa,justificativa,fundamento_tipo,fundamento_documento,validade_fonte,auto_matricular_ead,ativo,created_at,updated_at)
SELECT 6,qt.id,'FUNCAO',f.id,'OBRIGATORIA',1,'EMPRESA','MNL-SSO-002',
       'FDM - Tripulação obrigatório para Comandante e Copiloto.',
       'MATRIZ','Decisão da Gerência de Treinamento 2026-10-07','MODELO',0,1,datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt
  JOIN funcoes f ON f.empresa_id=6 AND f.ativo=1 AND f.deleted_at IS NULL
 WHERE qt.empresa_id=6 AND qt.codigo='FDM-TRIPULACAO' AND qt.ativo=1 AND qt.deleted_at IS NULL
   AND UPPER(TRIM(f.nome)) IN ('COMANDANTE','COPILOTO')
   AND NOT EXISTS (
     SELECT 1 FROM treinamento_requisitos tr WHERE tr.empresa_id=6 AND tr.qualificacao_tipo_id=qt.id
       AND tr.escopo='FUNCAO' AND tr.funcao_id=f.id AND tr.condicao_id IS NULL
       AND tr.ativo=1 AND tr.deleted_at IS NULL
   );

-- FDM - Comitê e Gatekeeper applies to the named positions independently of
-- formal Committee membership. No funcionario condition assignment is made.
INSERT INTO treinamento_requisitos
  (empresa_id,qualificacao_tipo_id,escopo,funcao_id,obrigatoriedade,critico_operacional,origem,referencia_normativa,justificativa,fundamento_tipo,fundamento_documento,validade_fonte,auto_matricular_ead,ativo,created_at,updated_at)
SELECT 6,qt.id,'FUNCAO',f.id,'OBRIGATORIA',1,'EMPRESA','MNL-SSO-002',
       'Treinamento requerido por função; cargo não concede designação Comitê FDM.',
       'MATRIZ','Decisão da Gerência de Treinamento 2026-10-07','MODELO',0,1,datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt
  JOIN funcoes f ON f.empresa_id=6 AND f.ativo=1 AND f.deleted_at IS NULL
 WHERE qt.empresa_id=6 AND qt.codigo='FDM-COMITE-GATEKEEPER' AND qt.ativo=1 AND qt.deleted_at IS NULL
   AND UPPER(TRIM(f.nome)) IN (
     'GERENTE DE SEGURANÇA OPERACIONAL','GERENTE DE SEGURANCA OPERACIONAL',
     'GERENTE DE MANUTENÇÃO','GERENTE DE MANUTENCAO',
     'GERENTE DE OPERAÇÕES','GERENTE DE OPERACOES',
     'ANALISTA DE FDM','ANALISTA FDM','COORDENADOR DE FDM','COORDENADOR FDM',
     'COORDENADOR DE ENGENHARIA'
   )
   AND NOT EXISTS (
     SELECT 1 FROM treinamento_requisitos tr WHERE tr.empresa_id=6 AND tr.qualificacao_tipo_id=qt.id
       AND tr.escopo='FUNCAO' AND tr.funcao_id=f.id AND tr.condicao_id IS NULL
       AND tr.ativo=1 AND tr.deleted_at IS NULL
   );

-- FDM_COMITE and GATEKEEPER are DISTINCT, existing, individually assigned
-- designations. Link both to the new training, never create assignments.
INSERT INTO treinamento_requisitos
  (empresa_id,qualificacao_tipo_id,escopo,condicao_id,obrigatoriedade,critico_operacional,origem,referencia_normativa,justificativa,fundamento_tipo,fundamento_documento,validade_fonte,auto_matricular_ead,ativo,created_at,updated_at)
SELECT 6,qt.id,'EMPRESA',cc.id,'OBRIGATORIA',1,'EMPRESA','MNL-SSO-002',
       'Treinamento requerido para Comitê FDM ou Gatekeeper formalmente designado.',
       'DESIGNACAO','Decisão da Gerência de Treinamento 2026-10-07','MODELO',0,1,datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt
  JOIN compliance_condicoes cc ON cc.empresa_id=6 AND cc.ativo=1 AND cc.deleted_at IS NULL
 WHERE qt.empresa_id=6 AND qt.codigo='FDM-COMITE-GATEKEEPER' AND qt.ativo=1 AND qt.deleted_at IS NULL
   AND cc.codigo IN ('FDM_COMITE','GATEKEEPER')
   AND NOT EXISTS (
     SELECT 1 FROM treinamento_requisitos tr WHERE tr.empresa_id=6 AND tr.qualificacao_tipo_id=qt.id
       AND tr.escopo='EMPRESA' AND tr.condicao_id=cc.id AND tr.ativo=1 AND tr.deleted_at IS NULL
   );
