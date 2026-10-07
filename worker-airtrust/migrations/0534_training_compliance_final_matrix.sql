-- 0534_training_compliance_final_matrix.sql
-- Aligns Costa do Sol Training Compliance with the final canonical QSMS + Segurança Operacional matrix supplied by Training Management on 2026-10-06.
-- Explicit correction: NR-05 category is EAD (not Treinamento).
-- The final matrix supersedes prior 0526/0531/0532 applicability/metadata decisions where they conflict.
-- Tenant-scoped to empresa_id=6. Historical qualification evidence and LMS completions are preserved.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/training-compliance-final-matrix-0534.md

-- Canonical model metadata.
UPDATE qualificacoes_tipos SET categoria='EAD',validade=24,carga_horaria=2,carga_horaria_inicial=2,carga_horaria_recorrente=2,updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='AUD_COMP' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET categoria='Treinamento',validade=NULL,carga_horaria=NULL,carga_horaria_inicial=NULL,carga_horaria_recorrente=NULL,updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='BRIGADA_INCENDIO' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET categoria='EAD',validade=12,carga_horaria=3,carga_horaria_inicial=3,carga_horaria_recorrente=3,updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='COD_ETICA' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET categoria='EAD',validade=24,carga_horaria=2,carga_horaria_inicial=2,carga_horaria_recorrente=2,updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='INTRO_SGQ' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET categoria='EAD',validade=24,carga_horaria=2,carga_horaria_inicial=2,carga_horaria_recorrente=2,updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='COL_SEL' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET categoria='EAD',validade=24,carga_horaria=2,carga_horaria_inicial=2,carga_horaria_recorrente=2,updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='MUDA' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET categoria='EAD',validade=24,carga_horaria=2,carga_horaria_inicial=2,carga_horaria_recorrente=2,updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='INTEGRA' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET categoria='EAD',validade=NULL,carga_horaria=NULL,carga_horaria_inicial=NULL,carga_horaria_recorrente=NULL,updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='NR-05' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET categoria='EAD',validade=24,carga_horaria=2,carga_horaria_inicial=2,carga_horaria_recorrente=2,updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='NR06' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET categoria='EAD',validade=24,carga_horaria=2,carga_horaria_inicial=2,carga_horaria_recorrente=2,updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='NR-11' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET categoria='Treinamento',validade=24,carga_horaria=2,carga_horaria_inicial=2,carga_horaria_recorrente=2,updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='NR-12' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET nome='NR-20 - Iniciação sobre Inflamáveis e Combustíveis',categoria='EAD',validade=24,carga_horaria=2,carga_horaria_inicial=2,carga_horaria_recorrente=2,updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='NR-20' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET categoria='EAD',validade=24,carga_horaria=2,carga_horaria_inicial=2,carga_horaria_recorrente=2,updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='NR-26' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET categoria='Presencial',validade=24,carga_horaria=8,carga_horaria_inicial=8,carga_horaria_recorrente=8,updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='NR-35' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET categoria='Treinamento',validade=NULL,carga_horaria=NULL,carga_horaria_inicial=NULL,carga_horaria_recorrente=NULL,updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='PRIMEIROS_SOCORROS' AND ativo=1 AND deleted_at IS NULL;

