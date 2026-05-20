-- =================================================================
-- ATUALIZAÇÃO DE QUALIFICAÇÕES - PARTE 5 (E4, E5, E6, F1, F2)
-- Data: 2025-12-05
-- =================================================================

-- Marcar como deletados os registros existentes
UPDATE qualificacoes_historico 
SET deleted_at = datetime('now')
WHERE deleted_at IS NULL
AND (
  qualificacao_id IN (SELECT id FROM qualificacoes_tipos WHERE codigo IN ('E4', 'E5', 'E6', 'F1', 'F2'))
  OR codigo IN ('E4', 'E5', 'E6', 'F1', 'F2')
);

-- QUALIFICAÇÃO E4 (validade 12 meses)
INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E4', '2025-10-11', date('2025-10-11', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '419.906.257-20' AND qt.codigo = 'E4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E4', '2025-11-19', date('2025-11-19', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '017.058.448-80' AND qt.codigo = 'E4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E4', '2025-10-30', date('2025-10-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '772.105.497-49' AND qt.codigo = 'E4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E4', '2025-11-18', date('2025-11-18', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '112.015.317-48' AND qt.codigo = 'E4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E4', '2025-05-08', date('2025-05-08', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '401.238.047-87' AND qt.codigo = 'E4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E4', '2024-11-19', date('2024-11-19', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '311.120.807-91' AND qt.codigo = 'E4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E4', '2024-11-26', date('2024-11-26', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '563.716.080-53' AND qt.codigo = 'E4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E4', '2024-12-09', date('2024-12-09', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '155.257.297-84' AND qt.codigo = 'E4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E4', '2025-11-07', date('2025-11-07', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '713.920.927-87' AND qt.codigo = 'E4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E4', '2024-12-13', date('2024-12-13', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '145.880.747-92' AND qt.codigo = 'E4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E4', '2025-05-09', date('2025-05-09', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '052.017.507-70' AND qt.codigo = 'E4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E4', '2025-04-25', date('2025-04-25', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '768.506.843-53' AND qt.codigo = 'E4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E4', '2024-12-10', date('2024-12-10', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '052.414.847-36' AND qt.codigo = 'E4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E4', '2025-07-09', date('2025-07-09', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '108.943.047-71' AND qt.codigo = 'E4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

-- QUALIFICAÇÃO E5 (validade 12 meses)
INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E5', '2025-11-30', date('2025-11-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '134.651.428-37' AND qt.codigo = 'E5' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E5', '2025-11-30', date('2025-11-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '419.906.257-20' AND qt.codigo = 'E5' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E5', '2024-12-21', date('2024-12-21', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '052.414.847-36' AND qt.codigo = 'E5' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E5', '2025-11-05', date('2025-11-05', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '387.181.008-80' AND qt.codigo = 'E5' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E5', '2024-12-16', date('2024-12-16', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '899.850.527-49' AND qt.codigo = 'E5' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E5', '2025-01-14', date('2025-01-14', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '017.058.448-80' AND qt.codigo = 'E5' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E5', '2025-11-30', date('2025-11-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '772.105.497-49' AND qt.codigo = 'E5' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E5', '2024-12-28', date('2024-12-28', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '722.443.567-87' AND qt.codigo = 'E5' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E5', '2024-12-31', date('2024-12-31', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '112.015.317-48' AND qt.codigo = 'E5' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E5', '2024-12-22', date('2024-12-22', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '012.598.600-94' AND qt.codigo = 'E5' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E5', '2024-12-04', date('2024-12-04', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '734.990.727-34' AND qt.codigo = 'E5' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E5', '2024-11-22', date('2024-11-22', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '311.120.807-91' AND qt.codigo = 'E5' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E5', '2024-12-10', date('2024-12-10', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '058.412.708-18' AND qt.codigo = 'E5' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E5', '2025-10-28', date('2025-10-28', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '102.896.837-66' AND qt.codigo = 'E5' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E5', '2025-01-03', date('2025-01-03', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '563.716.080-53' AND qt.codigo = 'E5' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E5', '2025-11-30', date('2025-11-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '093.127.887-28' AND qt.codigo = 'E5' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E5', '2025-11-30', date('2025-11-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '663.794.586-20' AND qt.codigo = 'E5' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E5', '2023-12-04', date('2023-12-04', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '939.571.227-91' AND qt.codigo = 'E5' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E5', '2024-12-06', date('2024-12-06', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '155.257.297-84' AND qt.codigo = 'E5' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E5', '2024-12-10', date('2024-12-10', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '713.920.927-87' AND qt.codigo = 'E5' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E5', '2025-01-06', date('2025-01-06', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '401.238.047-87' AND qt.codigo = 'E5' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E5', '2025-04-29', date('2025-04-29', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '145.880.747-92' AND qt.codigo = 'E5' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E5', '2025-04-29', date('2025-04-29', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '052.017.507-70' AND qt.codigo = 'E5' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E5', '2025-04-29', date('2025-04-29', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '768.506.843-53' AND qt.codigo = 'E5' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E5', '2025-04-29', date('2025-04-29', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '083.286.227-42' AND qt.codigo = 'E5' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E5', '2025-07-09', date('2025-07-09', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '108.943.047-71' AND qt.codigo = 'E5' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

-- QUALIFICAÇÃO E6 (validade 12 meses)
INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E6', '2026-01-20', date('2026-01-20', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '311.120.807-91' AND qt.codigo = 'E6' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E6', '2026-01-20', date('2026-01-20', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '155.257.297-84' AND qt.codigo = 'E6' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E6', '2026-02-04', date('2026-02-04', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '145.880.747-92' AND qt.codigo = 'E6' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E6', '2025-05-09', date('2025-05-09', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '052.017.507-70' AND qt.codigo = 'E6' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E6', '2025-09-04', date('2025-09-04', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '768.506.843-53' AND qt.codigo = 'E6' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'E6', '2025-09-04', date('2025-09-04', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '108.943.047-71' AND qt.codigo = 'E6' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

-- QUALIFICAÇÃO F1 (validade 12 meses)
INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'F1', '2025-05-07', date('2025-05-07', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '134.651.428-37' AND qt.codigo = 'F1' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'F1', '2025-08-30', date('2025-08-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '052.414.847-36' AND qt.codigo = 'F1' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'F1', '2025-09-16', date('2025-09-16', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '387.181.008-80' AND qt.codigo = 'F1' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'F1', '2025-07-17', date('2025-07-17', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '899.850.527-49' AND qt.codigo = 'F1' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'F1', '2025-05-11', date('2025-05-11', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '112.015.317-48' AND qt.codigo = 'F1' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'F1', '2025-03-13', date('2025-03-13', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '734.990.727-34' AND qt.codigo = 'F1' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'F1', '2024-12-28', date('2024-12-28', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '058.412.708-18' AND qt.codigo = 'F1' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'F1', '2025-03-31', date('2025-03-31', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '093.127.887-28' AND qt.codigo = 'F1' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'F1', '2025-06-14', date('2025-06-14', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '713.920.927-87' AND qt.codigo = 'F1' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'F1', '2025-05-02', date('2025-05-02', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '083.286.227-42' AND qt.codigo = 'F1' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

-- QUALIFICAÇÃO F2 (validade 12 meses)
INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'F2', '2025-03-16', date('2025-03-16', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '419.906.257-20' AND qt.codigo = 'F2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'F2', '2025-05-03', date('2025-05-03', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '017.058.448-80' AND qt.codigo = 'F2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'F2', '2024-12-13', date('2024-12-13', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '772.105.497-49' AND qt.codigo = 'F2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'F2', '2025-09-15', date('2025-09-15', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '722.443.567-87' AND qt.codigo = 'F2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'F2', '2025-02-10', date('2025-02-10', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '112.015.317-48' AND qt.codigo = 'F2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'F2', '2025-07-04', date('2025-07-04', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '401.238.047-87' AND qt.codigo = 'F2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'F2', '2025-10-08', date('2025-10-08', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '012.598.600-94' AND qt.codigo = 'F2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'F2', '2025-09-15', date('2025-09-15', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '311.120.807-91' AND qt.codigo = 'F2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'F2', '2025-08-17', date('2025-08-17', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '102.896.837-66' AND qt.codigo = 'F2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'F2', '2025-08-31', date('2025-08-31', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '563.716.080-53' AND qt.codigo = 'F2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'F2', '2024-12-22', date('2024-12-22', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '663.794.586-20' AND qt.codigo = 'F2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'F2', '2024-12-30', date('2024-12-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '155.257.297-84' AND qt.codigo = 'F2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'F2', '2025-05-03', date('2025-05-03', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '713.920.927-87' AND qt.codigo = 'F2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'F2', '2024-12-08', date('2024-12-08', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '145.880.747-92' AND qt.codigo = 'F2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'F2', '2025-02-03', date('2025-02-03', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '052.017.507-70' AND qt.codigo = 'F2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'F2', '2025-04-22', date('2025-04-22', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '768.506.843-53' AND qt.codigo = 'F2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'F2', '2025-07-04', date('2025-07-04', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '108.943.047-71' AND qt.codigo = 'F2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;
