-- =================================================================
-- ATUALIZAÇÃO DE QUALIFICAÇÕES - PARTE 3 (D2, D3, D4)
-- Data: 2025-12-05
-- =================================================================

-- Marcar como deletados os registros existentes
UPDATE qualificacoes_historico 
SET deleted_at = datetime('now')
WHERE deleted_at IS NULL
AND (
  qualificacao_id IN (SELECT id FROM qualificacoes_tipos WHERE codigo IN ('D2', 'D3', 'D4'))
  OR codigo IN ('D2', 'D3', 'D4')
);

-- QUALIFICAÇÃO D2 (validade 36 meses)
INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D2', '2023-11-26', date('2023-11-26', '+36 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '134.651.428-37' AND qt.codigo = 'D2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D2', '2023-11-29', date('2023-11-29', '+36 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '419.906.257-20' AND qt.codigo = 'D2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D2', '2023-11-26', date('2023-11-26', '+36 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '052.414.847-36' AND qt.codigo = 'D2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D2', '2023-11-04', date('2023-11-04', '+36 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '387.181.008-80' AND qt.codigo = 'D2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D2', '2023-12-16', date('2023-12-16', '+36 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '899.850.527-49' AND qt.codigo = 'D2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D2', '2023-06-13', date('2023-06-13', '+36 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '017.058.448-80' AND qt.codigo = 'D2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D2', '2023-07-01', date('2023-07-01', '+36 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '772.105.497-49' AND qt.codigo = 'D2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D2', '2022-09-30', date('2022-09-30', '+36 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '722.443.567-87' AND qt.codigo = 'D2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D2', '2023-11-26', date('2023-11-26', '+36 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '112.015.317-48' AND qt.codigo = 'D2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D2', '2022-12-15', date('2022-12-15', '+36 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '401.238.047-87' AND qt.codigo = 'D2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D2', '2023-09-24', date('2023-09-24', '+36 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '012.598.600-94' AND qt.codigo = 'D2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D2', '2022-11-28', date('2022-11-28', '+36 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '734.990.727-34' AND qt.codigo = 'D2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D2', '2023-12-16', date('2023-12-16', '+36 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '311.120.807-91' AND qt.codigo = 'D2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D2', '2024-02-25', date('2024-02-25', '+36 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '058.412.708-18' AND qt.codigo = 'D2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D2', '2023-09-14', date('2023-09-14', '+36 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '102.896.837-66' AND qt.codigo = 'D2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D2', '2024-08-22', date('2024-08-22', '+36 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '563.716.080-53' AND qt.codigo = 'D2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D2', '2023-12-10', date('2023-12-10', '+36 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '093.127.887-28' AND qt.codigo = 'D2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D2', '2023-05-29', date('2023-05-29', '+36 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '663.794.586-20' AND qt.codigo = 'D2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D2', '2021-10-25', date('2021-10-25', '+36 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '939.571.227-91' AND qt.codigo = 'D2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D2', '2024-03-13', date('2024-03-13', '+36 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '155.257.297-84' AND qt.codigo = 'D2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D2', '2023-11-19', date('2023-11-19', '+36 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '713.920.927-87' AND qt.codigo = 'D2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D2', '2024-01-13', date('2024-01-13', '+36 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '145.880.747-92' AND qt.codigo = 'D2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D2', '2023-05-08', date('2023-05-08', '+36 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '052.017.507-70' AND qt.codigo = 'D2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D2', '2024-06-20', date('2024-06-20', '+36 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '768.506.843-53' AND qt.codigo = 'D2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D2', '2022-09-17', date('2022-09-17', '+36 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '083.286.227-42' AND qt.codigo = 'D2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D2', '2024-06-23', date('2024-06-23', '+36 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '108.943.047-71' AND qt.codigo = 'D2' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

-- QUALIFICAÇÃO D3 (validade 12 meses)
INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D3', '2025-03-15', date('2025-03-15', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '134.651.428-37' AND qt.codigo = 'D3' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D3', '2025-03-15', date('2025-03-15', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '419.906.257-20' AND qt.codigo = 'D3' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D3', '2025-03-15', date('2025-03-15', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '052.414.847-36' AND qt.codigo = 'D3' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D3', '2025-03-15', date('2025-03-15', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '387.181.008-80' AND qt.codigo = 'D3' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D3', '2025-03-15', date('2025-03-15', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '899.850.527-49' AND qt.codigo = 'D3' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D3', '2025-04-16', date('2025-04-16', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '017.058.448-80' AND qt.codigo = 'D3' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D3', '2025-03-15', date('2025-03-15', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '772.105.497-49' AND qt.codigo = 'D3' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D3', '2025-03-15', date('2025-03-15', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '722.443.567-87' AND qt.codigo = 'D3' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D3', '2025-03-15', date('2025-03-15', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '112.015.317-48' AND qt.codigo = 'D3' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D3', '2025-04-16', date('2025-04-16', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '401.238.047-87' AND qt.codigo = 'D3' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D3', '2025-03-15', date('2025-03-15', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '012.598.600-94' AND qt.codigo = 'D3' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D3', '2025-03-15', date('2025-03-15', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '734.990.727-34' AND qt.codigo = 'D3' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D3', '2025-03-15', date('2025-03-15', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '311.120.807-91' AND qt.codigo = 'D3' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D3', '2025-03-14', date('2025-03-14', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '058.412.708-18' AND qt.codigo = 'D3' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D3', '2025-03-15', date('2025-03-15', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '102.896.837-66' AND qt.codigo = 'D3' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D3', '2025-04-16', date('2025-04-16', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '563.716.080-53' AND qt.codigo = 'D3' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D3', '2025-03-15', date('2025-03-15', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '093.127.887-28' AND qt.codigo = 'D3' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D3', '2025-03-15', date('2025-03-15', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '663.794.586-20' AND qt.codigo = 'D3' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D3', '2024-05-14', date('2024-05-14', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '939.571.227-91' AND qt.codigo = 'D3' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D3', '2025-03-15', date('2025-03-15', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '155.257.297-84' AND qt.codigo = 'D3' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D3', '2025-03-15', date('2025-03-15', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '713.920.927-87' AND qt.codigo = 'D3' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D3', '2025-01-09', date('2025-01-09', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '145.880.747-92' AND qt.codigo = 'D3' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D3', '2025-04-16', date('2025-04-16', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '052.017.507-70' AND qt.codigo = 'D3' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D3', '2025-05-04', date('2025-05-04', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '768.506.843-53' AND qt.codigo = 'D3' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D3', '2025-09-15', date('2025-09-15', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '083.286.227-42' AND qt.codigo = 'D3' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D3', '2025-07-15', date('2025-07-15', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '108.943.047-71' AND qt.codigo = 'D3' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

-- QUALIFICAÇÃO D4 (validade 24 meses)
INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D4', '2025-09-22', date('2025-09-22', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '134.651.428-37' AND qt.codigo = 'D4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D4', '2025-02-14', date('2025-02-14', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '419.906.257-20' AND qt.codigo = 'D4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D4', '2025-02-14', date('2025-02-14', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '052.414.847-36' AND qt.codigo = 'D4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D4', '2024-11-02', date('2024-11-02', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '387.181.008-80' AND qt.codigo = 'D4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D4', '2025-09-22', date('2025-09-22', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '899.850.527-49' AND qt.codigo = 'D4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D4', '2025-05-01', date('2025-05-01', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '017.058.448-80' AND qt.codigo = 'D4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D4', '2025-07-19', date('2025-07-19', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '772.105.497-49' AND qt.codigo = 'D4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D4', '2025-09-22', date('2025-09-22', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '722.443.567-87' AND qt.codigo = 'D4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D4', '2024-11-02', date('2024-11-02', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '112.015.317-48' AND qt.codigo = 'D4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D4', '2025-05-01', date('2025-05-01', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '401.238.047-87' AND qt.codigo = 'D4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D4', '2024-09-29', date('2024-09-29', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '012.598.600-94' AND qt.codigo = 'D4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D4', '2025-09-22', date('2025-09-22', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '734.990.727-34' AND qt.codigo = 'D4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D4', '2024-09-22', date('2024-09-22', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '311.120.807-91' AND qt.codigo = 'D4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D4', '2025-02-14', date('2025-02-14', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '058.412.708-18' AND qt.codigo = 'D4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D4', '2024-09-29', date('2024-09-29', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '102.896.837-66' AND qt.codigo = 'D4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D4', '2025-07-19', date('2025-07-19', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '563.716.080-53' AND qt.codigo = 'D4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D4', '2025-02-14', date('2025-02-14', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '093.127.887-28' AND qt.codigo = 'D4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D4', '2025-07-19', date('2025-07-19', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '663.794.586-20' AND qt.codigo = 'D4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D4', '2024-03-04', date('2024-03-04', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '939.571.227-91' AND qt.codigo = 'D4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D4', '2025-02-14', date('2025-02-14', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '155.257.297-84' AND qt.codigo = 'D4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D4', '2024-09-22', date('2024-09-22', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '713.920.927-87' AND qt.codigo = 'D4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D4', '2024-01-13', date('2024-01-13', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '145.880.747-92' AND qt.codigo = 'D4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D4', '2023-12-16', date('2023-12-16', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '052.017.507-70' AND qt.codigo = 'D4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D4', '2025-05-01', date('2025-05-01', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '768.506.843-53' AND qt.codigo = 'D4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D4', '2025-03-16', date('2025-03-16', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '083.286.227-42' AND qt.codigo = 'D4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'D4', '2025-09-22', date('2025-09-22', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '108.943.047-71' AND qt.codigo = 'D4' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;