UPDATE qualificacoes_tipos SET categoria='Teórico',validade=24,carga_horaria=16,carga_horaria_inicial=16,carga_horaria_recorrente=16,updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='CRM_CORP' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET categoria='EAD',validade=NULL,carga_horaria=4,carga_horaria_inicial=4,carga_horaria_recorrente=4,updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='CRM_DIR_RBAC119' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET categoria='EAD',validade=24,carga_horaria=2,carga_horaria_inicial=2,carga_horaria_recorrente=2,updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='JUST_CULTURE' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET categoria='EAD',validade=24,carga_horaria=2,carga_horaria_inicial=2,carga_horaria_recorrente=2,updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='FOD' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET categoria='EAD',validade=48,carga_horaria=2,carga_horaria_inicial=2,carga_horaria_recorrente=2,updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='LOSA' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET categoria='EAD',validade=60,carga_horaria=2,carga_horaria_inicial=2,carga_horaria_recorrente=2,updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='PPSP_SUP' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET categoria='EAD',validade=60,carga_horaria=2,carga_horaria_inicial=2,carga_horaria_recorrente=2,updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='PPSP' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET categoria='EAD',validade=12,carga_horaria=2,carga_horaria_inicial=2,carga_horaria_recorrente=2,updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='PRE' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET categoria='EAD',validade=36,carga_horaria=4,carga_horaria_inicial=4,carga_horaria_recorrente=4,updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='D2' AND ativo=1 AND deleted_at IS NULL;
UPDATE qualificacoes_tipos SET categoria='EAD',validade=24,carga_horaria=2,carga_horaria_inicial=2,carga_horaria_recorrente=2,updated_at=datetime('now') WHERE empresa_id=6 AND UPPER(TRIM(codigo))='STOP_WORK' AND ativo=1 AND deleted_at IS NULL;

-- Preserve the Regras de Ouro model/course/history that already carries the real evidence.
UPDATE qualificacoes_tipos
   SET codigo='REGRAS_OURO_PETROBRAS_UNUSED_' || id,
       ativo=0,
       deleted_at=datetime('now'),
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='REGRAS_OURO_PETROBRAS'
   AND EXISTS (SELECT 1 FROM qualificacoes_tipos p2 WHERE p2.empresa_id=6 AND UPPER(TRIM(p2.codigo))='PETRO-OURO' AND p2.ativo=1 AND p2.deleted_at IS NULL)
   AND NOT EXISTS (
     SELECT 1 FROM qualificacoes_historico qh
      WHERE qh.empresa_id=6 AND qh.deleted_at IS NULL
        AND (qh.qualificacao_id=qualificacoes_tipos.id OR UPPER(TRIM(COALESCE(qh.qualificacao_codigo,'')))='REGRAS_OURO_PETROBRAS')
   )
   AND NOT EXISTS (
     SELECT 1 FROM lms_cursos c
      WHERE c.empresa_id=6 AND c.qualificacao_tipo_id=qualificacoes_tipos.id AND c.deleted_at IS NULL
   );
UPDATE qualificacoes_tipos
   SET codigo='REGRAS_OURO_PETROBRAS',
       nome='Regras de Ouro - Petrobras',
       categoria='EAD',
       validade=24,
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       area_id=(SELECT id FROM qualificacoes_areas WHERE empresa_id=6 AND codigo='QSMS' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='PETRO-OURO' AND ativo=1 AND deleted_at IS NULL;

UPDATE qualificacoes_tipos
   SET nome='Regras de Ouro - Petrobras',
       categoria='EAD',
       validade=24,
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       area_id=(SELECT id FROM qualificacoes_areas WHERE empresa_id=6 AND codigo='QSMS' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='REGRAS_OURO_PETROBRAS' AND ativo=1 AND deleted_at IS NULL;

-- New canonical qualifications introduced by the final matrix.
INSERT INTO qualificacoes_tipos
  (empresa_id,codigo,nome,categoria,validade,carga_horaria,carga_horaria_inicial,carga_horaria_recorrente,area_id,ativo,is_check,observacoes,created_at,updated_at)
SELECT 6,'FDM-MECANICO','FDM - Mecânico','EAD',NULL,1,1,1,
       (SELECT id FROM qualificacoes_areas WHERE empresa_id=6 AND codigo='SEGURANCA_OPERACIONAL' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
       1,0,'Validade vitalícia conforme matriz final de 06/10/2026.',datetime('now'),datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='FDM-MECANICO' AND ativo=1 AND deleted_at IS NULL);

INSERT INTO qualificacoes_tipos
  (empresa_id,codigo,nome,categoria,validade,carga_horaria,carga_horaria_inicial,carga_horaria_recorrente,area_id,ativo,is_check,observacoes,created_at,updated_at)
SELECT 6,'BOWTIEXP','BOWTIEXP','EAD',24,4,4,4,
       (SELECT id FROM qualificacoes_areas WHERE empresa_id=6 AND codigo='SEGURANCA_OPERACIONAL' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
       1,0,'Aplicável a Gestores conforme matriz final de 06/10/2026.',datetime('now'),datetime('now')
 WHERE NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='BOWTIEXP' AND ativo=1 AND deleted_at IS NULL);

-- Designation-driven items remain designation-driven. Do not infer occupants.
UPDATE treinamento_requisitos
   SET ativo=0,deleted_at=datetime('now'),updated_at=datetime('now')
 WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
   AND qualificacao_tipo_id IN (
     SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo)) IN ('AUD_COMP','MUDA') AND ativo=1 AND deleted_at IS NULL
   )
   AND escopo<>'FUNCIONARIO';

