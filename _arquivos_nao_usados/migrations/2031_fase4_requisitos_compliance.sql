-- ============================================================
-- AIRTRUST - FASE 4: REQUISITOS DE COMPLIANCE
-- ============================================================
-- Tabela que define quais qualificações e licenças são OBRIGATÓRIAS
-- por função (Piloto, Co-piloto, Comissário, Examinador, Instrutor).
-- 
-- Cada linha = 1 requisito obrigatório para uma função.
-- ============================================================

CREATE TABLE IF NOT EXISTS requisitos_compliance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcao TEXT NOT NULL,             -- Piloto, Co-piloto, Comissário, Examinador, Instrutor, etc.
  tipo_recurso TEXT NOT NULL,       -- 'qualificacao' | 'licenca'
  referencia TEXT NOT NULL,         -- se qualificacao: codigo do tipo_qualificacao; se licenca: tipo da licença (CMA, CANAC, etc.)
  descricao TEXT,                   -- texto amigável para exibir na UI
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

-- Índice por função (consultas frequentes por função do funcionário)
CREATE INDEX IF NOT EXISTS idx_requisitos_compliance_funcao ON requisitos_compliance(funcao);

-- Índice por tipo_recurso (filtrar só qualificações ou só licenças)
CREATE INDEX IF NOT EXISTS idx_requisitos_compliance_tipo ON requisitos_compliance(tipo_recurso);

-- Índice para soft delete
CREATE INDEX IF NOT EXISTS idx_requisitos_compliance_deleted ON requisitos_compliance(deleted_at);

-- ============================================================
-- EXEMPLOS DE REQUISITOS INICIAIS (personalize conforme necessário)
-- ============================================================

-- Piloto: precisa ter CMA + PC + IFR
INSERT INTO requisitos_compliance (funcao, tipo_recurso, referencia, descricao)
VALUES 
  ('Piloto', 'licenca', 'CMA', 'Certificado Médico Aeronáutico (CMA)'),
  ('Piloto', 'licenca', 'PC', 'Piloto Comercial (PC)'),
  ('Piloto', 'licenca', 'IFR', 'Habilitação IFR');

-- Co-piloto: precisa ter CMA + PP
INSERT INTO requisitos_compliance (funcao, tipo_recurso, referencia, descricao)
VALUES 
  ('Co-piloto', 'licenca', 'CMA', 'Certificado Médico Aeronáutico (CMA)'),
  ('Co-piloto', 'licenca', 'PP', 'Piloto Privado (PP)');

-- Comissário: precisa ter CANAC
INSERT INTO requisitos_compliance (funcao, tipo_recurso, referencia, descricao)
VALUES 
  ('Comissário', 'licenca', 'CANAC', 'Certificado ANAC de Comissário');

-- Examinador: precisa ter CHT
INSERT INTO requisitos_compliance (funcao, tipo_recurso, referencia, descricao)
VALUES 
  ('Examinador', 'licenca', 'CHT', 'Check de Habilitação de Tipo (CHT)');

-- Instrutor: precisa ter INVA + qualificação SIM (exemplo com codigo)
INSERT INTO requisitos_compliance (funcao, tipo_recurso, referencia, descricao)
VALUES 
  ('Instrutor', 'licenca', 'INVA', 'Instrutor de Voo - Avião (INVA)'),
  ('Instrutor', 'qualificacao', 'SIM-B738-D', 'Simulador B738 - Delta');

-- ============================================================
-- Adicione mais requisitos conforme sua operação real:
--  • Se Piloto precisa qualificação tipo 'T1' ou 'ETOPS', insira aqui.
--  • Se Comissário precisa 'TREINAMENTO-SEG', insira aqui.
-- ============================================================
