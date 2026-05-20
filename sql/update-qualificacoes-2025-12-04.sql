-- Script de atualização de qualificações em lote
-- Data: 2025-12-04
-- Total de registros: ~450

-- Este script atualiza a data_conclusao e data_vencimento das qualificações
-- baseado no CPF do funcionário e código da qualificação

-- Primeiro, criar tabela temporária com os dados
CREATE TEMP TABLE IF NOT EXISTS temp_qualificacoes_update (
  cpf TEXT,
  codigo TEXT,
  validade INTEGER,
  data_conclusao TEXT,
  data_vencimento TEXT
);

-- Limpar tabela temporária
DELETE FROM temp_qualificacoes_update;

-- Inserir dados (convertendo datas de DD/MM/YYYY para YYYY-MM-DD)
INSERT INTO temp_qualificacoes_update (cpf, codigo, validade, data_conclusao, data_vencimento) VALUES
('134.651.428-37', 'B', 12, '2025-10-22', date('2025-10-22', '+12 months')),
('419.906.257-20', 'B', 12, '2025-10-28', date('2025-10-28', '+12 months')),
('052.414.847-36', 'B', 12, '2025-11-19', date('2025-11-19', '+12 months')),
('387.181.008-80', 'B', 12, '2025-11-03', date('2025-11-03', '+12 months')),
('899.850.527-49', 'B', 12, '2025-01-13', date('2025-01-13', '+12 months')),
('017.058.448-80', 'B', 12, '2025-11-19', date('2025-11-19', '+12 months')),
('772.105.497-49', 'B', 12, '2025-10-30', date('2025-10-30', '+12 months')),
('722.443.567-87', 'B', 12, '2025-10-11', date('2025-10-11', '+12 months')),
('112.015.317-48', 'B', 12, '2025-11-04', date('2025-11-04', '+12 months')),
('401.238.047-87', 'B', 12, '2025-04-09', date('2025-04-09', '+12 months')),
('734.990.727-34', 'B', 12, '2024-12-15', date('2024-12-15', '+12 months')),
('311.120.807-91', 'B', 12, '2025-11-10', date('2025-11-10', '+12 months')),
('058.412.708-18', 'B', 12, '2025-10-23', date('2025-10-23', '+12 months')),
('563.716.080-53', 'B', 12, '2024-11-26', date('2024-11-26', '+12 months')),
('093.127.887-28', 'B', 12, '2025-11-02', date('2025-11-02', '+12 months')),
('663.794.586-20', 'B', 12, '2025-10-22', date('2025-10-22', '+12 months')),
('939.571.227-91', 'B', 12, '2023-06-13', date('2023-06-13', '+12 months')),
('155.257.297-84', 'B', 12, '2024-12-09', date('2024-12-09', '+12 months')),
('713.920.927-87', 'B', 12, '2025-10-27', date('2025-10-27', '+12 months')),
('145.880.747-92', 'B', 12, '2024-12-08', date('2024-12-08', '+12 months')),
('052.017.507-70', 'B', 12, '2025-02-03', date('2025-02-03', '+12 months')),
('768.506.843-53', 'B', 12, '2025-04-24', date('2025-04-24', '+12 months')),
('083.286.227-42', 'B', 12, '2025-08-28', date('2025-08-28', '+12 months')),
('108.943.047-71', 'B', 12, '2025-06-06', date('2025-06-06', '+12 months'));

-- Mais dados serão adicionados...
