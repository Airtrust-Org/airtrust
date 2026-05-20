-- Migration 0295: Corrigir sessoes_checks com tipos deletados + novos modelos de sessão
--
-- PROBLEMA 1: sessoes_checks ainda apontam para qualificacoes_tipos soft-deleted
-- (IDs 31,32,65,68 foram consolidados em 0294 mas sessoes_checks não foi atualizado)
-- SOLUÇÃO: Remapear para os novos tipos equivalentes (IDs 76-84)
--
-- PROBLEMA 2: FAP07 e FAP13 precisam gerar fichas especiais com "Modelo de Sessão"
-- específico para o instrutor sendo avaliado.
-- SOLUÇÃO: Criar dois novos modelos_sessao.

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 1: Remapear sessoes_checks com tipos deletados → novos tipos equivalentes
-- ─────────────────────────────────────────────────────────────────────────────

-- ID 31 = _DEL_FAP05.2-139 → ID 77 = FAP05.2-139
UPDATE sessoes_checks
SET qualificacao_tipo_id = 77,
    updated_at = datetime('now')
WHERE qualificacao_tipo_id = 31
  AND deleted_at IS NULL;

-- ID 32 = _DEL_FAP06-139 → ID 79 = FAP06-139
UPDATE sessoes_checks
SET qualificacao_tipo_id = 79,
    updated_at = datetime('now')
WHERE qualificacao_tipo_id = 32
  AND deleted_at IS NULL;

-- ID 65 = _DEL_FAP05.2-76 → ID 76 = FAP05.2-76
UPDATE sessoes_checks
SET qualificacao_tipo_id = 76,
    updated_at = datetime('now')
WHERE qualificacao_tipo_id = 65
  AND deleted_at IS NULL;

-- ID 68 = _DEL_FAP06-76 → ID 78 = FAP06-76
UPDATE sessoes_checks
SET qualificacao_tipo_id = 78,
    updated_at = datetime('now')
WHERE qualificacao_tipo_id = 68
  AND deleted_at IS NULL;

-- Remapeamento genérico para quaisquer outros tipos deletados que ainda apareçam
-- (cobertura de segurança para IDs não listados acima, caso existam)
-- IDs 35,36,39,54,55,56,66,67,69,70,71,72 → caso apareçam, remapear por padrão de nome

-- 35 = _DEL_LPC-139 (LPC era FAP05.2 AW139) → 77 = FAP05.2-139
UPDATE sessoes_checks
SET qualificacao_tipo_id = 77,
    updated_at = datetime('now')
WHERE qualificacao_tipo_id = 35
  AND deleted_at IS NULL;

-- 36 = _DEL_OPC-139 (OPC era FAP05.2 AW139) → 77 = FAP05.2-139
UPDATE sessoes_checks
SET qualificacao_tipo_id = 77,
    updated_at = datetime('now')
WHERE qualificacao_tipo_id = 36
  AND deleted_at IS NULL;

-- 39 = _DEL_FAP14-139 → 84 = FAP14
UPDATE sessoes_checks
SET qualificacao_tipo_id = 84,
    updated_at = datetime('now')
WHERE qualificacao_tipo_id = 39
  AND deleted_at IS NULL;

-- 54 = _DEL_FAP06-SEM-139 → 79 = FAP06-139
UPDATE sessoes_checks
SET qualificacao_tipo_id = 79,
    updated_at = datetime('now')
WHERE qualificacao_tipo_id = 54
  AND deleted_at IS NULL;

-- 55 = _DEL_SAE-FAP06-139 → 79 = FAP06-139
UPDATE sessoes_checks
SET qualificacao_tipo_id = 79,
    updated_at = datetime('now')
WHERE qualificacao_tipo_id = 55
  AND deleted_at IS NULL;

-- 56 = _DEL_SAE-FAP14-139 → 84 = FAP14
UPDATE sessoes_checks
SET qualificacao_tipo_id = 84,
    updated_at = datetime('now')
WHERE qualificacao_tipo_id = 56
  AND deleted_at IS NULL;

-- 66 = _DEL_OPC-76 (OPC era FAP05.2 SK76) → 76 = FAP05.2-76
UPDATE sessoes_checks
SET qualificacao_tipo_id = 76,
    updated_at = datetime('now')
WHERE qualificacao_tipo_id = 66
  AND deleted_at IS NULL;

-- 67 = _DEL_FAP06-SEM-76 → 78 = FAP06-76
UPDATE sessoes_checks
SET qualificacao_tipo_id = 78,
    updated_at = datetime('now')
WHERE qualificacao_tipo_id = 67
  AND deleted_at IS NULL;

-- 69 = _DEL_FAP14-76 → 84 = FAP14
UPDATE sessoes_checks
SET qualificacao_tipo_id = 84,
    updated_at = datetime('now')
WHERE qualificacao_tipo_id = 69
  AND deleted_at IS NULL;

-- 70 = _DEL_LPC-76 → 76 = FAP05.2-76
UPDATE sessoes_checks
SET qualificacao_tipo_id = 76,
    updated_at = datetime('now')
WHERE qualificacao_tipo_id = 70
  AND deleted_at IS NULL;

-- 71 = _DEL_SAE-FAP06-76 → 78 = FAP06-76
UPDATE sessoes_checks
SET qualificacao_tipo_id = 78,
    updated_at = datetime('now')
WHERE qualificacao_tipo_id = 71
  AND deleted_at IS NULL;

-- 72 = _DEL_SAE-FAP14-76 → 84 = FAP14
UPDATE sessoes_checks
SET qualificacao_tipo_id = 84,
    updated_at = datetime('now')
WHERE qualificacao_tipo_id = 72
  AND deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 2: Criar modelos de sessão para fichas especiais FAP07 e FAP13
-- ─────────────────────────────────────────────────────────────────────────────

-- Modelo para FAP07: ficha do instrutor de voo sendo avaliado
INSERT OR IGNORE INTO modelos_sessao (codigo, nome, tipo, descricao, ativo, created_at, updated_at)
VALUES (
  'CHECK-TRIN-INSTRUTOR',
  'TREINAMENTO DE INSTRUTOR DE VOO',
  'RECORRENTE',
  'Ficha gerada automaticamente quando FAP 07 é vinculado a uma sessão de check. O avaliado é o instrutor que conduz a sessão.',
  1,
  datetime('now'),
  datetime('now')
);

-- Modelo para FAP13: ficha do examinador sendo credenciado
INSERT OR IGNORE INTO modelos_sessao (codigo, nome, tipo, descricao, ativo, created_at, updated_at)
VALUES (
  'CHECK-CRED-EXAMINADOR',
  'CREDENCIAMENTO DE EXAMINADOR',
  'RECORRENTE',
  'Ficha gerada automaticamente quando FAP 13 é vinculado a uma sessão de check. O avaliado é o instrutor que conduz a sessão.',
  1,
  datetime('now'),
  datetime('now')
);
