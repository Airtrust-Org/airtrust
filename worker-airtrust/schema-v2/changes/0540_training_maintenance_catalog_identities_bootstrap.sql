-- 0540_training_maintenance_manuals_bootstrap.sql
-- Forward-only repair for missing Costa do Sol Maintenance manual qualification identities.
-- Operational ordering: 0536 -> 0540 -> 0539 -> 0537 -> 0538.
-- Tenant scoped to empresa_id=6. No employee, enrollment, completion, certificate, history or R2 writes.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/training-maintenance-manuals-bootstrap-0540.md

INSERT INTO qualificacoes_categorias
  (empresa_id,nome,codigo,cor,descricao,ativo,created_at,updated_at)
SELECT 6,'Treinamento de Doutrinação','TREINAMENTO-DE-DOUTRINACAO','#14B8A6',
       'Treinamentos de integração e doutrinamento inicial da equipe de Manutenção',
       1,datetime('now'),datetime('now')
 WHERE NOT EXISTS (
   SELECT 1 FROM qualificacoes_categorias
    WHERE empresa_id=6
      AND (UPPER(TRIM(codigo))='TREINAMENTO-DE-DOUTRINACAO'
           OR UPPER(TRIM(nome))='TREINAMENTO DE DOUTRINAÇÃO')
      AND deleted_at IS NULL
 );

UPDATE qualificacoes_categorias
   SET nome='Treinamento de Doutrinação',
       codigo='TREINAMENTO-DE-DOUTRINACAO',
       descricao='Treinamentos de integração e doutrinamento inicial da equipe de Manutenção',
       ativo=1,
       deleted_at=NULL,
       updated_at=datetime('now')
 WHERE empresa_id=6
   AND id=(
     SELECT id FROM qualificacoes_categorias
      WHERE empresa_id=6
        AND (UPPER(TRIM(codigo))='TREINAMENTO-DE-DOUTRINACAO'
             OR UPPER(TRIM(nome))='TREINAMENTO DE DOUTRINAÇÃO')
      ORDER BY CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END,id DESC
      LIMIT 1
   );

UPDATE qualificacoes_tipos
   SET nome='MGM - Manual Geral de Manutenção',
       categoria='Treinamento de Doutrinação',
       categoria_id=(SELECT id FROM qualificacoes_categorias WHERE empresa_id=6 AND codigo='TREINAMENTO-DE-DOUTRINACAO' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
       area_id=(SELECT id FROM qualificacoes_areas WHERE empresa_id=6 AND codigo='MANUTENCAO' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
       carga_horaria=NULL,carga_horaria_inicial=NULL,carga_horaria_recorrente=NULL,
       ativo=1,deleted_at=NULL,updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='MNT_MGM'
   AND id=(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='MNT_MGM' ORDER BY CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END,id DESC LIMIT 1);

UPDATE qualificacoes_tipos
   SET nome='MOM - Manual da Organização de Manutenção',
       categoria='Treinamento de Doutrinação',
       categoria_id=(SELECT id FROM qualificacoes_categorias WHERE empresa_id=6 AND codigo='TREINAMENTO-DE-DOUTRINACAO' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
       area_id=(SELECT id FROM qualificacoes_areas WHERE empresa_id=6 AND codigo='MANUTENCAO' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
       carga_horaria=NULL,carga_horaria_inicial=NULL,carga_horaria_recorrente=NULL,
       ativo=1,deleted_at=NULL,updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='MNT_MOM'
   AND id=(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='MNT_MOM' ORDER BY CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END,id DESC LIMIT 1);

UPDATE qualificacoes_tipos
   SET nome='MCQ - Manual de Controle de Qualidade',
       categoria='Treinamento de Doutrinação',
       categoria_id=(SELECT id FROM qualificacoes_categorias WHERE empresa_id=6 AND codigo='TREINAMENTO-DE-DOUTRINACAO' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
       area_id=(SELECT id FROM qualificacoes_areas WHERE empresa_id=6 AND codigo='MANUTENCAO' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
       carga_horaria=NULL,carga_horaria_inicial=NULL,carga_horaria_recorrente=NULL,
       ativo=1,deleted_at=NULL,updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='MNT_MCQ'
   AND id=(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='MNT_MCQ' ORDER BY CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END,id DESC LIMIT 1);

INSERT INTO qualificacoes_tipos
  (empresa_id,codigo,nome,categoria,categoria_id,area_id,validade,carga_horaria,carga_horaria_inicial,carga_horaria_recorrente,ativo,is_check,observacoes,created_at,updated_at)
SELECT 6,'MNT_MGM','MGM - Manual Geral de Manutenção',qc.nome,qc.id,qa.id,NULL,NULL,NULL,NULL,1,0,
       'Identidade restaurada para permitir a Doutrinação de Manutenção; carga horária autônoma não definida.',datetime('now'),datetime('now')
  FROM qualificacoes_categorias qc, qualificacoes_areas qa
 WHERE qc.empresa_id=6 AND qc.codigo='TREINAMENTO-DE-DOUTRINACAO' AND qc.ativo=1 AND qc.deleted_at IS NULL
   AND qa.empresa_id=6 AND qa.codigo='MANUTENCAO' AND qa.ativo=1 AND qa.deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='MNT_MGM');

INSERT INTO qualificacoes_tipos
  (empresa_id,codigo,nome,categoria,categoria_id,area_id,validade,carga_horaria,carga_horaria_inicial,carga_horaria_recorrente,ativo,is_check,observacoes,created_at,updated_at)
SELECT 6,'MNT_MOM','MOM - Manual da Organização de Manutenção',qc.nome,qc.id,qa.id,NULL,NULL,NULL,NULL,1,0,
       'Identidade restaurada para permitir a Doutrinação de Manutenção; carga horária autônoma não definida.',datetime('now'),datetime('now')
  FROM qualificacoes_categorias qc, qualificacoes_areas qa
 WHERE qc.empresa_id=6 AND qc.codigo='TREINAMENTO-DE-DOUTRINACAO' AND qc.ativo=1 AND qc.deleted_at IS NULL
   AND qa.empresa_id=6 AND qa.codigo='MANUTENCAO' AND qa.ativo=1 AND qa.deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='MNT_MOM');

INSERT INTO qualificacoes_tipos
  (empresa_id,codigo,nome,categoria,categoria_id,area_id,validade,carga_horaria,carga_horaria_inicial,carga_horaria_recorrente,ativo,is_check,observacoes,created_at,updated_at)
SELECT 6,'MNT_MCQ','MCQ - Manual de Controle de Qualidade',qc.nome,qc.id,qa.id,NULL,NULL,NULL,NULL,1,0,
       'Identidade restaurada para permitir a Doutrinação de Manutenção; carga horária autônoma não definida.',datetime('now'),datetime('now')
  FROM qualificacoes_categorias qc, qualificacoes_areas qa
 WHERE qc.empresa_id=6 AND qc.codigo='TREINAMENTO-DE-DOUTRINACAO' AND qc.ativo=1 AND qc.deleted_at IS NULL
   AND qa.empresa_id=6 AND qa.codigo='MANUTENCAO' AND qa.ativo=1 AND qa.deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='MNT_MCQ');
