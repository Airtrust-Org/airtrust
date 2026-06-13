-- PREVIEW: Normalization of qualificacoes_tipos.categoria text to match qualificacoes_categorias.nome exactly
-- empresa_id = 6 ONLY. Manutenção tipos only — does NOT touch Tripulação tipos (setor_id=10).
--
-- Run PREVIEW first (SELECT), then apply UPDATEs only after confirmation.
--
-- ===== PREVIEW =====

-- Preview 1: "TREINAMENTO TEÓRICO" → "Treinamento Teórico"
-- Root cause: SQLite UPPER() cannot convert accented ó→Ó, so JOIN misses these.
SELECT
  qt.id          AS tipo_id,
  qt.codigo,
  qt.nome,
  qt.categoria   AS categoria_atual,
  'Treinamento Teórico' AS categoria_proposta,
  qts.setor_id,
  s.nome         AS setor_nome,
  'NORMALIZAR_ACENTO' AS acao
FROM qualificacoes_tipos qt
JOIN qualificacoes_tipos_setores qts
  ON qts.tipo_id = qt.id
  AND qts.empresa_id = qt.empresa_id
  AND qts.deleted_at IS NULL
  AND qts.setor_id = 11  -- Manutenção only
JOIN setores s ON s.id = qts.setor_id AND s.empresa_id = qt.empresa_id
WHERE qt.empresa_id = 6
  AND qt.deleted_at IS NULL
  AND qt.categoria = 'TREINAMENTO TEÓRICO';

-- Preview 2: "OUTROS" → "Outros"
SELECT
  qt.id          AS tipo_id,
  qt.codigo,
  qt.nome,
  qt.categoria   AS categoria_atual,
  'Outros'       AS categoria_proposta,
  qts.setor_id,
  s.nome         AS setor_nome,
  'NORMALIZAR_CASE' AS acao
FROM qualificacoes_tipos qt
JOIN qualificacoes_tipos_setores qts
  ON qts.tipo_id = qt.id
  AND qts.empresa_id = qt.empresa_id
  AND qts.deleted_at IS NULL
  AND qts.setor_id = 11  -- Manutenção only
JOIN setores s ON s.id = qts.setor_id AND s.empresa_id = qt.empresa_id
WHERE qt.empresa_id = 6
  AND qt.deleted_at IS NULL
  AND qt.categoria = 'OUTROS';

-- Preview 3: "TREINAMENTO DE VOO" → "Treinamento de Voo"
-- Already matches Tripulação cat via UPPER(), but normalize for consistency.
-- NOTE: these tipos belong to setor_id=10 (Tripulação). Per constraint "Não alterar modelos de Tripulação",
-- this UPDATE is SKIPPED. Left here for documentation only.
-- SELECT qt.id, qt.codigo, qt.nome, qt.categoria, 'Treinamento de Voo' AS proposta
-- FROM qualificacoes_tipos qt WHERE qt.empresa_id = 6 AND qt.categoria = 'TREINAMENTO DE VOO';

-- Preview 4: "PROFICIENCIA/TECNICO" — no matching category exists. No action.
SELECT
  qt.id, qt.codigo, qt.nome, qt.categoria,
  'NAO_ENCONTRADO' AS acao
FROM qualificacoes_tipos qt
WHERE qt.empresa_id = 6
  AND qt.deleted_at IS NULL
  AND qt.categoria = 'PROFICIENCIA/TECNICO';

-- ===== APPLY — only run after preview confirmation =====

-- UPDATE 1: normalize "TREINAMENTO TEÓRICO" → "Treinamento Teórico" (Manutenção, setor_id=11)
-- UPDATE qualificacoes_tipos
-- SET categoria = 'Treinamento Teórico', updated_at = datetime('now')
-- WHERE empresa_id = 6
--   AND deleted_at IS NULL
--   AND categoria = 'TREINAMENTO TEÓRICO'
--   AND id IN (
--     SELECT tipo_id FROM qualificacoes_tipos_setores
--     WHERE empresa_id = 6 AND setor_id = 11 AND deleted_at IS NULL
--   );

-- UPDATE 2: normalize "OUTROS" → "Outros" (Manutenção, setor_id=11)
-- UPDATE qualificacoes_tipos
-- SET categoria = 'Outros', updated_at = datetime('now')
-- WHERE empresa_id = 6
--   AND deleted_at IS NULL
--   AND categoria = 'OUTROS'
--   AND id IN (
--     SELECT tipo_id FROM qualificacoes_tipos_setores
--     WHERE empresa_id = 6 AND setor_id = 11 AND deleted_at IS NULL
--   );
