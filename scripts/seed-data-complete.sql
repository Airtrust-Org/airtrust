-- ============================================================================
-- SEED DATA COMPLETO - AIRTRUST v1.0.0
-- ============================================================================
-- Script para popular todas as tabelas com dados iniciais realistas
-- Data: 10 de Novembro de 2025
-- ============================================================================

-- ============================================================================
-- 1. QUALIFICAÇÕES (8 registros)
-- ============================================================================
DELETE FROM qualificacoes WHERE deleted_at IS NULL;

INSERT INTO qualificacoes (id, codigo, nome, descricao, created_at, updated_at, deleted_at) VALUES
('qual-001', 'CMA', 'Comandante', 'Comandante de Aeronave - Autoridade máxima a bordo', datetime('now'), datetime('now'), NULL),
('qual-002', 'SIC', 'Segundo em Comando', 'Segundo em Comando de Aeronave', datetime('now'), datetime('now'), NULL),
('qual-003', 'PP', 'Piloto Privado', 'Piloto Privado - Voos não comerciais', datetime('now'), datetime('now'), NULL),
('qual-004', 'PC', 'Piloto Comercial', 'Piloto Comercial - Voos remunerados', datetime('now'), datetime('now'), NULL),
('qual-005', 'IFR', 'Voo por Instrumento', 'Habilitação de Voo por Instrumento - Voos em IMC', datetime('now'), datetime('now'), NULL),
('qual-006', 'MLTE', 'Multi-Engine', 'Habilitação para Aeronaves Multimotoras', datetime('now'), datetime('now'), NULL),
('qual-007', 'INVA', 'Instrutor de Voo', 'Instrutor de Voo de Avião - Autorizado a treinar pilotos', datetime('now'), datetime('now'), NULL),
('qual-008', 'PLA', 'Piloto de Linha Aérea', 'Piloto de Linha Aérea - ATPL', datetime('now'), datetime('now'), NULL);

-- ============================================================================
-- 2. CATEGORIAS DE AERONAVES (5 registros)
-- ============================================================================
DELETE FROM categorias WHERE deleted_at IS NULL;

INSERT INTO categorias (id, codigo, nome, descricao, created_at, updated_at, deleted_at) VALUES
('cat-001', 'CAT-A', 'Monomotor Terrestre', 'Aeronaves monomotoras com trem de pouso fixo', datetime('now'), datetime('now'), NULL),
('cat-002', 'CAT-B', 'Multimtor Terrestre', 'Aeronaves multimotoras com trem de pouso fixo', datetime('now'), datetime('now'), NULL),
('cat-003', 'CAT-C', 'Helicóptero', 'Helicópteros com um ou mais rotores', datetime('now'), datetime('now'), NULL),
('cat-004', 'CAT-D', 'Planador', 'Planadores e voadeiras', datetime('now'), datetime('now'), NULL),
('cat-005', 'CAT-E', 'Anfíbio', 'Aeronaves anfíbias', datetime('now'), datetime('now'), NULL);

-- ============================================================================
-- 3. EMPRESAS (3 registros)
-- ============================================================================
DELETE FROM empresas WHERE deleted_at IS NULL;

INSERT INTO empresas (id, razao_social, nome_fantasia, cnpj, created_at, updated_at, deleted_at) VALUES
('emp-001', 'AirTrust Brasil S.A.', 'AirTrust', '12345678000190', datetime('now'), datetime('now'), NULL),
('emp-002', 'AZUL Linhas Aéreas S.A.', 'AZUL', '09261323000166', datetime('now'), datetime('now'), NULL),
('emp-003', 'TAP Air Portugal S.A.', 'TAP', '00178730008089', datetime('now'), datetime('now'), NULL);

-- ============================================================================
-- 4. SETORES (4 registros)
-- ============================================================================
DELETE FROM setores WHERE deleted_at IS NULL;

INSERT INTO setores (id, nome, descricao, created_at, updated_at, deleted_at) VALUES
('set-001', 'Operações', 'Setor de operações e voos', datetime('now'), datetime('now'), NULL),
('set-002', 'Treinamento', 'Setor de treinamento e simuladores', datetime('now'), datetime('now'), NULL),
('set-003', 'Manutenção', 'Setor de manutenção técnica', datetime('now'), datetime('now'), NULL),
('set-004', 'Administração', 'Setor administrativo', datetime('now'), datetime('now'), NULL);

