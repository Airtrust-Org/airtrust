-- ==========================================
-- Migration: Consolidar cadastro_manobras em manobras
-- Data: 2025-12-01
-- Descrição: Migra dados de cadastro_manobras para manobras
--           e elimina duplicação de tabelas
-- ==========================================

-- FASE 1: Inserir manobras únicas de cadastro_manobras que NÃO existem em manobras
INSERT INTO manobras (codigo, nome, descricao, categoria, tipo_sessao, tipo_aeronave, ordem, created_at, updated_at, deleted_at)
SELECT 
  c.codigo,
  c.descricao as nome,
  c.descricao,
  COALESCE(c.categoria, 'NORMAL') as categoria,
  c.tipo_sessao,
  c.tipo_aeronave,
  COALESCE(c.ordem, 1) as ordem,
  COALESCE(c.created_at, datetime('now')) as created_at,
  COALESCE(c.updated_at, datetime('now')) as updated_at,
  c.deleted_at
FROM cadastro_manobras c
WHERE NOT EXISTS (
  SELECT 1 FROM manobras m WHERE m.codigo = c.codigo
);

-- FASE 2: Atualizar manobras existentes com dados mais completos de cadastro_manobras
UPDATE manobras
SET 
  descricao = COALESCE(
    (SELECT descricao FROM cadastro_manobras WHERE codigo = manobras.codigo LIMIT 1),
    manobras.descricao
  ),
  categoria = COALESCE(
    (SELECT categoria FROM cadastro_manobras WHERE codigo = manobras.codigo LIMIT 1),
    manobras.categoria
  ),
  tipo_sessao = COALESCE(
    (SELECT tipo_sessao FROM cadastro_manobras WHERE codigo = manobras.codigo LIMIT 1),
    manobras.tipo_sessao
  ),
  tipo_aeronave = COALESCE(
    (SELECT tipo_aeronave FROM cadastro_manobras WHERE codigo = manobras.codigo LIMIT 1),
    manobras.tipo_aeronave
  ),
  ordem = COALESCE(
    (SELECT ordem FROM cadastro_manobras WHERE codigo = manobras.codigo LIMIT 1),
    manobras.ordem
  ),
  updated_at = datetime('now')
WHERE EXISTS (
  SELECT 1 FROM cadastro_manobras WHERE codigo = manobras.codigo
);

-- FASE 3: Dropar tabela antiga (após confirmação manual)
-- DROP TABLE cadastro_manobras;

SELECT 'Migration consolidação manobras completa. Execute DROP TABLE cadastro_manobras manualmente após validação.' as status;

