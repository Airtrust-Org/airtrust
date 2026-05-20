-- =================================================================
-- 0294_consolidar_qualificacoes_check.sql
-- Consolida qualificações CHECK duplicadas em tipos únicos
-- Backup restaurável: backups/airtrust_backup_20260325_195839.sql
-- Backup interno:     bkp_qual_historico_20260325 / bkp_qual_tipos_20260325
-- =================================================================

-- ─── STEP 1: Backup interno (segunda camada de segurança) ────────
CREATE TABLE IF NOT EXISTS bkp_qual_historico_20260325 AS SELECT * FROM qualificacoes_historico;
CREATE TABLE IF NOT EXISTS bkp_qual_tipos_20260325    AS SELECT * FROM qualificacoes_tipos;

-- =================================================================
-- STEP 2: Criar novos tipos consolidados
-- Todos categoria CHECK, empresa_id=6, codigo NULL
-- =================================================================
INSERT INTO qualificacoes_tipos (nome, codigo, categoria, validade, ativo, empresa_id, created_at, updated_at, is_check) VALUES
  ('FAP 05.2 - Habilitacao de Tipo Helicoptero - SK76',    'FAP052-TIPO-SK76',  'CHECK', 12, 1, 6, datetime('now'), datetime('now'), 1),
  ('FAP 05.2 - Habilitacao de Tipo Helicoptero - AW139',   'FAP052-TIPO-AW139', 'CHECK', 12, 1, 6, datetime('now'), datetime('now'), 1),
  ('FAP 06 - Habilitacao de Voo por Instrumentos - SK76',  'FAP06-IFR-SK76',    'CHECK',  6, 1, 6, datetime('now'), datetime('now'), 1),
  ('FAP 06 - Habilitacao de Voo por Instrumentos - AW139', 'FAP06-IFR-AW139',   'CHECK',  6, 1, 6, datetime('now'), datetime('now'), 1),
  ('FAP 07 - Instrutor de Voo - SK76',                     'FAP07-INST-SK76',   'CHECK', 12, 1, 6, datetime('now'), datetime('now'), 1),
  ('FAP 07 - Instrutor de Voo - AW139',                    'FAP07-INST-AW139',  'CHECK', 12, 1, 6, datetime('now'), datetime('now'), 1),
  ('FAP 13 - Credenciamento de Examinador - SK76',         'FAP13-CRED-SK76',   'CHECK', 12, 1, 6, datetime('now'), datetime('now'), 1),
  ('FAP 13 - Credenciamento de Examinador - AW139',        'FAP13-CRED-AW139',  'CHECK', 12, 1, 6, datetime('now'), datetime('now'), 1),
  ('FAP 14 - Exame em Rota (Operadores RBAC 121 e 135)',   'FAP14-ROTA',        'CHECK',  6, 1, 6, datetime('now'), datetime('now'), 1);

-- =================================================================
-- STEP 3: Consolidar FAP05.2 AW139
-- Fontes: 31=FAP05.2-139 (10 reg), 35=LPC-139 (0 reg)
-- Destino: 'FAP 05.2 - Habilitacao de Tipo Helicoptero - AW139'
-- =================================================================

-- 3a. Transferir certificado para o vencedor se ele não tiver
UPDATE qualificacoes_historico
SET certificado_arquivo_id = (
  SELECT qh2.certificado_arquivo_id
  FROM qualificacoes_historico qh2
  WHERE qh2.funcionario_id = qualificacoes_historico.funcionario_id
    AND qh2.qualificacao_id IN (31, 35)
    AND qh2.deleted_at IS NULL
    AND qh2.id != qualificacoes_historico.id
    AND qh2.certificado_arquivo_id IS NOT NULL
  ORDER BY qh2.data_conclusao DESC, qh2.id DESC
  LIMIT 1
)
WHERE qualificacoes_historico.qualificacao_id IN (31, 35)
  AND qualificacoes_historico.deleted_at IS NULL
  AND qualificacoes_historico.certificado_arquivo_id IS NULL
  AND qualificacoes_historico.id IN (
    SELECT MAX(qh2.id)
    FROM qualificacoes_historico qh2
    WHERE qh2.qualificacao_id IN (31, 35) AND qh2.deleted_at IS NULL
      AND qh2.data_conclusao = (
        SELECT MAX(qh3.data_conclusao) FROM qualificacoes_historico qh3
        WHERE qh3.funcionario_id = qh2.funcionario_id
          AND qh3.qualificacao_id IN (31, 35) AND qh3.deleted_at IS NULL
      )
    GROUP BY qh2.funcionario_id
  );

