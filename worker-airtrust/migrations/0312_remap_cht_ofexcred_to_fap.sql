-- Migration 0312: Remap CHT TIPO-SK76, CHT-IFR-SK76 e OFEXCRED para tipos FAP corretos
-- Etapa 1: Atualizar qualificacoes_historico apontando para os novos tipos

-- CHT TIPO-SK76 → FAP 05.2 - Habilitacao de Tipo Helicoptero - SK76
UPDATE qualificacoes_historico
SET qualificacao_id = (
  SELECT id FROM qualificacoes_tipos
  WHERE UPPER(TRIM(codigo)) = UPPER(TRIM('FAP 05.2'))
    AND deleted_at IS NULL
  LIMIT 1
),
qualificacao_codigo = (
  SELECT codigo FROM qualificacoes_tipos
  WHERE UPPER(TRIM(codigo)) = UPPER(TRIM('FAP 05.2'))
    AND deleted_at IS NULL
  LIMIT 1
),
updated_at = datetime('now')
WHERE qualificacao_id IN (
  SELECT id FROM qualificacoes_tipos
  WHERE (UPPER(TRIM(codigo)) = UPPER(TRIM('CHT TIPO -SK76'))
      OR UPPER(TRIM(codigo)) = UPPER(TRIM('CHT TIPO-SK76')))
    AND deleted_at IS NULL
);

-- CHT-IFR-SK76 → FAP 06 - Habilitacao de Voo por Instrumentos - SK76
UPDATE qualificacoes_historico
SET qualificacao_id = (
  SELECT id FROM qualificacoes_tipos
  WHERE UPPER(TRIM(codigo)) = UPPER(TRIM('FAP 06'))
    AND deleted_at IS NULL
  LIMIT 1
),
qualificacao_codigo = (
  SELECT codigo FROM qualificacoes_tipos
  WHERE UPPER(TRIM(codigo)) = UPPER(TRIM('FAP 06'))
    AND deleted_at IS NULL
  LIMIT 1
),
updated_at = datetime('now')
WHERE qualificacao_id IN (
  SELECT id FROM qualificacoes_tipos
  WHERE UPPER(TRIM(codigo)) = UPPER(TRIM('CHT-IFR-SK76'))
    AND deleted_at IS NULL
);

-- OFEXCRED → FAP 13 - Credenciamento de Examinador - SK76
UPDATE qualificacoes_historico
SET qualificacao_id = (
  SELECT id FROM qualificacoes_tipos
  WHERE UPPER(TRIM(codigo)) = UPPER(TRIM('FAP 13'))
    AND deleted_at IS NULL
  LIMIT 1
),
qualificacao_codigo = (
  SELECT codigo FROM qualificacoes_tipos
  WHERE UPPER(TRIM(codigo)) = UPPER(TRIM('FAP 13'))
    AND deleted_at IS NULL
  LIMIT 1
),
updated_at = datetime('now')
WHERE qualificacao_id IN (
  SELECT id FROM qualificacoes_tipos
  WHERE UPPER(TRIM(codigo)) = UPPER(TRIM('OFEXCRED'))
    AND deleted_at IS NULL
);

-- Etapa 2: Soft-delete dos tipos antigos que não possuem mais registros
UPDATE qualificacoes_tipos
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE (
    UPPER(TRIM(codigo)) = UPPER(TRIM('CHT TIPO -SK76'))
    OR UPPER(TRIM(codigo)) = UPPER(TRIM('CHT TIPO-SK76'))
    OR UPPER(TRIM(codigo)) = UPPER(TRIM('CHT-IFR-SK76'))
    OR UPPER(TRIM(codigo)) = UPPER(TRIM('OFEXCRED'))
  )
  AND deleted_at IS NULL
  AND (
    SELECT COUNT(*) FROM qualificacoes_historico
    WHERE qualificacao_id = qualificacoes_tipos.id
      AND deleted_at IS NULL
  ) = 0;
