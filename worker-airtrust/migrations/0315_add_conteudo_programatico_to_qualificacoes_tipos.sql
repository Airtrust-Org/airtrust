-- ================================================================
-- Migration 0315: Adiciona conteudo_programatico a qualificacoes_tipos
-- Data: 2026-03-31
-- Objetivo: Suporte a NR-1 / ANAC — conteúdo programático listado no certificado
-- ================================================================

ALTER TABLE qualificacoes_tipos
  ADD COLUMN conteudo_programatico TEXT DEFAULT NULL;

-- ================================================================
-- VALIDAÇÃO PÓS-MIGRATION
-- ================================================================
-- PRAGMA table_info('qualificacoes_tipos');
