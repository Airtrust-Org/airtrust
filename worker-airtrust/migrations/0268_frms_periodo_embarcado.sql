-- ============================================================
-- Migration 0268: Dia do Período Embarcado (Offshore)
-- Objetivo: incorporar "Dia X de Y" do período embarcado ao modelo
-- de fadiga, adicionando degradação progressiva ao Processo S.
--
-- Fonte de dados: frms_escala_quinzenal (tripulante_id, data_inicio_embarque,
-- data_fim_embarque, dias_embarcado) — tabela nativa FRMS da AirTrust.
-- ============================================================

-- 1. Novos campos na tabela de fatorização de jornada
ALTER TABLE frms_fatorizacao_jornada
  ADD COLUMN dia_periodo_embarcado INTEGER DEFAULT NULL;

ALTER TABLE frms_fatorizacao_jornada
  ADD COLUMN total_dias_periodo INTEGER DEFAULT NULL;

-- 2. Novo parâmetro de configuração: degradação progressiva máxima
INSERT OR IGNORE INTO frms_configuracao_limites
  (id, nome, valor_numerico, unidade, descricao, ativo, created_at, updated_at)
VALUES
  ('cfg_emb_progress', 'FRMS_EMBARQUE_PROGRESSO_MAX', 8, 'percentual',
   'Déficit máximo adicional de efetividade (pontos percentuais) no último dia do período embarcado. '||
   'Aplicado linearmente: 0% no dia 1, FRMS_EMBARQUE_PROGRESSO_MAX% no dia N. '||
   'Padrão: 8% (ex: dia 14 de 14 = -0.08 no total fatorizado).',
   1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 3. BACKFILL: derivar dia_periodo_embarcado e total_dias_periodo
-- Usa frms_escala_quinzenal que contém data_inicio_embarque, data_fim_embarque,
-- dias_embarcado e o relacionamento direto tripulante_id.
-- Join: frms_fatorizacao_jornada → frms_jornada → frms_escala_quinzenal
UPDATE frms_fatorizacao_jornada
SET
  dia_periodo_embarcado = (
    SELECT CAST(
      julianday(j.data) - julianday(eq.data_inicio_embarque) + 1
      AS INTEGER
    )
    FROM frms_jornada j
    JOIN frms_escala_quinzenal eq
      ON CAST(eq.tripulante_id AS TEXT) = CAST(j.tripulante_id AS TEXT)
     AND eq.deleted_at IS NULL
     AND j.data >= eq.data_inicio_embarque
     AND j.data <= eq.data_fim_embarque
    WHERE j.id = frms_fatorizacao_jornada.jornada_id
      AND j.deleted_at IS NULL
    ORDER BY eq.data_inicio_embarque DESC
    LIMIT 1
  ),
  total_dias_periodo = (
    SELECT COALESCE(
      eq.dias_embarcado,
      CAST(julianday(eq.data_fim_embarque) - julianday(eq.data_inicio_embarque) + 1 AS INTEGER)
    )
    FROM frms_jornada j
    JOIN frms_escala_quinzenal eq
      ON CAST(eq.tripulante_id AS TEXT) = CAST(j.tripulante_id AS TEXT)
     AND eq.deleted_at IS NULL
     AND j.data >= eq.data_inicio_embarque
     AND j.data <= eq.data_fim_embarque
    WHERE j.id = frms_fatorizacao_jornada.jornada_id
      AND j.deleted_at IS NULL
    ORDER BY eq.data_inicio_embarque DESC
    LIMIT 1
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE frms_fatorizacao_jornada.deleted_at IS NULL
  AND (frms_fatorizacao_jornada.dia_periodo_embarcado IS NULL
    OR frms_fatorizacao_jornada.total_dias_periodo IS NULL);

-- 4. Verificação rápida pós-backfill
SELECT
  'PERIODO_EMBARCADO_BACKFILL' AS check_name,
  COUNT(*) AS total_fj,
  COUNT(dia_periodo_embarcado) AS com_dia,
  COUNT(total_dias_periodo) AS com_total,
  ROUND(AVG(dia_periodo_embarcado), 1) AS dia_medio,
  MIN(dia_periodo_embarcado) AS dia_min,
  MAX(dia_periodo_embarcado) AS dia_max
FROM frms_fatorizacao_jornada
WHERE deleted_at IS NULL;
