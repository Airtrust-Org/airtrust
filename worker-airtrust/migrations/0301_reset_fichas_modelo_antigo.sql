-- Migration 0301: Resetar manobras de fichas com modelo antigo (A139-LOFT) ou modelo errado
-- Fichas 87 e 88 (Ramon e Nivaldo, sessão 39): têm códigos A139-LOFT-* (modelo antigo)
--   com resultado='NAO_REALIZADA' (nunca avaliadas de verdade) → reset para auto-popular com LOFT-CHK
-- Ficha 101 (Carlos - CREDENCIAMENTO DE EXAMINADOR, sessão 39): tem manobras do modelo PERIÓDICO
--   (resultado=NULL, nunca avaliada) → reset para auto-popular com EXA-CGE (modelo correto)

-- Reset fichas 87 e 88: manobras A139-LOFT antigas (não avaliadas de verdade)
UPDATE fichas_sessao_manobras
SET deleted_at = datetime('now')
WHERE ficha_id IN (87, 88)
  AND deleted_at IS NULL
  AND codigo LIKE 'A139-LOFT-%';

-- Reset ficha 101: manobras do modelo periódico (erradas para CREDENCIAMENTO DE EXAMINADOR)
UPDATE fichas_sessao_manobras
SET deleted_at = datetime('now')
WHERE ficha_id = 101
  AND deleted_at IS NULL
  AND resultado IS NULL;

-- Corrigir também quaisquer outras fichas do tipo CHECK-CRED-EXAMINADOR ou CHECK-TRIN-INSTRUTOR
-- que tenham manobras com resultado=NULL e cujos códigos não pertencem ao modelo correto
-- (fichas especiais que foram populadas com manobras do modelo da sessão por engano)
UPDATE fichas_sessao_manobras
SET deleted_at = datetime('now')
WHERE ficha_id IN (
  SELECT f.id
  FROM fichas_sessao f
  WHERE f.tipo_sessao IN ('CHECK-CRED-EXAMINADOR', 'CHECK-TRIN-INSTRUTOR')
    AND f.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM fichas_sessao_manobras fsm2
      WHERE fsm2.ficha_id = f.id
        AND fsm2.deleted_at IS NULL
        AND fsm2.resultado IS NOT NULL
    )
)
AND deleted_at IS NULL;
