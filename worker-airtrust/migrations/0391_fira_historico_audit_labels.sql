-- FIRA historical audit labels — 2026-06-07
-- Closes the FIRA cleanup residual from the 2026-06-06 operational audit.
--
-- Background (frms-operational-audit-deploy-20260606):
--   • 525 FIRA jornada records are pre-SIGVOOS history (Jan–Mar 2026).
--     They already have origem='FIRA'; the audit confirmed they feed NO
--     rolling/alert/operational queries.  We mark them FIRA_HISTORICO so
--     they are clearly distinguished from any future FIRA source that might
--     be re-imported.
--
--   • 13 jornada records have inconsistent HV/jornada data (horas_voo_minutos
--     > duracao_jornada_minutos  OR  jornada=0 while HV>0).  All have
--     origem='FIRA' and are isolated from SIGVOOS.  We tag them FIRA_INCONSISTENTE
--     for easy identification and set duracao_jornada_minutos = horas_voo_minutos
--     for the 8 cases where jornada>0 (so HV cannot exceed the shift duration).
--     For the 5 cases where jornada=0 and HV>0 the jornada correction is not
--     attempted (no reliable base value); we only add the observacao tag.
--
-- BOTH statements are idempotent (LIKE guard prevents double-application).

-- 1. Label FIRA historical records (525 expected, idempotent via LIKE guard)
UPDATE frms_jornada
   SET observacao   = COALESCE(observacao || ' ', '') || '[FIRA_HISTORICO: auditoria 2026-06-06]',
       updated_at   = datetime('now')
 WHERE origem       = 'FIRA'
   AND deleted_at   IS NULL
   AND COALESCE(observacao, '') NOT LIKE '%FIRA_HISTORICO%';

-- 2a. Tag FIRA records where HV > jornada and jornada > 0
--     AND correct duracao_jornada_minutos = horas_voo_minutos
UPDATE frms_jornada
   SET duracao_jornada_minutos = horas_voo_minutos,
       observacao = COALESCE(observacao || ' ', '') || '[FIRA_INCONSISTENTE: HV>jornada corrigido auditoria 2026-06-06]',
       updated_at = datetime('now')
 WHERE origem      = 'FIRA'
   AND deleted_at  IS NULL
   AND horas_voo_minutos IS NOT NULL
   AND duracao_jornada_minutos IS NOT NULL
   AND duracao_jornada_minutos > 0
   AND horas_voo_minutos > duracao_jornada_minutos
   AND COALESCE(observacao, '') NOT LIKE '%FIRA_INCONSISTENTE%';

-- 2b. Tag FIRA records where jornada=0 and HV>0 (no jornada correction possible)
UPDATE frms_jornada
   SET observacao = COALESCE(observacao || ' ', '') || '[FIRA_INCONSISTENTE: jornada=0 HV>0 auditoria 2026-06-06]',
       updated_at = datetime('now')
 WHERE origem      = 'FIRA'
   AND deleted_at  IS NULL
   AND horas_voo_minutos IS NOT NULL
   AND horas_voo_minutos > 0
   AND COALESCE(duracao_jornada_minutos, 0) = 0
   AND COALESCE(observacao, '') NOT LIKE '%FIRA_INCONSISTENTE%';