-- Retire the former FDM/HFDM team compliance obligation; its course/history remain untouched.
UPDATE treinamento_requisitos
   SET ativo=0,deleted_at=datetime('now'),updated_at=datetime('now')
 WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
   AND qualificacao_tipo_id=(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='FDM-EAD' AND ativo=1 AND deleted_at IS NULL LIMIT 1);

-- Rebuild exact applicability for the canonical matrix.
UPDATE treinamento_requisitos
   SET ativo=0,deleted_at=datetime('now'),updated_at=datetime('now')
 WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
   AND qualificacao_tipo_id IN (
     SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo)) IN (
       'BRIGADA_INCENDIO','COD_ETICA','INTRO_SGQ','COL_SEL','INTEGRA','NR-05','NR06','NR-11','NR-12','NR-20','NR-26','NR-35','PRIMEIROS_SOCORROS',
       'REGRAS_OURO_PETROBRAS','CRM_CORP','CRM_DIR_RBAC119','JUST_CULTURE','FOD','LOSA','PPSP_SUP','PPSP','PRE','D2','STOP_WORK','FDM-MECANICO','BOWTIEXP'
     ) AND ativo=1 AND deleted_at IS NULL
   );

-- Company-wide mandatory rules.
INSERT INTO treinamento_requisitos
  (empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,critico_operacional,origem,referencia_normativa,justificativa,fundamento_tipo,fundamento_documento,validade_fonte,auto_matricular_ead,ativo,created_at,updated_at)
SELECT 6,qt.id,'EMPRESA','OBRIGATORIA',0,'EMPRESA','Matriz final QSMS/Segurança Operacional 2026-10-06','Obrigatório para todos os funcionários conforme matriz final canônica.','MATRIZ','Matriz final 2026-10-06','MODELO',0,1,datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt
 WHERE qt.empresa_id=6 AND qt.ativo=1 AND qt.deleted_at IS NULL
   AND UPPER(TRIM(qt.codigo)) IN ('COD_ETICA','INTRO_SGQ','COL_SEL','INTEGRA','NR06','REGRAS_OURO_PETROBRAS','JUST_CULTURE','PRE','D2','STOP_WORK');

-- Designation conditions.
INSERT INTO treinamento_requisitos
  (empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,critico_operacional,origem,referencia_normativa,justificativa,condicao_id,fundamento_tipo,fundamento_documento,validade_fonte,auto_matricular_ead,ativo,created_at,updated_at)
SELECT 6,qt.id,'EMPRESA','OBRIGATORIA',1,'EMPRESA','Matriz final QSMS/Segurança Operacional 2026-10-06','Somente integrantes formalmente designados da Brigada de Incêndio/Emergência.',cc.id,'DESIGNACAO','Matriz final 2026-10-06','MODELO',0,1,datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt, compliance_condicoes cc
 WHERE qt.empresa_id=6 AND qt.codigo='BRIGADA_INCENDIO' AND qt.ativo=1 AND qt.deleted_at IS NULL
   AND cc.empresa_id=6 AND cc.codigo='BRIGADISTA' AND cc.ativo=1 AND cc.deleted_at IS NULL;

