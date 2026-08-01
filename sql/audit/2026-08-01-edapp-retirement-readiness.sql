-- AirTrust — EdApp retirement readiness audit
-- Snapshot source: origin/main 7f5c6b82e95a0beee9025c5a2d9134e02fb14a89
-- Purpose: count and validate historical dependencies before any future removal.
-- Safety: READ ONLY. This file contains only SELECT/PRAGMA statements.
-- Execution target: reviewed local/staging snapshot first. Production execution requires the
-- repository's normal read-only operational authorization and must never be converted to DML.
-- Privacy: returns aggregate counts only; no names, CPF, e-mail, payloads or certificate numbers.

SELECT
  'audit_metadata' AS section,
  'edapp_retirement_readiness' AS audit_name,
  datetime('now') AS observed_at,
  sqlite_version() AS sqlite_version;

-- -----------------------------------------------------------------------------
-- 1. Canonical schema inventory. All six tables must exist before interpreting
--    the remaining results.
-- -----------------------------------------------------------------------------
SELECT
  'schema_tables' AS section,
  name AS object_name,
  type AS object_type
FROM sqlite_master
WHERE type IN ('table', 'view')
  AND name IN (
    'empresas',
    'funcionarios',
    'lms_cursos',
    'lms_historico_importado',
    'integracoes_edapp_usuarios',
    'integracoes_edapp_cursos',
    'integracoes_edapp_eventos',
    'qualificacoes_historico',
    'documentos'
  )
ORDER BY object_type, object_name;

SELECT
  'schema_lms_history_columns' AS section,
  name AS column_name,
  type AS declared_type,
  "notnull" AS is_not_null,
  pk AS primary_key_position
FROM pragma_table_info('lms_historico_importado')
ORDER BY cid;

SELECT
  'schema_edapp_events_columns' AS section,
  name AS column_name,
  type AS declared_type,
  "notnull" AS is_not_null,
  pk AS primary_key_position
FROM pragma_table_info('integracoes_edapp_eventos')
ORDER BY cid;

