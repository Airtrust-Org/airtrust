-- ===============================================
-- SEED SIMPLIFICADO PARA TESTES E2E
-- Apenas campos que existem no schema real
-- ===============================================

-- Limpar dados de teste anteriores
DELETE FROM qualificacoes_historico WHERE funcionario_cpf IN (
  SELECT cpf FROM funcionarios WHERE email LIKE '%@teste.%'
);
DELETE FROM funcionarios WHERE email LIKE '%@teste.%';
DELETE FROM qualificacoes_tipos WHERE codigo LIKE 'TEST%';

-- 1. FUNCIONÁRIOS (10 registros - só campos obrigatórios)
INSERT INTO funcionarios (nome, cpf, email, matricula, funcao, aeronave, status, ativo) VALUES
('João Silva Teste', '012.345.678-90', 'joao.teste@airtrust.com', 'TEST001', 'Piloto', 'S76', 'ATIVO', 1),
('Maria Santos Teste', '123.456.789-09', 'maria.teste@airtrust.com', 'TEST002', 'Piloto', 'AW139', 'ATIVO', 1),
('Carlos Oliveira Teste', '234.567.890-12', 'carlos.teste@airtrust.com', 'TEST003', 'Mecânico', 'EC135', 'ATIVO', 1),
('Ana Costa Teste', '345.678.901-23', 'ana.teste@airtrust.com', 'TEST004', 'Copiloto', 'S76', 'ATIVO', 1),
('Pedro Lima Teste', '456.789.012-34', 'pedro.teste@airtrust.com', 'TEST005', 'Instrutor', 'AW139', 'ATIVO', 1),
('Julia Souza Teste', '567.890.123-45', 'julia.teste@airtrust.com', 'TEST006', 'Piloto', 'EC135', 'ATIVO', 1),
('Roberto Alves Teste', '678.901.234-56', 'roberto.teste@airtrust.com', 'TEST007', 'Mecânico', 'S76', 'ATIVO', 1),
('Fernanda Dias Teste', '789.012.345-67', 'fernanda.teste@airtrust.com', 'TEST008', 'Copiloto', 'AW139', 'ATIVO', 1),
('Marcos Rocha Teste', '890.123.456-78', 'marcos.teste@airtrust.com', 'TEST009', 'Instrutor', 'EC135', 'ATIVO', 1),
('Patricia Nunes Teste', '901.234.567-89', 'patricia.teste@airtrust.com', 'TEST010', 'Piloto', 'S76', 'ATIVO', 1);

-- 2. TIPOS DE QUALIFICAÇÃO (5 registros)
INSERT INTO qualificacoes_tipos (codigo, descricao, validade_padrao_meses, cor, exige_arquivo) VALUES
('TEST-CMA', 'Certificado Médico (Teste)', 12, '#10b981', 1),
('TEST-PPH', 'Piloto Privado Helicóptero (Teste)', 24, '#3b82f6', 1),
('TEST-CHT', 'Cheque Técnico (Teste)', 6, '#f59e0b', 1),
('TEST-SEG', 'Treinamento de Segurança (Teste)', 12, '#ef4444', 0),
('TEST-SIM', 'Simulador Básico (Teste)', 12, '#8b5cf6', 1);

-- 3. HISTÓRICO DE QUALIFICAÇÕES (15 registros)
-- Mix: válidas, vencidas, sem validade, renovações
INSERT INTO qualificacoes_historico (funcionario_cpf, qualificacao_codigo, data_obtencao, data_vencimento, arquivo_url, observacoes) VALUES
-- Qualificações válidas (vencimento futuro)
('012.345.678-90', 'TEST-CMA', '2024-06-01', '2025-06-01', 'http://teste.com/cma1.pdf', 'CMA válido'),
('123.456.789-09', 'TEST-PPH', '2023-01-15', '2025-01-15', 'http://teste.com/pph1.pdf', 'PPH válido'),
('234.567.890-12', 'TEST-CHT', '2024-09-10', '2025-03-10', 'http://teste.com/cht1.pdf', 'Cheque válido'),
('345.678.901-23', 'TEST-SEG', '2024-08-20', '2025-08-20', NULL, 'Segurança OK'),
('456.789.012-34', 'TEST-SIM', '2024-05-05', '2025-05-05', 'http://teste.com/sim1.pdf', 'Simulador válido'),

-- Qualificações próximas de vencer (15-30 dias)
('567.890.123-45', 'TEST-CMA', '2024-01-10', '2025-01-10', 'http://teste.com/cma2.pdf', 'Vence em breve'),
('678.901.234-56', 'TEST-CHT', '2024-07-20', '2025-01-20', 'http://teste.com/cht2.pdf', 'Renovar logo'),

-- Qualificações vencidas
('789.012.345-67', 'TEST-CMA', '2023-06-01', '2024-06-01', 'http://teste.com/cma3.pdf', 'Vencido'),
('890.123.456-78', 'TEST-PPH', '2021-03-15', '2023-03-15', 'http://teste.com/pph2.pdf', 'Vencido - renovar'),
('901.234.567-89', 'TEST-CHT', '2023-12-10', '2024-06-10', 'http://teste.com/cht3.pdf', 'Expirado'),

-- Qualificações sem validade (data_vencimento NULL)
('012.345.678-90', 'TEST-SEG', '2024-11-01', NULL, NULL, 'Treinamento obrigatório sem validade'),
('123.456.789-09', 'TEST-SEG', '2024-10-15', NULL, NULL, 'Segurança permanente'),

-- Renovações (múltiplas ocorrências do mesmo tipo/funcionário)
('234.567.890-12', 'TEST-CMA', '2023-01-05', '2024-01-05', 'http://teste.com/cma4-old.pdf', 'Versão anterior vencida'),
('234.567.890-12', 'TEST-CMA', '2024-01-05', '2025-01-05', 'http://teste.com/cma4-new.pdf', 'Renovação vigente'),
('345.678.901-23', 'TEST-CHT', '2024-03-01', '2024-09-01', 'http://teste.com/cht4-old.pdf', 'Cheque antigo');

-- Queries de verificação
SELECT '✅ Funcionários inseridos:' AS info, COUNT(*) AS total FROM funcionarios WHERE email LIKE '%@teste.%';
SELECT '✅ Tipos de qualificação inseridos:' AS info, COUNT(*) AS total FROM qualificacoes_tipos WHERE codigo LIKE 'TEST%';
SELECT '✅ Históricos inseridos:' AS info, COUNT(*) AS total FROM qualificacoes_historico WHERE funcionario_cpf IN (SELECT cpf FROM funcionarios WHERE email LIKE '%@teste.%');