-- 3b. Soft-delete perdedores
UPDATE qualificacoes_historico SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE qualificacao_id IN (31, 35) AND deleted_at IS NULL
  AND id NOT IN (
    SELECT MAX(qh2.id)
    FROM qualificacoes_historico qh2
    WHERE qh2.qualificacao_id IN (31, 35) AND qh2.deleted_at IS NULL
      AND qh2.data_conclusao = (
        SELECT MAX(qh3.data_conclusao) FROM qualificacoes_historico qh3
        WHERE qh3.funcionario_id = qh2.funcionario_id
          AND qh3.qualificacao_id IN (31, 35) AND qh3.deleted_at IS NULL
      )
    GROUP BY qh2.funcionario_id
  );

-- 3c. Atualizar vencedores para novo tipo
UPDATE qualificacoes_historico
SET qualificacao_id     = (SELECT id FROM qualificacoes_tipos WHERE nome = 'FAP 05.2 - Habilitacao de Tipo Helicoptero - AW139' AND empresa_id = 6 AND deleted_at IS NULL LIMIT 1),
    validade_meses      = 12,
    tipo                = NULL,
    qualificacao_codigo = NULL,
    tipo_codigo         = NULL,
    categoria           = NULL,
    updated_at          = datetime('now')
WHERE qualificacao_id IN (31, 35) AND deleted_at IS NULL;

-- =================================================================
-- STEP 4: Consolidar FAP05.2 SK76
-- Fontes: 65=FAP05.2-76 (15 reg), 70=LPC-76 (0 reg)
-- =================================================================

-- 4a. Transferir certificado
UPDATE qualificacoes_historico
SET certificado_arquivo_id = (
  SELECT qh2.certificado_arquivo_id
  FROM qualificacoes_historico qh2
  WHERE qh2.funcionario_id = qualificacoes_historico.funcionario_id
    AND qh2.qualificacao_id IN (65, 70)
    AND qh2.deleted_at IS NULL
    AND qh2.id != qualificacoes_historico.id
    AND qh2.certificado_arquivo_id IS NOT NULL
  ORDER BY qh2.data_conclusao DESC, qh2.id DESC
  LIMIT 1
)
WHERE qualificacoes_historico.qualificacao_id IN (65, 70)
  AND qualificacoes_historico.deleted_at IS NULL
  AND qualificacoes_historico.certificado_arquivo_id IS NULL
  AND qualificacoes_historico.id IN (
    SELECT MAX(qh2.id)
    FROM qualificacoes_historico qh2
    WHERE qh2.qualificacao_id IN (65, 70) AND qh2.deleted_at IS NULL
      AND qh2.data_conclusao = (
        SELECT MAX(qh3.data_conclusao) FROM qualificacoes_historico qh3
        WHERE qh3.funcionario_id = qh2.funcionario_id
          AND qh3.qualificacao_id IN (65, 70) AND qh3.deleted_at IS NULL
      )
    GROUP BY qh2.funcionario_id
  );

-- 4b. Soft-delete perdedores
UPDATE qualificacoes_historico SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE qualificacao_id IN (65, 70) AND deleted_at IS NULL
  AND id NOT IN (
    SELECT MAX(qh2.id)
    FROM qualificacoes_historico qh2
    WHERE qh2.qualificacao_id IN (65, 70) AND qh2.deleted_at IS NULL
      AND qh2.data_conclusao = (
        SELECT MAX(qh3.data_conclusao) FROM qualificacoes_historico qh3
        WHERE qh3.funcionario_id = qh2.funcionario_id
          AND qh3.qualificacao_id IN (65, 70) AND qh3.deleted_at IS NULL
      )
    GROUP BY qh2.funcionario_id
  );

-- 4c. Atualizar vencedores
UPDATE qualificacoes_historico
SET qualificacao_id     = (SELECT id FROM qualificacoes_tipos WHERE nome = 'FAP 05.2 - Habilitacao de Tipo Helicoptero - SK76' AND empresa_id = 6 AND deleted_at IS NULL LIMIT 1),
    validade_meses      = 12,
    tipo                = NULL,
    qualificacao_codigo = NULL,
    tipo_codigo         = NULL,
    categoria           = NULL,
    updated_at          = datetime('now')
WHERE qualificacao_id IN (65, 70) AND deleted_at IS NULL;

-- =================================================================
-- STEP 5: Consolidar FAP06 AW139
-- Fontes: 32=FAP06-139 (10 reg), 54=FAP06-SEM-139 (6 reg)
-- =================================================================