-- -----------------------------------------------------------------------------
-- 2. Historical inventory by tenant. Soft-deleted rows are reported separately
--    because retention decisions must include them explicitly.
-- -----------------------------------------------------------------------------
SELECT
  'history_by_tenant' AS section,
  h.empresa_id,
  COUNT(*) AS total_rows,
  SUM(CASE WHEN h.deleted_at IS NULL THEN 1 ELSE 0 END) AS active_history_rows,
  SUM(CASE WHEN h.deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS soft_deleted_history_rows,
  COUNT(DISTINCT h.funcionario_id) AS distinct_internal_employees,
  COUNT(DISTINCT h.curso_id) AS distinct_internal_courses,
  COUNT(DISTINCT h.edapp_user_id) AS distinct_external_users,
  COUNT(DISTINCT h.edapp_course_id) AS distinct_external_courses,
  MIN(h.data_conclusao) AS earliest_completion,
  MAX(h.data_conclusao) AS latest_completion
FROM lms_historico_importado h
WHERE h.fonte = 'EDAPP'
GROUP BY h.empresa_id
ORDER BY h.empresa_id;

SELECT
  'history_status_by_tenant' AS section,
  h.empresa_id,
  h.status,
  COUNT(*) AS total_rows
FROM lms_historico_importado h
WHERE h.fonte = 'EDAPP'
  AND h.deleted_at IS NULL
GROUP BY h.empresa_id, h.status
ORDER BY h.empresa_id, h.status;

SELECT
  'external_source_inventory_by_tenant' AS section,
  tenant.empresa_id,
  COALESCE(events.total_events, 0) AS total_events,
  COALESCE(users.total_user_mappings, 0) AS total_user_mappings,
  COALESCE(courses.total_course_mappings, 0) AS total_course_mappings,
  COALESCE(history.total_history_rows, 0) AS total_history_rows
FROM (
  SELECT empresa_id FROM integracoes_edapp_eventos
  UNION
  SELECT empresa_id FROM integracoes_edapp_usuarios
  UNION
  SELECT empresa_id FROM integracoes_edapp_cursos
  UNION
  SELECT empresa_id FROM lms_historico_importado WHERE fonte = 'EDAPP'
) tenant
LEFT JOIN (
  SELECT empresa_id, COUNT(*) AS total_events
  FROM integracoes_edapp_eventos
  WHERE deleted_at IS NULL
  GROUP BY empresa_id
) events ON events.empresa_id = tenant.empresa_id
LEFT JOIN (
  SELECT empresa_id, COUNT(*) AS total_user_mappings
  FROM integracoes_edapp_usuarios
  WHERE deleted_at IS NULL
  GROUP BY empresa_id
) users ON users.empresa_id = tenant.empresa_id
LEFT JOIN (
  SELECT empresa_id, COUNT(*) AS total_course_mappings
  FROM integracoes_edapp_cursos
  WHERE deleted_at IS NULL
  GROUP BY empresa_id
) courses ON courses.empresa_id = tenant.empresa_id
LEFT JOIN (
  SELECT empresa_id, COUNT(*) AS total_history_rows
  FROM lms_historico_importado
  WHERE fonte = 'EDAPP'
    AND deleted_at IS NULL
  GROUP BY empresa_id
) history ON history.empresa_id = tenant.empresa_id
ORDER BY tenant.empresa_id;

-- -----------------------------------------------------------------------------
-- 3. Internal-reference integrity. Every result should be zero before external
--    integration tables are considered for archival.
-- -----------------------------------------------------------------------------
SELECT
  'integrity_orphan_employee' AS section,
  h.empresa_id,
  COUNT(*) AS affected_rows
FROM lms_historico_importado h
WHERE h.fonte = 'EDAPP'
  AND h.deleted_at IS NULL
  AND h.funcionario_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM funcionarios f
    WHERE f.id = h.funcionario_id
      AND f.empresa_id = h.empresa_id
  )
GROUP BY h.empresa_id
ORDER BY h.empresa_id;

SELECT
  'integrity_orphan_course' AS section,
  h.empresa_id,
  COUNT(*) AS affected_rows
FROM lms_historico_importado h
WHERE h.fonte = 'EDAPP'
  AND h.deleted_at IS NULL
  AND h.curso_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM lms_cursos c
    WHERE c.id = h.curso_id
      AND c.empresa_id = h.empresa_id
  )
GROUP BY h.empresa_id
ORDER BY h.empresa_id;

SELECT
  'integrity_orphan_qualification_history' AS section,
  h.empresa_id,
  COUNT(*) AS affected_rows
FROM lms_historico_importado h
WHERE h.fonte = 'EDAPP'
  AND h.deleted_at IS NULL
  AND h.qualificacao_historico_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM qualificacoes_historico qh
    LEFT JOIN funcionarios qf ON qf.id = qh.funcionario_id
    WHERE qh.id = h.qualificacao_historico_id
      AND qh.deleted_at IS NULL
      AND qf.empresa_id = h.empresa_id
  )
GROUP BY h.empresa_id
ORDER BY h.empresa_id;

SELECT
  'integrity_orphan_source_event' AS section,
  h.empresa_id,
  COUNT(*) AS affected_rows
FROM lms_historico_importado h
WHERE h.fonte = 'EDAPP'
  AND h.deleted_at IS NULL
  AND h.integracao_evento_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM integracoes_edapp_eventos e
    WHERE e.id = h.integracao_evento_id
      AND e.empresa_id = h.empresa_id
  )
GROUP BY h.empresa_id
ORDER BY h.empresa_id;

SELECT
  'integrity_user_mapping_tenant_mismatch' AS section,
  u.empresa_id,
  COUNT(*) AS affected_rows
