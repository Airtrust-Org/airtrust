-- ============================================================
-- Migration 0358: FRMS — HV_28_DIAS_HORAS (RBAC 117) e fix HV_365
-- Separa limite rolling 28 dias (RBAC 117: 93 h) do limite mensal
-- calendário (Lei 13.475/2017: 90 h/mês).
-- Corrige HV_365_DIAS_HORAS de 960 → 930 (mais restritivo: RBAC 117).
-- ============================================================

-- 1. Adiciona HV_28_DIAS_HORAS (93 h — RBAC 117 Apêndice C, helicópteros)
INSERT OR IGNORE INTO frms_configuracao_limites (id, nome, valor_numerico, unidade, descricao, ativo, created_at, updated_at)
VALUES (
  'lim_hv_28d',
  'HV_28_DIAS_HORAS',
  93.0,
  'HORAS',
  'HV máx em 28 dias consecutivos (RBAC 117 Apêndice C — helicópteros). Diferente do limite mensal calendário da Lei 13.475/2017 (90 h/mês).',
  1,
  datetime('now'),
  datetime('now')
);

-- 2. Corrige HV_365_DIAS_HORAS: 960 (Lei) → 930 (RBAC 117, mais restritivo)
UPDATE frms_configuracao_limites
SET valor_numerico = 930.0,
    descricao = 'HV máx em 365 dias consecutivos (RBAC 117: 930 h — mais restritivo que Lei 13.475/2017: 960 h/ano)',
    updated_at = datetime('now')
WHERE nome = 'HV_365_DIAS_HORAS'
  AND deleted_at IS NULL;
