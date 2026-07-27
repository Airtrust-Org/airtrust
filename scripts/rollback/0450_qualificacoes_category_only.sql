-- Manual rollback only. Abort before running if any row has drifted since migration 0450.
BEGIN IMMEDIATE;
CREATE TEMP TABLE _qco_0450_rollback_guard (valid INTEGER NOT NULL CHECK (valid = 1));
INSERT INTO _qco_0450_rollback_guard (valid)
SELECT CASE WHEN NOT EXISTS (
  SELECT 1
    FROM qualificacoes_category_only_0450_rollback rb
    JOIN qualificacoes_tipos qt
      ON qt.id = rb.qualificacao_tipo_id AND qt.empresa_id = rb.empresa_id
   WHERE qt.deleted_at IS NOT NULL
      OR UPPER(TRIM(COALESCE(qt.categoria, ''))) <> 'EAD'
      OR qt.formato_id IS NOT NULL
) THEN 1 ELSE 0 END;

UPDATE qualificacoes_tipos
   SET categoria_id = (
         SELECT categoria_id_anterior FROM qualificacoes_category_only_0450_rollback rb
          WHERE rb.empresa_id = qualificacoes_tipos.empresa_id
            AND rb.qualificacao_tipo_id = qualificacoes_tipos.id
       ),
       categoria = (
         SELECT categoria_anterior FROM qualificacoes_category_only_0450_rollback rb
          WHERE rb.empresa_id = qualificacoes_tipos.empresa_id
            AND rb.qualificacao_tipo_id = qualificacoes_tipos.id
       ),
       formato_id = (
         SELECT formato_id_anterior FROM qualificacoes_category_only_0450_rollback rb
          WHERE rb.empresa_id = qualificacoes_tipos.empresa_id
            AND rb.qualificacao_tipo_id = qualificacoes_tipos.id
       ),
       updated_at = datetime('now')
 WHERE EXISTS (
   SELECT 1 FROM qualificacoes_category_only_0450_rollback rb
    WHERE rb.empresa_id = qualificacoes_tipos.empresa_id
      AND rb.qualificacao_tipo_id = qualificacoes_tipos.id
 );

DROP TABLE _qco_0450_rollback_guard;
COMMIT;
