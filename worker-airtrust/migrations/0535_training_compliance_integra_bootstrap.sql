-- 0535_training_compliance_integra_bootstrap.sql
-- Forward-only repair for the 0534 staging postcondition: tenant 6 has no INTEGRA model.
-- The 0534 final matrix requires Integração Corporativa company-wide as EAD, 24 months, 2 hours.
-- Preserve any existing identity/history/course if a target environment already has INTEGRA.
-- Do not create LMS content, enrollments, qualification history or employee data.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/training-compliance-integra-bootstrap-0535.md

-- Normalize an existing canonical identity if present.
UPDATE qualificacoes_tipos
   SET nome='Integração Corporativa',
       descricao='Apresentar ao novo empregado a estrutura, valores, responsabilidades, canais, documentos e requisitos básicos de segurança, qualidade, emergência e qualificação da Costa do Sol.',
       conteudo_programatico='• Onboarding corporativo
• estrutura e responsabilidades
• como localizar informação vigente
• canais corporativos
• comportamento e comunicação
• resposta mínima a emergências
• visão do sistema de qualificações
• encaminhamento para treinamentos específicos sem duplicar seus conteúdos',
       referencias='PRG-SGI-005 Rev.05
MNL-SGI-001 Rev.09
NR-01
Políticas e procedimentos corporativos vigentes',
       observacoes='Treinamento de integração corporativa conforme matriz final de 06/10/2026.',
       categoria_id=(SELECT id FROM qualificacoes_categorias WHERE empresa_id=6 AND UPPER(TRIM(codigo))='EAD' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
       categoria='EAD',
       validade=24,
       carga_horaria=2,
       carga_horaria_inicial=2,
       carga_horaria_recorrente=2,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND UPPER(TRIM(codigo))='INTEGRA' AND ativo=1 AND deleted_at IS NULL;

-- Staging proved INTEGRA can be entirely absent. Create only the missing model,
-- bound to the canonical tenant EAD category required by the 0457 contract.
INSERT INTO qualificacoes_tipos
  (empresa_id,codigo,nome,descricao,conteudo_programatico,referencias,observacoes,
   categoria,categoria_id,validade,carga_horaria,carga_horaria_inicial,carga_horaria_recorrente,
   ativo,is_check,created_at,updated_at)
SELECT 6,'INTEGRA','Integração Corporativa',
       'Apresentar ao novo empregado a estrutura, valores, responsabilidades, canais, documentos e requisitos básicos de segurança, qualidade, emergência e qualificação da Costa do Sol.',
       '• Onboarding corporativo
• estrutura e responsabilidades
• como localizar informação vigente
• canais corporativos
• comportamento e comunicação
• resposta mínima a emergências
• visão do sistema de qualificações
• encaminhamento para treinamentos específicos sem duplicar seus conteúdos',
       'PRG-SGI-005 Rev.05
MNL-SGI-001 Rev.09
NR-01
Políticas e procedimentos corporativos vigentes',
       'Treinamento de integração corporativa conforme matriz final de 06/10/2026.',
       'EAD',
       (SELECT id FROM qualificacoes_categorias WHERE empresa_id=6 AND UPPER(TRIM(codigo))='EAD' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
       24,2,2,2,1,0,datetime('now'),datetime('now')
 WHERE NOT EXISTS (
   SELECT 1 FROM qualificacoes_tipos
    WHERE empresa_id=6 AND UPPER(TRIM(codigo))='INTEGRA' AND ativo=1 AND deleted_at IS NULL
 );

-- 0534 could not create this rule when the qualification model was absent.
INSERT INTO treinamento_requisitos
  (empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,critico_operacional,origem,
   referencia_normativa,justificativa,fundamento_tipo,fundamento_documento,
   validade_fonte,auto_matricular_ead,ativo,created_at,updated_at)
SELECT 6,qt.id,'EMPRESA','OBRIGATORIA',0,'EMPRESA',
       'Matriz final QSMS/Segurança Operacional 2026-10-06',
       'Integração Corporativa obrigatória para todos os funcionários conforme matriz final canônica.',
       'MATRIZ','Matriz final 2026-10-06','MODELO',0,1,datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt
 WHERE qt.empresa_id=6 AND UPPER(TRIM(qt.codigo))='INTEGRA' AND qt.ativo=1 AND qt.deleted_at IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM treinamento_requisitos tr
      WHERE tr.empresa_id=6 AND tr.qualificacao_tipo_id=qt.id
        AND tr.escopo='EMPRESA' AND tr.condicao_id IS NULL
        AND tr.ativo=1 AND tr.deleted_at IS NULL
   );
