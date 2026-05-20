-- =================================================================
-- ATUALIZAÇÃO DE QUALIFICAÇÕES - PARTE 1 (B e C)
-- Data: 2025-12-05
-- Nota: Apaga registros existentes e insere novos com datas corretas
-- Cálculo: data_vencimento = data_conclusao + validade meses
-- =================================================================

-- Primeiro, marcar como deletados todos os registros existentes das qualificações B e C
UPDATE qualificacoes_historico 
SET deleted_at = datetime('now')
WHERE deleted_at IS NULL
AND (
  qualificacao_id IN (SELECT id FROM qualificacoes_tipos WHERE codigo IN ('B', 'C'))
  OR codigo IN ('B', 'C')
);

-- QUALIFICAÇÃO B (validade 12 meses)
INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'B', '2025-10-22', date('2025-10-22', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '134.651.428-37' AND qt.codigo = 'B' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'B', '2025-10-28', date('2025-10-28', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '419.906.257-20' AND qt.codigo = 'B' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'B', '2025-11-19', date('2025-11-19', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '052.414.847-36' AND qt.codigo = 'B' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'B', '2025-11-03', date('2025-11-03', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '387.181.008-80' AND qt.codigo = 'B' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'B', '2025-01-13', date('2025-01-13', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '899.850.527-49' AND qt.codigo = 'B' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'B', '2025-11-19', date('2025-11-19', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '017.058.448-80' AND qt.codigo = 'B' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'B', '2025-10-30', date('2025-10-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '772.105.497-49' AND qt.codigo = 'B' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'B', '2025-10-11', date('2025-10-11', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '722.443.567-87' AND qt.codigo = 'B' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'B', '2025-11-04', date('2025-11-04', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '112.015.317-48' AND qt.codigo = 'B' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'B', '2025-04-09', date('2025-04-09', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '401.238.047-87' AND qt.codigo = 'B' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'B', '2024-12-15', date('2024-12-15', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '734.990.727-34' AND qt.codigo = 'B' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'B', '2025-11-10', date('2025-11-10', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '311.120.807-91' AND qt.codigo = 'B' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'B', '2025-10-23', date('2025-10-23', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '058.412.708-18' AND qt.codigo = 'B' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'B', '2024-11-26', date('2024-11-26', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '563.716.080-53' AND qt.codigo = 'B' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'B', '2025-11-02', date('2025-11-02', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '093.127.887-28' AND qt.codigo = 'B' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'B', '2025-10-22', date('2025-10-22', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '663.794.586-20' AND qt.codigo = 'B' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'B', '2023-06-13', date('2023-06-13', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '939.571.227-91' AND qt.codigo = 'B' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'B', '2024-12-09', date('2024-12-09', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '155.257.297-84' AND qt.codigo = 'B' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'B', '2025-10-27', date('2025-10-27', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '713.920.927-87' AND qt.codigo = 'B' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'B', '2024-12-08', date('2024-12-08', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '145.880.747-92' AND qt.codigo = 'B' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'B', '2025-02-03', date('2025-02-03', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '052.017.507-70' AND qt.codigo = 'B' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'B', '2025-04-24', date('2025-04-24', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '768.506.843-53' AND qt.codigo = 'B' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'B', '2025-08-28', date('2025-08-28', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '083.286.227-42' AND qt.codigo = 'B' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'B', '2025-06-06', date('2025-06-06', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '108.943.047-71' AND qt.codigo = 'B' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

-- QUALIFICAÇÃO C (validade 12 meses)
INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'C', '2025-10-22', date('2025-10-22', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '134.651.428-37' AND qt.codigo = 'C' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'C', '2025-10-29', date('2025-10-29', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '419.906.257-20' AND qt.codigo = 'C' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'C', '2025-11-19', date('2025-11-19', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '052.414.847-36' AND qt.codigo = 'C' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'C', '2025-11-03', date('2025-11-03', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '387.181.008-80' AND qt.codigo = 'C' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'C', '2024-11-30', date('2024-11-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '899.850.527-49' AND qt.codigo = 'C' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'C', '2025-11-19', date('2025-11-19', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '017.058.448-80' AND qt.codigo = 'C' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'C', '2025-10-30', date('2025-10-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '772.105.497-49' AND qt.codigo = 'C' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'C', '2025-10-11', date('2025-10-11', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '722.443.567-87' AND qt.codigo = 'C' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'C', '2025-10-21', date('2025-10-21', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '112.015.317-48' AND qt.codigo = 'C' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'C', '2025-04-07', date('2025-04-07', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '401.238.047-87' AND qt.codigo = 'C' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'C', '2024-12-08', date('2024-12-08', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '012.598.600-94' AND qt.codigo = 'C' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'C', '2024-12-11', date('2024-12-11', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '734.990.727-34' AND qt.codigo = 'C' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'C', '2024-11-21', date('2024-11-21', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '311.120.807-91' AND qt.codigo = 'C' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'C', '2025-10-23', date('2025-10-23', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '058.412.708-18' AND qt.codigo = 'C' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'C', '2025-10-27', date('2025-10-27', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '102.896.837-66' AND qt.codigo = 'C' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'C', '2025-01-03', date('2025-01-03', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '563.716.080-53' AND qt.codigo = 'C' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'C', '2025-11-02', date('2025-11-02', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '093.127.887-28' AND qt.codigo = 'C' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'C', '2025-10-22', date('2025-10-22', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '663.794.586-20' AND qt.codigo = 'C' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'C', '2024-05-01', date('2024-05-01', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '939.571.227-91' AND qt.codigo = 'C' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'C', '2024-12-06', date('2024-12-06', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '155.257.297-84' AND qt.codigo = 'C' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'C', '2025-10-31', date('2025-10-31', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '713.920.927-87' AND qt.codigo = 'C' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'C', '2025-01-12', date('2025-01-12', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '145.880.747-92' AND qt.codigo = 'C' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'C', '2025-03-14', date('2025-03-14', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '052.017.507-70' AND qt.codigo = 'C' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'C', '2025-04-30', date('2025-04-30', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '768.506.843-53' AND qt.codigo = 'C' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'C', '2025-07-21', date('2025-07-21', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '083.286.227-42' AND qt.codigo = 'C' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, codigo, data_conclusao, data_vencimento, created_at, updated_at)
SELECT f.id, qt.id, 'C', '2025-07-07', date('2025-07-07', '+12 months'), datetime('now'), datetime('now')
FROM funcionarios f, qualificacoes_tipos qt WHERE f.cpf = '108.943.047-71' AND qt.codigo = 'C' AND f.deleted_at IS NULL AND qt.deleted_at IS NULL;
