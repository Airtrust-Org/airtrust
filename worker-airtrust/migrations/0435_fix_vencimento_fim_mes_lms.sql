-- Migration 0435: Corrigir data_vencimento de qualificações LMS geradas com vencimento_fim_mes incorreto
-- Data: 2026-07-15
--
-- NO_GO_MIGRATION_PRODUCAO
-- Motivo: o filtro `observacoes LIKE '%LMS%'` não é proveniência confiável.
-- Auditoria read-only de 2026-07-15 encontrou 18 registros com origem_tipo='MANUAL'
-- (Manutenção/SGSO/MOM/MCQ/MGM) já alterados em produção em 2026-07-15 19:05:19 UTC
-- por um processo com o mesmo filtro textual, sem vínculo estrutural com o LMS
-- (nem origem_tipo='LMS', nem lms_matricula_id). Reexecutar este arquivo hoje é
-- um no-op (0 linhas atualmente satisfazem a condição de dia divergente), mas o
-- filtro em si não deve ser reaplicado nem copiado até ser reescrito com
-- proveniência estrutural (origem_tipo='LMS' OR lms_matricula_id IS NOT NULL).
-- Liberação requer PR revisado que (1) substitua o filtro por proveniência
-- estrutural e (2) trate a correção dos 18 registros já afetados incorretamente.

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