INSERT INTO treinamento_requisitos
  (empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,critico_operacional,origem,referencia_normativa,justificativa,condicao_id,fundamento_tipo,fundamento_documento,validade_fonte,auto_matricular_ead,ativo,created_at,updated_at)
SELECT 6,qt.id,'EMPRESA','OBRIGATORIA',1,'EMPRESA','Matriz final QSMS/Segurança Operacional 2026-10-06','Somente membros da CIPA / representantes NR-05 formalmente designados.',cc.id,'DESIGNACAO','Matriz final 2026-10-06','MODELO',0,1,datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt, compliance_condicoes cc
 WHERE qt.empresa_id=6 AND qt.codigo='NR-05' AND qt.ativo=1 AND qt.deleted_at IS NULL
   AND cc.empresa_id=6 AND cc.codigo='MEMBRO_CIPA' AND cc.ativo=1 AND cc.deleted_at IS NULL;

INSERT INTO treinamento_requisitos
  (empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,critico_operacional,origem,referencia_normativa,justificativa,condicao_id,fundamento_tipo,fundamento_documento,validade_fonte,auto_matricular_ead,ativo,created_at,updated_at)
SELECT 6,qt.id,'EMPRESA','OBRIGATORIA',1,'EMPRESA','Matriz final QSMS/Segurança Operacional 2026-10-06','Somente socorristas formalmente designados.',cc.id,'DESIGNACAO','Matriz final 2026-10-06','MODELO',0,1,datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt, compliance_condicoes cc
 WHERE qt.empresa_id=6 AND qt.codigo='PRIMEIROS_SOCORROS' AND qt.ativo=1 AND qt.deleted_at IS NULL
   AND cc.empresa_id=6 AND cc.codigo='SOCORRISTA_DESIGNADO' AND cc.ativo=1 AND cc.deleted_at IS NULL;

INSERT INTO treinamento_requisitos
  (empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,critico_operacional,origem,referencia_normativa,justificativa,condicao_id,fundamento_tipo,fundamento_documento,validade_fonte,auto_matricular_ead,ativo,created_at,updated_at)
SELECT 6,qt.id,'EMPRESA','OBRIGATORIA',1,'EMPRESA','Matriz final QSMS/Segurança Operacional 2026-10-06','Somente observadores / integrantes da equipe LOSA formalmente designados.',cc.id,'DESIGNACAO','Matriz final 2026-10-06','MODELO',0,1,datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt, compliance_condicoes cc
 WHERE qt.empresa_id=6 AND qt.codigo='LOSA' AND qt.ativo=1 AND qt.deleted_at IS NULL
   AND cc.empresa_id=6 AND cc.codigo='LOSA_OBSERVADOR' AND cc.ativo=1 AND cc.deleted_at IS NULL;

-- Function-scoped requirements.
INSERT INTO treinamento_requisitos
  (empresa_id,qualificacao_tipo_id,escopo,funcao_id,obrigatoriedade,critico_operacional,origem,referencia_normativa,justificativa,fundamento_tipo,fundamento_documento,validade_fonte,auto_matricular_ead,ativo,created_at,updated_at)
SELECT 6,qt.id,'FUNCAO',f.id,'OBRIGATORIA',1,'EMPRESA','Matriz final QSMS/Segurança Operacional 2026-10-06','Aplicabilidade por cargo definida na matriz final.','MATRIZ','Matriz final 2026-10-06','MODELO',0,1,datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt JOIN funcoes f ON f.empresa_id=6 AND f.ativo=1 AND f.deleted_at IS NULL
 WHERE qt.empresa_id=6 AND qt.codigo='NR-11' AND qt.ativo=1 AND qt.deleted_at IS NULL
   AND UPPER(TRIM(f.nome)) IN ('MECÂNICO','MECANICO','AUXILIAR DE MANUTENÇÃO','AUXILIAR DE MANUTENCAO');

INSERT INTO treinamento_requisitos
  (empresa_id,qualificacao_tipo_id,escopo,funcao_id,obrigatoriedade,critico_operacional,origem,referencia_normativa,justificativa,fundamento_tipo,fundamento_documento,validade_fonte,auto_matricular_ead,ativo,created_at,updated_at)
