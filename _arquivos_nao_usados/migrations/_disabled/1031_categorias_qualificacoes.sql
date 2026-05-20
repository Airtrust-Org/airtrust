-- ════════════════════════════════════════════════════════════════
-- MIGRATION: Sistema de 4 Categorias de Qualificações
-- Data: 25/10/2025
-- Descrição: Adicionar campos de categoria e características
-- ════════════════════════════════════════════════════════════════

-- Adicionar coluna categoria
ALTER TABLE tipos_qualificacoes ADD COLUMN categoria TEXT CHECK(categoria IN ('EXAME', 'CHECK', 'TREINAMENTO_TEORICO', 'TREINAMENTO_VOO'));

-- Adicionar campos de requisitos
ALTER TABLE tipos_qualificacoes ADD COLUMN requer_simulador INTEGER DEFAULT 0;
ALTER TABLE tipos_qualificacoes ADD COLUMN requer_aeronave INTEGER DEFAULT 0;
ALTER TABLE tipos_qualificacoes ADD COLUMN requer_sala INTEGER DEFAULT 0;

-- Adicionar campos de sessões e carga horária
ALTER TABLE tipos_qualificacoes ADD COLUMN total_sessoes INTEGER DEFAULT 1;
ALTER TABLE tipos_qualificacoes ADD COLUMN carga_horaria INTEGER; -- em horas

-- Adicionar descrição (se não existir)
-- ALTER TABLE tipos_qualificacoes ADD COLUMN descricao TEXT;

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_tipos_categoria ON tipos_qualificacoes(categoria);

-- ════════════════════════════════════════════════════════════════
-- POPULAR CATEGORIAS - DADOS EXEMPLO
-- ════════════════════════════════════════════════════════════════

-- 1. EXAMES (🏥)
INSERT OR IGNORE INTO tipos_qualificacoes (codigo, nome, categoria, validade_meses, descricao, created_at) VALUES
('CMA', 'Certificado Médico Aeronáutico', 'EXAME', 12, 'Exame médico obrigatório ANAC', datetime('now')),
('ASO', 'Atestado de Saúde Ocupacional', 'EXAME', 12, 'Exame admissional e periódico', datetime('now')),
('ICAO-4', 'ICAO Nível 4', 'EXAME', 36, 'Proficiência linguística nível 4', datetime('now')),
('ICAO-5', 'ICAO Nível 5', 'EXAME', 48, 'Proficiência linguística nível 5', datetime('now')),
('ICAO-6', 'ICAO Nível 6', 'EXAME', 60, 'Proficiência linguística nível 6', datetime('now')),
('TOXICO', 'Exame Toxicológico', 'EXAME', 12, 'Exame toxicológico obrigatório', datetime('now'));

-- 2. CHECKS (✅)
INSERT OR IGNORE INTO tipos_qualificacoes (codigo, nome, categoria, requer_aeronave, total_sessoes, validade_meses, descricao, created_at) VALUES
('LINE_CHECK', 'Line Check', 'CHECK', 1, 1, 6, 'Cheque operacional em linha', datetime('now')),
('LPC', 'License Proficiency Check', 'CHECK', 1, 1, 6, 'Cheque de proficiência de licença', datetime('now')),
('AVAL_OP', 'Avaliação Operacional', 'CHECK', 1, 1, 6, 'Avaliação operacional periódica', datetime('now'));

-- 3. TREINAMENTOS TEÓRICOS (📚)
INSERT OR IGNORE INTO tipos_qualificacoes (codigo, nome, categoria, requer_sala, total_sessoes, carga_horaria, validade_meses, descricao, created_at) VALUES
('RBHA', 'RBHA - Regulamentação', 'TREINAMENTO_TEORICO', 1, 4, 16, 24, 'Regulamentação brasileira de aviação', datetime('now')),
('SMS', 'Safety Management System', 'TREINAMENTO_TEORICO', 1, 3, 12, 24, 'Sistema de gerenciamento de segurança', datetime('now')),
('FRMS', 'Fatigue Risk Management', 'TREINAMENTO_TEORICO', 1, 2, 8, 24, 'Gerenciamento de risco de fadiga', datetime('now')),
('DG', 'Dangerous Goods', 'TREINAMENTO_TEORICO', 1, 4, 16, 24, 'Transporte de cargas perigosas', datetime('now')),
('CRM', 'Crew Resource Management', 'TREINAMENTO_TEORICO', 1, 3, 12, 24, 'Gerenciamento de recursos de tripulação', datetime('now')),
('SEGINF', 'Segurança da Informação', 'TREINAMENTO_TEORICO', 1, 2, 8, 24, 'Segurança da informação e dados', datetime('now'));

-- 4. TREINAMENTOS DE VOO (✈️)
INSERT OR IGNORE INTO tipos_qualificacoes (codigo, nome, categoria, requer_simulador, total_sessoes, carga_horaria, validade_meses, descricao, created_at) VALUES
('FAP06', 'FAP06 - Proficiência', 'TREINAMENTO_VOO', 1, 4, 16, 6, 'Proficiência em simulador', datetime('now')),
('OPC', 'OPC - Operator Check', 'TREINAMENTO_VOO', 1, 4, 16, 6, 'Operator proficiency check', datetime('now')),
('CHT-IFR', 'Cheque IFR', 'TREINAMENTO_VOO', 1, 2, 8, 6, 'Cheque de voo por instrumentos', datetime('now')),
('CHT-TIPO', 'Cheque de Tipo', 'TREINAMENTO_VOO', 1, 4, 16, 12, 'Cheque de tipo de aeronave', datetime('now')),
('TRANSICAO', 'Transição de Aeronave', 'TREINAMENTO_VOO', 1, 6, 24, 0, 'Transição para novo tipo (não vence)', datetime('now')),
('LOFT', 'LOFT', 'TREINAMENTO_VOO', 1, 2, 8, 6, 'Line-oriented flight training', datetime('now'));

-- ════════════════════════════════════════════════════════════════
-- ATUALIZAR TIPOS EXISTENTES (se houver)
-- ════════════════════════════════════════════════════════════════

-- Atualizar CMA existente
UPDATE tipos_qualificacoes 
SET categoria = 'EXAME', 
    validade_meses = 12,
    descricao = 'Certificado Médico Aeronáutico - Exame obrigatório ANAC'
WHERE codigo = 'CMA' AND categoria IS NULL;

-- Atualizar FAP06 existente
UPDATE tipos_qualificacoes 
SET categoria = 'TREINAMENTO_VOO', 
    requer_simulador = 1,
    total_sessoes = 4,
    carga_horaria = 16,
    validade_meses = 6,
    descricao = 'Proficiência em simulador - FAP06'
WHERE codigo = 'FAP06' AND categoria IS NULL;

-- ════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO
-- ════════════════════════════════════════════════════════════════

-- Contar por categoria
-- SELECT categoria, COUNT(*) as total FROM tipos_qualificacoes GROUP BY categoria;
