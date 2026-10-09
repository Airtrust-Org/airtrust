-- 0537_training_catalog_source_backed_metadata.sql
-- Forward-only metadata correction for Costa do Sol (empresa_id=6).
-- Sources: PRG-MNT-002 PTM Rev.06 (14/03/2025), MNL-SSO-002 FDM Rev.09,
--          Costa do Sol LGPD completion evidence (2025) and controlled GTI procedures.
-- No employee assignment, completion, certificate, enrollment or cross-tenant write.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/training-catalog-source-backed-metadata-0537.md

UPDATE qualificacoes_tipos
   SET referencias=REPLACE(referencias,'PRG-MNT-002 — PTM Rev.07','PRG-MNT-002 — PTM Rev.06'),
       observacoes=CASE WHEN observacoes IS NULL THEN NULL ELSE REPLACE(observacoes,'PTM Rev.07','PTM Rev.06') END,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
   AND COALESCE(referencias,'') LIKE '%PRG-MNT-002 — PTM Rev.07%';

UPDATE qualificacoes_tipos
   SET descricao='Integrar o profissional da Gerência de Manutenção à organização, legislação, políticas, manuais, procedimentos, responsabilidades e sistemática de trabalho da Costa do Sol.',
       conteudo_programatico='• Organização da Empresa — organograma
• Políticas corporativas e do SGI
• Atribuições e responsabilidades em MGM, MOM, MCQ e PTM
• Procedimentos de manutenção em MGM, MOM, MCQ e PTM
• Programa de Treinamento de Manutenção
• Conhecimentos gerais de legislação aeronáutica
• Rede interna e acesso a publicações técnicas',
       referencias='PRG-MNT-002 — Programa de Treinamento de Manutenção Rev.06, item 20.3
MNL-MNT-001 — MGM Rev.10
MNL-MNT-004 — MOM Rev.08
MNL-MNT-005 — MCQ Rev.08
RBAC 145
IS 145-010',
       observacoes='O PTM Rev.06 define a Doutrinação como treinamento único: mínimo de 8h no inicial e 4h no recorrente, a cada 36 meses ou antes quando houver requisito contratual ou necessidade da empresa. MGM, MOM e MCQ integram o conteúdo desta Doutrinação.',
       carga_horaria=4,
       carga_horaria_inicial=8,
       carga_horaria_recorrente=4,
       validade=36,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='MNT_INTEGRACAO_DOUTRINACAO' AND ativo=1 AND deleted_at IS NULL;

UPDATE qualificacoes_tipos
   SET referencias='MNL-MNT-001 — MGM Rev.10
PRG-MNT-002 — Programa de Treinamento de Manutenção Rev.06, item 20.3
RBAC 135
RBAC 145
IS 119-010
IS 145-010',
       observacoes='O MGM integra o conteúdo do Treinamento de Doutrinação previsto no PTM Rev.06. O PTM não atribui carga horária autônoma ao MGM isoladamente; a carga de 8h inicial / 4h recorrente pertence à Doutrinação como conjunto. Mantido o ciclo interno de revisão do modelo sem inventar horas individuais.',
       carga_horaria=NULL,carga_horaria_inicial=NULL,carga_horaria_recorrente=NULL,updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='MNT_MGM' AND ativo=1 AND deleted_at IS NULL;

UPDATE qualificacoes_tipos
   SET referencias='MNL-MNT-004 — MOM Rev.08
PRG-MNT-002 — Programa de Treinamento de Manutenção Rev.06, item 20.3
RBAC 145
IS 145-010',
       observacoes='O MOM integra o conteúdo do Treinamento de Doutrinação previsto no PTM Rev.06. O PTM não atribui carga horária autônoma ao MOM isoladamente; a carga de 8h inicial / 4h recorrente pertence à Doutrinação como conjunto. Mantido o ciclo interno de revisão do modelo sem inventar horas individuais.',
       carga_horaria=NULL,carga_horaria_inicial=NULL,carga_horaria_recorrente=NULL,updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='MNT_MOM' AND ativo=1 AND deleted_at IS NULL;

UPDATE qualificacoes_tipos
   SET referencias='MNL-MNT-005 — MCQ Rev.08
PRG-MNT-002 — Programa de Treinamento de Manutenção Rev.06, item 20.3
RBAC 145
IS 145-010',
       observacoes='O MCQ integra o conteúdo do Treinamento de Doutrinação previsto no PTM Rev.06. O PTM não atribui carga horária autônoma ao MCQ isoladamente; a carga de 8h inicial / 4h recorrente pertence à Doutrinação como conjunto. Mantido o ciclo interno de revisão do modelo sem inventar horas individuais.',
       carga_horaria=NULL,carga_horaria_inicial=NULL,carga_horaria_recorrente=NULL,updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='MNT_MCQ' AND ativo=1 AND deleted_at IS NULL;

UPDATE qualificacoes_tipos
   SET referencias='Lei nº 13.709/2018 — Lei Geral de Proteção de Dados Pessoais
