-- Migration 0435: Corrigir data_vencimento de qualificações LMS geradas com vencimento_fim_mes incorreto
-- Data: 2026-07-15

UPDATE qualificacoes_historico
SET data_vencimento = (
  SELECT date(qh2.data_conclusao, '+' || CAST(qt.validade AS TEXT) || ' months')
  FROM qualificacoes_historico qh2
  JOIN qualificacoes_tipos qt ON qt.id = qh2.qualificacao_id AND qt.deleted_at IS NULL
  WHERE qh2.id = qualificacoes_historico.id
),
    updated_at = datetime('now')
WHERE id IN (
  SELECT qh.id
  FROM qualificacoes_historico qh
  JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
  WHERE qh.deleted_at IS NULL
    AND qh.observacoes LIKE '%LMS%'
    AND qh.data_vencimento IS NOT NULL
    AND qh.data_conclusao IS NOT NULL
    AND COALESCE(qt.vencimento_fim_mes, 0) = 0
    AND CAST(SUBSTR(qh.data_vencimento, 9, 2) AS INTEGER) >
        CAST(SUBSTR(qh.data_conclusao, 9, 2) AS INTEGER)
);