FROM integracoes_edapp_usuarios u
LEFT JOIN funcionarios f ON f.id = u.funcionario_id
WHERE u.deleted_at IS NULL
  AND (
    f.id IS NULL
    OR f.empresa_id <> u.empresa_id
  )
GROUP BY u.empresa_id
ORDER BY u.empresa_id;

-- -----------------------------------------------------------------------------
-- 4. Historical self-sufficiency. These counts identify rows that still need an
--    external identifier or raw event to be interpreted.
-- -----------------------------------------------------------------------------
SELECT
  'self_sufficiency_by_tenant' AS section,
  h.empresa_id,
  COUNT(*) AS total_history_rows,
  SUM(CASE WHEN h.funcionario_nome IS NULL OR trim(h.funcionario_nome) = '' THEN 1 ELSE 0 END) AS missing_employee_snapshot,
  SUM(CASE WHEN h.curso_titulo IS NULL OR trim(h.curso_titulo) = '' THEN 1 ELSE 0 END) AS missing_course_snapshot,
  SUM(CASE WHEN h.data_conclusao IS NULL AND h.completed_at IS NULL THEN 1 ELSE 0 END) AS missing_completion_date,
  SUM(CASE WHEN h.funcionario_id IS NULL THEN 1 ELSE 0 END) AS missing_internal_employee,
  SUM(CASE WHEN h.curso_id IS NULL THEN 1 ELSE 0 END) AS missing_internal_course,
  SUM(CASE WHEN h.qualificacao_historico_id IS NULL THEN 1 ELSE 0 END) AS missing_internal_qualification_history,
  SUM(
    CASE
      WHEN h.funcionario_id IS NULL
       AND h.edapp_user_id IS NOT NULL
      THEN 1 ELSE 0
    END
  ) AS employee_resolved_only_by_external_id,
  SUM(
    CASE
      WHEN h.curso_id IS NULL
       AND h.edapp_course_id IS NOT NULL
      THEN 1 ELSE 0
    END
  ) AS course_resolved_only_by_external_id,
  SUM(
    CASE
      WHEN (h.funcionario_nome IS NULL OR trim(h.funcionario_nome) = '')
       AND h.funcionario_id IS NULL
       AND h.edapp_user_id IS NULL
      THEN 1 ELSE 0
    END
  ) AS employee_identity_unrecoverable,
  SUM(
    CASE
      WHEN (h.curso_titulo IS NULL OR trim(h.curso_titulo) = '')
       AND h.curso_id IS NULL
       AND h.edapp_course_id IS NULL
      THEN 1 ELSE 0
    END
  ) AS course_identity_unrecoverable
FROM lms_historico_importado h
WHERE h.fonte = 'EDAPP'
  AND h.deleted_at IS NULL
GROUP BY h.empresa_id
ORDER BY h.empresa_id;

SELECT
  'history_payload_quality_by_tenant' AS section,
  h.empresa_id,
  COUNT(*) AS total_history_rows,
  SUM(CASE WHEN h.payload_json IS NULL OR trim(h.payload_json) = '' THEN 1 ELSE 0 END) AS missing_payload,
  SUM(
    CASE
      WHEN h.payload_json IS NOT NULL
       AND trim(h.payload_json) <> ''
       AND json_valid(h.payload_json) = 0
      THEN 1 ELSE 0
    END
  ) AS invalid_json_payload
FROM lms_historico_importado h
WHERE h.fonte = 'EDAPP'
  AND h.deleted_at IS NULL
GROUP BY h.empresa_id
ORDER BY h.empresa_id;

-- -----------------------------------------------------------------------------
-- 5. Duplicates and reconciliation residue. Duplicate semantic rows require
--    case-by-case validation; they are not automatically deletable.
-- -----------------------------------------------------------------------------
SELECT
  'duplicate_source_event_links' AS section,
  h.empresa_id,
  h.integracao_evento_id,
  COUNT(*) AS duplicate_rows
