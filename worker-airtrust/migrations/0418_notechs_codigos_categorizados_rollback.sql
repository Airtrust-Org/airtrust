-- ROLLBACK 0418: Reverte códigos categorizados para NOTECHS-01..15
-- Aplicar apenas se necessário reverter a migration 0418
-- Seguro para rerun: WHERE pelo código novo garante idempotência

-- COO → original
UPDATE manobras SET codigo = 'NOTECHS-01' WHERE codigo = 'NOTECHS-COO-01' AND categoria = 'NOTECHS';
UPDATE manobras SET codigo = 'NOTECHS-02' WHERE codigo = 'NOTECHS-COO-02' AND categoria = 'NOTECHS';
UPDATE manobras SET codigo = 'NOTECHS-03' WHERE codigo = 'NOTECHS-COO-03' AND categoria = 'NOTECHS';
UPDATE manobras SET codigo = 'NOTECHS-04' WHERE codigo = 'NOTECHS-COO-04' AND categoria = 'NOTECHS';

-- LID → original
UPDATE manobras SET codigo = 'NOTECHS-05' WHERE codigo = 'NOTECHS-LID-05' AND categoria = 'NOTECHS';
UPDATE manobras SET codigo = 'NOTECHS-06' WHERE codigo = 'NOTECHS-LID-06' AND categoria = 'NOTECHS';
UPDATE manobras SET codigo = 'NOTECHS-07' WHERE codigo = 'NOTECHS-LID-07' AND categoria = 'NOTECHS';
UPDATE manobras SET codigo = 'NOTECHS-08' WHERE codigo = 'NOTECHS-LID-08' AND categoria = 'NOTECHS';

-- CSA → original
UPDATE manobras SET codigo = 'NOTECHS-09' WHERE codigo = 'NOTECHS-CSA-09' AND categoria = 'NOTECHS';
UPDATE manobras SET codigo = 'NOTECHS-10' WHERE codigo = 'NOTECHS-CSA-10' AND categoria = 'NOTECHS';
UPDATE manobras SET codigo = 'NOTECHS-11' WHERE codigo = 'NOTECHS-CSA-11' AND categoria = 'NOTECHS';

-- TMD → original
UPDATE manobras SET codigo = 'NOTECHS-12' WHERE codigo = 'NOTECHS-TMD-12' AND categoria = 'NOTECHS';
UPDATE manobras SET codigo = 'NOTECHS-13' WHERE codigo = 'NOTECHS-TMD-13' AND categoria = 'NOTECHS';
UPDATE manobras SET codigo = 'NOTECHS-14' WHERE codigo = 'NOTECHS-TMD-14' AND categoria = 'NOTECHS';
UPDATE manobras SET codigo = 'NOTECHS-15' WHERE codigo = 'NOTECHS-TMD-15' AND categoria = 'NOTECHS';
