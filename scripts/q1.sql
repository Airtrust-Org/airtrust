SELECT 'simuladores' as t, COUNT(*) as total, SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) as ativos FROM simuladores;
