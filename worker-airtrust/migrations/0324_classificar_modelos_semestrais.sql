UPDATE qualificacoes_tipos
   SET tipo = 'SEMESTRAL',
       updated_at = datetime('now')
 WHERE deleted_at IS NULL
   AND COALESCE(validade, 0) = 6
   AND COALESCE(tipo, '') != 'SEMESTRAL';