-- ============================================================================
-- 5. FUNÇÕES (6 registros)
-- ============================================================================
DELETE FROM funcoes WHERE deleted_at IS NULL;

INSERT INTO funcoes (id, nome, descricao, created_at, updated_at, deleted_at) VALUES
('func-001', 'Piloto Comandante', 'Responsável pela aeronave e tripulação', datetime('now'), datetime('now'), NULL),
('func-002', 'Piloto Copiloto', 'Auxilia comandante nas operações', datetime('now'), datetime('now'), NULL),
('func-003', 'Instrutor de Voo', 'Responsável pelo treinamento', datetime('now'), datetime('now'), NULL),
('func-004', 'Mecânico de Voo', 'Responsável por sistemas da aeronave', datetime('now'), datetime('now'), NULL),
('func-005', 'Comissário', 'Responsável pela cabine', datetime('now'), datetime('now'), NULL),
('func-006', 'Gerente de Operações', 'Supervisiona operações aéreas', datetime('now'), datetime('now'), NULL);

-- ============================================================================
-- 6. AERONAVES (5 registros)
-- ============================================================================
DELETE FROM aeronaves WHERE deleted_at IS NULL;

INSERT INTO aeronaves (id, fabricante, modelo, prefixo, numero_serie, categoria_id, created_at, updated_at, deleted_at) VALUES
('aer-001', 'Embraer', 'E195-E2', 'PT-XPE', 'SN-001', 'cat-002', datetime('now'), datetime('now'), NULL),
('aer-002', 'Airbus', 'A320', 'PT-MVA', 'SN-002', 'cat-002', datetime('now'), datetime('now'), NULL),
('aer-003', 'Boeing', 'B737', 'PT-GUE', 'SN-003', 'cat-002', datetime('now'), datetime('now'), NULL),
('aer-004', 'Cessna', 'C172', 'PT-ABC', 'SN-004', 'cat-001', datetime('now'), datetime('now'), NULL),
('aer-005', 'Robinson', 'R66', 'PT-HEL', 'SN-005', 'cat-003', datetime('now'), datetime('now'), NULL);

-- ============================================================================
-- 7. FUNCIONÁRIOS (5 registros de teste)
-- ============================================================================
DELETE FROM funcionarios WHERE deleted_at IS NULL;

INSERT INTO funcionarios (id, nome, cpf, email, matricula, data_nascimento, telefone, endereco, created_at, updated_at, deleted_at) VALUES
('func-emp-001', 'João Silva Santos', '12345678901', 'joao.silva@airtrust.com.br', 'MAT001', '1985-05-15', '(11) 98765-4321', 'Rua Principal, 100', datetime('now'), datetime('now'), NULL),
('func-emp-002', 'Maria Oliveira Costa', '98765432109', 'maria.oliveira@airtrust.com.br', 'MAT002', '1990-08-22', '(11) 99876-5432', 'Avenida Secundária, 200', datetime('now'), datetime('now'), NULL),
('func-emp-003', 'Carlos Mendes Ferreira', '11122233344', 'carlos.mendes@airtrust.com.br', 'MAT003', '1988-03-10', '(11) 97654-3210', 'Rua Tertúária, 300', datetime('now'), datetime('now'), NULL),
('func-emp-004', 'Ana Paula Gomes', '55566677788', 'ana.paula@airtrust.com.br', 'MAT004', '1992-11-30', '(11) 96543-2109', 'Rua Quaternária, 400', datetime('now'), datetime('now'), NULL),
('func-emp-005', 'Ricardo Alves Souza', '99988877766', 'ricardo.alves@airtrust.com.br', 'MAT005', '1987-07-18', '(11) 95432-1098', 'Rua Quináária, 500', datetime('now'), datetime('now'), NULL);

-- ============================================================================
-- 8. HABILITAÇÕES (15 registros - 3 qualificações × 5 funcionários)
-- ============================================================================
DELETE FROM habilitacoes WHERE deleted_at IS NULL;

