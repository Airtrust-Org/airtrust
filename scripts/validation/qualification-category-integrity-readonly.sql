-- READ-ONLY DIAGNOSTIC — qualification category canonical contract.
-- Every statement is SELECT/PRAGMA. Do not add INSERT/UPDATE/DELETE/DDL here.

PRAGMA foreign_keys;
PRAGMA table_info('qualificacoes_categorias');
PRAGMA table_info('qualificacoes_tipos');
PRAGMA table_info('qualificacoes_historico');
PRAGMA table_info('lms_cursos');
PRAGMA table_info('qualificacoes_formatos');

-- 1. Duplicate active names/codes inside the same tenant.
SELECT 'duplicate_category_name' AS finding,
       empresa_id,
       UPPER(TRIM(nome)) AS normalized_value,
       COUNT(*) AS total,
       GROUP_CONCAT(id) AS ids
  FROM qualificacoes_categorias
 WHERE deleted_at IS NULL AND ativo = 1
 GROUP BY empresa_id, UPPER(TRIM(nome))
HAVING COUNT(*) > 1;

SELECT 'duplicate_category_code' AS finding,
       empresa_id,
       UPPER(TRIM(codigo)) AS normalized_value,
       COUNT(*) AS total,
       GROUP_CONCAT(id) AS ids
  FROM qualificacoes_categorias
 WHERE deleted_at IS NULL AND ativo = 1
 GROUP BY empresa_id, UPPER(TRIM(codigo))
HAVING COUNT(*) > 1;

-- 2. Types without a valid tenant-scoped FK, or with text/FK divergence.
SELECT 'type_missing_or_cross_tenant_category' AS finding,
       qt.id,
       qt.empresa_id,
       qt.categoria_id,
       qt.categoria
  FROM qualificacoes_tipos qt
  LEFT JOIN qualificacoes_categorias qc
    ON qc.id = qt.categoria_id
   AND qc.empresa_id = qt.empresa_id
   AND qc.deleted_at IS NULL
 WHERE qt.deleted_at IS NULL
   AND (qt.categoria_id IS NULL OR qc.id IS NULL);

SELECT 'type_category_snapshot_divergence' AS finding,
       qt.id,
       qt.empresa_id,
       qt.categoria_id,
       qt.categoria AS snapshot_nome,
       qc.nome AS canonical_nome,
       qc.codigo AS canonical_codigo,
       qc.ativo AS canonical_ativo
  FROM qualificacoes_tipos qt
  JOIN qualificacoes_categorias qc
    ON qc.id = qt.categoria_id
   AND qc.empresa_id = qt.empresa_id
   AND qc.deleted_at IS NULL
 WHERE qt.deleted_at IS NULL
   AND UPPER(TRIM(COALESCE(qt.categoria, ''))) <> UPPER(TRIM(qc.nome));

SELECT 'active_type_references_inactive_category' AS finding,
       qt.id,
       qt.empresa_id,
       qt.categoria_id,
       qt.categoria,
       qc.nome,
       qc.ativo
  FROM qualificacoes_tipos qt
  JOIN qualificacoes_categorias qc
    ON qc.id = qt.categoria_id
   AND qc.empresa_id = qt.empresa_id
   AND qc.deleted_at IS NULL
 WHERE qt.deleted_at IS NULL
   AND qt.ativo = 1
   AND qc.ativo <> 1;

-- 3. History without canonical FK, cross-tenant FK, or divergent snapshots.
SELECT 'history_missing_or_cross_tenant_category' AS finding,
       qh.id,
       qh.empresa_id,
       qh.qualificacao_id,
       qh.qualificacao_codigo,
       qh.categoria_id,
       qh.categoria
  FROM qualificacoes_historico qh
  LEFT JOIN qualificacoes_categorias qc
    ON qc.id = qh.categoria_id
   AND qc.empresa_id = qh.empresa_id
   AND qc.deleted_at IS NULL
 WHERE qh.deleted_at IS NULL
   AND (qh.categoria_id IS NULL OR qc.id IS NULL);

SELECT 'history_category_snapshot_divergence' AS finding,
       qh.id,
       qh.empresa_id,
       qh.qualificacao_id,
       qh.categoria_id,
       qh.categoria AS snapshot_nome,
       qh.categoria_codigo AS snapshot_codigo,
       qc.nome AS canonical_nome,
       qc.codigo AS canonical_codigo
  FROM qualificacoes_historico qh
  JOIN qualificacoes_categorias qc
    ON qc.id = qh.categoria_id
   AND qc.empresa_id = qh.empresa_id
   AND qc.deleted_at IS NULL
 WHERE qh.deleted_at IS NULL
   AND (
     UPPER(TRIM(COALESCE(qh.categoria, ''))) <> UPPER(TRIM(qc.nome))
     OR UPPER(TRIM(COALESCE(qh.categoria_codigo, ''))) <> UPPER(TRIM(qc.codigo))
   );

SELECT 'history_type_category_divergence' AS finding,
       qh.id,
       qh.empresa_id,
       qh.qualificacao_id,
       qh.categoria_id AS history_category_id,
       qt.categoria_id AS type_category_id,
       qh.categoria AS history_category_name,
       qt.categoria AS type_category_name
  FROM qualificacoes_historico qh
  JOIN qualificacoes_tipos qt
    ON qt.id = qh.qualificacao_id
   AND qt.empresa_id = qh.empresa_id
   AND qt.deleted_at IS NULL
 WHERE qh.deleted_at IS NULL
   AND COALESCE(qh.categoria_id, -1) <> COALESCE(qt.categoria_id, -1);