FROM lms_historico_importado h
WHERE h.fonte = 'EDAPP'
  AND h.deleted_at IS NULL
  AND h.integracao_evento_id IS NOT NULL
GROUP BY h.empresa_id, h.integracao_evento_id
HAVING COUNT(*) > 1
ORDER BY h.empresa_id, h.integracao_evento_id;

SELECT
  'duplicate_semantic_history_groups' AS section,
  h.empresa_id,
  h.funcionario_id,
  h.curso_id,
  date(COALESCE(h.data_conclusao, h.completed_at)) AS completion_day,
  COUNT(*) AS duplicate_rows
FROM lms_historico_importado h
WHERE h.fonte = 'EDAPP'
  AND h.deleted_at IS NULL
  AND h.funcionario_id IS NOT NULL
  AND h.curso_id IS NOT NULL
  AND COALESCE(h.data_conclusao, h.completed_at) IS NOT NULL
GROUP BY
  h.empresa_id,
  h.funcionario_id,
  h.curso_id,
  date(COALESCE(h.data_conclusao, h.completed_at))
HAVING COUNT(*) > 1
ORDER BY h.empresa_id, duplicate_rows DESC;

SELECT
  'completion_events_without_imported_history' AS section,
  e.empresa_id,
  COUNT(*) AS affected_rows
FROM integracoes_edapp_eventos e
WHERE e.deleted_at IS NULL
  AND e.tipo_evento IN (
    'CourseCompletedEvent',
    'course.completed',
    'analytics.courseprogress.completed'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM lms_historico_importado h
    WHERE h.empresa_id = e.empresa_id
      AND h.fonte = 'EDAPP'
      AND h.integracao_evento_id = e.id
      AND h.deleted_at IS NULL
  )
GROUP BY e.empresa_id
ORDER BY e.empresa_id;

-- -----------------------------------------------------------------------------
-- 6. Qualifications, certificates and document dependencies. The result proves
--    whether historical rows already point to internal compliance artifacts.
-- -----------------------------------------------------------------------------
SELECT
  'qualification_certificate_dependencies' AS section,
  h.empresa_id,
  COUNT(*) AS history_rows_with_qualification,
  SUM(CASE WHEN qh.numero_certificado IS NOT NULL AND trim(qh.numero_certificado) <> '' THEN 1 ELSE 0 END) AS rows_with_certificate_number,
  SUM(CASE WHEN qh.certificado_arquivo_id IS NOT NULL AND trim(qh.certificado_arquivo_id) <> '' THEN 1 ELSE 0 END) AS rows_with_certificate_document_reference,
  SUM(CASE WHEN d.uuid IS NOT NULL THEN 1 ELSE 0 END) AS rows_with_existing_document,
  SUM(
    CASE
      WHEN qh.certificado_arquivo_id IS NOT NULL
       AND trim(qh.certificado_arquivo_id) <> ''
       AND d.uuid IS NULL
      THEN 1 ELSE 0
    END
  ) AS rows_with_missing_document
FROM lms_historico_importado h
JOIN qualificacoes_historico qh
  ON qh.id = h.qualificacao_historico_id
 AND qh.deleted_at IS NULL
LEFT JOIN documentos d
  ON d.uuid = qh.certificado_arquivo_id
 AND d.deleted_at IS NULL
WHERE h.fonte = 'EDAPP'
  AND h.deleted_at IS NULL
GROUP BY h.empresa_id
ORDER BY h.empresa_id;

SELECT
  'qualification_employee_tenant_mismatch' AS section,
  h.empresa_id,
  COUNT(*) AS affected_rows
FROM lms_historico_importado h
JOIN qualificacoes_historico qh
  ON qh.id = h.qualificacao_historico_id
 AND qh.deleted_at IS NULL
LEFT JOIN funcionarios qf ON qf.id = qh.funcionario_id
WHERE h.fonte = 'EDAPP'
  AND h.deleted_at IS NULL
  AND h.qualificacao_historico_id IS NOT NULL
  AND (
    qf.id IS NULL
    OR qf.empresa_id <> h.empresa_id
    OR (h.funcionario_id IS NOT NULL AND qh.funcionario_id <> h.funcionario_id)
  )
