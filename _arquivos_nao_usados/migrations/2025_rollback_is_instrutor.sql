-- ROLLBACK Migration: Remover a alteração errada de is_instrutor
-- Data: 06/11/2025
-- Descrição: Desfaz a migration 2025_fix_is_instrutor_column.sql que marcou todos com codigo_anac como instrutores

-- 1. Resetar todos de volta para 0 (padrão)
UPDATE funcionarios 
SET is_instrutor = 0,
    updated_at = datetime('now')
WHERE deleted_at IS NULL;

-- 2. Marcar APENAS os que deveriam ser (usar a mesma lógica da UI)
-- Baseado em: src/react-app/components/simuladores/FormularioAgendamento.tsx
-- que filtra por: f.is_instrutor === 1 OU f.funcao === 'INSTRUTOR'
-- Para agora, apenas dados conhecidos como instrutores (ID 9, 37, 45)

-- Os verdadeiros instrutores (do git log anterior):
UPDATE funcionarios 
SET is_instrutor = 1,
    updated_at = datetime('now')
WHERE id IN (9, 37, 45)  -- Bernardo, Wilson, Rubens (dados reais de antes)
  AND deleted_at IS NULL;

-- 3. Verificar resultado
SELECT 
  COUNT(*) as total_funcionarios,
  SUM(CASE WHEN is_instrutor = 1 THEN 1 ELSE 0 END) as instrutores_corretos,
  SUM(CASE WHEN funcao = 'INSTRUTOR' THEN 1 ELSE 0 END) as com_funcao_instrutor
FROM funcionarios 
WHERE deleted_at IS NULL;
