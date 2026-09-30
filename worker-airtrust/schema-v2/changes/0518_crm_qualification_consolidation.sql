-- 0518_crm_qualification_consolidation.sql
-- Consolidates Costa do Sol non-flight-crew CRM into one CRM Corporate qualification.
-- CRM — Tripulantes (D3) remains separate and unchanged.
-- source_reference: user decision 2026-09-30 after review of ANAC IS 00-010B, PCRM Rev.03, IOGP 690-2 item 46 and Petrobras RPEA/PQ-C 2026.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/crm-qualification-consolidation-0518.md

-- Canonical surviving non-tripulante model.
UPDATE qualificacoes_tipos
   SET nome = 'CRM Corporate',
       descricao = 'Corporate Resource Management para colaboradores não tripulantes, incluindo Manutenção.',
       observacoes = 'CRM Corporate aplicável a colaboradores não tripulantes, incluindo Manutenção; ciclo de 24 meses. CRM de Tripulantes (D3) permanece separado.',
       categoria = 'Teórico',
       carga_horaria = 16,
       carga_horaria_inicial = 16,
       carga_horaria_recorrente = 16,
       conteudo_programatico = 'Evolução do CRM e modelos de fatores humanos; normas e diretrizes; Reason, SHELL e outros modelos aplicáveis; cultura organizacional e de segurança; erro humano; desempenho humano e limitações; comunicação; formação e manutenção de equipe; liderança e followership; consciência situacional; monitoramento, intervenção e tomada de decisão; TEM; automação e interface homem-tecnologia; gerenciamento da carga de trabalho; pressão, estresse, fadiga e vigilância; ambiente; procedimentos, informações, ferramentas e práticas; prevenção e gerenciamento de ameaças, erros e estados indesejados; interfaces entre Operações, Manutenção e demais áreas; Programa de Fatores Humanos da Costa do Sol; estudos de caso e aplicação ao ambiente de trabalho.',
       validade = 24,
       ativo = 1,
       updated_at = datetime('now')
 WHERE empresa_id = 6
   AND codigo = 'CRM_CORP'
   AND deleted_at IS NULL;

-- A company-wide qualification must be treated as multi-sector by the RBAC resolver,
-- so qualification history/certificates continue resolving through each employee's own sector domain.
INSERT INTO qualificacoes_tipos_setores(tipo_id,setor_id,empresa_id,created_at,updated_at,deleted_at)
SELECT qt.id, s.id, 6, datetime('now'), datetime('now'), NULL
  FROM qualificacoes_tipos qt
  JOIN setores s ON s.empresa_id=6 AND s.ativo=1 AND s.deleted_at IS NULL
 WHERE qt.empresa_id=6
   AND qt.codigo='CRM_CORP'
   AND qt.deleted_at IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM qualificacoes_tipos_setores qts
      WHERE qts.empresa_id=6 AND qts.tipo_id=qt.id AND qts.setor_id=s.id AND qts.deleted_at IS NULL
   );

-- Consolidate duplicate history before changing the qualification identity.
-- Production contains legacy maintenance CRM rows plus later CRM_CORP rows for the same
-- employee/completion date. Keep the evidence-rich/original row active, soft-delete the
-- redundant row(s), and preserve historical workload instead of retroactively rewriting it.
CREATE TABLE _0518_crm_history_merge_map (
  duplicate_id INTEGER PRIMARY KEY,
  survivor_id INTEGER NOT NULL
);

WITH ranked AS (
  SELECT
    qh.id,
    FIRST_VALUE(qh.id) OVER (
      PARTITION BY qh.funcionario_id, qh.data_conclusao
      ORDER BY
        CASE WHEN qh.certificado_arquivo_id IS NOT NULL
                   OR NULLIF(TRIM(COALESCE(qh.numero_certificado,'')),'') IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN UPPER(TRIM(COALESCE(qh.status,''))) IN ('RENOVADA','RENOVADO')
                   OR COALESCE(qh.renovada,0)=1 THEN 1 ELSE 0 END,
        CASE WHEN NULLIF(TRIM(COALESCE(qh.qualificacao_codigo,'')),'') IS NOT NULL THEN 0 ELSE 1 END,
        COALESCE(qh.created_at,'9999-12-31 23:59:59'),
        qh.id
    ) AS survivor_id,
    COUNT(*) OVER (PARTITION BY qh.funcionario_id, qh.data_conclusao) AS group_size
  FROM qualificacoes_historico qh
 WHERE qh.empresa_id=6
   AND qh.deleted_at IS NULL
   AND qh.data_conclusao IS NOT NULL
   AND qh.qualificacao_id IN (
     SELECT id FROM qualificacoes_tipos
      WHERE empresa_id=6 AND codigo IN ('CRM_CORP','MNT_FATORES_HUMANOS_CRM')
   )
)
INSERT INTO _0518_crm_history_merge_map(duplicate_id,survivor_id)
SELECT id,survivor_id FROM ranked WHERE group_size>1 AND id<>survivor_id;

-- Preserve renewal lineage when a predecessor is one of the redundant rows.
UPDATE qualificacoes_historico
   SET renovacao_de = (
         SELECT m.survivor_id FROM _0518_crm_history_merge_map m
          WHERE m.duplicate_id=qualificacoes_historico.renovacao_de
       ),
       updated_at = datetime('now')
 WHERE empresa_id=6
   AND renovacao_de IN (SELECT duplicate_id FROM _0518_crm_history_merge_map);

