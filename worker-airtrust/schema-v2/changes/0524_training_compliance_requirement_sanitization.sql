-- 0524_training_compliance_requirement_sanitization.sql
-- Removes redundant fallback exclusions and reconciles reviewed Training Compliance audiences.
-- source_reference: audited AirTrust matrix 2026-09-28 + reviewed Costa do Sol decisions 2026-09-30.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/training-compliance-requirement-sanitization-0524.md

-- Absence of a matching applicability rule already means "not required". Generic company-wide
-- NAO_APLICA rows add noise and no effective semantics, so retire only the unconditioned fallback form.
UPDATE treinamento_requisitos
   SET ativo=0,
       deleted_at=COALESCE(deleted_at,datetime('now')),
       updated_at=datetime('now')
 WHERE empresa_id=6
   AND ativo=1 AND deleted_at IS NULL
   AND escopo='EMPRESA'
   AND obrigatoriedade='NAO_APLICA'
   AND setor_id IS NULL
   AND funcao_id IS NULL
   AND funcionario_id IS NULL
   AND condicao_id IS NULL
   AND NULLIF(TRIM(COALESCE(aeronave_modelo,'')),'') IS NULL;

-- Requirement rules cannot remain active when their qualification model has been retired.
UPDATE treinamento_requisitos
   SET ativo=0,
       deleted_at=COALESCE(deleted_at,datetime('now')),
       updated_at=datetime('now')
 WHERE empresa_id=6
   AND ativo=1 AND deleted_at IS NULL
   AND qualificacao_tipo_id IN (
     SELECT id
       FROM qualificacoes_tipos
      WHERE empresa_id=6
        AND (COALESCE(ativo,1)<>1 OR deleted_at IS NOT NULL)
   );

-- FDM-EAD: reviewed as broad awareness for the audited population. Keep condition-based
-- FDM-team rules, but replace stale organizational variants with one rule per reviewed function.
UPDATE treinamento_requisitos
   SET ativo=0, deleted_at=COALESCE(deleted_at,datetime('now')), updated_at=datetime('now')
 WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
   AND qualificacao_tipo_id=(
     SELECT id FROM qualificacoes_tipos
      WHERE empresa_id=6 AND codigo='FDM-EAD' AND ativo=1 AND deleted_at IS NULL LIMIT 1
   )
   AND condicao_id IS NULL
   AND escopo IN ('EMPRESA','SETOR','FUNCAO','SETOR_FUNCAO');

INSERT OR IGNORE INTO treinamento_requisitos (
  empresa_id,qualificacao_tipo_id,escopo,funcao_id,obrigatoriedade,critico_operacional,
  origem,referencia_normativa,justificativa,fundamento_tipo,fundamento_documento,
  validade_fonte,auto_matricular_ead,ativo,observacoes,created_at,updated_at
)
SELECT 6, qt.id, 'FUNCAO', f.id, 'OBRIGATORIA', 0,
       'SGSO', 'Programa FDM / SGSO Costa do Sol',
       'FDM-EAD é conhecimento e familiarização do programa para a população auditada.',
       'PROGRAMA_APROVADO', 'Matriz auditada 2026-09-28; Programa FDM / SGSO Costa do Sol',
       'MODELO', 0, 1, 'Sanitização governada 0524; população revisada em 2026-09-30',
       datetime('now'), datetime('now')
  FROM qualificacoes_tipos qt
  JOIN funcoes f
    ON f.empresa_id=6 AND f.ativo=1 AND f.deleted_at IS NULL
   AND f.nome IN (
     'Comandante','Copiloto','Mecânico','Auxiliar de Manutenção','Coordenador de Engenharia',
     'Analista de CTM','Analista de CTM I','Auxiliar de CTM','Auxiliar de CTM I',
     'Gerente de Operações','Assistente de Segurança Operacional','Auxiliar de QSMS',
     'Técnico de Segurança do Trabalho'
   )
 WHERE qt.empresa_id=6 AND qt.codigo='FDM-EAD' AND qt.ativo=1 AND qt.deleted_at IS NULL;

-- Current maintenance population works both fleets. Retire prior organizational variants for
-- the two product-level requirements, then keep exactly Mechanic + Maintenance Assistant.
UPDATE treinamento_requisitos
   SET ativo=0, deleted_at=COALESCE(deleted_at,datetime('now')), updated_at=datetime('now')
 WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
   AND qualificacao_tipo_id IN (
     SELECT id FROM qualificacoes_tipos
      WHERE empresa_id=6 AND codigo IN ('MNT_AW139','MNT_S76AC')
        AND ativo=1 AND deleted_at IS NULL
   )
   AND condicao_id IS NULL
   AND escopo IN ('EMPRESA','SETOR','FUNCAO','SETOR_FUNCAO');

