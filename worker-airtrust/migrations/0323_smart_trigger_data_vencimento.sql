-- Migration 0323: Smart trigger para data_vencimento
-- 1. Backfill data_vencimento em rows que estão NULL
-- 2. Dropar triggers antigos (que sobrescreviam data_vencimento incondicionalmente)
-- 3. Criar trigger INSERT inteligente (só calcula se data_vencimento não foi fornecido)
-- 4. NÃO criar trigger UPDATE (edições sempre passam pelo código)

-- Step 1: Backfill data_vencimento para registros existentes que estão NULL
UPDATE qualificacoes_historico
SET data_vencimento = date(
  data_conclusao,
  '+' || COALESCE(
    validade_meses,
    (SELECT qt.validade FROM qualificacoes_tipos qt WHERE qt.id = qualificacoes_historico.qualificacao_id AND qt.deleted_at IS NULL),
    12
  ) || ' months'
)
WHERE data_vencimento IS NULL
  AND data_conclusao IS NOT NULL
  AND deleted_at IS NULL;

-- Step 2: Dropar triggers antigos
DROP TRIGGER IF EXISTS trg_calc_vencimento_insert;
DROP TRIGGER IF EXISTS trg_calc_vencimento_update;

-- Step 3: Criar trigger INSERT inteligente (safety net)
-- SÓ dispara quando data_vencimento NÃO foi fornecido explicitamente
CREATE TRIGGER trg_calc_vencimento_insert
AFTER INSERT ON qualificacoes_historico
FOR EACH ROW
WHEN NEW.validade_meses IS NOT NULL
  AND NEW.validade_meses > 0
  AND NEW.data_conclusao IS NOT NULL
  AND NEW.data_vencimento IS NULL
BEGIN
  UPDATE qualificacoes_historico
    SET data_vencimento = date(NEW.data_conclusao, '+' || NEW.validade_meses || ' months')
    WHERE id = NEW.id;
END;