INSERT INTO habilitacoes (id, funcionario_id, qualificacao_id, data_conclusao, data_vencimento, renovada_em, status, created_at, updated_at, deleted_at) VALUES
-- João Silva - 3 qualificações
('hab-001', 'func-emp-001', 'qual-001', '2023-05-15', '2026-05-15', NULL, 'ativo', datetime('now'), datetime('now'), NULL),
('hab-002', 'func-emp-001', 'qual-005', '2023-06-20', '2026-06-20', NULL, 'ativo', datetime('now'), datetime('now'), NULL),
('hab-003', 'func-emp-001', 'qual-007', '2022-12-10', '2025-12-10', NULL, 'expirando_em_breve', datetime('now'), datetime('now'), NULL),

-- Maria Oliveira - 3 qualificações
('hab-004', 'func-emp-002', 'qual-002', '2023-08-22', '2026-08-22', NULL, 'ativo', datetime('now'), datetime('now'), NULL),
('hab-005', 'func-emp-002', 'qual-005', '2024-01-15', '2027-01-15', NULL, 'ativo', datetime('now'), datetime('now'), NULL),
('hab-006', 'func-emp-002', 'qual-006', '2023-03-30', '2026-03-30', NULL, 'ativo', datetime('now'), datetime('now'), NULL),

-- Carlos Mendes - 3 qualificações
('hab-007', 'func-emp-003', 'qual-004', '2023-03-10', '2026-03-10', NULL, 'ativo', datetime('now'), datetime('now'), NULL),
('hab-008', 'func-emp-003', 'qual-005', '2023-07-25', '2026-07-25', NULL, 'ativo', datetime('now'), datetime('now'), NULL),
('hab-009', 'func-emp-003', 'qual-008', '2022-11-05', '2025-11-05', NULL, 'expirando_em_breve', datetime('now'), datetime('now'), NULL),

-- Ana Paula - 3 qualificações
('hab-010', 'func-emp-004', 'qual-003', '2024-02-15', '2027-02-15', NULL, 'ativo', datetime('now'), datetime('now'), NULL),
('hab-011', 'func-emp-004', 'qual-005', '2024-03-20', '2027-03-20', NULL, 'ativo', datetime('now'), datetime('now'), NULL),
('hab-012', 'func-emp-004', 'qual-007', '2023-01-10', '2026-01-10', NULL, 'ativo', datetime('now'), datetime('now'), NULL),

-- Ricardo Alves - 3 qualificações
('hab-013', 'func-emp-005', 'qual-002', '2023-07-18', '2026-07-18', NULL, 'ativo', datetime('now'), datetime('now'), NULL),
('hab-014', 'func-emp-005', 'qual-006', '2023-09-22', '2026-09-22', NULL, 'ativo', datetime('now'), datetime('now'), NULL),
('hab-015', 'func-emp-005', 'qual-008', '2024-04-11', '2027-04-11', NULL, 'ativo', datetime('now'), datetime('now'), NULL);

-- ============================================================================
-- 9. SIMULADORES (3 registros)
-- ============================================================================
DELETE FROM simuladores WHERE deleted_at IS NULL;

INSERT INTO simuladores (id, nome, fabricante, modelo, nivel, created_at, updated_at, deleted_at) VALUES
('sim-001', 'Simulador A320 Full-Flight', 'Thales', 'TFS 300', 'FFS Level D', datetime('now'), datetime('now'), NULL),
('sim-002', 'Simulador B737 Fixed-Base', 'CAE', 'Medallion', 'FBS Level 2', datetime('now'), datetime('now'), NULL),
('sim-003', 'Simulador Cessna 172', 'Redbird', 'JC2', 'Desktop', datetime('now'), datetime('now'), NULL);

-- ============================================================================
-- 10. MODELOS DE SESSÃO - SIMULADOR A320 (4 modelos)
-- ============================================================================
DELETE FROM simuladores_modelos WHERE deleted_at IS NULL;

INSERT INTO simuladores_modelos (id, simulador_id, nome, descricao, duracao_minutos, created_at, updated_at, deleted_at) VALUES
('mod-001', 'sim-001', 'Decolagem Normal', 'Procedimento completo de decolagem em condições VFR', 45, datetime('now'), datetime('now'), NULL),
('mod-002', 'sim-001', 'Aproximação e Pouso ILS', 'Aproximação por instrumento ILS e pouso', 50, datetime('now'), datetime('now'), NULL),
('mod-003', 'sim-001', 'Pane em Cruzeiro', 'Simulação de emergências em cruzeiro', 60, datetime('now'), datetime('now'), NULL),
('mod-004', 'sim-001', 'Voo Noturno', 'Procedimentos de voo noturno e operação com luzes', 55, datetime('now'), datetime('now'), NULL);