PRC-GTI-002 — Plano de Resposta a Contingência LGPD Rev.02
PRC-GTI-003 — Segurança da Informação para Terceiros - LGPD Rev.01
Evidência interna: Certificado 2025 CDS Curso de LGPD — 2 horas EAD',
       observacoes='Carga de 2h suportada por certificado interno Costa do Sol de 2025. Trata-se de carga adotada pela empresa; a LGPD não fixa carga horária mínima universal para treinamento de conscientização.',
       carga_horaria=2,carga_horaria_inicial=2,carga_horaria_recorrente=2,updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='LGPD' AND ativo=1 AND deleted_at IS NULL;

UPDATE qualificacoes_tipos
   SET descricao='Capacitar comandantes e copilotos nos fundamentos, funcionamento, confidencialidade, responsabilidades e fluxo do Programa de Flight Data Monitoring da Costa do Sol.',
       conteudo_programatico='• Histórico e requisitos do FDM
• Documentos de referência
• Objetivo e funcionamento do programa
• Ações e responsabilidades
• Comitê do FDM
• Abertura de voos
• Convocação de tripulantes
• Comitê de Casos Egrégios
• Protocolo do FDM e confidencialidade',
       referencias='MNL-SSO-002 — Manual de FDM Rev.09, Anexo 1 — Grupo de Voo
IS 119-008A
Protocolo PAADV vigente',
       observacoes='Carga de 1h conforme o Anexo 1 do Manual de FDM Rev.09 para o Grupo de Voo. O manual não estabelece recorrência temporal específica para esta trilha; validade permanece sem vencimento automático até regra controlada superveniente.',
       carga_horaria=1,carga_horaria_inicial=1,carga_horaria_recorrente=NULL,validade=NULL,updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='FDM-TRIPULACAO' AND ativo=1 AND deleted_at IS NULL;

UPDATE qualificacoes_tipos
   SET descricao='Capacitar integrantes do Comitê FDM, Gatekeepers e funções abrangidas no funcionamento, governança, confidencialidade, análise e tratamento do Programa de FDM da Costa do Sol.',
       conteudo_programatico='• Introdução e premissa principal
• Funcionamento do Programa
• Comitê do FDM
• Objetivo
• Parâmetros contratuais aplicáveis
• Abertura dos voos
• Convocação de tripulantes
• Comitê de Casos Egrégios
• Protocolo do FDM
• Papel do Gatekeeper e confidencialidade',
       referencias='MNL-SSO-002 — Manual de FDM Rev.09, Anexo 1 — Comitê do FDM
IS 119-008A
Protocolo PAADV vigente',
       observacoes='Carga de 2h conforme o Anexo 1 do Manual de FDM Rev.09 para o Comitê do FDM. O Gatekeeper integra a governança e a proteção de confidencialidade do programa. O manual não fixa recorrência temporal específica para esta trilha.',
       carga_horaria=2,carga_horaria_inicial=2,carga_horaria_recorrente=NULL,validade=NULL,updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='FDM-COMITE-GATEKEEPER' AND ativo=1 AND deleted_at IS NULL;

UPDATE qualificacoes_tipos
   SET descricao='Capacitar mecânicos e auxiliares de manutenção nos fundamentos do FDM, uso dos dados para manutenção, coleta e transferência de dados e interfaces com o Comitê FDM.',
       conteudo_programatico='• Terminologia e definições
• Introdução ao FDM
• Funcionamento do programa
• Utilização dos dados
• Coleta e transferência de dados
• Comitê do FDM
• Interfaces com manutenção e engenharia',
       referencias='MNL-SSO-002 — Manual de FDM Rev.09, Anexo 1 — Mecânicos
ITR-MNT-005 — Captura e Transferência dos Dados de FDM Rev.07
IS 119-008A',
       observacoes='Carga de 1h conforme o Anexo 1 do Manual de FDM Rev.09 para Mecânicos. Mantido o modelo EAD existente e sem vencimento automático.',
       carga_horaria=1,carga_horaria_inicial=1,carga_horaria_recorrente=NULL,validade=NULL,updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='FDM-MECANICO' AND ativo=1 AND deleted_at IS NULL;

UPDATE lms_cursos AS c
   SET titulo=(SELECT qt.nome FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),
       descricao=(SELECT qt.descricao FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),
       conteudo_programatico=(SELECT qt.conteudo_programatico FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),
       observacoes=(SELECT qt.observacoes FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),
       referencias=(SELECT qt.referencias FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),
       carga_horaria_inicial_horas=(SELECT qt.carga_horaria_inicial FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),
       carga_horaria_recorrente_horas=(SELECT qt.carga_horaria_recorrente FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),
       carga_horaria_minutos=COALESCE((SELECT ROUND(60*COALESCE(qt.carga_horaria,qt.carga_horaria_inicial,qt.carga_horaria_recorrente)) FROM qualificacoes_tipos qt WHERE qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id),c.carga_horaria_minutos),
       updated_at=datetime('now')
 WHERE c.empresa_id=6 AND c.ativo=1 AND c.deleted_at IS NULL
   AND c.qualificacao_tipo_id IN (
     SELECT id FROM qualificacoes_tipos
      WHERE empresa_id=6
        AND UPPER(TRIM(codigo)) IN ('LGPD','FDM-MECANICO','FDM-TRIPULACAO','FDM-COMITE-GATEKEEPER','MNT_INTEGRACAO_DOUTRINACAO','MNT_MGM','MNT_MOM','MNT_MCQ')
        AND ativo=1 AND deleted_at IS NULL
   );