SELECT 6,qt.id,'FUNCAO',f.id,'OBRIGATORIA',1,'EMPRESA','Matriz final QSMS/Segurança Operacional 2026-10-06','Aplicabilidade por cargo definida na matriz final.','MATRIZ','Matriz final 2026-10-06','MODELO',0,1,datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt JOIN funcoes f ON f.empresa_id=6 AND f.ativo=1 AND f.deleted_at IS NULL
 WHERE qt.empresa_id=6 AND qt.codigo='NR-12' AND qt.ativo=1 AND qt.deleted_at IS NULL
   AND UPPER(TRIM(f.nome)) IN ('MECÂNICO','MECANICO','AUXILIAR DE MANUTENÇÃO','AUXILIAR DE MANUTENCAO');

INSERT INTO treinamento_requisitos
  (empresa_id,qualificacao_tipo_id,escopo,funcao_id,obrigatoriedade,critico_operacional,origem,referencia_normativa,justificativa,fundamento_tipo,fundamento_documento,validade_fonte,auto_matricular_ead,ativo,created_at,updated_at)
SELECT 6,qt.id,'FUNCAO',f.id,'OBRIGATORIA',1,'EMPRESA','Matriz final QSMS/Segurança Operacional 2026-10-06','Aplicabilidade por cargo definida na matriz final.','MATRIZ','Matriz final 2026-10-06','MODELO',0,1,datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt JOIN funcoes f ON f.empresa_id=6 AND f.ativo=1 AND f.deleted_at IS NULL
 WHERE qt.empresa_id=6 AND qt.codigo='NR-20' AND qt.ativo=1 AND qt.deleted_at IS NULL
   AND UPPER(TRIM(f.nome)) IN ('MECÂNICO','MECANICO','AUXILIAR DE MANUTENÇÃO','AUXILIAR DE MANUTENCAO','AUXILIAR DE SUPRIMENTOS','SUPERVISOR DE SUPRIMENTOS');

INSERT INTO treinamento_requisitos
  (empresa_id,qualificacao_tipo_id,escopo,funcao_id,obrigatoriedade,critico_operacional,origem,referencia_normativa,justificativa,fundamento_tipo,fundamento_documento,validade_fonte,auto_matricular_ead,ativo,created_at,updated_at)
SELECT 6,qt.id,'FUNCAO',f.id,'OBRIGATORIA',1,'EMPRESA','Matriz final QSMS/Segurança Operacional 2026-10-06','Aplicabilidade por cargo definida na matriz final.','MATRIZ','Matriz final 2026-10-06','MODELO',0,1,datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt JOIN funcoes f ON f.empresa_id=6 AND f.ativo=1 AND f.deleted_at IS NULL
 WHERE qt.empresa_id=6 AND qt.codigo='NR-26' AND qt.ativo=1 AND qt.deleted_at IS NULL
   AND UPPER(TRIM(f.nome)) IN (
     'AGENTE DE ATENDIMENTO','AGENTE DE RAMPA','AUXILIAR DE MANUTENÇÃO','AUXILIAR DE MANUTENCAO','AUXILIAR DE QSMS','AUXILIAR DE SUPRIMENTOS',
     'COMANDANTE','COORDENADOR DE ENGENHARIA','COPILOTO','GERENTE DE BASES','GERENTE DE MANUTENÇÃO','GERENTE DE MANUTENCAO',
     'GERENTE DE OPERAÇÕES','GERENTE DE OPERACOES','GERENTE DE QSMS','GERENTE DE SEGURANÇA OPERACIONAL','GERENTE DE SEGURANCA OPERACIONAL',
     'MECÂNICO','MECANICO','MOTORISTA','SUPERVISOR DE ENGENHARIA','SUPERVISOR DE SUPRIMENTOS','TÉCNICO DE SEGURANÇA DO TRABALHO','TECNICO DE SEGURANCA DO TRABALHO'
   );

