-- Schema V2 0545: compensation for QSMS/Safety Operational canonical PDF 2026-10-09.
-- Tenant Costa do Sol = 6; no employee designation, enrollment, course evidence or R2 writes.
-- Reviewed input: modelos_qualificacao_qsms_seguranca_operacional_com_cargos MODIFICADO(1).pdf.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/training-compliance-canonical-pdf-alignment-0545.md

-- NR-05: CIPA designation only; PDF does not define months, hours or EAD.
UPDATE qualificacoes_tipos
   SET categoria='Treinamento',categoria_id=NULL,validade=NULL,carga_horaria=NULL,
       carga_horaria_inicial=NULL,carga_horaria_recorrente=NULL,
       observacoes='Somente membros e representantes NR-05 formalmente designados. Periodicidade e carga nao estabelecidas no PDF canonico de 09/10/2026.',
       updated_at=datetime('now')
 WHERE empresa_id=6 AND codigo='NR-05' AND ativo=1 AND deleted_at IS NULL;

UPDATE treinamento_requisitos SET ativo=0,deleted_at=datetime('now'),updated_at=datetime('now')
 WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND escopo='EMPRESA' AND condicao_id IS NULL
 AND qualificacao_tipo_id IN (SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='NR-05' AND ativo=1 AND deleted_at IS NULL);

INSERT INTO treinamento_requisitos
 (empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,critico_operacional,origem,
 referencia_normativa,justificativa,condicao_id,fundamento_tipo,fundamento_documento,
 validade_fonte,auto_matricular_ead,ativo,created_at,updated_at)
SELECT 6,qt.id,'EMPRESA','OBRIGATORIA',1,'EMPRESA',
 'PDF canonico QSMS/Seguranca Operacional 2026-10-09',
 'Aplicavel somente a membros/representantes CIPA formalmente designados',
 cc.id,'DESIGNACAO','Tabela canonica QSMS e Seguranca Operacional 2026-10-09',
 'MODELO',0,1,datetime('now'),datetime('now')
 FROM qualificacoes_tipos qt JOIN compliance_condicoes cc
 ON cc.empresa_id=6 AND cc.codigo='MEMBRO_CIPA' AND cc.ativo=1 AND cc.deleted_at IS NULL
 WHERE qt.empresa_id=6 AND qt.codigo='NR-05' AND qt.ativo=1 AND qt.deleted_at IS NULL
 AND NOT EXISTS (
 SELECT 1 FROM treinamento_requisitos tr WHERE tr.empresa_id=6
 AND tr.qualificacao_tipo_id=qt.id AND tr.escopo='EMPRESA' AND tr.condicao_id=cc.id
 AND tr.obrigatoriedade='OBRIGATORIA' AND tr.ativo=1 AND tr.deleted_at IS NULL);

-- Regras de Ouro: PDF page 2, note 3 says model exists but no active Compliance requirement.
UPDATE treinamento_requisitos SET ativo=0,deleted_at=datetime('now'),updated_at=datetime('now')
 WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
 AND qualificacao_tipo_id IN (SELECT id FROM qualificacoes_tipos WHERE empresa_id=6
 AND codigo='REGRAS_OURO_PETROBRAS' AND ativo=1 AND deleted_at IS NULL);

-- FDM MECANICO: vitalicio and 1h; retain later FDM-MNT public label.
UPDATE qualificacoes_tipos SET validade=NULL,carga_horaria=1,carga_horaria_inicial=1,
 carga_horaria_recorrente=1,updated_at=datetime('now')
 WHERE empresa_id=6 AND codigo='FDM-MECANICO' AND ativo=1 AND deleted_at IS NULL;

