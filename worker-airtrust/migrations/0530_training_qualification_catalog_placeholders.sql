-- 0530_training_qualification_catalog_placeholders.sql
-- Creates qualification models for planned AirTrust EAD packages without creating courses,
-- compliance obligations, enrollments or qualification history.
-- source_reference: AIRTRUST_EAD_BACKLOG_V4_20261003; Training Management decision 2026-10-04.
-- operational_decision: create the canonical qualifications now; SCORM packages will be produced later.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/training-qualification-catalog-placeholders-0530.md

-- Guard: tenant and canonical EAD category must already exist.
CREATE TEMP TABLE qualification_catalog_0530_guard (
  ok INTEGER NOT NULL CHECK (ok = 1)
);

INSERT INTO qualification_catalog_0530_guard(ok)
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM empresas WHERE id = 6)
   AND (
     SELECT COUNT(*)
       FROM qualificacoes_categorias
      WHERE empresa_id = 6
        AND ativo = 1
        AND deleted_at IS NULL
        AND UPPER(TRIM(codigo)) = 'EAD'
   ) = 1
  THEN 1 ELSE 0
END;

DROP TABLE qualification_catalog_0530_guard;

-- Five future-EAD qualification models. No validity is invented at this stage.
-- No treinamento_requisitos, lms_cursos, lms_matriculas or historico rows are created.
INSERT INTO qualificacoes_tipos (
  empresa_id,codigo,nome,descricao,categoria,validade,carga_horaria,
  area_id,ativo,is_check,observacoes,created_at,updated_at,categoria_id
)
SELECT
  6,'REGRAS_OURO_PETROBRAS','Regras de Ouro — Petrobras',
  'Qualificação corporativa destinada ao futuro pacote EAD das Regras de Ouro Petrobras.',
  'EAD',NULL,NULL,
  (SELECT id FROM qualificacoes_areas WHERE empresa_id=6 AND UPPER(codigo)='QSMS' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
  1,0,
  'Modelo criado em 2026-10-04; pacote LMS será vinculado posteriormente. Nenhuma obrigação de Compliance criada por esta mudança.',
  datetime('now'),datetime('now'),
  (SELECT id FROM qualificacoes_categorias WHERE empresa_id=6 AND UPPER(codigo)='EAD' AND ativo=1 AND deleted_at IS NULL LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM qualificacoes_tipos
   WHERE empresa_id=6 AND UPPER(codigo)='REGRAS_OURO_PETROBRAS' AND deleted_at IS NULL
);

INSERT INTO qualificacoes_tipos (
  empresa_id,codigo,nome,descricao,categoria,validade,carga_horaria,
  area_id,ativo,is_check,observacoes,created_at,updated_at,categoria_id
)
SELECT
  6,'JUST_CULTURE','Cultura Justa',
  'Qualificação corporativa baseada no PRC-SSO-008; pacote EAD será vinculado posteriormente.',
  'EAD',NULL,NULL,
  (SELECT id FROM qualificacoes_areas WHERE empresa_id=6 AND UPPER(codigo)='SEGURANCA_OPERACIONAL' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
  1,0,
  'Modelo criado em 2026-10-04; pacote LMS será vinculado posteriormente. Nenhuma obrigação de Compliance criada por esta mudança.',
  datetime('now'),datetime('now'),
  (SELECT id FROM qualificacoes_categorias WHERE empresa_id=6 AND UPPER(codigo)='EAD' AND ativo=1 AND deleted_at IS NULL LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM qualificacoes_tipos
   WHERE empresa_id=6 AND UPPER(codigo)='JUST_CULTURE' AND deleted_at IS NULL
);

INSERT INTO qualificacoes_tipos (
  empresa_id,codigo,nome,descricao,categoria,validade,carga_horaria,
  area_id,ativo,is_check,observacoes,created_at,updated_at,categoria_id
)
SELECT
  6,'STOP_WORK','Stop Work',
  'Qualificação corporativa baseada no PRC-SSO-006; pacote EAD será vinculado posteriormente.',
  'EAD',NULL,NULL,
  (SELECT id FROM qualificacoes_areas WHERE empresa_id=6 AND UPPER(codigo)='SEGURANCA_OPERACIONAL' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
  1,0,
  'Modelo criado em 2026-10-04; pacote LMS será vinculado posteriormente. Nenhuma obrigação de Compliance criada por esta mudança.',
  datetime('now'),datetime('now'),
  (SELECT id FROM qualificacoes_categorias WHERE empresa_id=6 AND UPPER(codigo)='EAD' AND ativo=1 AND deleted_at IS NULL LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM qualificacoes_tipos
   WHERE empresa_id=6 AND UPPER(codigo)='STOP_WORK' AND deleted_at IS NULL
);

INSERT INTO qualificacoes_tipos (
  empresa_id,codigo,nome,descricao,categoria,validade,carga_horaria,
  area_id,ativo,is_check,observacoes,created_at,updated_at,categoria_id
)
SELECT
  6,'ETICA_CONDUTA','Código de Ética e Conduta',
  'Qualificação corporativa para o futuro pacote EAD do Código de Ética e Conduta.',
  'EAD',NULL,NULL,NULL,1,0,
  'Modelo criado em 2026-10-04; pacote LMS será vinculado posteriormente. Nenhuma obrigação de Compliance criada por esta mudança.',
  datetime('now'),datetime('now'),
  (SELECT id FROM qualificacoes_categorias WHERE empresa_id=6 AND UPPER(codigo)='EAD' AND ativo=1 AND deleted_at IS NULL LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM qualificacoes_tipos
   WHERE empresa_id=6 AND UPPER(codigo)='ETICA_CONDUTA' AND deleted_at IS NULL
);

INSERT INTO qualificacoes_tipos (
  empresa_id,codigo,nome,descricao,categoria,validade,carga_horaria,
  area_id,ativo,is_check,observacoes,created_at,updated_at,categoria_id
)
SELECT
  6,'LGPD_SEG_INFO','LGPD / Segurança da Informação',
  'Qualificação corporativa para o futuro pacote EAD de LGPD e Segurança da Informação.',
  'EAD',NULL,NULL,NULL,1,0,
  'Modelo criado em 2026-10-04; pacote LMS será vinculado posteriormente. Nenhuma obrigação de Compliance criada por esta mudança.',
  datetime('now'),datetime('now'),
  (SELECT id FROM qualificacoes_categorias WHERE empresa_id=6 AND UPPER(codigo)='EAD' AND ativo=1 AND deleted_at IS NULL LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM qualificacoes_tipos
   WHERE empresa_id=6 AND UPPER(codigo)='LGPD_SEG_INFO' AND deleted_at IS NULL
);