INSERT INTO treinamento_requisitos
  (empresa_id,qualificacao_tipo_id,escopo,funcao_id,obrigatoriedade,critico_operacional,origem,referencia_normativa,justificativa,modalidade_requerida,fundamento_tipo,fundamento_documento,validade_fonte,auto_matricular_ead,ativo,created_at,updated_at)
SELECT 6,qt.id,'FUNCAO',f.id,'OBRIGATORIA',1,'EMPRESA','Matriz final QSMS/Segurança Operacional 2026-10-06','Aplicabilidade por cargo definida na matriz final.','PRESENCIAL','MATRIZ','Matriz final 2026-10-06','MODELO',0,1,datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt JOIN funcoes f ON f.empresa_id=6 AND f.ativo=1 AND f.deleted_at IS NULL
 WHERE qt.empresa_id=6 AND qt.codigo='NR-35' AND qt.ativo=1 AND qt.deleted_at IS NULL
   AND UPPER(TRIM(f.nome)) IN ('MECÂNICO','MECANICO','AUXILIAR DE MANUTENÇÃO','AUXILIAR DE MANUTENCAO');

-- FOD and PPSP share the exact final-matrix audience.
INSERT INTO treinamento_requisitos
  (empresa_id,qualificacao_tipo_id,escopo,funcao_id,obrigatoriedade,critico_operacional,origem,referencia_normativa,justificativa,fundamento_tipo,fundamento_documento,validade_fonte,auto_matricular_ead,ativo,created_at,updated_at)
SELECT 6,qt.id,'FUNCAO',f.id,'OBRIGATORIA',1,'EMPRESA','Matriz final QSMS/Segurança Operacional 2026-10-06','Aplicabilidade por cargo definida na matriz final.','MATRIZ','Matriz final 2026-10-06','MODELO',0,1,datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt JOIN funcoes f ON f.empresa_id=6 AND f.ativo=1 AND f.deleted_at IS NULL
 WHERE qt.empresa_id=6 AND qt.codigo IN ('FOD','PPSP') AND qt.ativo=1 AND qt.deleted_at IS NULL
   AND UPPER(TRIM(f.nome)) IN (
     'AGENTE DE ATENDIMENTO','AGENTE DE RAMPA','ANALISTA DE CTM','ASSISTENTE DE OPERAÇÕES','ASSISTENTE DE OPERACOES','ASSISTENTE DE SEGURANÇA OPERACIONAL','ASSISTENTE DE SEGURANCA OPERACIONAL',
     'AUXILIAR DE CTM','AUXILIAR DE COORDENAÇÃO DE VOO','AUXILIAR DE COORDENACAO DE VOO','AUXILIAR DE MANUTENÇÃO','AUXILIAR DE MANUTENCAO','AUXILIAR DE QSMS','AUXILIAR DE SUPRIMENTOS',
     'COMANDANTE','COORDENADOR DE ENGENHARIA','COORDENADOR DE VOO','COPILOTO','GERENTE DE BASES','GERENTE DE OPERAÇÕES','GERENTE DE OPERACOES',
     'MECÂNICO','MECANICO','MOTORISTA','SUPERVISOR DE SUPRIMENTOS','TÉCNICO DE SEGURANÇA DO TRABALHO','TECNICO DE SEGURANCA DO TRABALHO'
   );

-- Gestores = active functions whose canonical name is Gerente / Gerente ...
INSERT INTO treinamento_requisitos
  (empresa_id,qualificacao_tipo_id,escopo,funcao_id,obrigatoriedade,critico_operacional,origem,referencia_normativa,justificativa,fundamento_tipo,fundamento_documento,validade_fonte,auto_matricular_ead,ativo,created_at,updated_at)
