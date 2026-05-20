-- Migration: Preencher validade e data de execução nas qualificações
-- Data: 2025-10-22
-- Descrição: Integra qualificações com catalogo_treinamentos para preencher campos faltantes

-- 1. Preencher data_vencimento baseado em data_realizacao + validade_meses do catálogo
UPDATE qualificacoes
SET data_vencimento = date(data_realizacao, '+' || (
    SELECT validade_meses FROM catalogo_treinamentos 
    WHERE catalogo_treinamentos.codigo = qualificacoes.codigo 
    AND catalogo_treinamentos.deleted_at IS NULL
    LIMIT 1
) || ' months')
WHERE data_realizacao IS NOT NULL 
  AND data_realizacao != ''
  AND (data_vencimento IS NULL OR data_vencimento = '')
  AND EXISTS (
    SELECT 1 FROM catalogo_treinamentos 
    WHERE catalogo_treinamentos.codigo = qualificacoes.codigo 
    AND catalogo_treinamentos.validade_meses IS NOT NULL
    AND catalogo_treinamentos.deleted_at IS NULL
  );

-- 2. Preencher data_validade (alias para data_vencimento) se estiver vazio
UPDATE qualificacoes
SET data_validade = data_vencimento
WHERE data_vencimento IS NOT NULL 
  AND data_vencimento != ''
  AND (data_validade IS NULL OR data_validade = '');

-- 3. Preencher data_realizacao com data_conclusao se estiver vazio
UPDATE qualificacoes
SET data_realizacao = data_conclusao
WHERE data_conclusao IS NOT NULL 
  AND data_conclusao != ''
  AND (data_realizacao IS NULL OR data_realizacao = '');

-- 4. Preencher data_conclusao com data_realizacao se estiver vazio
UPDATE qualificacoes
SET data_conclusao = data_realizacao
WHERE data_realizacao IS NOT NULL 
  AND data_realizacao != ''
  AND (data_conclusao IS NULL OR data_conclusao = '');

-- 5. Preencher periodicidade_meses do catálogo
UPDATE qualificacoes
SET periodicidade_meses = (
    SELECT validade_meses FROM catalogo_treinamentos 
    WHERE catalogo_treinamentos.codigo = qualificacoes.codigo 
    AND catalogo_treinamentos.deleted_at IS NULL
    LIMIT 1
)
WHERE (periodicidade_meses IS NULL OR periodicidade_meses = 0)
  AND EXISTS (
    SELECT 1 FROM catalogo_treinamentos 
    WHERE catalogo_treinamentos.codigo = qualificacoes.codigo 
    AND catalogo_treinamentos.validade_meses IS NOT NULL
    AND catalogo_treinamentos.deleted_at IS NULL
  );

-- 6. Preencher carga_horaria do catálogo
UPDATE qualificacoes
SET carga_horaria = (
    SELECT carga_horaria FROM catalogo_treinamentos 
    WHERE catalogo_treinamentos.codigo = qualificacoes.codigo 
    AND catalogo_treinamentos.deleted_at IS NULL
    LIMIT 1
)
WHERE (carga_horaria IS NULL OR carga_horaria = 0)
  AND EXISTS (
    SELECT 1 FROM catalogo_treinamentos 
    WHERE catalogo_treinamentos.codigo = qualificacoes.codigo 
    AND catalogo_treinamentos.carga_horaria IS NOT NULL
    AND catalogo_treinamentos.deleted_at IS NULL
  );

-- 7. Preencher categoria do catálogo
UPDATE qualificacoes
SET categoria = (
    SELECT categoria FROM catalogo_treinamentos 
    WHERE catalogo_treinamentos.codigo = qualificacoes.codigo 
    AND catalogo_treinamentos.deleted_at IS NULL
    LIMIT 1
)
WHERE (categoria IS NULL OR categoria = '')
  AND EXISTS (
    SELECT 1 FROM catalogo_treinamentos 
    WHERE catalogo_treinamentos.codigo = qualificacoes.codigo 
    AND catalogo_treinamentos.categoria IS NOT NULL
    AND catalogo_treinamentos.deleted_at IS NULL
  );

-- 8. Preencher descricao do catálogo (se não tiver nome)
UPDATE qualificacoes
SET nome = (
    SELECT nome FROM catalogo_treinamentos 
    WHERE catalogo_treinamentos.codigo = qualificacoes.codigo 
    AND catalogo_treinamentos.deleted_at IS NULL
    LIMIT 1
)
WHERE (nome IS NULL OR nome = '')
  AND EXISTS (
    SELECT 1 FROM catalogo_treinamentos 
    WHERE catalogo_treinamentos.codigo = qualificacoes.codigo 
    AND catalogo_treinamentos.nome IS NOT NULL
    AND catalogo_treinamentos.deleted_at IS NULL
  );