GROUP BY h.empresa_id
ORDER BY h.empresa_id;

-- -----------------------------------------------------------------------------
-- 7. Aggregate retirement gate. READY means the historical table is internally
--    readable and linked. It does not authorize deletion; backup, restore drill,
--    UI/API validation and reviewed archival PRs remain mandatory.
-- -----------------------------------------------------------------------------
SELECT
  'retirement_gate' AS section,
  h.empresa_id,
  COUNT(*) AS total_history_rows,
  SUM(
    CASE
      WHEN h.funcionario_nome IS NULL OR trim(h.funcionario_nome) = ''
      THEN 1 ELSE 0
    END
  ) AS missing_employee_snapshot,
  SUM(
    CASE
      WHEN h.curso_titulo IS NULL OR trim(h.curso_titulo) = ''
      THEN 1 ELSE 0
    END
  ) AS missing_course_snapshot,
  SUM(
    CASE
      WHEN h.funcionario_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM funcionarios f
         WHERE f.id = h.funcionario_id
           AND f.empresa_id = h.empresa_id
       )
      THEN 1 ELSE 0
    END
  ) AS orphan_employee_links,
  SUM(
    CASE
      WHEN h.curso_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM lms_cursos c
         WHERE c.id = h.curso_id
           AND c.empresa_id = h.empresa_id
       )
      THEN 1 ELSE 0
    END
  ) AS orphan_course_links,
  SUM(
    CASE
      WHEN h.qualificacao_historico_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM qualificacoes_historico qh
         LEFT JOIN funcionarios qf ON qf.id = qh.funcionario_id
         WHERE qh.id = h.qualificacao_historico_id
           AND qh.deleted_at IS NULL
           AND qf.empresa_id = h.empresa_id
       )
      THEN 1 ELSE 0
    END
  ) AS orphan_qualification_links,
  CASE
    WHEN COUNT(*) = 0 THEN 'NO_HISTORY'
    WHEN SUM(
      CASE
        WHEN h.funcionario_nome IS NULL OR trim(h.funcionario_nome) = ''
          OR h.curso_titulo IS NULL OR trim(h.curso_titulo) = ''
        THEN 1 ELSE 0
      END
    ) > 0 THEN 'BLOCKED_MISSING_SNAPSHOT'
    WHEN SUM(
      CASE
        WHEN h.funcionario_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM funcionarios f
           WHERE f.id = h.funcionario_id
             AND f.empresa_id = h.empresa_id
         )
        THEN 1 ELSE 0
      END
    ) > 0 THEN 'BLOCKED_ORPHAN_EMPLOYEE'
    WHEN SUM(
      CASE
        WHEN h.curso_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM lms_cursos c
           WHERE c.id = h.curso_id
             AND c.empresa_id = h.empresa_id
         )
        THEN 1 ELSE 0
      END
    ) > 0 THEN 'BLOCKED_ORPHAN_COURSE'
    WHEN SUM(
      CASE
        WHEN h.qualificacao_historico_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM qualificacoes_historico qh
           LEFT JOIN funcionarios qf ON qf.id = qh.funcionario_id
           WHERE qh.id = h.qualificacao_historico_id
             AND qh.deleted_at IS NULL
             AND qf.empresa_id = h.empresa_id
         )
        THEN 1 ELSE 0
      END
    ) > 0 THEN 'BLOCKED_ORPHAN_QUALIFICATION'
    ELSE 'READY_FOR_BACKUP_AND_DYNAMIC_VALIDATION'
  END AS gate_status
FROM lms_historico_importado h
WHERE h.fonte = 'EDAPP'
  AND h.deleted_at IS NULL
GROUP BY h.empresa_id
ORDER BY h.empresa_id;

PRAGMA foreign_key_check;