SELECT 6,qt.id,'FUNCAO',f.id,'OBRIGATORIA',1,'EMPRESA','Matriz final QSMS/Segurança Operacional 2026-10-06','Aplicável a Gestores conforme matriz final; Gestores são as funções ativas Gerente / Gerente ... do cadastro organizacional.','MATRIZ','Matriz final 2026-10-06','MODELO',0,1,datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt JOIN funcoes f ON f.empresa_id=6 AND f.ativo=1 AND f.deleted_at IS NULL
 WHERE qt.empresa_id=6 AND qt.codigo IN ('PPSP_SUP','BOWTIEXP') AND qt.ativo=1 AND qt.deleted_at IS NULL
   AND (UPPER(TRIM(f.nome))='GERENTE' OR UPPER(TRIM(f.nome)) LIKE 'GERENTE %');

-- FDM - Mecânico applies to Mechanics and Maintenance Assistants, independent of FDM/HFDM team designation.
INSERT INTO treinamento_requisitos
  (empresa_id,qualificacao_tipo_id,escopo,funcao_id,obrigatoriedade,critico_operacional,origem,referencia_normativa,justificativa,fundamento_tipo,fundamento_documento,validade_fonte,auto_matricular_ead,ativo,created_at,updated_at)
SELECT 6,qt.id,'FUNCAO',f.id,'OBRIGATORIA',1,'EMPRESA','Matriz final QSMS/Segurança Operacional 2026-10-06','FDM - Mecânico é obrigatório para Mecânico e Auxiliar de Manutenção conforme matriz final.','MATRIZ','Matriz final 2026-10-06','MODELO',0,1,datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt JOIN funcoes f ON f.empresa_id=6 AND f.ativo=1 AND f.deleted_at IS NULL
 WHERE qt.empresa_id=6 AND qt.codigo='FDM-MECANICO' AND qt.ativo=1 AND qt.deleted_at IS NULL
   AND UPPER(TRIM(f.nome)) IN ('MECÂNICO','MECANICO','AUXILIAR DE MANUTENÇÃO','AUXILIAR DE MANUTENCAO');

-- CRM Corporate: company-wide, excluding Tripulação and the five RBAC 119 direction designations.
INSERT INTO treinamento_requisitos
  (empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,critico_operacional,origem,referencia_normativa,justificativa,fundamento_tipo,fundamento_documento,validade_fonte,auto_matricular_ead,ativo,created_at,updated_at)
SELECT 6,qt.id,'EMPRESA','OBRIGATORIA',1,'EMPRESA','Matriz final QSMS/Segurança Operacional 2026-10-06','CRM Corporate obrigatório para todos, ressalvadas as exclusões da matriz.','MATRIZ','Matriz final 2026-10-06','MODELO',0,1,datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt
 WHERE qt.empresa_id=6 AND qt.codigo='CRM_CORP' AND qt.ativo=1 AND qt.deleted_at IS NULL;

INSERT INTO treinamento_requisitos
  (empresa_id,qualificacao_tipo_id,escopo,setor_id,obrigatoriedade,critico_operacional,origem,referencia_normativa,justificativa,fundamento_tipo,fundamento_documento,validade_fonte,auto_matricular_ead,ativo,created_at,updated_at)
SELECT 6,qt.id,'SETOR',s.id,'NAO_APLICA',0,'EMPRESA','Matriz final QSMS/Segurança Operacional 2026-10-06','Tripulação recebe o CRM específico operacional, não o CRM Corporate.','MATRIZ_EXCLUSAO','Matriz final 2026-10-06','MODELO',0,1,datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt JOIN setores s ON s.empresa_id=6 AND s.ativo=1 AND s.deleted_at IS NULL
 WHERE qt.empresa_id=6 AND qt.codigo='CRM_CORP' AND qt.ativo=1 AND qt.deleted_at IS NULL
   AND UPPER(TRIM(s.nome))='TRIPULAÇÃO';

INSERT INTO treinamento_requisitos
  (empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,critico_operacional,origem,referencia_normativa,justificativa,condicao_id,fundamento_tipo,fundamento_documento,validade_fonte,auto_matricular_ead,ativo,created_at,updated_at)