-- 4. Legacy format residues in every functional table.
SELECT 'type_format_residue' AS finding,
       id,
       empresa_id,
       categoria_id,
       categoria,
       formato_id
  FROM qualificacoes_tipos
 WHERE deleted_at IS NULL AND formato_id IS NOT NULL;

SELECT 'history_format_residue' AS finding,
       id,
       empresa_id,
       qualificacao_id,
       categoria_id,
       categoria,
       formato_id,
       formato_codigo
  FROM qualificacoes_historico
 WHERE deleted_at IS NULL
   AND (formato_id IS NOT NULL OR TRIM(COALESCE(formato_codigo, '')) <> '');

SELECT 'course_format_residue' AS finding,
       id,
       empresa_id,
       qualificacao_tipo_id,
       categoria,
       formato_id
  FROM lms_cursos
 WHERE deleted_at IS NULL AND formato_id IS NOT NULL;

SELECT 'active_format_catalog' AS finding,
       id,
       empresa_id,
       codigo,
       nome,
       ativo
  FROM qualificacoes_formatos
 WHERE deleted_at IS NULL;

-- 5. EAD/name-based evidence and LMS mapping inconsistencies.
SELECT 'legacy_ead_text_evidence' AS finding,
       'qualificacoes_tipos' AS source_table,
       id,
       empresa_id,
       categoria_id,
       categoria
  FROM qualificacoes_tipos
 WHERE deleted_at IS NULL
   AND UPPER(TRIM(COALESCE(categoria, ''))) IN ('EAD', 'TREINAMENTO EAD')
UNION ALL
SELECT 'legacy_ead_text_evidence',
       'qualificacoes_historico',
       id,
       empresa_id,
       categoria_id,
       categoria
  FROM qualificacoes_historico
 WHERE deleted_at IS NULL
   AND UPPER(TRIM(COALESCE(categoria, ''))) IN ('EAD', 'TREINAMENTO EAD')
UNION ALL
SELECT 'legacy_ead_text_evidence',
       'lms_cursos',
       id,
       empresa_id,
       qualificacao_tipo_id,
       categoria
  FROM lms_cursos
 WHERE deleted_at IS NULL
   AND UPPER(TRIM(COALESCE(categoria, ''))) IN ('EAD', 'TREINAMENTO EAD');

SELECT 'course_type_category_divergence' AS finding,
       c.id AS curso_id,
       c.empresa_id,
       c.qualificacao_tipo_id,
       c.categoria AS curso_categoria,
       qt.categoria_id AS tipo_categoria_id,
       qt.categoria AS tipo_categoria,
       qc.nome AS canonical_categoria,
       c.dominio_codigo AS curso_dominio,
       COALESCE(qt.dominio_codigo, qc.dominio_codigo) AS tipo_dominio
  FROM lms_cursos c
  LEFT JOIN qualificacoes_tipos qt
    ON qt.id = c.qualificacao_tipo_id
   AND qt.empresa_id = c.empresa_id
   AND qt.deleted_at IS NULL
  LEFT JOIN qualificacoes_categorias qc
    ON qc.id = qt.categoria_id
   AND qc.empresa_id = qt.empresa_id
   AND qc.deleted_at IS NULL
 WHERE c.deleted_at IS NULL
   AND c.qualificacao_tipo_id IS NOT NULL
   AND (
     qt.id IS NULL
     OR UPPER(TRIM(COALESCE(c.categoria, ''))) <> UPPER(TRIM(COALESCE(qc.nome, qt.categoria, '')))
     OR COALESCE(c.dominio_codigo, '') <> COALESCE(qt.dominio_codigo, qc.dominio_codigo, '')
   );

-- 6. Domain policy. A category with NULL domain is domain-agnostic; a type or
-- history without a valid category FK is unclassified and appears above.
SELECT 'category_domain_inventory' AS finding,
       qc.id,
       qc.empresa_id,
       qc.codigo,
       qc.nome,
       qc.ativo,
       qc.dominio_codigo,
       CASE WHEN qc.dominio_codigo IS NULL THEN 'DOMAIN_AGNOSTIC' ELSE 'DOMAIN_CLASSIFIED' END AS domain_policy,
       COUNT(DISTINCT qt.id) AS active_type_references
  FROM qualificacoes_categorias qc
  LEFT JOIN qualificacoes_tipos qt
    ON qt.categoria_id = qc.id
   AND qt.empresa_id = qc.empresa_id
   AND qt.deleted_at IS NULL
   AND qt.ativo = 1
 WHERE qc.deleted_at IS NULL
 GROUP BY qc.id, qc.empresa_id, qc.codigo, qc.nome, qc.ativo, qc.dominio_codigo;

-- 7. Multi-tenant validation: same names are allowed across tenants, but an ID
-- must never cross tenant boundaries.
SELECT 'cross_tenant_type_category_fk' AS finding,
       qt.id,
       qt.empresa_id AS tipo_empresa_id,
       qt.categoria_id,
       qc.empresa_id AS categoria_empresa_id
  FROM qualificacoes_tipos qt
  JOIN qualificacoes_categorias qc ON qc.id = qt.categoria_id
 WHERE qt.deleted_at IS NULL
   AND qc.deleted_at IS NULL
   AND qt.empresa_id <> qc.empresa_id;

SELECT 'cross_tenant_history_category_fk' AS finding,
       qh.id,
       qh.empresa_id AS history_empresa_id,
       qh.categoria_id,
       qc.empresa_id AS categoria_empresa_id
  FROM qualificacoes_historico qh
  JOIN qualificacoes_categorias qc ON qc.id = qh.categoria_id
 WHERE qh.deleted_at IS NULL
   AND qc.deleted_at IS NULL
   AND qh.empresa_id <> qc.empresa_id;
