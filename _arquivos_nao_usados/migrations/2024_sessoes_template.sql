-- ==========================================
-- Migration: Sessões Template (Tipos de Sessão Padrão)
-- Data: 2025-12-01
-- Descrição: Cria tabelas para armazenar templates de sessões
--           com suas manobras pré-configuradas
-- ==========================================

-- 1. Tabela de Templates de Sessões
CREATE TABLE IF NOT EXISTS sessoes_template (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tema TEXT NOT NULL,
  tipo_sessao TEXT DEFAULT 'TREINAMENTO',
  tipo_aeronave TEXT DEFAULT 'AW139',
  duracao_estimada INTEGER DEFAULT 120,
  descricao TEXT,
  ativa BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

-- 2. Tabela de Vínculos Template-Manobras
CREATE TABLE IF NOT EXISTS sessoes_template_manobras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessao_template_id INTEGER NOT NULL,
  manobra_id INTEGER NOT NULL,
  ordem INTEGER DEFAULT 1,
  obrigatoria BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sessao_template_id) REFERENCES sessoes_template(id) ON DELETE CASCADE,
  FOREIGN KEY (manobra_id) REFERENCES manobras(id)
);

-- 3. Índices para Performance
CREATE INDEX IF NOT EXISTS idx_sessoes_template_tipo ON sessoes_template(tipo_sessao, tipo_aeronave);
CREATE INDEX IF NOT EXISTS idx_sessoes_template_ativa ON sessoes_template(ativa);
CREATE INDEX IF NOT EXISTS idx_sessoes_template_deleted ON sessoes_template(deleted_at);
CREATE INDEX IF NOT EXISTS idx_sessoes_template_manobras_sessao ON sessoes_template_manobras(sessao_template_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_template_manobras_manobra ON sessoes_template_manobras(manobra_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_template_manobras_ordem ON sessoes_template_manobras(sessao_template_id, ordem);

SELECT 'Migration 2024 - Sessões Template criadas com sucesso' as status;
