-- ================================================================
-- SEED: Corrigir campos NULL em simuladores existentes
-- ================================================================
-- Data: 30/11/2025
-- Objetivo: Popular modelo, tipo, fabricante nos 12 simuladores

UPDATE simuladores
SET 
  modelo = CASE 
    WHEN id = 1 THEN 'A320-200'
    WHEN id = 2 THEN 'B737-800'
    WHEN id = 3 THEN 'E195'
    WHEN id = 4 THEN 'ATR72-600'
    WHEN id = 5 THEN 'CJ4'
    WHEN id = 6 THEN 'B737-MAX'
    WHEN id = 7 THEN 'A320neo'
    WHEN id = 8 THEN 'E175'
    WHEN id = 9 THEN 'B787-9'
    WHEN id = 10 THEN 'A350-900'
    WHEN id = 11 THEN 'AW139'
    WHEN id = 12 THEN 'H145'
    ELSE modelo
  END,
  tipo = CASE 
    WHEN id <= 3 THEN 'FULL FLIGHT'
    WHEN id <= 6 THEN 'FTD'
    WHEN id <= 10 THEN 'FNPT II'
    ELSE 'Helicóptero'
  END,
  fabricante = CASE 
    WHEN id IN (1, 7) THEN 'Airbus'
    WHEN id IN (2, 6, 9) THEN 'Boeing'
    WHEN id IN (3, 8) THEN 'Embraer'
    WHEN id = 4 THEN 'ATR'
    WHEN id = 5 THEN 'Cessna'
    WHEN id = 10 THEN 'Airbus'
    WHEN id IN (11, 12) THEN 'Airbus Helicopters'
    ELSE fabricante
  END,
  updated_at = datetime('now')
WHERE id BETWEEN 1 AND 12 
  AND (modelo IS NULL OR tipo IS NULL OR fabricante IS NULL);

-- Verificar resultado
SELECT 
  id, 
  nome, 
  modelo, 
  tipo, 
  fabricante, 
  status
FROM simuladores
WHERE deleted_at IS NULL
ORDER BY id;
