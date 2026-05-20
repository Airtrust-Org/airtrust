-- Migration 0061: Adicionar coluna 'telefone' perdida na reconstrução de funcionarios
-- Data: 2025-11-21
-- Objetivo: Restaurar compatibilidade com endpoints que selecionam 'telefone'

ALTER TABLE funcionarios ADD COLUMN telefone TEXT;