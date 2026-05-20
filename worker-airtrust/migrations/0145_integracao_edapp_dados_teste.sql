-- =========================================
-- INTEGRAÇÃO EDAPP - DADOS DE TESTE
-- Migration: 0145_integracao_edapp_dados_teste.sql
-- Data: 2025-12-05
-- Descrição: Dados de teste para integração EdApp
-- =========================================

-- Dados de teste (usar funcionário existente)
-- Primeiro, buscar um funcionário real do sistema

-- Inserir mapeamento de usuário teste (funcionário_id = 41 é Filipe)
INSERT OR IGNORE INTO integracoes_edapp_usuarios (funcionario_id, edapp_user_id, edapp_email, edapp_username) 
VALUES (41, 'test-user-filipe', 'filipe@teste.com', 'filipe.daumas');

-- Inserir mapeamento de curso teste
INSERT OR IGNORE INTO integracoes_edapp_cursos (edapp_course_id, qualificacao_codigo, edapp_course_name, edapp_course_code, validade_meses) 
VALUES ('test-course-crm', 'CRM001', 'CRM Online - Teste EdApp', 'CRM-ONLINE-001', 12);

INSERT OR IGNORE INTO integracoes_edapp_cursos (edapp_course_id, qualificacao_codigo, edapp_course_name, edapp_course_code, validade_meses) 
VALUES ('test-course-safety', 'SAFETY001', 'Safety Management System - Teste', 'SMS-001', 24);