-- 5a. Transferir certificado
UPDATE qualificacoes_historico
SET certificado_arquivo_id = (
  SELECT qh2.certificado_arquivo_id
  FROM qualificacoes_historico qh2
  WHERE qh2.funcionario_id = qualificacoes_historico.funcionario_id
    AND qh2.qualificacao_id IN (32, 54)
    AND qh2.deleted_at IS NULL
    AND qh2.id != qualificacoes_historico.id
    AND qh2.certificado_arquivo_id IS NOT NULL
  ORDER BY qh2.data_conclusao DESC, qh2.id DESC
  LIMIT 1
)
WHERE qualificacoes_historico.qualificacao_id IN (32, 54)
  AND qualificacoes_historico.deleted_at IS NULL
  AND qualificacoes_historico.certificado_arquivo_id IS NULL
  AND qualificacoes_historico.id IN (
    SELECT MAX(qh2.id)
    FROM qualificacoes_historico qh2
    WHERE qh2.qualificacao_id IN (32, 54) AND qh2.deleted_at IS NULL
      AND qh2.data_conclusao = (
        SELECT MAX(qh3.data_conclusao) FROM qualificacoes_historico qh3
        WHERE qh3.funcionario_id = qh2.funcionario_id
          AND qh3.qualificacao_id IN (32, 54) AND qh3.deleted_at IS NULL
      )
    GROUP BY qh2.funcionario_id
  );

-- 5b. Soft-delete perdedores
UPDATE qualificacoes_historico SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE qualificacao_id IN (32, 54) AND deleted_at IS NULL
  AND id NOT IN (
    SELECT MAX(qh2.id)
    FROM qualificacoes_historico qh2
    WHERE qh2.qualificacao_id IN (32, 54) AND qh2.deleted_at IS NULL
      AND qh2.data_conclusao = (
        SELECT MAX(qh3.data_conclusao) FROM qualificacoes_historico qh3
        WHERE qh3.funcionario_id = qh2.funcionario_id
          AND qh3.qualificacao_id IN (32, 54) AND qh3.deleted_at IS NULL
      )
    GROUP BY qh2.funcionario_id
  );

-- 5c. Atualizar vencedores
UPDATE qualificacoes_historico
SET qualificacao_id     = (SELECT id FROM qualificacoes_tipos WHERE nome = 'FAP 06 - Habilitacao de Voo por Instrumentos - AW139' AND empresa_id = 6 AND deleted_at IS NULL LIMIT 1),
    validade_meses      = 6,
    tipo                = NULL,
    qualificacao_codigo = NULL,
    tipo_codigo         = NULL,
    categoria           = NULL,
    updated_at          = datetime('now')
WHERE qualificacao_id IN (32, 54) AND deleted_at IS NULL;

-- =================================================================
-- STEP 6: Consolidar FAP06 SK76
-- Fontes: 68=FAP06-76 (13 reg), 67=FAP06-SEM-76 (8 reg)
-- =================================================================

-- 6a. Transferir certificado
UPDATE qualificacoes_historico
SET certificado_arquivo_id = (
  SELECT qh2.certificado_arquivo_id
  FROM qualificacoes_historico qh2
  WHERE qh2.funcionario_id = qualificacoes_historico.funcionario_id
    AND qh2.qualificacao_id IN (68, 67)
    AND qh2.deleted_at IS NULL
    AND qh2.id != qualificacoes_historico.id
    AND qh2.certificado_arquivo_id IS NOT NULL
  ORDER BY qh2.data_conclusao DESC, qh2.id DESC
  LIMIT 1
)
WHERE qualificacoes_historico.qualificacao_id IN (68, 67)
  AND qualificacoes_historico.deleted_at IS NULL
  AND qualificacoes_historico.certificado_arquivo_id IS NULL
  AND qualificacoes_historico.id IN (
    SELECT MAX(qh2.id)
    FROM qualificacoes_historico qh2
    WHERE qh2.qualificacao_id IN (68, 67) AND qh2.deleted_at IS NULL
      AND qh2.data_conclusao = (
        SELECT MAX(qh3.data_conclusao) FROM qualificacoes_historico qh3
        WHERE qh3.funcionario_id = qh2.funcionario_id
          AND qh3.qualificacao_id IN (68, 67) AND qh3.deleted_at IS NULL
      )
    GROUP BY qh2.funcionario_id
  );

