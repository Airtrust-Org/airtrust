-- Migration: Consolidar duplicações em qualificacoes_historico
-- Data: 2026-01-13
-- Objetivo: Eliminar campos redundantes que duplicam informação de FK

-- 1. Migrar qh.codigo para usar sempre qualificacoes_tipos.codigo via FK
UPDATE qualificacoes_historico
SET codigo = (
  SELECT qt.codigo
  FROM qualificacoes_tipos qt
  WHERE qt.id = qualificacoes_historico.qualificacao_id
  LIMIT 1
)
WHERE qualificacao_id IS NOT NULL
  AND (codigo IS NULL OR codigo = '')
  AND deleted_at IS NULL;

-- 2. Migrar qh.tipo_codigo para usar qualificacoes_tipos.codigo via FK  
UPDATE qualificacoes_historico
SET tipo_codigo = (
  SELECT qt.codigo
  FROM qualificacoes_tipos qt
  WHERE qt.id = qualificacoes_historico.qualificacao_id
  LIMIT 1
)
WHERE qualificacao_id IS NOT NULL
  AND (tipo_codigo IS NULL OR tipo_codigo = '')
  AND deleted_at IS NULL;

-- 3. Migrar qh.categoria para usar qualificacoes_tipos.categoria via FK
UPDATE qualificacoes_historico
SET categoria = (
  SELECT qt.categoria
  FROM qualificacoes_tipos qt
  WHERE qt.id = qualificacoes_historico.qualificacao_id
  LIMIT 1
)
WHERE qualificacao_id IS NOT NULL
  AND (categoria IS NULL OR categoria = '')
  AND deleted_at IS NULL;

-- 4. Migrar qh.validade para usar qualificacoes_tipos.validade via FK
UPDATE qualificacoes_historico
SET validade_meses = (
  SELECT qt.validade
  FROM qualificacoes_tipos qt
  WHERE qt.id = qualificacoes_historico.qualificacao_id
  LIMIT 1
)
WHERE qualificacao_id IS NOT NULL
  AND validade_meses IS NULL
  AND deleted_at IS NULL;

-- 5. Migrar qh.funcionario_cpf para usar funcionarios.cpf via FK
UPDATE qualificacoes_historico
SET funcionario_cpf = (
  SELECT f.cpf
  FROM funcionarios f
  WHERE f.id = qualificacoes_historico.funcionario_id
  LIMIT 1
)
WHERE funcionario_id IS NOT NULL
  AND (funcionario_cpf IS NULL OR funcionario_cpf = '')
  AND deleted_at IS NULL;

-- 6. Migrar qh.qualificacao_codigo para usar qualificacoes_tipos.codigo via FK
UPDATE qualificacoes_historico
SET qualificacao_codigo = (
  SELECT qt.codigo
  FROM qualificacoes_tipos qt
  WHERE qt.id = qualificacoes_historico.qualificacao_id
  LIMIT 1
)
WHERE qualificacao_id IS NOT NULL
  AND (qualificacao_codigo IS NULL OR qualificacao_codigo = '')
  AND deleted_at IS NULL;

-- Nota: A remoção das colunas redundantes será feita em migration futura após validação
-- Colunas candidatas para remoção: tipo_codigo, codigo, categoria, validade, funcionario_cpf, qualificacao_codigo
