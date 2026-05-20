-- Migration 0303: Reset definitivo de TODAS as fichas com manobras incorretas e sem avaliações
-- Executada DEPOIS do deploy do código self-healing (0303).
-- O novo código auto-corrige qualquer ficha ao ser aberta; esta migration
-- apenas force-reseta as fichas já conhecidas para que o self-heal rode imediatamente.

-- 1. Fichas da sessão PERIÓDICO 04/04 LOFT/CHECK (devem ter LOFT-CHK): fichas 87, 88
UPDATE fichas_sessao_manobras SET deleted_at = datetime('now')
WHERE ficha_id IN (87, 88)
  AND deleted_at IS NULL
  AND resultado IS NULL;

-- 2. Fichas da sessão PERIÓDICO 03/04 OFFSHORE (devem ter LOFT-OFF): fichas 85, 86
UPDATE fichas_sessao_manobras SET deleted_at = datetime('now')
WHERE ficha_id IN (85, 86)
  AND deleted_at IS NULL
  AND resultado IS NULL;

-- 3. Fichas da sessão SEMESTRAL 02/02 CHECK IFR (devem ter LOFT-CHK): fichas 91, 92
UPDATE fichas_sessao_manobras SET deleted_at = datetime('now')
WHERE ficha_id IN (91, 92)
  AND deleted_at IS NULL
  AND resultado IS NULL;

-- 4. Fichas da sessão SEMESTRAL 01/02 NOTURNO (devem ter LOFT-NOT): ficha 89, 90
--    Ficha 89 tem LOFT-PRE antigos (de antes da migration 0300), 0 avaliadas → resetar
UPDATE fichas_sessao_manobras SET deleted_at = datetime('now')
WHERE ficha_id IN (89, 90)
  AND deleted_at IS NULL
  AND resultado IS NULL;

-- 5. Ficha do examinador (deve ter EXA-CGE): ficha 101
UPDATE fichas_sessao_manobras SET deleted_at = datetime('now')
WHERE ficha_id = 101
  AND deleted_at IS NULL
  AND resultado IS NULL;

-- 6. Qualquer outra ficha com manobras não avaliadas cujo primeiro código
--    seja um código de modelo genérico antigo (A139-LOFT, LOFT-PRE, ORD-)
UPDATE fichas_sessao_manobras SET deleted_at = datetime('now')
WHERE deleted_at IS NULL
  AND resultado IS NULL
  AND codigo IN (
    SELECT DISTINCT fsm.codigo FROM fichas_sessao_manobras fsm
    WHERE (fsm.codigo LIKE 'A139-LOFT-%' OR fsm.codigo LIKE 'LOFT-PRE-%'
           OR fsm.codigo LIKE 'LOFT-SOL-%' OR fsm.codigo LIKE 'LOFT-VOO-%'
           OR fsm.codigo LIKE 'LOFT-EME-%' OR fsm.codigo LIKE 'LOFT-APR-%'
           OR fsm.codigo LIKE 'LOFT-CRM-%' OR fsm.codigo LIKE 'ORD-%')
      AND NOT EXISTS (
        SELECT 1 FROM modelos_sessao_manobras msm
        INNER JOIN manobras m ON msm.manobra_id = m.id
        WHERE m.codigo = fsm.codigo AND msm.deleted_at IS NULL AND m.deleted_at IS NULL
      )
  );
