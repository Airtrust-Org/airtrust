-- Saneia historico certificado da empresa 6 com base no catalogo atual.
-- Escopo: apenas registros que ja possuem numero_certificado ou certificado_arquivo_id.
-- Ajusta carga_horaria e data_vencimento quando divergirem da regra atual do modelo.

WITH base AS (
  SELECT
    qh.id,
    qh.tipo_treinamento,
    qh.data_conclusao,
    qh.data_vencimento,
    qh.carga_horaria AS carga_historico,
    qt.carga_horaria AS carga_padrao,
    qt.carga_horaria_inicial,
    qt.carga_horaria_recorrente,
    qt.validade AS validade_modelo,
    COALESCE(qt.vencimento_fim_mes, 0) AS vencimento_fim_mes
  FROM qualificacoes_historico qh
  INNER JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
  WHERE qh.empresa_id = 6
    AND qh.deleted_at IS NULL
    AND (qh.numero_certificado IS NOT NULL OR qh.certificado_arquivo_id IS NOT NULL)
),
calc AS (
  SELECT
    id,
    CASE
      WHEN UPPER(COALESCE(tipo_treinamento, 'RECORRENTE')) = 'INICIAL'
        THEN COALESCE(carga_horaria_inicial, carga_padrao, carga_historico)
      WHEN UPPER(COALESCE(tipo_treinamento, 'RECORRENTE')) = 'RECORRENTE'
        THEN COALESCE(carga_horaria_recorrente, carga_padrao, carga_horaria_inicial, carga_historico)
      ELSE COALESCE(carga_padrao, carga_horaria_recorrente, carga_horaria_inicial, carga_historico)
    END AS carga_esperada,
    CASE
      WHEN data_conclusao IS NOT NULL AND validade_modelo IS NOT NULL AND validade_modelo > 0 THEN
        CASE
          WHEN vencimento_fim_mes = 1
            THEN date(data_conclusao, 'start of month', printf('+%d months', validade_modelo + 1), '-1 day')
          ELSE date(data_conclusao, printf('+%d months', validade_modelo))
        END
      ELSE NULL
    END AS vencimento_esperado
  FROM base
)
UPDATE qualificacoes_historico
SET
  carga_horaria = CASE
    WHEN (
      SELECT carga_esperada IS NOT NULL
      FROM calc
      WHERE calc.id = qualificacoes_historico.id
    ) THEN (
      SELECT carga_esperada
      FROM calc
      WHERE calc.id = qualificacoes_historico.id
    )
    ELSE carga_horaria
  END,
  data_vencimento = CASE
    WHEN (
      SELECT vencimento_esperado IS NOT NULL
      FROM calc
      WHERE calc.id = qualificacoes_historico.id
    ) THEN (
      SELECT vencimento_esperado
      FROM calc
      WHERE calc.id = qualificacoes_historico.id
    )
    ELSE data_vencimento
  END,
  updated_at = datetime('now')
WHERE id IN (
  SELECT id
  FROM calc
  WHERE (carga_esperada IS NOT NULL)
     OR (vencimento_esperado IS NOT NULL)
);