INSERT OR IGNORE INTO treinamento_requisitos (
  empresa_id,qualificacao_tipo_id,escopo,funcao_id,obrigatoriedade,critico_operacional,
  origem,referencia_normativa,justificativa,fundamento_tipo,fundamento_documento,
  validade_fonte,auto_matricular_ead,ativo,observacoes,created_at,updated_at
)
SELECT 6, qt.id, 'FUNCAO', f.id, 'OBRIGATORIA', 0,
       'EMPRESA', 'Matriz auditada 2026-09-28; FORM-MNT-009 / PTM vigente',
       'Na realidade operacional atual, Mecânicos e Auxiliares de Manutenção atuam nas frotas AW139 e S-76.',
       'POLITICA_INTERNA', 'Matriz auditada 2026-09-28; FORM-MNT-009 / PTM vigente',
       'MODELO', 0, 1, 'Sanitização governada 0524; escopo atual das duas frotas',
       datetime('now'), datetime('now')
  FROM qualificacoes_tipos qt
  JOIN funcoes f
    ON f.empresa_id=6 AND f.ativo=1 AND f.deleted_at IS NULL
   AND f.nome IN ('Mecânico','Auxiliar de Manutenção')
 WHERE qt.empresa_id=6
   AND qt.codigo IN ('MNT_AW139','MNT_S76AC')
   AND qt.ativo=1 AND qt.deleted_at IS NULL;

-- Corporate baseline AVSEC awareness is separate from activity-specific AVSEC certification profiles.
INSERT INTO qualificacoes_tipos (
  codigo,nome,descricao,categoria,observacoes,ativo,is_check,empresa_id,
  categoria_id,classe_requisito,area_id,created_at,updated_at
)
SELECT 'AVSEC_CONSC', 'AVSEC — Conscientização Corporativa',
       'Conscientização AVSEC corporativa para colaboradores no ambiente aeroportuário; certificações AVSEC específicas permanecem adicionais conforme atividade.',
       'Teórico',
       'Política corporativa Costa do Sol definida em 2026-09-30; não substitui perfis AVSEC específicos.',
       1,0,6,
       (SELECT id FROM qualificacoes_categorias WHERE empresa_id=6 AND codigo='TERICO' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
       'TREINAMENTO',
       (SELECT id FROM qualificacoes_areas WHERE empresa_id=6 AND codigo='OPERACOES' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
       datetime('now'),datetime('now')
 WHERE NOT EXISTS (
   SELECT 1 FROM qualificacoes_tipos
    WHERE empresa_id=6 AND codigo='AVSEC_CONSC' AND deleted_at IS NULL
 );

UPDATE qualificacoes_tipos
   SET nome='AVSEC — Conscientização Corporativa',
       descricao='Conscientização AVSEC corporativa para colaboradores no ambiente aeroportuário; certificações AVSEC específicas permanecem adicionais conforme atividade.',
       observacoes='Política corporativa Costa do Sol definida em 2026-09-30; não substitui perfis AVSEC específicos.',
       ativo=1,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND codigo='AVSEC_CONSC' AND deleted_at IS NULL;

INSERT OR IGNORE INTO treinamento_requisitos (
  empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,critico_operacional,
  origem,referencia_normativa,justificativa,fundamento_tipo,fundamento_documento,
  validade_fonte,auto_matricular_ead,ativo,observacoes,created_at,updated_at
)
SELECT 6, qt.id, 'EMPRESA', 'OBRIGATORIA', 0,
       'EMPRESA', 'Política interna Costa do Sol; requisitos AVSEC aplicáveis ao ambiente aeroportuário',
       'Conscientização AVSEC corporativa definida para todos os colaboradores; perfis/certificações específicas são requisitos adicionais.',
       'POLITICA_INTERNA', 'Decisão corporativa Costa do Sol 2026-09-30; matriz de Compliance auditada',
       'MODELO',0,1,'Sanitização governada 0524; sem auto-matrícula',datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt
 WHERE qt.empresa_id=6 AND qt.codigo='AVSEC_CONSC' AND qt.ativo=1 AND qt.deleted_at IS NULL;

-- Complete rationale on the specific flight-crew exclusion from company-wide CRM Corporate.
UPDATE treinamento_requisitos
   SET origem='EMPRESA',
       referencia_normativa='IS 00-010B; programa CRM aprovado Costa do Sol',
       justificativa='CRM Corporate não se aplica à Tripulação porque tripulantes seguem o CRM específico D3.',
       fundamento_tipo='PROGRAMA_APROVADO',
       fundamento_documento='PTO / PCRM Costa do Sol; IS 00-010B',
       validade_fonte='MODELO',
       observacoes='Override específico auditável; preserva D3 para a Tripulação.',
       auto_matricular_ead=0,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
   AND escopo='SETOR' AND obrigatoriedade='NAO_APLICA'
   AND qualificacao_tipo_id=(
     SELECT id FROM qualificacoes_tipos
      WHERE empresa_id=6 AND codigo='CRM_CORP' AND ativo=1 AND deleted_at IS NULL LIMIT 1
   )
   AND setor_id=(
     SELECT id FROM setores
      WHERE empresa_id=6 AND codigo='TRI' AND ativo=1 AND deleted_at IS NULL LIMIT 1
   );

-- Complete rationale on the flight-crew CRM requirement without changing its audience.
UPDATE treinamento_requisitos
   SET origem='PTO',
       referencia_normativa='IS 00-010B; programa CRM aprovado Costa do Sol',
       justificativa='CRM específico aplicável à Tripulação conforme o programa aprovado.',
       fundamento_tipo='PROGRAMA_APROVADO',
       fundamento_documento='PTO / PCRM Costa do Sol; IS 00-010B',
       validade_fonte='MODELO',
       auto_matricular_ead=0,
       updated_at=datetime('now')
 WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
   AND obrigatoriedade='OBRIGATORIA'
   AND qualificacao_tipo_id=(
     SELECT id FROM qualificacoes_tipos
      WHERE empresa_id=6 AND codigo='D3' AND ativo=1 AND deleted_at IS NULL LIMIT 1
   );