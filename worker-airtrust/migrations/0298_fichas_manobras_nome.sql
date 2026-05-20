-- Migration 0298: Adiciona coluna nome em fichas_sessao_manobras
-- Separa o nome curto da descrição longa das manobras nas fichas geradas

ALTER TABLE fichas_sessao_manobras ADD COLUMN nome TEXT;

-- Para fichas com manobras que têm código na tabela manobras, preenche nome
UPDATE fichas_sessao_manobras
SET nome = (
  SELECT m.nome FROM manobras m
  WHERE m.codigo = fichas_sessao_manobras.codigo AND m.deleted_at IS NULL
  LIMIT 1
)
WHERE deleted_at IS NULL AND nome IS NULL;

-- Fichas 87, 88 (sessão 39 - LOFT+CHECK PERIÓDICO) → modelo 34
UPDATE fichas_sessao_manobras
SET nome = (
  SELECT m.nome FROM manobras m
  INNER JOIN modelos_sessao_manobras msm ON m.id = msm.manobra_id
  WHERE msm.modelo_id = 34 AND msm.ordem = fichas_sessao_manobras.ordem AND msm.deleted_at IS NULL
  LIMIT 1
)
WHERE ficha_id IN (87, 88) AND deleted_at IS NULL;

-- Fichas 93, 94, 97, 98 (sessões 42, 44 - SEMESTRAL 01/02 LOFT NOTURNO) → modelo 52
UPDATE fichas_sessao_manobras
SET nome = (
  SELECT m.nome FROM manobras m
  INNER JOIN modelos_sessao_manobras msm ON m.id = msm.manobra_id
  WHERE msm.modelo_id = 52 AND msm.ordem = fichas_sessao_manobras.ordem AND msm.deleted_at IS NULL
  LIMIT 1
)
WHERE ficha_id IN (93, 94, 97, 98) AND deleted_at IS NULL;

-- Fichas sem nome ainda: usar descricao como fallback
UPDATE fichas_sessao_manobras
SET nome = descricao
WHERE deleted_at IS NULL AND nome IS NULL;
