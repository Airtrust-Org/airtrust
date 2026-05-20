-- =================================================================
-- ATUALIZAÇÃO DE QUALIFICAÇÕES - PARTE 9 (ASO.P, SAEFAP06, SAEFAP14, TIPO)
-- Data: 2025-12-05
-- =================================================================

-- Marcar como deletados os registros existentes
UPDATE qualificacoes_historico 
SET deleted_at = datetime('now')
WHERE deleted_at IS NULL
AND (
  qualificacao_id IN (SELECT id FROM qualificacoes_tipos WHERE codigo IN ('ASO.P', 'SAEFAP06', 'SAEFAP14', 'TIPO'))
  OR codigo IN ('ASO.P', 'SAEFAP06', 'SAEFAP14', 'TIPO')
);

-- QUALIFICAÇÃO ASO.P (validade 12 meses)
INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'ASO.P', '2025-05-20', date('2025-05-20', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '134.651.428-37' AND qt.codigo = 'ASO.P' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'ASO.P', '2025-09-15', date('2025-09-15', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '419.906.257-20' AND qt.codigo = 'ASO.P' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'ASO.P', '2025-07-31', date('2025-07-31', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '052.414.847-36' AND qt.codigo = 'ASO.P' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'ASO.P', '2025-07-31', date('2025-07-31', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '387.181.008-80' AND qt.codigo = 'ASO.P' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'ASO.P', '2025-06-30', date('2025-06-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '899.850.527-49' AND qt.codigo = 'ASO.P' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'ASO.P', '2025-06-30', date('2025-06-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '017.058.448-80' AND qt.codigo = 'ASO.P' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'ASO.P', '2025-07-01', date('2025-07-01', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '772.105.497-49' AND qt.codigo = 'ASO.P' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'ASO.P', '2025-06-01', date('2025-06-01', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '722.443.567-87' AND qt.codigo = 'ASO.P' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'ASO.P', '2025-06-01', date('2025-06-01', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '112.015.317-48' AND qt.codigo = 'ASO.P' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'ASO.P', '2024-10-11', date('2024-10-11', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '401.238.047-87' AND qt.codigo = 'ASO.P' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'ASO.P', '2025-06-01', date('2025-06-01', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '012.598.600-94' AND qt.codigo = 'ASO.P' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'ASO.P', '2025-08-01', date('2025-08-01', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '734.990.727-34' AND qt.codigo = 'ASO.P' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'ASO.P', '2025-10-01', date('2025-10-01', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '311.120.807-91' AND qt.codigo = 'ASO.P' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'ASO.P', '2025-08-01', date('2025-08-01', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '058.412.708-18' AND qt.codigo = 'ASO.P' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'ASO.P', '2025-06-30', date('2025-06-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '102.896.837-66' AND qt.codigo = 'ASO.P' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'ASO.P', '2025-08-01', date('2025-08-01', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '563.716.080-53' AND qt.codigo = 'ASO.P' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'ASO.P', '2025-06-30', date('2025-06-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '093.127.887-28' AND qt.codigo = 'ASO.P' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'ASO.P', '2025-06-01', date('2025-06-01', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '663.794.586-20' AND qt.codigo = 'ASO.P' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'ASO.P', '2025-06-01', date('2025-06-01', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '939.571.227-91' AND qt.codigo = 'ASO.P' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'ASO.P', '2025-07-22', date('2025-07-22', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '155.257.297-84' AND qt.codigo = 'ASO.P' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'ASO.P', '2025-08-01', date('2025-08-01', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '713.920.927-87' AND qt.codigo = 'ASO.P' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'ASO.P', '2025-07-01', date('2025-07-01', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '145.880.747-92' AND qt.codigo = 'ASO.P' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'ASO.P', '2025-11-05', date('2025-11-05', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '052.017.507-70' AND qt.codigo = 'ASO.P' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'ASO.P', '2025-06-17', date('2025-06-17', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '768.506.843-53' AND qt.codigo = 'ASO.P' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'ASO.P', '2025-11-01', date('2025-11-01', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '083.286.227-42' AND qt.codigo = 'ASO.P' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'ASO.P', '2025-06-30', date('2025-06-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '108.943.047-71' AND qt.codigo = 'ASO.P' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

-- QUALIFICAÇÃO SAEFAP06 (validade 24 meses)
INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP06', '2024-10-18', date('2024-10-18', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '134.651.428-37' AND qt.codigo = 'SAEFAP06' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP06', '2024-10-18', date('2024-10-18', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '419.906.257-20' AND qt.codigo = 'SAEFAP06' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP06', '2024-10-18', date('2024-10-18', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '387.181.008-80' AND qt.codigo = 'SAEFAP06' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP06', '2024-10-18', date('2024-10-18', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '899.850.527-49' AND qt.codigo = 'SAEFAP06' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP06', '2024-10-18', date('2024-10-18', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '017.058.448-80' AND qt.codigo = 'SAEFAP06' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP06', '2024-10-18', date('2024-10-18', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '772.105.497-49' AND qt.codigo = 'SAEFAP06' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP06', '2024-10-18', date('2024-10-18', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '722.443.567-87' AND qt.codigo = 'SAEFAP06' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP06', '2024-10-18', date('2024-10-18', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '112.015.317-48' AND qt.codigo = 'SAEFAP06' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP06', '2024-10-18', date('2024-10-18', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '401.238.047-87' AND qt.codigo = 'SAEFAP06' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP06', '2024-10-18', date('2024-10-18', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '012.598.600-94' AND qt.codigo = 'SAEFAP06' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP06', '2024-10-18', date('2024-10-18', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '734.990.727-34' AND qt.codigo = 'SAEFAP06' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP06', '2024-10-18', date('2024-10-18', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '311.120.807-91' AND qt.codigo = 'SAEFAP06' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP06', '2024-10-18', date('2024-10-18', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '058.412.708-18' AND qt.codigo = 'SAEFAP06' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP06', '2024-10-18', date('2024-10-18', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '563.716.080-53' AND qt.codigo = 'SAEFAP06' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP06', '2024-10-18', date('2024-10-18', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '663.794.586-20' AND qt.codigo = 'SAEFAP06' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP06', '2024-10-18', date('2024-10-18', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '155.257.297-84' AND qt.codigo = 'SAEFAP06' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP06', '2024-10-18', date('2024-10-18', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '145.880.747-92' AND qt.codigo = 'SAEFAP06' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP06', '2024-10-18', date('2024-10-18', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '768.506.843-53' AND qt.codigo = 'SAEFAP06' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

-- QUALIFICAÇÃO SAEFAP14 (validade 24 meses)
INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP14', '2024-08-16', date('2024-08-16', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '052.414.847-36' AND qt.codigo = 'SAEFAP14' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP14', '2024-08-16', date('2024-08-16', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '387.181.008-80' AND qt.codigo = 'SAEFAP14' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP14', '2024-08-16', date('2024-08-16', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '017.058.448-80' AND qt.codigo = 'SAEFAP14' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP14', '2024-08-16', date('2024-08-16', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '772.105.497-49' AND qt.codigo = 'SAEFAP14' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP14', '2024-08-16', date('2024-08-16', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '012.598.600-94' AND qt.codigo = 'SAEFAP14' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP14', '2024-08-16', date('2024-08-16', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '734.990.727-34' AND qt.codigo = 'SAEFAP14' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP14', '2024-08-16', date('2024-08-16', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '058.412.708-18' AND qt.codigo = 'SAEFAP14' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP14', '2024-08-16', date('2024-08-16', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '102.896.837-66' AND qt.codigo = 'SAEFAP14' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP14', '2024-08-16', date('2024-08-16', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '563.716.080-53' AND qt.codigo = 'SAEFAP14' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP14', '2024-08-16', date('2024-08-16', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '093.127.887-28' AND qt.codigo = 'SAEFAP14' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP14', '2024-08-16', date('2024-08-16', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '663.794.586-20' AND qt.codigo = 'SAEFAP14' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP14', '2024-08-16', date('2024-08-16', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '939.571.227-91' AND qt.codigo = 'SAEFAP14' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP14', '2024-08-16', date('2024-08-16', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '713.920.927-87' AND qt.codigo = 'SAEFAP14' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP14', '2024-08-16', date('2024-08-16', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '052.017.507-70' AND qt.codigo = 'SAEFAP14' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP14', '2024-08-16', date('2024-08-16', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '768.506.843-53' AND qt.codigo = 'SAEFAP14' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP14', '2024-08-16', date('2024-08-16', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '083.286.227-42' AND qt.codigo = 'SAEFAP14' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'SAEFAP14', '2024-10-18', date('2024-10-18', '+24 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '108.943.047-71' AND qt.codigo = 'SAEFAP14' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

-- QUALIFICAÇÃO TIPO (validade 12 meses)
INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'TIPO', '2025-11-30', date('2025-11-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '134.651.428-37' AND qt.codigo = 'TIPO' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'TIPO', '2025-09-30', date('2025-09-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '419.906.257-20' AND qt.codigo = 'TIPO' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'TIPO', '2025-11-30', date('2025-11-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '052.414.847-36' AND qt.codigo = 'TIPO' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'TIPO', '2025-11-30', date('2025-11-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '387.181.008-80' AND qt.codigo = 'TIPO' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'TIPO', '2025-11-30', date('2025-11-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '899.850.527-49' AND qt.codigo = 'TIPO' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'TIPO', '2025-11-30', date('2025-11-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '017.058.448-80' AND qt.codigo = 'TIPO' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'TIPO', '2025-11-30', date('2025-11-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '772.105.497-49' AND qt.codigo = 'TIPO' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'TIPO', '2025-11-30', date('2025-11-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '722.443.567-87' AND qt.codigo = 'TIPO' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'TIPO', '2025-02-26', date('2025-02-26', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '112.015.317-48' AND qt.codigo = 'TIPO' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'TIPO', '2025-08-31', date('2025-08-31', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '401.238.047-87' AND qt.codigo = 'TIPO' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'TIPO', '2025-11-30', date('2025-11-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '012.598.600-94' AND qt.codigo = 'TIPO' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'TIPO', '2025-11-30', date('2025-11-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '734.990.727-34' AND qt.codigo = 'TIPO' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'TIPO', '2025-11-30', date('2025-11-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '311.120.807-91' AND qt.codigo = 'TIPO' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'TIPO', '2025-11-30', date('2025-11-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '058.412.708-18' AND qt.codigo = 'TIPO' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'TIPO', '2025-11-30', date('2025-11-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '102.896.837-66' AND qt.codigo = 'TIPO' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'TIPO', '2025-11-30', date('2025-11-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '563.716.080-53' AND qt.codigo = 'TIPO' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'TIPO', '2025-11-30', date('2025-11-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '093.127.887-28' AND qt.codigo = 'TIPO' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'TIPO', '2025-11-30', date('2025-11-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '663.794.586-20' AND qt.codigo = 'TIPO' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'TIPO', '2024-11-15', date('2024-11-15', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '939.571.227-91' AND qt.codigo = 'TIPO' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'TIPO', '2025-02-26', date('2025-02-26', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '155.257.297-84' AND qt.codigo = 'TIPO' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'TIPO', '2025-11-30', date('2025-11-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '713.920.927-87' AND qt.codigo = 'TIPO' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'TIPO', '2025-06-30', date('2025-06-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '145.880.747-92' AND qt.codigo = 'TIPO' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'TIPO', '2025-11-30', date('2025-11-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '052.017.507-70' AND qt.codigo = 'TIPO' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'TIPO', '2025-11-30', date('2025-11-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '768.506.843-53' AND qt.codigo = 'TIPO' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'TIPO', '2025-11-30', date('2025-11-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '083.286.227-42' AND qt.codigo = 'TIPO' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'TIPO', '2025-11-30', date('2025-11-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '108.943.047-71' AND qt.codigo = 'TIPO' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;