-- ============================================================================
-- 11. MODELOS DE SESSÃO - SIMULADOR B737 (3 modelos)
-- ============================================================================
INSERT INTO simuladores_modelos (id, simulador_id, nome, descricao, duracao_minutos, created_at, updated_at, deleted_at) VALUES
('mod-005', 'sim-002', 'Procedimentos Normais', 'Procedimentos padrão de operação B737', 40, datetime('now'), datetime('now'), NULL),
('mod-006', 'sim-002', 'Pouso com Vento de Través', 'Técnicas de pouso com componente lateral', 45, datetime('now'), datetime('now'), NULL),
('mod-007', 'sim-002', 'Falhas de Sistemas', 'Simulação de falhas múltiplas de sistemas', 60, datetime('now'), datetime('now'), NULL);

-- ============================================================================
-- 12. MODELOS DE SESSÃO - SIMULADOR CESSNA (2 modelos)
-- ============================================================================
INSERT INTO simuladores_modelos (id, simulador_id, nome, descricao, duracao_minutos, created_at, updated_at, deleted_at) VALUES
('mod-008', 'sim-003', 'Decolagem e Pouso', 'Procedimentos básicos de decolagem e pouso', 30, datetime('now'), datetime('now'), NULL),
('mod-009', 'sim-003', 'Navegação VFR', 'Navegação visual e uso de instrumentos', 45, datetime('now'), datetime('now'), NULL);

-- ============================================================================
-- 13. MANOBRAS - MODELO A320 DECOLAGEM (6 manobras)
-- ============================================================================
DELETE FROM simuladores_manobras WHERE deleted_at IS NULL;

INSERT INTO simuladores_manobras (id, modelo_id, nome, descricao, ordem, created_at, updated_at, deleted_at) VALUES
('man-001', 'mod-001', 'Briefing Pré-Voo', 'Briefing e verificação de clima', 1, datetime('now'), datetime('now'), NULL),
('man-002', 'mod-001', 'Preparação da Aeronave', 'Inspeção externa e configuração interna', 2, datetime('now'), datetime('now'), NULL),
('man-003', 'mod-001', 'Start dos Motores', 'Procedimento de partida dos motores', 3, datetime('now'), datetime('now'), NULL),
('man-004', 'mod-001', 'Rolo de Saída', 'Táxi até a cabeceira da pista', 4, datetime('now'), datetime('now'), NULL),
('man-005', 'mod-001', 'Alinhamento na Pista', 'Alinhamento e coordenação final', 5, datetime('now'), datetime('now'), NULL),
('man-006', 'mod-001', 'Decolagem e Subida Inicial', 'Decolagem e transição para subida', 6, datetime('now'), datetime('now'), NULL);

-- ============================================================================
-- 14. MANOBRAS - MODELO A320 APROXIMAÇÃO (5 manobras)
-- ============================================================================
INSERT INTO simuladores_manobras (id, modelo_id, nome, descricao, ordem, created_at, updated_at, deleted_at) VALUES
('man-007', 'mod-002', 'Descida Planejada', 'Cálculo e execução da descida', 1, datetime('now'), datetime('now'), NULL),
('man-008', 'mod-002', 'Captação de Glideslope', 'Interceptar e seguir plano de descida ILS', 2, datetime('now'), datetime('now'), NULL),
('man-009', 'mod-002', 'Fase de Aproximação Final', 'Alinhamento final com pista', 3, datetime('now'), datetime('now'), NULL),
('man-010', 'mod-002', 'Flare e Touchdown', 'Manobra de arredondamento e toque', 4, datetime('now'), datetime('now'), NULL),
('man-011', 'mod-002', 'Rolagem e Desaceleração', 'Reversão, freios e táxi de saída', 5, datetime('now'), datetime('now'), NULL);

