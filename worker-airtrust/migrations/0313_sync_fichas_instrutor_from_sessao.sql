-- Migration 0313: Sincronizar instrutor_id nas fichas_sessao com o instrutor real da sessao
-- Corrige fichas onde o instrutor foi trocado na sessao mas as fichas ainda apontam para o instructor antigo.
-- Apenas fichas nao-CHECK e nao ainda assinadas pelo instrutor.

UPDATE fichas_sessao
SET
  instrutor_id = (
    SELECT sa.instrutor_id
    FROM simulador_agendamentos sa
    WHERE sa.id = fichas_sessao.agendamento_slot_id
      AND sa.deleted_at IS NULL
    LIMIT 1
  ),
  updated_at = datetime('now')
WHERE
  fichas_sessao.deleted_at IS NULL
  AND fichas_sessao.assinatura_instrutor_timestamp IS NULL
  AND fichas_sessao.agendamento_slot_id IS NOT NULL
  AND COALESCE(
    (SELECT sa.is_check
     FROM simulador_agendamentos sa
     WHERE sa.id = fichas_sessao.agendamento_slot_id
       AND sa.deleted_at IS NULL
     LIMIT 1),
    0
  ) = 0
  AND (
    SELECT sa.instrutor_id
    FROM simulador_agendamentos sa
    WHERE sa.id = fichas_sessao.agendamento_slot_id
      AND sa.deleted_at IS NULL
    LIMIT 1
  ) IS NOT NULL
  AND (
    SELECT sa.instrutor_id
    FROM simulador_agendamentos sa
    WHERE sa.id = fichas_sessao.agendamento_slot_id
      AND sa.deleted_at IS NULL
    LIMIT 1
  ) != fichas_sessao.instrutor_id;
