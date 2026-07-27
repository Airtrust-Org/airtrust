-- Category is the sole functional classification for qualification types.
-- Legacy format columns/tables are intentionally retained for compatibility.
BEGIN IMMEDIATE;

CREATE TABLE IF NOT EXISTS qualificacoes_category_only_0450_rollback (
  empresa_id INTEGER NOT NULL,
  qualificacao_tipo_id INTEGER NOT NULL,
  categoria_id_anterior INTEGER,
  categoria_anterior TEXT,
  formato_id_anterior INTEGER,
  PRIMARY KEY (empresa_id, qualificacao_tipo_id)
);

-- Fail closed if a tenant has more than one active category called/code EAD.
CREATE TEMP TABLE _qco_0450_guard (valid INTEGER NOT NULL CHECK (valid = 1));
INSERT INTO _qco_0450_guard (valid)
SELECT CASE WHEN NOT EXISTS (
  SELECT 1
    FROM qualificacoes_categorias
   WHERE deleted_at IS NULL
   GROUP BY empresa_id
  HAVING SUM(CASE WHEN UPPER(TRIM(nome)) = 'EAD' OR UPPER(TRIM(codigo)) = 'EAD' THEN 1 ELSE 0 END) > 1
) THEN 1 ELSE 0 END;

-- The existing EAD-labelled category is canonical only when it is unambiguous.
UPDATE qualificacoes_categorias
   SET codigo = 'EAD',
       updated_at = datetime('now')
 WHERE deleted_at IS NULL
   AND UPPER(TRIM(nome)) = 'EAD'
   AND UPPER(TRIM(codigo)) <> 'EAD'
   AND NOT EXISTS (
     SELECT 1 FROM qualificacoes_categorias other
      WHERE other.empresa_id = qualificacoes_categorias.empresa_id
        AND other.deleted_at IS NULL
        AND other.id <> qualificacoes_categorias.id
        AND UPPER(TRIM(other.codigo)) = 'EAD'
   );

-- Create a canonical EAD category only for tenants that have active EAD-format types.
INSERT INTO qualificacoes_categorias (nome, codigo, descricao, cor, ativo, empresa_id, created_at, updated_at)
SELECT 'EAD', 'EAD', 'Treinamento a distância (classificação canônica).', '#6B7280', 1,
       qt.empresa_id, datetime('now'), datetime('now')
  FROM qualificacoes_tipos qt
  JOIN qualificacoes_formatos qf ON qf.id = qt.formato_id
 WHERE qt.deleted_at IS NULL
   AND qf.deleted_at IS NULL
   AND UPPER(TRIM(qf.codigo)) = 'EAD'
   AND NOT EXISTS (
     SELECT 1 FROM qualificacoes_categorias qc
      WHERE qc.empresa_id = qt.empresa_id
        AND qc.deleted_at IS NULL
        AND UPPER(TRIM(qc.codigo)) = 'EAD'
   )
 GROUP BY qt.empresa_id;

-- Capture the exact target map before changing active types.
INSERT OR IGNORE INTO qualificacoes_category_only_0450_rollback (
  empresa_id, qualificacao_tipo_id, categoria_id_anterior, categoria_anterior, formato_id_anterior
)
SELECT qt.empresa_id, qt.id, qt.categoria_id, qt.categoria, qt.formato_id
  FROM qualificacoes_tipos qt
  JOIN qualificacoes_formatos qf ON qf.id = qt.formato_id
 WHERE qt.deleted_at IS NULL
   AND qf.deleted_at IS NULL
   AND UPPER(TRIM(qf.codigo)) = 'EAD';

-- Change only the captured map. Histories, certificates, enrolments and LMS courses are untouched.
UPDATE qualificacoes_tipos
   SET categoria_id = (
         SELECT qc.id FROM qualificacoes_categorias qc
          WHERE qc.empresa_id = qualificacoes_tipos.empresa_id
            AND qc.deleted_at IS NULL
            AND UPPER(TRIM(qc.codigo)) = 'EAD'
       ),
       categoria = 'EAD',
       formato_id = NULL,
       updated_at = datetime('now')
 WHERE deleted_at IS NULL
   AND EXISTS (
     SELECT 1 FROM qualificacoes_category_only_0450_rollback rb
      WHERE rb.empresa_id = qualificacoes_tipos.empresa_id
        AND rb.qualificacao_tipo_id = qualificacoes_tipos.id
   );

DROP TABLE _qco_0450_guard;
COMMIT;