-- ============================================================================
-- 15. MANOBRAS - MODELO A320 PANE (4 manobras)
-- ============================================================================
INSERT INTO simuladores_manobras (id, modelo_id, nome, descricao, ordem, created_at, updated_at, deleted_at) VALUES
('man-012', 'mod-003', 'Reconhecimento da Pane', 'Identificação e diagnóstico da falha', 1, datetime('now'), datetime('now'), NULL),
('man-013', 'mod-003', 'Acionamento de Procedimentos', 'Checklist e procedimentos de emergência', 2, datetime('now'), datetime('now'), NULL),
('man-014', 'mod-003', 'Manejo da Emergência', 'Controle e navegação com falha', 3, datetime('now'), datetime('now'), NULL),
('man-015', 'mod-003', 'Pouso de Emergência', 'Técnicas de pouso com limitações', 4, datetime('now'), datetime('now'), NULL);

-- ============================================================================
-- 16. MANOBRAS - MODELO B737 NORMAIS (5 manobras)
-- ============================================================================
INSERT INTO simuladores_manobras (id, modelo_id, nome, descricao, ordem, created_at, updated_at, deleted_at) VALUES
('man-016', 'mod-005', 'Preparação da Aeronave', 'Check-list pré-voo', 1, datetime('now'), datetime('now'), NULL),
('man-017', 'mod-005', 'Partida de Motores', 'Procedimento de start', 2, datetime('now'), datetime('now'), NULL),
('man-018', 'mod-005', 'Táxi e Decolagem', 'Táxi e decolagem normal', 3, datetime('now'), datetime('now'), NULL),
('man-019', 'mod-005', 'Subida e Cruzeiro', 'Transição e operação em cruzeiro', 4, datetime('now'), datetime('now'), NULL),
('man-020', 'mod-005', 'Aproximação e Pouso', 'Aproximação e pouso normal', 5, datetime('now'), datetime('now'), NULL);

-- ============================================================================
-- 17. MANOBRAS - MODELO CESSNA (4 manobras)
-- ============================================================================
INSERT INTO simuladores_manobras (id, modelo_id, nome, descricao, ordem, created_at, updated_at, deleted_at) VALUES
('man-021', 'mod-008', 'Preparação e Partida', 'Check-list inicial e start', 1, datetime('now'), datetime('now'), NULL),
('man-022', 'mod-008', 'Decolagem', 'Procedimento de decolagem', 2, datetime('now'), datetime('now'), NULL),
('man-023', 'mod-008', 'Voo de Cruzeiro', 'Operação em nível de voo', 3, datetime('now'), datetime('now'), NULL),
('man-024', 'mod-008', 'Pouso', 'Procedimento completo de pouso', 4, datetime('now'), datetime('now'), NULL);

-- ============================================================================
-- 18. VERIFICAÇÃO FINAL - Exibir contagem de registros
-- ============================================================================

SELECT '=== SEED DATA COMPLETO APLICADO ===' as status;
SELECT 'Qualificações: ' || COUNT(*) as info FROM qualificacoes WHERE deleted_at IS NULL;
SELECT 'Categorias: ' || COUNT(*) as info FROM categorias WHERE deleted_at IS NULL;
SELECT 'Empresas: ' || COUNT(*) as info FROM empresas WHERE deleted_at IS NULL;
SELECT 'Setores: ' || COUNT(*) as info FROM setores WHERE deleted_at IS NULL;
SELECT 'Funções: ' || COUNT(*) as info FROM funcoes WHERE deleted_at IS NULL;
SELECT 'Aeronaves: ' || COUNT(*) as info FROM aeronaves WHERE deleted_at IS NULL;
SELECT 'Funcionários: ' || COUNT(*) as info FROM funcionarios WHERE deleted_at IS NULL;
SELECT 'Habilitações: ' || COUNT(*) as info FROM habilitacoes WHERE deleted_at IS NULL;
SELECT 'Simuladores: ' || COUNT(*) as info FROM simuladores WHERE deleted_at IS NULL;
SELECT 'Modelos de Sessão: ' || COUNT(*) as info FROM simuladores_modelos WHERE deleted_at IS NULL;
SELECT 'Manobras: ' || COUNT(*) as info FROM simuladores_manobras WHERE deleted_at IS NULL;

-- ============================================================================
-- Fim do Script de Seed Data
-- ============================================================================
