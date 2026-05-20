-- Migration 0302: Reset fichas com manobras do modelo errado (lookup genérico pegou modelo errado)
-- Afetadas: fichas 85, 86 (OFFSHORE→model 28 errado), 88 (LOFT/CHECK→model 28 errado),
--           91 (SEMESTRAL LOFT CHECK→model 52 errado), 101 (CRED EXAMINADOR→manobras erradas)
-- Todas sem avaliações reais (resultado IS NULL) → seguro resetar

-- Reset fichas identificadas com manobras de modelo errado e sem avaliações
UPDATE fichas_sessao_manobras
SET deleted_at = datetime('now')
WHERE ficha_id IN (85, 86, 88, 91, 101)
  AND deleted_at IS NULL
  AND resultado IS NULL;

-- Também resetar fichas de sessões Semestral 02/02 com manobras do modelo errado (52 em vez de 53)
-- Fichas extras que possam ter sido populadas erradas nas sessoes posteriores
UPDATE fichas_sessao_manobras
SET deleted_at = datetime('now')
WHERE ficha_id IN (
  SELECT f.id FROM fichas_sessao f
  INNER JOIN simulador_agendamentos sa ON f.agendamento_slot_id = sa.id
  INNER JOIN simuladores sim ON sa.simulador_id = sim.id
  WHERE f.deleted_at IS NULL
    AND (
      -- fichas PER/AW139 cuja sessão é LOFT/CHECK/OFFSHORE mas tem manobras do modelo 28 (VFR Ciclo1 - errado)
      (sa.nome LIKE '%LOFT%' AND sim.modelo = 'AW139' AND f.tipo_sessao = 'PER')
      OR
      -- fichas SEM/AW139 cuja sessão é "02/02: LOFT e CHECK" mas tem manobras do modelo 52 (Noturno - errado)
      (sa.nome LIKE '%02/02%' AND sa.nome LIKE '%LOFT%CHECK%' AND sim.modelo = 'AW139' AND f.tipo_sessao = 'SEM')
    )
    AND NOT EXISTS (
      SELECT 1 FROM fichas_sessao_manobras fsm2
      WHERE fsm2.ficha_id = f.id AND fsm2.deleted_at IS NULL AND fsm2.resultado IS NOT NULL
    )
)
AND deleted_at IS NULL;