-- Complement missing function rules only. Keep already existing rules untouched.
WITH target(codigo,cargo) AS (VALUES
 ('NR-11','Mecânico'),
 ('NR-11','Auxiliar de Manutenção'),
 ('NR-12','Mecânico'),
 ('NR-12','Auxiliar de Manutenção'),
 ('NR-20','Mecânico'),
 ('NR-20','Auxiliar de Manutenção'),
 ('NR-20','Auxiliar de Suprimentos'),
 ('NR-20','Supervisor de Suprimentos'),
 ('NR-26','Agente de Atendimento'),
 ('NR-26','Agente de Rampa'),
 ('NR-26','Auxiliar de Manutenção'),
 ('NR-26','Auxiliar de QSMS'),
 ('NR-26','Auxiliar de Suprimentos'),
 ('NR-26','Comandante'),
 ('NR-26','Coordenador de Engenharia'),
 ('NR-26','Copiloto'),
 ('NR-26','Gerente de Bases'),
 ('NR-26','Gerente de Manutenção'),
 ('NR-26','Gerente de Operações'),
 ('NR-26','Gerente de QSMS'),
 ('NR-26','Gerente de Segurança Operacional'),
 ('NR-26','Mecânico'),
 ('NR-26','Motorista'),
 ('NR-26','Supervisor de Engenharia'),
 ('NR-26','Supervisor de Suprimentos'),
 ('NR-26','Técnico de Segurança do Trabalho'),
 ('NR-35','Mecânico'),
 ('NR-35','Auxiliar de Manutenção'),
 ('FOD','Agente de Atendimento'),
 ('FOD','Agente de Rampa'),
 ('FOD','Analista de CTM'),
 ('FOD','Assistente de Operações'),
 ('FOD','Assistente de Segurança Operacional'),
 ('FOD','Auxiliar de CTM'),
 ('FOD','Auxiliar de Coordenação de Voo'),
 ('FOD','Auxiliar de Manutenção'),
 ('FOD','Auxiliar de QSMS'),
 ('FOD','Auxiliar de Suprimentos'),
 ('FOD','Comandante'),
 ('FOD','Coordenador de Engenharia'),
 ('FOD','Coordenador de Voo'),
 ('FOD','Copiloto'),
 ('FOD','Gerente de Bases'),
 ('FOD','Gerente de Operações'),
 ('FOD','Mecânico'),
 ('FOD','Motorista'),
 ('FOD','Supervisor de Suprimentos'),
 ('FOD','Técnico de Segurança do Trabalho'),
 ('PPSP','Agente de Atendimento'),
 ('PPSP','Agente de Rampa'),
 ('PPSP','Analista de CTM'),
 ('PPSP','Assistente de Operações'),
 ('PPSP','Assistente de Segurança Operacional'),
 ('PPSP','Auxiliar de CTM'),
 ('PPSP','Auxiliar de Coordenação de Voo'),
 ('PPSP','Auxiliar de Manutenção'),
 ('PPSP','Auxiliar de QSMS'),
 ('PPSP','Auxiliar de Suprimentos'),
 ('PPSP','Comandante'),
 ('PPSP','Coordenador de Engenharia'),
 ('PPSP','Coordenador de Voo'),
 ('PPSP','Copiloto'),
 ('PPSP','Gerente de Bases'),
 ('PPSP','Gerente de Operações'),
 ('PPSP','Mecânico'),
 ('PPSP','Motorista'),
 ('PPSP','Supervisor de Suprimentos'),
 ('PPSP','Técnico de Segurança do Trabalho')
)
INSERT INTO treinamento_requisitos
 (empresa_id,qualificacao_tipo_id,escopo,funcao_id,obrigatoriedade,critico_operacional,
 origem,referencia_normativa,justificativa,modalidade_requerida,fundamento_tipo,
 fundamento_documento,validade_fonte,auto_matricular_ead,ativo,created_at,updated_at)
SELECT 6,qt.id,'FUNCAO',f.id,'OBRIGATORIA',1,'EMPRESA',
 'PDF canonico QSMS/Seguranca Operacional 2026-10-09',
 'Funcao prevista expressamente na tabela canonica',
 CASE WHEN target.codigo='NR-35' THEN 'PRESENCIAL' ELSE NULL END,
 'MATRIZ','Tabela canonica QSMS e Seguranca Operacional 2026-10-09',
 'MODELO',0,1,datetime('now'),datetime('now')
FROM target
JOIN qualificacoes_tipos qt ON qt.empresa_id=6 AND qt.codigo=target.codigo AND qt.ativo=1 AND qt.deleted_at IS NULL
JOIN funcoes f ON f.empresa_id=6 AND f.nome=target.cargo AND f.ativo=1 AND f.deleted_at IS NULL
WHERE NOT EXISTS (
 SELECT 1 FROM treinamento_requisitos tr WHERE tr.empresa_id=6
 AND tr.qualificacao_tipo_id=qt.id AND tr.escopo='FUNCAO' AND tr.funcao_id=f.id
 AND tr.obrigatoriedade='OBRIGATORIA' AND tr.ativo=1 AND tr.deleted_at IS NULL);