UPDATE qualificacoes_historico
   SET renovacao_de=NULL, updated_at=datetime('now')
 WHERE empresa_id=6 AND renovacao_de=id;

-- Governance uses soft-delete: duplicate evidence remains auditable but leaves the active history.
UPDATE qualificacoes_historico
   SET deleted_at=COALESCE(deleted_at,datetime('now')),
       updated_at=datetime('now')
 WHERE empresa_id=6
   AND id IN (SELECT duplicate_id FROM _0518_crm_history_merge_map);

-- Preserve every surviving historical completion, certificate link, date and recorded workload.
-- Only the qualification identity is consolidated into CRM Corporate. Historical hours are
-- intentionally not normalized; reissuance, if ever required, is a separate evidence-based action.
UPDATE qualificacoes_historico
   SET qualificacao_id = (
         SELECT id FROM qualificacoes_tipos
          WHERE empresa_id=6 AND codigo='CRM_CORP' AND deleted_at IS NULL LIMIT 1
       ),
       qualificacao_codigo = 'CRM_CORP',
       updated_at = datetime('now')
 WHERE empresa_id=6
   AND deleted_at IS NULL
   AND qualificacao_id = (
         SELECT id FROM qualificacoes_tipos
          WHERE empresa_id=6 AND codigo='MNT_FATORES_HUMANOS_CRM' AND deleted_at IS NULL LIMIT 1
       );

DROP TABLE _0518_crm_history_merge_map;

-- Move any still-open/planned maintenance CRM event to the surviving model.
UPDATE treinamentos_planejados
   SET qualificacao_tipo_id = (
         SELECT id FROM qualificacoes_tipos
          WHERE empresa_id=6 AND codigo='CRM_CORP' AND deleted_at IS NULL LIMIT 1
       ),
       titulo = 'CRM Corporate',
       updated_at = datetime('now')
 WHERE empresa_id=6
   AND qualificacao_tipo_id = (
         SELECT id FROM qualificacoes_tipos
          WHERE empresa_id=6 AND codigo='MNT_FATORES_HUMANOS_CRM' AND deleted_at IS NULL LIMIT 1
       );

-- The surviving CRM_CORP already has the company-wide mandatory Compliance rule.
-- Explicitly exclude the Tripulação sector: flight crew remains governed by D3, not by CRM Corporate.
INSERT INTO treinamento_requisitos (
  empresa_id,qualificacao_tipo_id,escopo,setor_id,obrigatoriedade,critico_operacional,
  origem,observacoes,auto_matricular_ead,ativo,created_at,updated_at
)
SELECT 6, qt.id, 'SETOR', s.id, 'NAO_APLICA', 0,
       'EMPRESA', 'CRM Corporate não se aplica ao setor Tripulação; tripulantes seguem a qualificação D3.',
       0, 1, datetime('now'), datetime('now')
  FROM qualificacoes_tipos qt
  JOIN setores s ON s.empresa_id=6 AND s.codigo='TRI' AND s.ativo=1 AND s.deleted_at IS NULL
 WHERE qt.empresa_id=6 AND qt.codigo='CRM_CORP' AND qt.deleted_at IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM treinamento_requisitos tr
      WHERE tr.empresa_id=6 AND tr.qualificacao_tipo_id=qt.id
        AND tr.escopo='SETOR' AND tr.setor_id=s.id AND tr.ativo=1 AND tr.deleted_at IS NULL
   );

-- Retire redundant maintenance rules and the erroneous LOS rules instead of duplicating applicability.
UPDATE treinamento_requisitos
   SET ativo=0,
       deleted_at=COALESCE(deleted_at,datetime('now')),
       updated_at=datetime('now')
 WHERE empresa_id=6
   AND deleted_at IS NULL
   AND qualificacao_tipo_id IN (
     SELECT id FROM qualificacoes_tipos
      WHERE empresa_id=6
        AND codigo IN ('MNT_FATORES_HUMANOS_CRM','CRM-LOS-T','CRM-LOS-P')
        AND deleted_at IS NULL
   );

-- Retire legacy sector links for models that will no longer be selectable.
UPDATE qualificacoes_tipos_setores
   SET deleted_at=COALESCE(deleted_at,datetime('now')),
       updated_at=datetime('now')
 WHERE empresa_id=6
   AND deleted_at IS NULL
   AND tipo_id IN (
     SELECT id FROM qualificacoes_tipos
      WHERE empresa_id=6
        AND codigo IN ('MNT_FATORES_HUMANOS_CRM','CRM-LOS-T','CRM-LOS-P')
        AND deleted_at IS NULL
   );

-- Soft-delete the two unused LOS models and the maintenance duplicate.
UPDATE qualificacoes_tipos
   SET ativo=0,
       deleted_at=COALESCE(deleted_at,datetime('now')),
       updated_at=datetime('now')
 WHERE empresa_id=6
   AND codigo IN ('MNT_FATORES_HUMANOS_CRM','CRM-LOS-T','CRM-LOS-P')
   AND deleted_at IS NULL;
