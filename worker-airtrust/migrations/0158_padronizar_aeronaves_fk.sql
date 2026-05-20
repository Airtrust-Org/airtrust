-- ================================================================
-- MIGRATION 0158: Padronizar uso de aeronaves.codigo como FK
-- Data: 02/12/2025
-- Objetivo: Criar relacionamento correto entre aeronaves, simuladores e modelos
-- ================================================================

-- 1. Adicionar coluna aeronave_codigo em simuladores (se não existir)
-- Nota: Pode já existir da tentativa anterior, vamos verificar
ALTER TABLE simuladores ADD COLUMN aeronave_codigo TEXT;

-- 2. Popular aeronave_codigo dos simuladores baseado no modelo
-- Mapear modelo do simulador para codigo da aeronave
UPDATE simuladores 
SET aeronave_codigo = (
    SELECT codigo 
    FROM aeronaves 
    WHERE aeronaves.modelo = simuladores.modelo 
    AND aeronaves.deleted_at IS NULL
    LIMIT 1
)
WHERE deleted_at IS NULL
AND aeronave_codigo IS NULL;

-- 3. Atualizar modelos_sessao: garantir que tipo_aeronave usa codigo da aeronave
-- Primeiro, criar coluna temporária se não existir
-- ALTER TABLE modelos_sessao ADD COLUMN aeronave_codigo TEXT; -- Já existe da migration 0157

-- 4. Popular aeronave_codigo em modelos_sessao baseado em tipo_aeronave
UPDATE modelos_sessao
SET codigo_aeronave = (
    SELECT codigo
    FROM aeronaves
    WHERE aeronaves.modelo = modelos_sessao.tipo_aeronave
    AND aeronaves.deleted_at IS NULL
    LIMIT 1
)
WHERE deleted_at IS NULL
AND tipo_aeronave IS NOT NULL
AND codigo_aeronave IS NULL;

-- 5. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_simuladores_aeronave_codigo ON simuladores(aeronave_codigo);
CREATE INDEX IF NOT EXISTS idx_modelos_sessao_aeronave_codigo ON modelos_sessao(codigo_aeronave);

-- 6. Adicionar constraint (SQLite não suporta ADD CONSTRAINT, então apenas documentamos)
-- FOREIGN KEY (aeronave_codigo) REFERENCES aeronaves(codigo)
-- Implementação via validação na aplicação

-- ================================================================
-- RESULTADO ESPERADO:
-- - simuladores.aeronave_codigo: AER1761245212046 (exemplo)
-- - modelos_sessao.codigo_aeronave: AER1761245212046
-- - Relacionamento: aeronaves.codigo = simuladores.aeronave_codigo
-- ================================================================
