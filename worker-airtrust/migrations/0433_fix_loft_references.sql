-- Migration 0433: Corrigir referências LOFT- órfãs em fichas_sessao_manobras
-- Usa o campo nome para mapear old→new code
-- Data: 2026-07-14

UPDATE fichas_sessao_manobras SET codigo = (
  SELECT m.codigo FROM manobras m
  WHERE m.deleted_at IS NULL
    AND m.nome = fichas_sessao_manobras.nome
    AND m.codigo LIKE 'A139-%'
  LIMIT 1
)
WHERE codigo LIKE 'LOFT-%' AND deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM manobras m
    WHERE m.deleted_at IS NULL
      AND m.nome = fichas_sessao_manobras.nome
      AND m.codigo LIKE 'A139-%'
  );

UPDATE historico_notas_manobras SET codigo_manobra = (
  SELECT m.codigo FROM manobras m
  WHERE m.deleted_at IS NULL
    AND m.nome = historico_notas_manobras.descricao_manobra
    AND m.codigo LIKE 'A139-%'
  LIMIT 1
)
WHERE codigo_manobra LIKE 'LOFT-%' AND deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM manobras m
    WHERE m.deleted_at IS NULL
      AND m.nome = historico_notas_manobras.descricao_manobra
      AND m.codigo LIKE 'A139-%'
  );
