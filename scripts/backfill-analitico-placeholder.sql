-- backfill-analitico-placeholder.sql
-- Placeholder para popular alguns campos analíticos com valores sintéticos controlados
-- NÃO USA DADOS SENSÍVEIS REAIS
UPDATE qualificacoes_historico
SET instrutor = COALESCE(instrutor, 'INSTRUTOR_PADRAO'),
    local = COALESCE(local, 'CENTRO_TREINAMENTO'),
    modalidade = COALESCE(modalidade, 'PRESENCIAL')
WHERE deleted_at IS NULL;

-- Nota sintética apenas onde nula
UPDATE qualificacoes_historico
SET nota = ROUND(80 + (RANDOM() % 2000) / 100.0, 2)
WHERE nota IS NULL AND deleted_at IS NULL;

-- Carga horária padrão se nula
UPDATE qualificacoes_historico
SET carga_horaria = 8
WHERE carga_horaria IS NULL AND deleted_at IS NULL;