SELECT 6,qt.id,'EMPRESA','NAO_APLICA',0,'EMPRESA','Matriz final QSMS/Segurança Operacional 2026-10-06','Cargo de direção RBAC 119 recebe o CRM específico de direção.',cc.id,'MATRIZ_EXCLUSAO','Matriz final 2026-10-06','MODELO',0,1,datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt JOIN compliance_condicoes cc ON cc.empresa_id=6 AND cc.ativo=1 AND cc.deleted_at IS NULL
 WHERE qt.empresa_id=6 AND qt.codigo='CRM_CORP' AND qt.ativo=1 AND qt.deleted_at IS NULL
   AND cc.codigo IN ('RBAC119_GESTOR_RESPONSAVEL','RBAC119_GERENTE_OPERACOES','RBAC119_GERENTE_MANUTENCAO','RBAC119_GERENTE_SEGURANCA_OPERACIONAL','RBAC119_PILOTO_CHEFE');

-- CRM de direção: exactly the five RBAC 119 direction designations.
INSERT INTO treinamento_requisitos
  (empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,critico_operacional,origem,referencia_normativa,justificativa,condicao_id,fundamento_tipo,fundamento_documento,validade_fonte,auto_matricular_ead,ativo,created_at,updated_at)
SELECT 6,qt.id,'EMPRESA','OBRIGATORIA',1,'EMPRESA','Matriz final QSMS/Segurança Operacional 2026-10-06','CRM específico para cargo de direção requerido pelo RBAC 119.',cc.id,'DESIGNACAO','Matriz final 2026-10-06','MODELO',0,1,datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt JOIN compliance_condicoes cc ON cc.empresa_id=6 AND cc.ativo=1 AND cc.deleted_at IS NULL
 WHERE qt.empresa_id=6 AND qt.codigo='CRM_DIR_RBAC119' AND qt.ativo=1 AND qt.deleted_at IS NULL
   AND cc.codigo IN ('RBAC119_GESTOR_RESPONSAVEL','RBAC119_GERENTE_OPERACOES','RBAC119_GERENTE_MANUTENCAO','RBAC119_GERENTE_SEGURANCA_OPERACIONAL','RBAC119_PILOTO_CHEFE');

-- Final matrix says NR-20 is EAD; reverse the prior hybrid-only completion guard.
UPDATE lms_cursos
   SET gerar_qualificacao_ao_concluir=1,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND deleted_at IS NULL
   AND qualificacao_tipo_id=(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='NR-20' AND ativo=1 AND deleted_at IS NULL LIMIT 1);

-- Keep NR-35 fail-closed for presencial completion.
UPDATE lms_cursos
   SET gerar_qualificacao_ao_concluir=0,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND deleted_at IS NULL
   AND qualificacao_tipo_id=(SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='NR-35' AND ativo=1 AND deleted_at IS NULL LIMIT 1);

-- Sync LMS course display/load metadata for every linked course affected by this final matrix.
UPDATE lms_cursos AS c
   SET titulo=(SELECT qt.nome FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),
       carga_horaria_inicial_horas=(SELECT qt.carga_horaria_inicial FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),
       carga_horaria_recorrente_horas=(SELECT qt.carga_horaria_recorrente FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),
       carga_horaria_minutos=COALESCE((SELECT ROUND(60*COALESCE(qt.carga_horaria_recorrente,qt.carga_horaria_inicial,qt.carga_horaria)) FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),0),
       updated_at=datetime('now')
 WHERE c.empresa_id=6 AND c.ativo=1 AND c.deleted_at IS NULL
   AND c.qualificacao_tipo_id IN (
     SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
       AND UPPER(TRIM(codigo)) IN ('AUD_COMP','BRIGADA_INCENDIO','COD_ETICA','INTRO_SGQ','COL_SEL','MUDA','INTEGRA','NR-05','NR06','NR-11','NR-12','NR-20','NR-26','NR-35','PRIMEIROS_SOCORROS','REGRAS_OURO_PETROBRAS','CRM_CORP','CRM_DIR_RBAC119','JUST_CULTURE','FOD','LOSA','PPSP_SUP','PPSP','PRE','D2','STOP_WORK','FDM-MECANICO','BOWTIEXP')
   );
