-- ============================================================
-- Correção de data_vencimento de qualificações com vencimento
-- "fim do mês" gravado incorretamente em tipos operacionais.
--
-- Regra (migration 0122):
--   vencimento_fim_mes = 1  ->  somente tipos MÉDICOS (CMA/ASO/Médico/Saúde)
--   vencimento_fim_mes = 0  ->  tipos OPERACIONAIS (vence no dia exato)
--
-- Este arquivo NÃO altera o flag do tipo (isso é feito via API/script).
-- Ele apenas RECALCULA o data_vencimento já persistido no histórico,
-- para os registros de tipos com flag=0 cujo vencimento não corresponde
-- ao dia exato (data_conclusao + validade em meses).
--
-- ⚠️ PRODUÇÃO: aplique somente com autorização explícita e após revisão.
-- Antes de aplicar, rode o SELECT (dry-run) abaixo para conferir o escopo.
-- ============================================================

-- ── DRY-RUN (somente leitura) ────────────────────────────────
-- SELECT
--   qh.id,
--   qh.funcionario_id,
--   qh.qualificacao_id,
--   qh.data_conclusao,
--   qh.data_vencimento AS atual,
--   date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses,
--     (SELECT qt.validade FROM qualificacoes_tipos qt
--       WHERE qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL), 12) || ' months') AS corrigido
-- FROM qualificacoes_historico qh
-- WHERE qh.deleted_at IS NULL
--   AND qh.data_conclusao IS NOT NULL
--   AND qh.data_vencimento IS NOT NULL
--   AND qh.qualificacao_id IN (
--     SELECT id FROM qualificacoes_tipos
--     WHERE deleted_at IS NULL AND COALESCE(vencimento_fim_mes, 0) = 0
--   )
--   AND date(qh.data_vencimento) != date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses,
--     (SELECT qt2.validade FROM qualificacoes_tipos qt2
--       WHERE qt2.id = qh.qualificacao_id AND qt2.deleted_at IS NULL), 12) || ' months')
-- ORDER BY qh.qualificacao_id, qh.id;

-- ── APPLY (escrita) ──────────────────────────────────────────
UPDATE qualificacoes_historico
SET data_vencimento = date(
      data_conclusao,
      '+' || COALESCE(
        validade_meses,
        (SELECT qt.validade FROM qualificacoes_tipos qt
          WHERE qt.id = qualificacoes_historico.qualificacao_id AND qt.deleted_at IS NULL),
        12
      ) || ' months'
    ),
    updated_at = datetime('now')
WHERE deleted_at IS NULL
  AND data_conclusao IS NOT NULL
  AND data_vencimento IS NOT NULL
  AND qualificacao_id IN (
    SELECT id FROM qualificacoes_tipos
    WHERE deleted_at IS NULL AND COALESCE(vencimento_fim_mes, 0) = 0
  )
  AND date(data_vencimento) != date(
        data_conclusao,
        '+' || COALESCE(
          validade_meses,
          (SELECT qt2.validade FROM qualificacoes_tipos qt2
            WHERE qt2.id = qualificacoes_historico.qualificacao_id AND qt2.deleted_at IS NULL),
          12
        ) || ' months'
      );