-- 6b. Soft-delete perdedores
UPDATE qualificacoes_historico SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE qualificacao_id IN (68, 67) AND deleted_at IS NULL
  AND id NOT IN (
    SELECT MAX(qh2.id)
    FROM qualificacoes_historico qh2
    WHERE qh2.qualificacao_id IN (68, 67) AND qh2.deleted_at IS NULL
      AND qh2.data_conclusao = (
        SELECT MAX(qh3.data_conclusao) FROM qualificacoes_historico qh3
        WHERE qh3.funcionario_id = qh2.funcionario_id
          AND qh3.qualificacao_id IN (68, 67) AND qh3.deleted_at IS NULL
      )
    GROUP BY qh2.funcionario_id
  );

-- 6c. Atualizar vencedores
UPDATE qualificacoes_historico
SET qualificacao_id     = (SELECT id FROM qualificacoes_tipos WHERE nome = 'FAP 06 - Habilitacao de Voo por Instrumentos - SK76' AND empresa_id = 6 AND deleted_at IS NULL LIMIT 1),
    validade_meses      = 6,
    tipo                = NULL,
    qualificacao_codigo = NULL,
    tipo_codigo         = NULL,
    categoria           = NULL,
    updated_at          = datetime('now')
WHERE qualificacao_id IN (68, 67) AND deleted_at IS NULL;

-- =================================================================
-- STEP 7: Consolidar FAP14 (único para todas aeronaves)
-- Fontes: 39=FAP14-139 (10), 69=FAP14-76 (10), 36=OPC-139 (3), 66=OPC-76 (1)
-- =================================================================

-- 7a. Transferir certificado
UPDATE qualificacoes_historico
SET certificado_arquivo_id = (
  SELECT qh2.certificado_arquivo_id
  FROM qualificacoes_historico qh2
  WHERE qh2.funcionario_id = qualificacoes_historico.funcionario_id
    AND qh2.qualificacao_id IN (39, 69, 36, 66)
    AND qh2.deleted_at IS NULL
    AND qh2.id != qualificacoes_historico.id
    AND qh2.certificado_arquivo_id IS NOT NULL
  ORDER BY qh2.data_conclusao DESC, qh2.id DESC
  LIMIT 1
)
WHERE qualificacoes_historico.qualificacao_id IN (39, 69, 36, 66)
  AND qualificacoes_historico.deleted_at IS NULL
  AND qualificacoes_historico.certificado_arquivo_id IS NULL
  AND qualificacoes_historico.id IN (
    SELECT MAX(qh2.id)
    FROM qualificacoes_historico qh2
    WHERE qh2.qualificacao_id IN (39, 69, 36, 66) AND qh2.deleted_at IS NULL
      AND qh2.data_conclusao = (
        SELECT MAX(qh3.data_conclusao) FROM qualificacoes_historico qh3
        WHERE qh3.funcionario_id = qh2.funcionario_id
          AND qh3.qualificacao_id IN (39, 69, 36, 66) AND qh3.deleted_at IS NULL
      )
    GROUP BY qh2.funcionario_id
  );

-- 7b. Soft-delete perdedores
UPDATE qualificacoes_historico SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE qualificacao_id IN (39, 69, 36, 66) AND deleted_at IS NULL
  AND id NOT IN (
    SELECT MAX(qh2.id)
    FROM qualificacoes_historico qh2
    WHERE qh2.qualificacao_id IN (39, 69, 36, 66) AND qh2.deleted_at IS NULL
      AND qh2.data_conclusao = (
        SELECT MAX(qh3.data_conclusao) FROM qualificacoes_historico qh3
        WHERE qh3.funcionario_id = qh2.funcionario_id
          AND qh3.qualificacao_id IN (39, 69, 36, 66) AND qh3.deleted_at IS NULL
      )
    GROUP BY qh2.funcionario_id
  );

-- 7c. Atualizar vencedores
UPDATE qualificacoes_historico
SET qualificacao_id     = (SELECT id FROM qualificacoes_tipos WHERE nome = 'FAP 14 - Exame em Rota (Operadores RBAC 121 e 135)' AND empresa_id = 6 AND deleted_at IS NULL LIMIT 1),
    validade_meses      = 6,
    tipo                = NULL,
    qualificacao_codigo = NULL,
    tipo_codigo         = NULL,
    categoria           = NULL,
    updated_at          = datetime('now')
WHERE qualificacao_id IN (39, 69, 36, 66) AND deleted_at IS NULL;

-- =================================================================
-- STEP 8: Soft-delete todos os tipos antigos (16 tipos)
-- ids: 31,32,35,36,39,54,55,56,65,66,67,68,69,70,71,72
-- =================================================================
UPDATE qualificacoes_tipos
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE id IN (31, 32, 35, 36, 39, 54, 55, 56, 65, 66, 67, 68, 69, 70, 71, 72)
  AND deleted_at IS NULL;
