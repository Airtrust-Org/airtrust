-- ============================================
-- MIGRAÇÃO: Índices de Performance (aditivos)
-- Data: 2025-10-23
-- Objetivo: Melhorar performance de consultas frequentes sem alterar dados
-- ============================================

-- Qualificações
CREATE INDEX IF NOT EXISTS idx_qualificacoes_funcionario ON qualificacoes(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipo ON qualificacoes(tipo);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_codigo ON qualificacoes(codigo);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_validade ON qualificacoes(data_validade);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_deleted ON qualificacoes(deleted_at);

-- Catálogo de treinamentos (tipos)
CREATE INDEX IF NOT EXISTS idx_catalogo_trein_codigo ON catalogo_treinamentos(codigo);
CREATE INDEX IF NOT EXISTS idx_catalogo_trein_tipo ON catalogo_treinamentos(tipo);
CREATE INDEX IF NOT EXISTS idx_catalogo_trein_deleted ON catalogo_treinamentos(deleted_at);

-- Anexos de certificados
CREATE INDEX IF NOT EXISTS idx_cert_anexos_hist ON certificado_anexos_v2(historico_id);
CREATE INDEX IF NOT EXISTS idx_cert_anexos_deleted ON certificado_anexos_v2(deleted_at);

-- Modelos de sessão
CREATE INDEX IF NOT EXISTS idx_sessoes_template_codigo ON sessoes_template(codigo);
CREATE INDEX IF NOT EXISTS idx_sessoes_template_sessao_numero ON sessoes_template(sessao_numero);
CREATE INDEX IF NOT EXISTS idx_sessoes_template_deleted ON sessoes_template(deleted_at);
