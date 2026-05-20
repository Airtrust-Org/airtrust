-- Rollback for AW139 and SK76 LOFT manobras and associations
-- Safe delete: removes associations referencing the specific manobra codes, then removes the manobra records.

-- Remove associations in modelos_sessao_manobras for the A139 and S76 LOFT codes
DELETE FROM modelos_sessao_manobras
WHERE manobra_id IN (
  SELECT id FROM manobras WHERE codigo LIKE 'A139-LOFT-%' OR codigo LIKE 'S76-LOFT-%'
);

-- Remove the manobras themselves
DELETE FROM manobras WHERE codigo LIKE 'A139-LOFT-%' OR codigo LIKE 'S76-LOFT-%';

-- (Optional) If categories were created specifically for these seeds with codes starting 'BLOCO-', you can uncomment the following
-- DELETE FROM manobras_categorias WHERE codigo LIKE 'BLOCO-%';

-- Audit: select remaining counts for quick check
SELECT COUNT(*) AS manobras_remanescentes FROM manobras WHERE codigo LIKE 'A139-LOFT-%' OR codigo LIKE 'S76-LOFT-%';
SELECT COUNT(*) AS assoc_remanescentes FROM modelos_sessao_manobras msm JOIN manobras m ON m.id=msm.manobra_id WHERE m.codigo LIKE 'A139-LOFT-%' OR m.codigo LIKE 'S76-LOFT-%';
