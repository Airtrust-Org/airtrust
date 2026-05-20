-- ==========================================
-- RECUPERAÇÃO DE DADOS SIMPLES - 11/11/2025
-- ==========================================
-- Apenas dados críticos com campos confirmados
-- ==========================================

-- ✅ 1. CATEGORIAS DE MANOBRAS (Confirmed Fields)
INSERT OR IGNORE INTO categoriasmanobras (id, codigo, nome, tipo, created_at, updated_at) VALUES
(1, 'EMERG', 'Emergências', 'NORMAL', datetime('now'), datetime('now')),
(2, 'NAV', 'Navegação', 'NORMAL', datetime('now'), datetime('now')),
(3, 'APROX', 'Aproximação', 'NORMAL', datetime('now'), datetime('now')),
(4, 'BASICO', 'Manobras Básicas', 'NORMAL', datetime('now'), datetime('now')),
(5, 'IFR', 'IFR', 'NORMAL', datetime('now'), datetime('now'));

-- ✅ 2. MANOBRAS (8 principais)
INSERT OR IGNORE INTO manobras (id, codigo, nome, categoria, nivel_dificuldade, created_at, updated_at) VALUES
(1, 'EF', 'Engine Failure', 'Emergências', 'AVANCADO', datetime('now'), datetime('now')),
(2, 'ILS', 'ILS Approach', 'Aproximação', 'AVANCADO', datetime('now'), datetime('now')),
(3, 'ST', 'Steep Turn', 'Básicas', 'BASICO', datetime('now'), datetime('now')),
(4, 'EL', 'Emergency Landing', 'Emergências', 'AVANCADO', datetime('now'), datetime('now')),
(5, 'VOR', 'VOR Navigation', 'Navegação', 'INTERMEDIARIO', datetime('now'), datetime('now')),
(6, 'SR', 'Stall Recovery', 'Básicas', 'BASICO', datetime('now'), datetime('now')),
(7, 'GA', 'Go Around', 'Aproximação', 'INTERMEDIARIO', datetime('now'), datetime('now')),
(8, 'NDB', 'NDB Approach', 'Aproximação', 'AVANCADO', datetime('now'), datetime('now'));

-- ✅ 3. TIPOS DE SESSÃO
INSERT OR IGNORE INTO tipos_sessao (id, nome, created_at, updated_at) VALUES
(1, 'Treinamento Inicial', datetime('now'), datetime('now')),
(2, 'Recorrente', datetime('now'), datetime('now')),
(3, 'Proficiência', datetime('now'), datetime('now')),
(4, 'Transição', datetime('now'), datetime('now'));

-- ✅ 4. SIMULADORES
INSERT OR IGNORE INTO simuladores (id, nome, modelo, tipo, fabricante, status, created_at, updated_at) VALUES
(1, 'Simulador A320 Full-Flight', 'TFS 300', 'FFS Level D', 'Thales', 'ATIVO', datetime('now'), datetime('now')),
(2, 'Simulador B737 Fixed-Base', 'Medallion', 'FBS Level 2', 'CAE', 'ATIVO', datetime('now'), datetime('now')),
(3, 'Simulador Cessna 172', 'JC2', 'Desktop', 'Redbird', 'ATIVO', datetime('now'), datetime('now'));

-- ✅ 5. QUALIFICAÇÕES
INSERT OR IGNORE INTO qualificacoes (id, nome, created_at, updated_at) VALUES
('qual-001', 'Comandante', datetime('now'), datetime('now')),
('qual-002', 'Segundo em Comando', datetime('now'), datetime('now')),
('qual-003', 'Piloto Privado', datetime('now'), datetime('now')),
('qual-004', 'Piloto Comercial', datetime('now'), datetime('now')),
('qual-005', 'Voo por Instrumento', datetime('now'), datetime('now')),
('qual-006', 'Multi-Engine', datetime('now'), datetime('now')),
('qual-007', 'Instrutor de Voo', datetime('now'), datetime('now')),
('qual-008', 'Piloto de Linha Aérea', datetime('now'), datetime('now'));

-- ✅ 6. CATEGORIAS DE QUALIFICAÇÕES  
INSERT OR IGNORE INTO categorias_qualificacoes (id, nome, cor, created_at, updated_at) VALUES
(1, 'Tipo', '#3B82F6', datetime('now'), datetime('now')),
(2, 'Classe', '#10B981', datetime('now'), datetime('now')),
(3, 'IFR', '#8B5CF6', datetime('now'), datetime('now')),
(4, 'MLTE', '#F59E0B', datetime('now'), datetime('now')),
(5, 'Instrutor', '#EF4444', datetime('now'), datetime('now'));

-- ==========================================
